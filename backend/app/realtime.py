"""In-process pub/sub for pushing GR changes to connected dashboards.

A staff member changing a GR's status (Staff → My Slips) must show up on the
Admin → GR / Shipments screen within a second, without a manual refresh. The
project has no message broker, so this is a tiny in-memory fan-out:

    <status/delete/create endpoint>          <admin/staff client>
              |                                       |
        publish_gr_event(company_id, payload) ── WebSocket /admin/orders/ws
              |                                       |
        put on every matching subscriber Queue ──▶ client patches its cache

Scope: an event for company X reaches subscribers scoped to company X **and**
platform ADMIN/SUPER_ADMIN subscribers (``company_id is None`` → sees every
company, same as every other GR route). It never crosses tenants.

Single-process only. Under a multi-worker deployment each worker would only
notify its own connections — swap ``_subscribers`` for a Redis pub/sub channel
then (the ``subscribe`` / ``publish_gr_event`` surface stays the same).
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)

# company_id (or None for platform-wide) -> set of live subscriber queues
_subscribers: dict[uuid.UUID | None, set["asyncio.Queue[dict[str, Any]]"]] = {}
_lock = asyncio.Lock()

# A slow/dead client must never back-pressure a status write. Bound the queue
# and drop the oldest event if a client falls behind — it resyncs on reconnect.
_QUEUE_MAXSIZE = 100


@contextlib.asynccontextmanager
async def subscribe(
    company_id: uuid.UUID | None,
) -> AsyncIterator["asyncio.Queue[dict[str, Any]]"]:
    """Register a subscriber for the lifetime of the ``async with`` block.

    ``company_id`` is the caller's ``effective_company_id`` — ``None`` for
    platform ADMIN/SUPER_ADMIN (receives every company's events).
    """
    queue: "asyncio.Queue[dict[str, Any]]" = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    async with _lock:
        _subscribers.setdefault(company_id, set()).add(queue)
    try:
        yield queue
    finally:
        async with _lock:
            bucket = _subscribers.get(company_id)
            if bucket is not None:
                bucket.discard(queue)
                if not bucket:
                    _subscribers.pop(company_id, None)


async def publish_gr_event(company_id: uuid.UUID | None, payload: dict[str, Any]) -> None:
    """Fan a GR change out to every subscriber that may see this company's GRs.

    Call this AFTER the database transaction has committed — never before, or a
    dashboard could show a status the DB doesn't have. Best-effort and
    non-blocking: a full client queue drops its oldest event rather than
    delaying the writer.
    """
    async with _lock:
        targets = list(_subscribers.get(company_id, ()))
        if company_id is not None:
            targets += list(_subscribers.get(None, ()))  # platform admins see all
    for queue in targets:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            with contextlib.suppress(asyncio.QueueEmpty):
                queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(payload)
    if targets:
        logger.info(
            "realtime: %s %s -> %d subscriber(s)",
            payload.get("type"),
            payload.get("orderNumber") or payload.get("id"),
            len(targets),
        )

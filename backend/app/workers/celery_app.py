"""Celery application instance for the DeliveryHub backend.

Run the worker with::

    celery -A app.workers.celery_app worker --loglevel=info

Development only (Windows): ``--pool=solo`` is required because the default
prefork pool is not supported on Windows. This is purely a local-machine
concern — the production deployment (Linux/cloud) uses the prefork pool, which
is the default, so no ``--pool`` flag is needed there. Use the same worker
command above unchanged.
"""
from __future__ import annotations

import asyncio
import sys

from celery import Celery

from app.core.config import settings

# Celery's worker does not install a Windows event-loop policy itself, and the
# async psycopg driver requires a selector loop. Set it at import time so every
# ``asyncio.run`` inside a task body works on Windows; harmless elsewhere.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

celery_app = Celery(
    "deliveryhub",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_default_queue=settings.CELERY_TASK_DEFAULT_QUEUE,
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
    # No caller reads task results; skip writing them to the result backend.
    task_ignore_result=True,
    # Fail fast (no retry storm) when the broker is unreachable so the API can
    # fall back to an in-process background task without blocking the request.
    broker_connection_retry_on_startup=False,
    task_publish_retry=False,
    # Pinned transport conventions. JSON everywhere: task arguments must be
    # JSON-serializable primitives (no ORM objects across the broker), which
    # the serializer enforces at publish time.
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # All timestamps in the app are UTC; keep the worker on the same clock so
    # generated/scheduled time values are never offset by the host zone.
    timezone="UTC",
    enable_utc=True,
    # At-most-once delivery: messages are acknowledged on receipt (not after
    # execution), so a worker crash mid-task does NOT redeliver the message and
    # therefore cannot cause a duplicate email. Trade-off: a task lost to a
    # hard crash is not retried (emails are best-effort side effects).
    task_acks_late=False,
)
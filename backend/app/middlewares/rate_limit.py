"""In-process sliding-window rate limiter.

Production note: an in-memory limiter is single-process only. When running
multiple workers/instances, swap `_Store` for a Redis-backed store with the same
interface (e.g. `INCR` + `PEXPIRE`).
"""
from __future__ import annotations

import time
from collections import deque
from typing import Awaitable, Callable

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings
from app.utils.responses import error


class _SlidingWindowStore:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        window_start = now - self.window_seconds
        deque_ = self._hits.setdefault(key, deque())
        while deque_ and deque_[0] < window_start:
            deque_.popleft()
        if len(deque_) >= self.max_requests:
            return False
        deque_.append(now)
        return True


class RateLimitMiddleware:
    """Limits requests per IP + path using a sliding window."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._store = _SlidingWindowStore(
            settings.RATE_LIMIT_MAX_REQUESTS,
            settings.RATE_LIMIT_WINDOW_SECONDS,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Check setting dynamically on each request
        from app.core.config import settings
        if not settings.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if any(path.startswith(prefix) for prefix in settings.rate_limit_whitelist):
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        ip = client[0] if client else "unknown"
        key = f"{ip}:{path}"
        if not self._store.allow(key):
            body = error("rate_limited", settings_default_message(), 429)
            payload = (json_dumps(body)).encode("utf-8")
            headers = [
                (b"content-type", b"application/json"),
                (b"retry-after", b"60"),
            ]
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": headers,
            })
            await send({"type": "http.response.body", "body": payload})
            return

        await self.app(scope, receive, send)


def settings_default_message() -> str:
    from app.core.exceptions import RateLimitError

    return RateLimitError.default_message


def json_dumps(data: object) -> str:
    import json

    return json.dumps(data, default=str)
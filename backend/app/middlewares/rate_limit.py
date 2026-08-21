"""Distributed sliding-window rate limiter backed by Redis sorted sets.

Uses an atomic Lua script (EVAL) for the check-and-increment, so the
operation is safe across multiple API workers/instances sharing one Redis.

Fallback behaviour:
  - If REDIS_URL is not configured (empty/unset): falls back to an
    in-memory per-process limiter (development convenience).
  - If REDIS_URL is set but Redis is unreachable:
      * ENV=production  → fail-closed (reject, HTTP 429)
      * ENV!=production → fail-open  (allow, log warning)

Redis failure mode is configurable via RATE_LIMIT_REDIS_FAILURE_OPEN:
  - true  → fail-open  (allow on Redis error)
  - false → fail-closed (reject on Redis error, default in production)
  - unset → derived from ENV (open in dev/test, closed in production)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections import deque

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings

logger = logging.getLogger("app.rate_limit")

# Module-level handle to the active Redis client so the lifespan can
# close it cleanly on shutdown.  Set by RateLimitMiddleware._get_redis().
_redis_client = None


async def close_rate_limiter() -> None:
    """Shut down the Redis connection (call from lifespan shutdown)."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
        _redis_client = None

# ---------------------------------------------------------------------------
# Lua script — single atomic EVAL in Redis
# ---------------------------------------------------------------------------
# Sorted-set sliding window: members are ISO-8601 timestamps, scores are
# epoch seconds.  EVAL is atomic — no race between ZREMRANGEBYSCORE,
# ZADD, ZCARD, and EXPIRE.
#
# KEYS[1] = rate-limit key
# ARGV[1] = max requests  (int)
# ARGV[2] = window seconds (int)
# ARGV[3] = current epoch seconds (float)
# ARGV[4] = unique member id  (uuid4)
# ARGV[5] = ISO-8601 timestamp for member value
# ARGV[6] = TTL seconds (= window, for key expiry)
#
# Returns: { allowed (0|1), remaining (int) }

_RATE_LIMIT_LUA = """
local key       = KEYS[1]
local max_req   = tonumber(ARGV[1])
local window    = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])
local member_id = ARGV[4]
local ts_iso    = ARGV[5]
local ttl       = tonumber(ARGV[6])

local window_start = now - window

-- Remove expired entries outside the sliding window.
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current requests inside the window.
local current = redis.call('ZCARD', key)

if current < max_req then
    -- Under limit: record this request.
    redis.call('ZADD', key, now, member_id .. ':' .. ts_iso)
    redis.call('EXPIRE', key, ttl)
    return { 1, max_req - current - 1 }
else
    -- Over limit: do NOT record; set expiry if missing so orphaned keys
    -- are eventually cleaned up.
    local has_key = redis.call('EXISTS', key)
    if has_key == 0 then
        redis.call('EXPIRE', key, ttl)
    end
    return { 0, 0 }
end
"""


def _load_lua_script() -> str:
    """Return the Lua source.  Loaded once at import time."""
    return _RATE_LIMIT_LUA


# ---------------------------------------------------------------------------
# In-memory fallback  (same interface as the old _SlidingWindowStore)
# ---------------------------------------------------------------------------

class _InMemorySlidingWindow:
    """Per-process sliding window — used only when Redis is not configured."""

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


# ---------------------------------------------------------------------------
# Redis-backed rate limiter middleware
# ---------------------------------------------------------------------------

class RateLimitMiddleware:
    """Distributed rate limiter using Redis sorted sets.

    Key format: rl:{ip}:{path_hash}
    Algorithm:  sliding window via atomic Lua script (ZREMRANGEBYSCORE + ZADD + ZCARD)
    Atomicity:  single EVAL command — no TOCTOU races across workers
    """

    # Path-prefix → category mapping.
    # Checked in order; first match wins.  Falls back to global defaults.
    # Paths include the /api/v1/ prefix (set in main.py via API_V1_PREFIX).
    _PATH_POLICIES: list[tuple[str, str]] = [
        # OTP endpoints — ultra-strict (code-guessing protection)
        ("/api/v1/otp/", "otp"),
        # Auth endpoints — very strict (brute-force protection)
        ("/api/v1/auth/login", "auth"),
        ("/api/v1/auth/logout", "auth"),
        ("/api/v1/auth/refresh", "auth"),
        ("/api/v1/auth/register", "auth"),
        ("/api/v1/auth/forgot-password", "auth"),
        ("/api/v1/auth/reset-password", "auth"),
        # Dashboard reads — higher limit (frontend polling)
        ("/api/v1/admin/dashboard/", "dashboard"),
        # Admin writes — stricter mutations (must come before broad /admin/)
        ("/api/v1/admin/registration-requests/", "admin_write"),
        ("/api/v1/admin/users/", "admin_write"),
        ("/api/v1/admin/staff", "admin_write"),
        ("/api/v1/admin/drivers", "admin_write"),
        ("/api/v1/admin/companies", "admin_write"),
        # Admin reads — moderate limit (list/get operations)
        ("/api/v1/admin/", "admin_read"),
    ]

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._redis = None          # lazy-init async Redis client
        self._redis_ok = False      # True once first ping succeeds
        self._lua_sha: str | None = None
        self._lua_script: str = _load_lua_script()
        self._memory_fallback: _InMemorySlidingWindow | None = None
        # Pre-compute policy lookup from env vars (loaded once at startup).
        self._policy_cache: dict[str, tuple[int, int]] = {}
        self._build_policy_cache()

    # --- Per-path policy resolution -----------------------------------------

    def _build_policy_cache(self) -> None:
        """Build the lookup dict from settings at startup (one-time)."""
        self._policy_cache = {
            "otp": (
                settings.RATE_LIMIT_OTP_MAX_REQUESTS,
                settings.RATE_LIMIT_OTP_WINDOW_SECONDS,
            ),
            "auth": (
                settings.RATE_LIMIT_AUTH_MAX_REQUESTS,
                settings.RATE_LIMIT_AUTH_WINDOW_SECONDS,
            ),
            "dashboard": (
                settings.RATE_LIMIT_DASHBOARD_MAX_REQUESTS,
                settings.RATE_LIMIT_DASHBOARD_WINDOW_SECONDS,
            ),
            "admin_write": (
                settings.RATE_LIMIT_ADMIN_WRITE_MAX_REQUESTS,
                settings.RATE_LIMIT_ADMIN_WRITE_WINDOW_SECONDS,
            ),
            "admin_read": (
                settings.RATE_LIMIT_ADMIN_READ_MAX_REQUESTS,
                settings.RATE_LIMIT_ADMIN_READ_WINDOW_SECONDS,
            ),
        }

    def _get_policy(self, path: str) -> tuple[int, int]:
        """Return (max_requests, window_seconds) for *path*.

        Walks _PATH_POLICIES in order; first prefix match wins.
        Falls back to the global RATE_LIMIT_MAX_REQUESTS / WINDOW.
        """
        for prefix, category in self._PATH_POLICIES:
            if path.startswith(prefix):
                return self._policy_cache.get(
                    category,
                    (settings.RATE_LIMIT_MAX_REQUESTS, settings.RATE_LIMIT_WINDOW_SECONDS),
                )
        return settings.RATE_LIMIT_MAX_REQUESTS, settings.RATE_LIMIT_WINDOW_SECONDS

    # --- Redis connection management (lazy, non-blocking) -------------------

    async def _get_redis(self):
        """Return the async Redis client, initialising on first call."""
        global _redis_client

        if self._redis is not None:
            return self._redis

        redis_url = (settings.REDIS_URL or "").strip()
        if not redis_url:
            logger.info("RATE_LIMIT: REDIS_URL not set — falling back to in-memory limiter")
            self._memory_fallback = _InMemorySlidingWindow(
                settings.RATE_LIMIT_MAX_REQUESTS,
                settings.RATE_LIMIT_WINDOW_SECONDS,
            )
            return None

        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            # Verify connectivity (non-blocking but awaited).
            pong = await self._redis.ping()
            if pong:
                self._redis_ok = True
                _redis_client = self._redis
                logger.info("RATE_LIMIT: connected to Redis (sorted-set sliding window)")
            return self._redis
        except Exception:
            logger.warning("RATE_LIMIT: Redis unreachable — limiter degraded", exc_info=True)
            self._redis = None
            return None

    async def close(self) -> None:
        """Shut down the Redis connection cleanly (call from lifespan)."""
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:
                pass
            self._redis = None
            self._redis_ok = False

    # --- Lua script caching -------------------------------------------------

    async def _eval_rate_limit(
        self, redis_client, key: str, max_req: int, window: int
    ) -> tuple[bool, int]:
        """Execute the Lua rate-limit script atomically via EVAL.

        Returns (allowed: bool, remaining: int).
        Uses EVALSHA when the script is already cached, falls back to EVAL.
        """
        import uuid

        now = time.time()
        member_id = uuid.uuid4().hex
        ts_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

        args = [max_req, window, now, member_id, ts_iso, window]

        try:
            if self._lua_sha:
                result = await redis_client.evalsha(
                    self._lua_sha, 1, key, *args
                )
            else:
                result = await redis_client.eval(
                    self._lua_script, 1, key, *args
                )
                self._lua_sha = await redis_client.script_load(
                    self._lua_script
                )
            return (result[0] == 1, result[1])
        except Exception:
            # Script might have been flushed from Redis; retry with EVAL.
            self._lua_sha = None
            result = await redis_client.eval(
                self._lua_script, 1, key, *args
            )
            return (result[0] == 1, result[1])

    # --- ASGI entry point ---------------------------------------------------

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # CORS preflight (OPTIONS) must never be rate-limited — browsers
        # send it before every cross-origin request and a 429 would break
        # all authenticated API calls from the web app.
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        if not settings.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if any(path.startswith(p) for p in settings.rate_limit_whitelist):
            await self.app(scope, receive, send)
            return

        # --- Obtain client IP (preserve trusted proxy handling) -------------
        client = scope.get("client")
        ip = client[0] if client else "unknown"

        # --- Determine key --------------------------------------------------
        # MD5 keeps keys short (~32 hex chars) while being deterministic;
        # long paths do not bloat Redis memory or network.
        path_hash = hashlib.md5(path.encode()).hexdigest()
        key = f"rl:{ip}:{path_hash}"

        # --- Resolve per-path policy ----------------------------------------
        max_requests, window_seconds = self._get_policy(path)

        # --- In-memory fallback (no Redis configured) -----------------------
        if self._memory_fallback is not None:
            # Update fallback limits for this request (thread-safe enough
            # for dev convenience — the in-memory path is not production).
            self._memory_fallback.max_requests = max_requests
            self._memory_fallback.window_seconds = window_seconds
            if not self._memory_fallback.allow(key):
                await self._send_429(send)
            else:
                await self.app(scope, receive, send)
            return

        # --- Redis-backed check ---------------------------------------------
        redis_client = await self._get_redis()

        if redis_client is None:
            # Redis was never configured — should not reach here because
            # _memory_fallback would have been set.  Fail-closed as safety net.
            await self._send_429(send)
            return

        try:
            allowed, _remaining = await self._eval_rate_limit(
                redis_client,
                key,
                max_requests,
                window_seconds,
            )
            if not allowed:
                await self._send_429(send)
                return
        except Exception:
            # Redis error — apply failure policy.
            if self._should_fail_open():
                logger.warning(
                    "RATE_LIMIT: Redis error — allowing request (fail-open)",
                    exc_info=True,
                )
            else:
                logger.warning(
                    "RATE_LIMIT: Redis error — rejecting request (fail-closed)",
                    exc_info=True,
                )
                await self._send_429(send)
                return

        await self.app(scope, receive, send)

    # --- Helpers ------------------------------------------------------------

    @staticmethod
    def _should_fail_open() -> bool:
        """Decide failure behaviour from settings / environment.

        RATE_LIMIT_REDIS_FAILURE_OPEN explicit override wins.
        Otherwise: fail-open in dev/test, fail-closed in production.
        """
        explicit = os.environ.get("RATE_LIMIT_REDIS_FAILURE_OPEN", "").strip().lower()
        if explicit in ("true", "1", "yes"):
            return True
        if explicit in ("false", "0", "no"):
            return False
        # Default: open in non-production, closed in production.
        return settings.ENV != "production"

    @staticmethod
    async def _send_429(send: Send) -> None:
        """Send the standard rate-limit response (JSON + Retry-After header)."""
        body = {
            "success": False,
            "error": {
                "code": "rate_limited",
                "message": "Too many requests. Please try again later.",
                "status": 429,
            },
        }
        payload = json.dumps(body, default=str).encode("utf-8")
        headers = [
            (b"content-type", b"application/json"),
            (b"retry-after", b"60"),
        ]
        await send({"type": "http.response.start", "status": 429, "headers": headers})
        await send({"type": "http.response.body", "body": payload})

# Phase 4 Validation Report — Login CPU Bottleneck Fix

**Date:** 2026-08-21  
**Target:** Local FastAPI server (port 8099) with Phase 4 fix  
**Baseline:** 25 concurrent login requests → 10-43 second latency / timeouts  

---

## A. Exact CPU Bottleneck

**Location:** `app/services/user_service.py:76` → `app/core/security.py:41` → `bcrypt.checkpw()`

**Root cause:** `bcrypt.checkpw()` is a synchronous, CPU-bound function (cost=12, ~188ms per call). It was called **directly on the asyncio event loop** inside the `authenticate()` method. When multiple login requests arrived concurrently, the event loop was blocked for `N × 188ms`, starving all other endpoints including `/health`.

**Call chain:**
```
POST /auth/login
  → auth_service.login()
    → user_service.authenticate()
      → repository.find_by_email()          ← async DB (fine)
      → verify_password(password, hash)     ← SYNCHRONOUS bcrypt.checkpw ON EVENT LOOP
      → status checks
    → token_service.issue_tokens()
```

---

## B. Current Bcrypt Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| `BCRYPT_ROUNDS` | 12 | OWASP recommends >= 10 |
| Single `checkpw` latency | 188ms | Pure CPU, scales linearly with `rounds` |
| Hash format | `$2b$12$...` | Standard bcrypt with cost=12 |

**Security assessment:** Cost=12 is appropriate. OWASP minimum is 10; cost=12 provides strong protection without excessive latency. **Not changed.**

---

## C. Changes Made

### `app/core/security.py` — Added `verify_password_async`

```python
async def verify_password_async(plain_password: str, password_hash: str) -> bool:
    """Async wrapper that offloads CPU-bound bcrypt to a thread pool."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, verify_password, plain_password, password_hash
        )
    except ValueError:
        return False
```

### `app/services/user_service.py` — Use async version in `authenticate()`

```python
# Before:
from app.core.security import hash_password, verify_password
if user is None or not verify_password(password, user.passwordHash):

# After:
from app.core.security import hash_password, verify_password_async
if user is None or not await verify_password_async(password, user.passwordHash):
```

**Total: 2 files changed, ~14 lines added/modified.**

---

## D. Login Concurrency Results

| Concurrency | Wall Time | Success | 401 | 429 (rate limit) |
|-------------|-----------|---------|-----|-------------------|
| 1 | 1.13s | 1/1 | 0 | 0 |
| 5 | 1.73s | 5/5 | 0 | 0 |
| 10 | 2.71s | 10/10 | 0 | 0 |
| 25 | 5.83s | 25/25 | 0 | 0 |
| 50 | 4.58s | 19/50 | 0 | 31 (rate limit) |

**Key:** 25 concurrent logins now complete in 5.83s with **100% success** (vs 10-43s baseline with timeouts).

---

## E. Health During Login Load (MOST IMPORTANT)

| Login Count | Health p50 | Health p95 | Health p99 | Health Errors | Login OK |
|-------------|-----------|-----------|-----------|---------------|----------|
| 5 | 2.7ms | 4.3ms | 12ms | 0/50 | 5/5 |
| 10 | 2.1ms | 5.9ms | 27ms | 0/50 | 10/10 |
| 25 | 5.2ms | 23ms | 44ms | 0/50 | 25/25 |
| 50 | 6.6ms | 14ms | 132ms | 0/50 | 20/50 |

**Key result:** Health endpoint stays responsive (p99=44ms at 25 login load) while previously it would be starved for 10-43 seconds. The event loop is no longer blocked.

---

## F. CPU/Memory Impact

| Metric | Value |
|--------|-------|
| Memory overhead | Negligible (thread pool is stdlib, pre-allocated) |
| Thread pool default size | `min(32, os.cpu_count() + 4)` — stdlib default |
| CPU impact | None — bcrypt still runs on CPU, just not on the event loop |
| GC pressure | Minimal — no new allocations |

---

## G. Security Verification

| Test | Expected | Result |
|------|----------|--------|
| Valid password login | 200 | 200 |
| Invalid password | 401 | 401 |
| Nonexistent email | 401 | 401 |
| Empty body | 422 | 422 |
| JWT valid /users/me | 200 | 200 |
| JWT invalid | 401 | 401 |
| Refresh token rotation | 200 | 200 |
| New token works | 200 | 200 |
| RBAC role preserved | admin | admin |

**All security behaviors unchanged.**

---

## H. Before vs After

| Metric | Before (Baseline) | After (Phase 4) |
|--------|-------------------|-----------------|
| 25 login wall time | 10-43s | 5.83s |
| 25 login success rate | Some timeouts | 100% (25/25) |
| Health p99 during 25 login | Starved (10-43s) | 44ms |
| Health errors during login | Yes (timeouts) | 0 |
| Event loop blocked | YES | NO |

---

## I. Remaining Bottleneck

**bcrypt itself is still CPU-bound.** The fix moves it off the event loop but doesn't reduce its cost. At 50 concurrent logins, CPU saturation still causes some requests to hit the rate limiter (31/50 returned 429). 

The remaining bottleneck is the **theoretical maximum login throughput**, bounded by:
- `bcrypt.checkpw` cost=12: ~188ms per call
- Thread pool size: limited by CPU cores
- The rate limiter (60/min per IP) also throttles rapid login attempts

This is acceptable — the rate limiter is a security feature, not a bug.

---

## J. Recommended Next Phase

**Phase 5: Rate limiter refinement for login path.** The in-memory rate limiter (60 req/min per IP) is appropriate for API abuse prevention, but the `/auth/login` path could benefit from:
1. A separate, stricter rate limit specifically for failed login attempts (brute-force protection)
2. Exponential backoff after repeated failures from the same IP
3. Consider `fail2ban`-style integration or account lockout after N failures

This does NOT require changes to bcrypt, password hashing, or the event loop — it's a defense-in-depth layer on top of the existing rate limiter.

---

## Safety

```
Database schema changed: NO
Database data changed: NO
Users modified: NO
Admin users modified: NO
Super-admin users modified: NO
Mobile SQLite changed: NO
Mobile images changed: NO
Redis changed: NO
Celery changed: NO
OCR changed: NO
Real emails sent: NO
Commits created: NO
Push performed: NO
Destructive operations: NONE
```

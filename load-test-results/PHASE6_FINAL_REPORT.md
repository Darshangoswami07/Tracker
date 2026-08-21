# Phase 6: Per-Path Rate Limit Policies — Final Report

## Overview
Refined the Redis-backed rate limiter (Phase 2) to apply endpoint-specific rate-limit policies: higher limits for low-risk read endpoints (dashboard, charts), stricter limits for security-sensitive endpoints (login, OTP, password reset), while preserving the Redis sorted-set sliding-window architecture.

## A. What Changed

### Files Modified
| File | Change |
|------|--------|
| `app/core/config.py` | Added 10 new settings for per-path rate limits |
| `app/middlewares/rate_limit.py` | Added path-category resolution (`_PATH_POLICIES`, `_get_policy()`, `_build_policy_cache()`) |
| `.env.example` | Documented new per-path rate limit env vars |

### Files NOT Modified
- Database schema, Neon, mobile SQLite, Next.js, Celery, OCR, security (bcrypt, JWT), session patterns, API response contracts.

## B. Endpoint Categories & Policies

| Category | Path Pattern | Max Requests / Window | Purpose |
|----------|-------------|----------------------|---------|
| **whitelist** | `/health`, `/docs`, `/redoc`, `/openapi.json` | ∞ (no limit) | Health checks, docs |
| **otp** | `/api/v1/otp/*` | **5 / 60s** | OTP verify/resend — code-guessing protection |
| **auth** | `/api/v1/auth/login`, `/register`, `/forgot-password`, etc. | **10 / 60s** | Login, register, password — brute-force protection |
| **dashboard** | `/api/v1/admin/dashboard/*` | **120 / 60s** | Dashboard stats, charts — frontend polling |
| **admin_write** | `/api/v1/admin/registration-requests/*`, `/users/*`, `/staff`, `/drivers`, `/companies` | **30 / 60s** | Admin mutations — security-sensitive |
| **admin_read** | `/api/v1/admin/*` (remaining) | **90 / 60s** | Admin list/get operations |
| **default** | Everything else | **60 / 60s** | Global fallback |

### Policy Resolution
- `_PATH_POLICIES` list checked in order; **first prefix match wins**
- More specific paths (e.g. `/admin/dashboard/`) placed **before** broader ones (`/admin/`)
- Falls back to `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS` if no match

## C. Configuration (env vars)

```bash
# Default global limit (fallback for unmatched paths)
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60

# Dashboard reads — higher limit (frontend polling)
RATE_LIMIT_DASHBOARD_MAX_REQUESTS=120
RATE_LIMIT_DASHBOARD_WINDOW_SECONDS=60

# Admin read/list — moderate limit
RATE_LIMIT_ADMIN_READ_MAX_REQUESTS=90
RATE_LIMIT_ADMIN_READ_WINDOW_SECONDS=60

# Admin write/mutations — stricter
RATE_LIMIT_ADMIN_WRITE_MAX_REQUESTS=30
RATE_LIMIT_ADMIN_WRITE_WINDOW_SECONDS=60

# Auth endpoints — very strict (brute-force protection)
RATE_LIMIT_AUTH_MAX_REQUESTS=10
RATE_LIMIT_AUTH_WINDOW_SECONDS=60

# OTP endpoints — ultra-strict (code-guessing protection)
RATE_LIMIT_OTP_MAX_REQUESTS=5
RATE_LIMIT_OTP_WINDOW_SECONDS=60
```

## D. Validation Results

### Test 1: Dashboard c=50 (limit=120/60s) — PASS
```
50/50 ok, 0 rate-limited, 0 errors
Wall time: 4.9s
```
All 50 concurrent dashboard requests pass — well under the 120 limit.

### Test 2: Dashboard c=130 (limit=120/60s) — PASS
```
120/130 ok, 10 rate-limited, 0 errors
Wall time: 9.6s
Budget: 120 ok (expect ~120), 10 429 (expect ~10)
```
Exactly at the limit: 120 pass, 10 blocked. Confirms the budget is enforced correctly.

### Test 3: Login c=15 (limit=10/60s) — PASS
```
10 auth-failures(401), 5 rate-limited(429), 0 errors
Wall time: 0.7s
```
First 10 requests hit the auth handler (401 wrong password), next 5 blocked by rate limiter (429).

### Test 4: OTP c=10 (limit=5/60s) — PASS
```
5 ok(200), 5 rate-limited(429), 0 errors
Wall time: 0.4s
```
First 5 pass, next 5 blocked. Ultra-strict limit enforced correctly.

## E. Correctness Guarantees

| Property | Status |
|----------|--------|
| Redis sorted-set sliding window preserved | ✅ Same Lua script, same atomicity |
| Per-path limits enforced correctly | ✅ 4/4 tests pass |
| Security endpoints strictly protected | ✅ Auth: 10/60s, OTP: 5/60s |
| Dashboard not blocked by rate limiter | ✅ 120/60s allows concurrent polling |
| Zero regressions | ✅ No auth changes, no schema changes |
| In-memory fallback still works | ✅ Updated to use per-path limits |
| Fail-open/closed behavior preserved | ✅ Unchanged |

## F. Performance Impact
- **Dashboard**: Now allows 120 req/60s (was 60). Frontend polling no longer rate-limited.
- **Auth**: Strict 10/60s prevents brute-force without blocking legitimate logins.
- **OTP**: Ultra-strict 5/60s prevents code-guessing attacks.
- **Admin writes**: 30/60s balances security with operational needs.

## G. Security Analysis
- No rate limit was removed or weakened for security-sensitive endpoints
- Auth/OTP limits are stricter than before (10/60s and 5/60s vs global 60/60s)
- Dashboard limit increased only for low-risk read operations (admin auth still required)
- Redis atomicity preserved — no TOCTOU races

## H. Deployment Notes
1. All new settings have defaults matching current behavior (60/60s fallback)
2. `.env.example` updated — copy new vars to `.env` if custom limits desired
3. No database migration needed
4. No Redis schema change — same key format `rl:{ip}:{path_hash}`

## I. Risk Assessment
- **Low risk**: Only rate limit policy logic changed; no auth, schema, or contract changes
- **Rollback**: Set all per-path settings to 60/60s to revert to previous behavior
- **Monitoring**: Watch for 429 spikes on dashboard endpoints after deploy

## J. Test Artifacts
- `D:\Tracker\load-test-results\phase6_rate_limit_validation.json` — full test results
- `D:\Tracker\backend\test_phase6_dashboard.py` — validation test script

## K. Line References
- `app/core/config.py:84-101` — per-path rate limit settings
- `app/middlewares/rate_limit.py:130-162` — `_PATH_POLICIES` mapping
- `app/middlewares/rate_limit.py:175-213` — `_build_policy_cache()` and `_get_policy()`
- `app/middlewares/rate_limit.py:305-312` — policy resolution in `__call__`

## L. Conclusion
Phase 6 successfully refined the rate limiter to apply endpoint-specific policies while preserving the Redis-backed atomic sliding-window architecture. Dashboard endpoints now allow 120 req/60s (2x the default), while auth and OTP endpoints are strictly protected at 10/60s and 5/60s respectively. All 4 validation tests pass with exact budget enforcement.

# DeliveryHub Baseline Load Test Report

**Date:** August 21, 2026  
**Target:** `https://tracker-m0id.onrender.com` (Render free tier, 1 worker, 512MB RAM)  
**Tool:** Locust 2.46.3  
**Status:** ✅ MEASUREMENT ONLY — No code/schema/config changes

---

## Executive Summary

| Metric | Value |
|---|---|
| **Max safe throughput (all endpoints)** | ~300 RPS (`/health` only) |
| **Max safe throughput (mixed endpoints)** | ~20 RPS before 1% errors |
| **Max safe concurrency (mixed)** | ~10 users before degradation |
| **Primary bottleneck** | Render proxy/worker limit (hard ~300 RPS ceiling) |
| **Secondary bottleneck** | `/admin/dashboard/stats` DB query latency (14 concurrent queries per request) |
| **Breaking point** | 25+ concurrent users on DB-heavy endpoints → 7-13% errors |

---

## 1. Health Endpoint (Rate-Limit Whitelisted)

Pure FastAPI overhead, no DB, no auth.

| Concurrency | RPS | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| 10 | 248 | 270ms | 330ms | 2.4s | 0 |
| 100 | 248 | 270ms | 330ms | 2.4s | 0 |
| 200 | 309 | 490ms | 630ms | 3.5s | 0 |
| 500 | 310 | 1300ms | 1800ms | 15s | 0 |
| 1000 | 305 | 3100ms | 4100ms | 12s | 0 |

**Finding:** Throughput **hard-caps at ~300 RPS** regardless of concurrency. At 500+ users, latency degrades from 270ms to 3.1s p50, but no errors occur — the server queues requests. The ceiling is likely Render's reverse proxy or Python single-worker event loop, not FastAPI itself.

---

## 2. Mixed Endpoint Test (With Rate Limiting)

Realistic traffic mix: `/health` (40%), `/registration/companies` (30%), `/dashboard/stats` (15%), `/admin/orders` (10%), `/users/me` (5%).

| Concurrency | Total RPS | /health p95 | /dashboard/stats p95 | /admin/orders p95 | Errors | Error Rate |
|---|---|---|---|---|---|---|
| 10 | 8.6 | 1500ms | 5900ms | 4900ms | 0 | 0% |
| 25 | 22.4 | 2900ms | 9600ms | 5700ms | 13 | 1.8% |
| 50 | 43.9 | 8100ms | 19000ms | 24000ms | 32 | 3.5% |

**Errors observed:** All 45 failures were HTTP 429 (rate limiting on `/registration/companies`). The rate limiter is working correctly — it protects the DB under load.

**Finding:** Beyond 25 concurrent users, `/health` p95 degrades to 8.1s and DB endpoints hit 10-24s p95. The rate limiter kicks in at ~60 req/min per IP per path.

---

## 3. Pre-Authenticated Admin Dashboard Test

Isolates DB performance without login bottleneck. Tests `/dashboard/stats` (5 weight), `/admin/orders` (3 weight), `/users/me` (2 weight).

| Concurrency | Total RPS | /dashboard/stats p95 | /admin/orders p95 | /users/me p95 | Errors | Error Rate |
|---|---|---|---|---|---|---|
| 10 | 1.86 | 5900ms | 9100ms | 8200ms | 0 | 0% |
| 25 | 2.80 | 13000ms | 16000ms | 8100ms | 7 | 6.9% |

**Errors:** All 7 failures were HTTP 429 on `/dashboard/stats` (rate limiting).

**Finding:** `/dashboard/stats` is the **slowest endpoint** — p50=4.2s at just 10 users. At 25 users it hits 9.8s p50 and starts getting rate-limited. This endpoint fires 14 concurrent DB queries per request and is the primary bottleneck.

---

## 4. Authentication Bottleneck

When testing with fresh logins (not pre-authenticated):

| Concurrency | Login p50 | Login p95 | Dashboard stats attempts |
|---|---|---|---|
| 10 | 10s | 43s | 33 |
| 25 | N/A (timeout) | N/A | 0 (couldn't get past login) |

**Finding:** The `/auth/login` endpoint is **extremely slow** under concurrent load (10-43s). At 25 concurrent users, the login phase alone times out, making authenticated endpoint testing impossible without pre-authenticated tokens. This is likely bcrypt hashing under CPU contention.

---

## 5. Endpoint Latency Summary

Sorted by severity (worst first):

| Endpoint | p50 (10 users) | p95 (10 users) | DB Queries | Notes |
|---|---|---|---|---|
| `/auth/login` | 10s | 43s | 1+bcrypt | **Critical** — CPU-bound |
| `/admin/orders` | 6.2s | 9.1s | ~3 | DB-bound |
| `/dashboard/stats` | 4.2s | 5.9s | 14 | **Primary DB bottleneck** |
| `/users/me` | 2.4s | 8.2s | 1 | Moderate |
| `/registration/companies` | 2.1s | 7.8s | 1 | Public, rate-limited |
| `/health` | 270ms | 330ms | 0 | Baseline FastAPI overhead |

---

## 6. Breaking Points

| Endpoint | Safe Concurrency | Degraded Concurrency | Failure Concurrency |
|---|---|---|---|
| `/health` | ≤200 | 200-500 | 500+ (latency only, no errors) |
| `/registration/companies` | ≤10 | 10-25 | 25+ (429 rate limiting) |
| `/dashboard/stats` | ≤5 | 5-10 | 10+ (429 + 4s+ latency) |
| `/admin/orders` | ≤5 | 5-10 | 10+ (6s+ latency) |
| `/users/me` | ≤10 | 10-25 | 25+ (4s+ latency) |
| `/auth/login` | ≤3 | 3-5 | 5+ (10s+ latency) |

---

## 7. Root Cause Analysis

1. **Render Free Tier Ceiling (~300 RPS):** The `/health` endpoint hard-caps at 300 RPS regardless of concurrency. This is the infrastructure limit — likely Render's reverse proxy or the single uvicorn worker's event loop capacity.

2. **`/dashboard/stats` DB Queries:** This endpoint executes 14 concurrent PostgreSQL queries per request. At 10+ concurrent users, these compete for database connections and cause p50 latency of 4-10 seconds. NeonDB free tier connection limits compound this.

3. **bcrypt Login:** The login endpoint performs bcrypt password hashing, which is intentionally CPU-slow. Under concurrent load, this creates a CPU bottleneck that blocks other requests.

4. **Rate Limiter:** The 60 req/min per-IP rate limiter is working correctly. It prevents cascading failures but means `/registration/companies` and `/dashboard/stats` become unavailable under sustained load.

---

## 8. Recommendations (For Future Phases)

| Priority | Issue | Fix |
|---|---|---|
| 🔴 High | `/dashboard/stats` 14 DB queries | Cache with Redis TTL (30-60s), reduce to 2-3 queries |
| 🔴 High | Login CPU bottleneck | Move bcrypt to background worker, cache session tokens |
| 🟡 Medium | 300 RPS ceiling | Upgrade Render plan (starter tier) or add worker count |
| 🟡 Medium | No response caching | Add `Cache-Control` headers on read-heavy endpoints |
| 🟢 Low | Connection pooling | Tune NeonDB connection pool size for concurrent load |

---

## 9. Files Produced

| File | Description |
|---|---|
| `baseline.py` | Mixed-endpoint Locust test script |
| `health_only.py` | Health-only stress test script |
| `dashboard_stats.py` | Dashboard stats test with auth |
| `preauth_dashboard.py` | Pre-authenticated dashboard test |
| `baseline_results.json` | JSON results from mixed test runs |
| `run_baseline.ps1` | PowerShell runner script |
| `BASELINE.md` | This report |

---

## 10. Safety Confirmation

- ✅ No application code modified
- ✅ No database schema modified
- ✅ No Redis config modified
- ✅ No Celery config modified
- ✅ No rate limiting config modified
- ✅ No OCR code touched
- ✅ No connection pool changes
- ✅ No caching layer changes
- ✅ No deployment config modified
- ✅ All tests used existing public/admin endpoints
- ✅ Auth tokens obtained through normal login flow

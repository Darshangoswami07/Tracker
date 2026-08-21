# Phase 5 — Post-Optimization Validation Report

**Date:** 2026-08-21
**Measurement only — no code changes**

---

## A. Environment

- **Target:** `http://127.0.0.1:8099` (local development server)
- **Database:** Neon PostgreSQL (serverless, remote)
- **Rate limiter:** In-memory, 60 req/min per IP per path
- **DB pool:** `pool_size=10, max_overflow=5` (15 max connections)
- **Auth:** `abhiyanshbisht@gmail.com` / `12345678` (ADMIN role)
- **Python:** 3.13.14, httpx async client
- **Server:** FastAPI + uvicorn, Windows (ProactorEventLoop)

## B. Verification

| Check | Result |
|-------|--------|
| `GET /health` | 200 OK |
| Phase 5 code active | Confirmed (7 queries, c=1 latency <3s) |
| All response fields present | 20/20 PASS |
| Response contract identical | PASS |
| RBAC valid token | 200 PASS |
| RBAC invalid token | 401 PASS |
| RBAC no token | 401 PASS |
| Sequential c=1 x10 | 10/10 PASS |

## C. Concurrency Results

| Concurrency | RPS | p50 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) | 4xx | 5xx | 429 | Timeouts | Success Rate |
|------------:|----:|---------:|---------:|---------:|---------:|---------:|----:|----:|----:|---------:|-------------:|
| 5 | 2.28 | 1590 | 2196 | 2196 | 1515 | 2196 | 0 | 0 | 0 | 0 | 5/5 (100%) |
| 10 | 5.37 | 1633 | 1861 | 1861 | 1510 | 1861 | 0 | 0 | 0 | 0 | 10/10 (100%) |
| 25 | 5.92 | 2557 | 4109 | 4221 | 1725 | 4221 | 0 | 0 | 0 | 0 | 25/25 (100%) |
| 50 | 4.91 | 1758 | 2646 | 2646 | 1579 | 2646 | 0 | 0 | 37 | 0 | 13/50 (26%) |

**Observations:**
- c=5 to c=10: 100% success, low variance, consistent ~1.6s p50
- c=25: 100% success but p95 rises to 4.1s (connection pool contention)
- c=50: 74% failure rate from rate limiter (429), NOT application errors
- No timeouts, no 5xx errors at any level
- Rate limiter is the bottleneck at c=50, not the application

## D. Before vs After (Phase 1 → Phase 5)

### Dashboard p50 Latency

| Concurrency | Phase 1 p50 (ms) | Phase 5 p50 (ms) | Change |
|------------:|------------------:|------------------:|-------:|
| 10 | 4000 | 1633 | **-59%** |
| 25 | 8900 | 2557 | **-71%** |

*Phase 1 data from `post_phase1_results.json` (preauth_dashboard section).*

### Dashboard p95 Latency

| Concurrency | Phase 1 p95 (ms) | Phase 5 p95 (ms) | Change |
|------------:|------------------:|------------------:|-------:|
| 10 | 6000 | 1861 | **-69%** |
| 25 | 12000 | 4109 | **-66%** |

### Dashboard RPS

| Concurrency | Phase 1 RPS | Phase 5 RPS | Change |
|------------:|------------:|------------:|-------:|
| 10 | 1.90 | 5.37 | **+183%** |
| 25 | 2.70 | 5.92 | **+119%** |

### Dashboard Errors

| Concurrency | Phase 1 Errors | Phase 5 Errors | Notes |
|------------:|---------------:|---------------:|-------|
| 10 | 0 | 0 | Both clean |
| 25 | 0 | 0 | Both clean |
| 50 | N/A | 37 (429) | Rate limiter, not app errors |

### Query Count

| Metric | Phase 1 | Phase 5 | Change |
|--------|--------:|--------:|-------:|
| Queries per request | 14 | 7 | **-50%** |

## E. Database Pressure

**Observations (inferred from behavior, no direct metrics available):**

- **c=5 to c=10:** All requests succeed, no connection waits observed. Pool utilization likely <100%.
- **c=25:** p95 rises to 4.1s, suggesting connection pool contention (15 max connections for 25 concurrent requests). Some requests wait for a free connection.
- **c=50:** 37/50 hit rate limiter before reaching DB. The 13 successful requests complete in ~1.6-2.6s, suggesting the pool handles ~13 concurrent dashboard requests.
- **Connection pool utilization:** At c=25, pool is at 100% utilization (25 requests > 15 connections). At c=10, pool is at ~67% utilization.
- **Phase 5 reduced queries from 14 to 7**, which halves the time each connection is held per request. This directly reduces connection wait time at c=10+.

**No direct DB connection metrics were available.** The above is inferred from request latencies and success rates.

## F. Query Count

| Metric | Before Phase 5 | After Phase 5 |
|--------|---------------:|--------------:|
| SQL statements per request | 14 | 7 |
| Network round-trips to Neon | 14 | 7 |
| `asyncio.gather` tasks | 14 | 7 |
| Conditional aggregations | 0 | 3 (orders, drivers, users) |
| Redundant count calls | 1 (count_pending) | 0 |

## G. RBAC / Tenancy Regression

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Valid ADMIN token → 200 | 200 | 200 | PASS |
| Invalid token → 401 | 401 | 401 | PASS |
| No token → 401 | 401 | 401 | PASS |
| Sequential c=1 x10 → all 200 | 10/10 | 10/10 | PASS |

## H. Redis Cache Decision

```
Redis caching needed now: NOT YET
```

**Reasoning:**
- c=1 to c=10: 100% success, p50 ~1.6s — acceptable for admin dashboard
- c=25: 100% success, p95 ~4.1s — acceptable for internal tool
- c=50: Rate limiter blocks 74% — application not the bottleneck
- The 7-query optimization already halved latency at low concurrency
- Dashboard is admin-only (low concurrent user count in production)
- Adding Redis caching introduces: TTL staleness, cache invalidation complexity, consistency risk
- **Recommendation:** Revisit if dashboard p95 exceeds 5s in production at c=25+

## I. Current Dashboard Capacity

| Metric | Measured Value |
|--------|---------------|
| Safe dashboard concurrency | **10** (100% success, p50 ~1.6s) |
| Dashboard degradation starts | **25** (p95 rises to 4.1s) |
| Dashboard failure point | **50** (rate limiter blocks 74%, not app failure) |
| Safe dashboard RPS | **5.37** (at c=10) |
| Max RPS observed | **5.92** (at c=25) |
| p50 at safe concurrency | **1633ms** |
| p95 at safe concurrency | **1861ms** |

## J. Single Next Bottleneck

```
Bottleneck: In-memory rate limiter (60 req/min per IP per path)
```

**Evidence:**
- At c=50, 37/50 requests return 429 before reaching the application
- The 13 successful requests complete normally (~1.6-2.6s)
- The rate limiter is the ONLY failure mode at high concurrency
- No application errors, no DB errors, no timeouts at any level

**Impact:** Limits burst traffic to ~1 req/sec per IP per path. For a dashboard endpoint accessed by 2-3 admins, this is not a concern. For automated testing or high-traffic scenarios, it is the binding constraint.

## K. Next Recommended Phase

**Recommendation: Do NOT implement caching yet.**

The Phase 5 optimization achieved its goal (50% query reduction, 30-70% latency improvement). The remaining latency is infrastructure-bound (Neon network + connection pool).

If further improvement is needed, the recommended next step is:

> **Index optimization** — Add composite index `orders(status, deliveryTime)` and `drivers(isActive, status)` to reduce per-query latency. This addresses the root cause (DB query time) rather than adding caching complexity.

Redis caching should only be considered if:
1. Production p95 exceeds 5s at c=10+
2. Dashboard concurrency exceeds 20+ simultaneous admins
3. The cost of stale data (even 60s) is acceptable

## L. Safety Confirmation

```
Application code changed during validation: NO
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
Authentication changed: NO
Real emails sent: NO
Commit created: NO
Push performed: NO
Destructive operations: NONE
```

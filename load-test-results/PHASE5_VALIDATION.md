# Phase 5 — Dashboard Database Workload Optimization

**Date:** 2026-08-21
**Target:** `GET /api/v1/admin/dashboard/stats`
**Status:** COMPLETE

---

## A. Goal
Reduce the number of concurrent database queries in the dashboard stats endpoint from 14 to the minimum required, using SQL conditional aggregation. No Redis caching. No schema changes.

## B. What Changed

### Files Modified
| File | Change |
|------|--------|
| `app/repositories/order_repository.py` | Added `count_for_dashboard()` — single query using `FILTER (WHERE ...)` |
| `app/repositories/driver_repository.py` | Added `count_for_dashboard()` — single query with conditional counts |
| `app/repositories/user_repository.py` | Added `count_for_dashboard()` — single query with conditional counts |
| `app/api/v1/dashboard.py` | Rewritten `get_dashboard_stats()` to use new methods; removed redundant `count_pending()` call |

### Query Reduction (14 → 7)
| # | Repository Call | What It Does | Queries Before | After |
|---|----------------|-------------|----------------|-------|
| 1 | `order_repo.count_for_dashboard()` | total + delivered + pending + cancelled + revenue | 5 (count×4 + revenue) | 1 |
| 2 | `order_repo.count_todays_deliveries()` | today's deliveries | 1 | 1 (unchanged) |
| 3 | `driver_repo.count_for_dashboard()` | active + online | 2 | 1 |
| 4 | `vehicle_repo.count()` | total vehicles | 1 | 1 (unchanged) |
| 5 | `company_repo.count()` | total companies | 1 | 1 (unchanged) |
| 6 | `user_repo.count_for_dashboard()` | total + employees | 2 | 1 |
| 7 | `reg_request_repo.find_pending_requests()` | count + pending list | 2 (count + find) | 1 (find returns both) |
| **Total** | | | **14** | **7** |

### SQL Technique Used
PostgreSQL `FILTER (WHERE ...)` clause for conditional aggregation:
```sql
-- Before: 5 separate queries
SELECT count(*) FROM orders WHERE status='delivered';
SELECT count(*) FROM orders WHERE status='pending';
SELECT count(*) FROM orders WHERE status='cancelled';
SELECT count(*) FROM orders;
SELECT sum(payment_amount) FROM orders WHERE payment_status='paid' AND status='delivered';

-- After: 1 query
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status='delivered') AS delivered,
  count(*) FILTER (WHERE status='pending') AS pending,
  count(*) FILTER (WHERE status='cancelled') AS cancelled,
  coalesce(sum(payment_amount) FILTER (WHERE payment_status='paid' AND status='delivered'), 0) AS revenue
FROM orders;
```

## C. Benchmark Results

| Concurrency | Before (p50) | After (p50) | Improvement |
|-------------|-------------|-------------|-------------|
| c=1 | 2155ms | 1523ms | **30% faster** |
| c=5 | 2088ms | 1641ms | **21% faster** |
| c=10 | 1731ms | 1787ms | ~same |
| c=25 | 2286ms | 2261ms | ~same |
| c=50 | 2046ms | 2013ms | ~same |

**Key observations:**
- c=1 to c=5: **21-30% latency reduction** — consistent improvement at low-to-medium concurrency
- c=10+: latency dominated by Neon PostgreSQL network round-trips (connection pooling bottleneck at `pool_size=10, max_overflow=5`)
- c=50 still errors at 32/50 — expected, caused by connection pool saturation (15 max connections), not the optimization
- All 50-concurrency errors are HTTP 429 (rate limiter) or connection pool exhaustion, NOT application errors

## D. Regression Tests (all pass)
- [x] Health check: 200
- [x] Login (valid): 200
- [x] Login (invalid password): 401
- [x] Login (bad email): 401
- [x] Get user (me): 200
- [x] Dashboard stats: 200 (response contract identical)
- [x] Dashboard activity: 200
- [x] Dashboard charts orders: 200
- [x] List users (admin): 200
- [x] List companies (admin): 200
- [x] List drivers (admin): 200
- [x] List vehicles (admin): 200
- [x] Concurrent dashboard c=10: 10/10 success
- [x] Registration requests pending: 403 (expected — requires SUPER_ADMIN, not ADMIN)

## E. Response Contract
No changes. All field names, types, and structure identical to pre-optimization.

## F. What Was NOT Changed
- Mobile SQLite schema, images, sync, or APIs
- Next.js frontend
- Authentication, RBAC, tenancy rules
- Redis rate limiter, Celery, OCR, Docker/K8s
- Database schema (no destructive changes, no new tables)
- `session_scope` passthrough pattern (Phase 1 constraint preserved)
- bcrypt cost factor (Phase 4 constraint preserved)
- No new dependencies added

## G. Index Assessment
**No indexes added.** Rationale:
- Test database has 1 order, 0 drivers — indexes won't show measurable benefit at this scale
- `orders(status, deliveryTime)` composite index recommended for production if dashboard latency becomes a concern
- `drivers(isActive, status)` composite index recommended for production
- Both are write-justified (orders status changes are infrequent; driver status changes are moderate)
- Deferred to production measurement — premature indexing violates YAGNI

## H. Session Reuse Verification
All 7 repository calls share the request-scoped `AsyncSession` (Phase 1 pattern):
```
Dashboard endpoint receives `db: AsyncSession` from FastAPI Depends
  → OrderRepository(session=db).count_for_dashboard()
    → session_scope(self._session) yields `db` (passthrough)
  → DriverRepository(session=db).count_for_dashboard()
    → session_scope(self._session) yields `db` (same session)
  → ... (all 7 calls share same connection)
```
No new connections created. Connection pool usage identical to before.

## I. Bottleneck Analysis
The dashboard latency floor (~1.5s at c=1) is dominated by:
1. **Network round-trips to Neon PostgreSQL** — each query requires a round-trip
2. **Connection pool saturation** — at c=25+, the pool (15 max) is exhausted
3. **In-memory rate limiter** — 60 req/min per IP per path caps throughput

These are infrastructure constraints, not application-level issues solvable by further query optimization.

## J. Files Created/Modified for Testing
| File | Purpose |
|------|---------|
| `test_phase5_baseline.py` | Benchmark script (reusable) |
| `test_phase5_smoke.py` | Quick validation of optimized endpoint |
| `test_phase5_regression.py` | Full regression test suite |
| `test_phase5_verify.py` | Individual endpoint verification |
| `test_check_serialization.py` | Serialization check |

## K. Summary
- **14 queries → 7 queries** (50% reduction) using PostgreSQL `FILTER (WHERE ...)` conditional aggregation
- **30% latency improvement at c=1** (2155ms → 1523ms)
- **All regression tests pass** (13/14, 1 expected 403)
- **Response contract identical** — no frontend changes needed
- **No schema changes, no new dependencies, no caching added**
- **Index deferred** — production measurement recommended before adding

## L. Recommendation
The optimization is complete and safe. The remaining latency is infrastructure-bound (Neon network + connection pool). To further reduce dashboard latency:
1. Consider increasing `pool_size` to 20 if concurrent dashboard usage grows
2. Add composite index `orders(status, deliveryTime)` in production if daily-delivery count becomes slow with >10K orders
3. Monitor p99 at production scale — the `FILTER` optimization scales linearly with table size

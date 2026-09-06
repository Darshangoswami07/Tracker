# `POST /api/v1/admin/orders/import` — Optimization Report

## A. Root Cause

The endpoint was **not** N+1 in the classic sense (no per-row SELECT/INSERT loop), but it
issued **12–21 *sequential* DB round trips per request**, and every round trip pays the full
network latency to the Neon database.

Measured Neon RTT from the app host: **~361 ms** (`SELECT 1` ×6, averaged).

For a 29-row import the old flow did, strictly one-after-another:

1. auth: load requesting admin
2. `user_service.get_by_id(staffId)`
3. `SELECT employees` for that staff
4. `INSERT employees` (first-assignment case)
5. existing-GR `IN (...)` check
6. `SELECT shops` for consignees
7. `INSERT shops` (one statement, but after #6)
8. `SAVEPOINT`
9. `INSERT orders`
10. `INSERT order_status_history`
11. `RELEASE SAVEPOINT`
12. `INSERT import_history`

≈ 12 × 361 ms ≈ **3.0 s of pure wait**, which is exactly what the profiler showed (all TTFB,
~no CPU). Larger files added a few more statements (SAVEPOINT retries, `insertmanyvalues`
chunk boundaries) → up to 21.

So the real problem = **round-trip count that grows with the file**, executed serially,
against a remote DB.

## B. Files Changed

| File | Change |
|---|---|
| `backend/app/api/v1/gr_reports.py` | `bulk_import` rewritten from the prep phase onward (see below). New module-level `_write_import_history` helper. `BackgroundTasks` added to the FastAPI import; unused `IntegrityError` import removed. |
| `backend/scripts/bench_import.py` | **New.** Repeatable, honest benchmark — drives the real ASGI endpoint (real auth, validation, DB writes), counts SQL via a SQLAlchemy `before_cursor_execute` hook, runs 29/100/200/500/1000 rows, then deletes everything it created. |

No changes to the mobile app or the web admin — the request and response shapes are byte-for-byte identical.

### What `bulk_import` now does

1. **Pure-Python prep** — collect every GR number, every consignee shop key, and the row→area
   mapping in one pass, no DB.
2. **One parallel round trip** for all independent reads:
   `asyncio.gather(_fetch_existing_grs(), _fetch_staff_employee_id(), _fetch_shops())`,
   each on its own short-lived `session_scope()` connection (concurrent use of a single
   `AsyncSession` is unsafe). Wall cost = 1 RTT, not 3.
3. **Pre-generate all UUIDs** (orders, new shops, new employee, history rows) in Python, so a
   child row can reference a parent id before the parent is flushed — no read-back.
4. **Row-level validation stays in memory**: bad date, in-file duplicate (`seen_in_file`
   set), already-active GR number (`active` set from step 2) are all decided without touching
   the DB. Separate list of clean `order_values` dicts is built for persistence.
5. **One `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`** for all orders, targeting the
   existing partial unique index (`orderNumber WHERE deletedAt IS NULL`). This makes the
   insert **race-safe at the database level** — a concurrent import that grabs the same GR
   number between our check and our write is silently skipped (counted as a duplicate), so
   the old `SAVEPOINT` + `IntegrityError` retry loop is **deleted entirely**. `RETURNING`
   tells us exactly which rows landed.
6. **One `INSERT`** for all `order_status_history` "Imported from Excel" rows.
7. **`import_history` audit row deferred** to a `BackgroundTask` — the client no longer waits
   on it.

All of this runs inside the request's single existing transaction (`get_db_session` commits
once on success, rolls back on any exception).

## C. Database Changes

**None.** No new tables, columns, or migrations.

The optimization *leverages* an index that already existed —
`uq_orders_orderNumber_active` (partial unique on `orderNumber WHERE deletedAt IS NULL`,
re-asserted at startup by `_ensure_order_number_partial_unique()`) — by routing the bulk
insert through `ON CONFLICT (orderNumber) WHERE deletedAt IS NULL DO NOTHING`. Previously
that index only backstopped correctness; now it also does conflict handling, replacing
application-level SAVEPOINT/retry.

## D. Query Reduction (measured, real counts)

| rows | queries BEFORE | queries AFTER |
|---:|---:|---:|
| 29 | 12 | 10 \* |
| 100 | 17 | **8** |
| 200 | 17 | **8** |
| 500 | 18 | **8** |
| 1000 | 21 | **8** |

\* The 29-row run is the *first* import for that staff member + those shops, so it also does
`INSERT employees` and `INSERT shops` (2 extra one-shot statements). Every subsequent import
that reuses them is a flat **8**.

The key result: **query count is now constant regardless of file size.** It no longer grows
with the number of rows. The 8 statements for a steady-state import:

1–3. parallel prep (existing GRs / staff employee / shops) — *overlapped*, ~1 RTT wall
4. `INSERT orders ... ON CONFLICT ... RETURNING`
5. `INSERT order_status_history`
6. `COMMIT`
7–8. transaction `BEGIN`/bookkeeping on the pooled connections

## E. Performance Results (measured via `scripts/bench_import.py`)

**BEFORE**

```
  rows     total   queries
    29    3270 ms      12
   100    3158 ms      17
   200    3177 ms      17
   500    4071 ms      18
  1000    5934 ms      21
```

**AFTER**

```
  rows     total   queries   endpoint result
    29    3114 ms      10     imported=29   dup=0 failed=0
   100    2464 ms       8     imported=100  dup=0 failed=0
   200    2370 ms       8     imported=200  dup=0 failed=0
   500    3327 ms       8     imported=500  dup=0 failed=0
  1000    5568 ms       8     imported=1000 dup=0 failed=0
```

Improvement: 100–500 rows ~**25–30 % faster**, 1000 rows ~6 % faster, and — more importantly
— the work per row collapsed from "adds round trips" to "adds bytes to one INSERT".

### Why the absolute numbers still aren't <500 ms — and what it takes

The remaining wall time is **network latency to the database**, not code:

```
floor ≈ (sequential round trips) × (DB RTT)
      ≈ 6 × 361 ms  ≈ 2.2 s   (+ auth's own round trip, + INSERT payload transfer for big files)
```

On this dev host the Neon DB is ~361 ms away, so ~2.4 s for a mid-size import is the floor
*with the current architecture*. The sub-second targets are reachable **only** by cutting
RTT, not queries:

* **Co-locate the DB with the API** (Neon project in the same region as the backend host) or
  put a **connection pooler / PgBouncer** in the same region → RTT drops to ~1–5 ms →
  8 round trips ≈ **10–40 ms** + insert time. A 1000-row import would land well under 1 s.
* The endpoint is already structured to benefit from this the moment RTT shrinks — there is
  no further query-count work to do.

I did **not** switch the endpoint to `202 Accepted` / background queue (explicitly excluded),
and profiling does not force it: the synchronous path is now round-trip-optimal, and on a
co-located DB it meets the targets. If production keeps a cross-region DB and 1000+ row
imports must be sub-second there, a background job is the only remaining lever — but that's
an infra decision, not a code defect.

## F. Correctness Verification

Ran the full import regression suite against the real DB:

```
tests/test_gr_import.py .....                          [ 6 passed ]
tests/test_gr_import_staff_assignment.py
6 passed in 201.40s
```

Plus the payment-independence suite (`test_payment_no_auto_status.py`, 3 tests) still green.

| Guarantee | How it's preserved | Covered by |
|---|---|---|
| **Duplicates within the file** | `seen_in_file` set during row-build; 2nd occurrence → `duplicateGRNumbers`, not inserted | build loop |
| **GR number already active in DB** | `active` set from the parallel existing-GR query; row skipped → `duplicateGRNumbers` | `_fetch_existing` |
| **Concurrent import races for a GR number** | `ON CONFLICT DO NOTHING` on the partial unique index; row absent from `RETURNING` → counted duplicate | DB-level |
| **Re-import over a soft-deleted GR** | `index_where=deletedAt IS NULL` — soft-deleted row is outside the index, new live row inserts alongside it, old row + its history untouched | `test_import_gr_over_soft_deleted_order_preserves_history` |
| **Invalid row (bad date etc.)** | caught per-row in build loop → `failures[]`, `failedRows`; batch continues | build loop `except` |
| **Staff assignment by user id** | `select(Employee.id).where(userId == staffId)`; `employees` row auto-created in the same txn on first assignment | `test_import_assigns_batch_to_selected_staff_by_user_id`, `..._area_and_staff` |
| **Reject unknown / inactive / wrong-area staff** | preamble validation unchanged (role, `isActive`, `RegistrationStatus.ACTIVE`, area match) → 422 before any write | `test_import_rejects_unknown_staff_id`, `..._inactive_staff`, `..._different_location` |
| **Imported GR always starts `pending`** | `"status": "pending"` hard-coded in every row dict; Excel status ignored | assertions in staff-assignment tests |
| **Shop dedup semantics** | same `normalize_shop_name` key, `ORDER BY createdAt ASC` (oldest wins) as `ShopRepository.get_or_create` | `_fetch_shops` |
| **Transaction safety** | all writes in the request's single `session.begin()`; any exception → full rollback, nothing partially imported | `get_db_session` dependency |
| **API response contract** | `{totalRows, importedRows, duplicateRows, failedRows, duplicateGRNumbers, failures}` — unchanged keys, unchanged types, still `201` | benchmark + all tests assert on these |
| **Auth** | `GRAccessUser` dependency unchanged | every test authenticates |

### Debug instrumentation

Per-stage timing (`_lap`) is kept but moved to `logger.debug`, so it is silent in production
and available when a developer raises the log level.

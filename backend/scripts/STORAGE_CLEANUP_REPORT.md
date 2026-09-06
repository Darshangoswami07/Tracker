# Production DB Storage Audit & Cleanup — 2026-09-06

**Tool:** `backend/scripts/storage_audit.py` (read-only; `--vacuum` for a safe VACUUM ANALYZE pass).
Cleanup applied via a one-off `TRUNCATE` of the already-empty transactional tables + `VACUUM (ANALYZE)`.

---

## 1. Where the storage actually was

The transactional rows were already gone (previous reset). The ~150 MB was **dead
index pages** — a B-tree index does **not** shrink when you `DELETE` its rows, the
empty pages stay allocated until `REINDEX` / `TRUNCATE` / `VACUUM FULL`. The 150k-row
seed-and-delete cycle left this behind:

| table | rows | heap | **index bloat** |
|---|---:|---:|---:|
| `orders` | 0 | 32 KB | **65.8 MB** |
| `order_status_history` | 0 | 24 KB | **18.3 MB** |
| `payments` | 0 | 32 KB | **11.0 MB** |
| `shops` | 0 | 16 KB | 0.37 MB |
| `audit_logs` | 0 | 48 KB | 0.08 MB |
| everything else | — | tiny | tiny |

No TOAST usage anywhere (0 B on every table). Dead tuples were trivial (< 80 per
table) — regular autovacuum had already handled those; they were not the problem.

---

## 2. BEFORE

| metric | value |
|---|---|
| `pg_database_size` | **107 MB** (112,050,176 bytes) |
| Neon dashboard "storage" (reported by user) | ~154 MB |
| users | **18** (13 admin-tier + 5 staff) |
| companies | 17 · employees 4 · drivers 1 |
| largest tables | `orders` 65.8 MB, `order_status_history` 18.4 MB, `payments` 11.0 MB (all 0 rows — pure index bloat) |
| largest indexes | `ix_orders_staff_scope` 12.3 MB, `ix_orders_company_created` 9.4 MB, `order_status_history_pkey` 9.6 MB, `orders_pkey` 9.0 MB, `ix_order_status_history_orderId` 8.6 MB, `ix_orders_orderNumber` 7.8 MB (all on empty tables) |

---

## 3. What was done

### Data removed
`TRUNCATE TABLE payments, order_status_history, order_attachments, staff_settlements,
orders, shops, import_history, notifications, audit_logs, approval_logs, reports CASCADE`

- All 11 tables were **already at 0 rows** — the script aborts if any has rows, so no
  business data was destroyed by this step; it existed only to reset the *physical
  files* (heap + every index + TOAST) back to zero size, which `DELETE` cannot do.
- `TRUNCATE` is transactional in Postgres and, on empty tables in a pre-production
  DB with no traffic, takes its lock and releases it instantly — no downtime.

### Storage reclaimed
`VACUUM (ANALYZE)` on `users, companies, employees, registration_requests,
refresh_tokens, email_otps, alembic_version` — clears the residual dead tuples
(from repeated test logins / edits) and refreshes planner statistics.

- **No `VACUUM FULL`, no `REINDEX`, no table rewrites** — not needed once the empty
  tables were truncated, and explicitly avoided on populated tables to prevent locks.

### Indexes removed
**None.** Every index maps to a model definition, a primary key, a unique
constraint, or a foreign key. On an empty pre-production database "`idx_scan = 0`"
only means "unused *since the last stats reset*", which is not proof an index is
obsolete. Removing any would be guesswork against the requirement, so all indexes
were kept. They are currently 8–128 KB each (empty) and will grow only with real data.

### Preserved — untouched
`users`, `companies`, `employees`, `drivers`, `vehicles`, `customers`, `roles`,
`permissions`, `role_permissions`, `licenses`, `devices`, `refresh_tokens` (all
active login sessions — nobody logged out), `email_otps`, `password_resets`,
`registration_requests`, `driver_documents`, `driver_locations`,
`vehicle_assignments`, `vehicle_images`, `alembic_version`.
No user IDs, emails, phones, password hashes, roles, permissions, company links, or
account-status flags were read for modification or changed.

---

## 4. AFTER

| metric | value |
|---|---|
| `pg_database_size` | **11 MB** (11,968,512 bytes) |
| **reclaimed at the Postgres level** | **95.4 MB** (107 MB → 11 MB) |
| users | **18** — unchanged ✓ (13 admin-tier + 5 staff) |
| companies 17 · employees 4 · drivers 1 | unchanged ✓ |
| `orders` table (was 65.8 MB) | 120 KB |
| `order_status_history` (was 18.4 MB) | 24 KB |
| `payments` (was 11.0 MB) | 40 KB |
| dead tuples on preserved tables | 0 after VACUUM ANALYZE |

### Business-data counts — genuinely zero (computed live, not hardcoded)

| | |
|---|---|
| orders / GRs | **0** |
| deliveries / order_status_history | **0** |
| payments / collections | **0** |
| `SUM(payments.amount)` (revenue/collections) | **0** |
| `SUM(orders.toPay)` active (outstanding) | **0.0** |
| `SUM(staff_settlements.amount)` | **0** |
| shops · import_history · notifications · audit_logs · approval_logs · reports | **0** |
| `status_counts` → total / pending / delivered / cleared / uncleared | **0 / 0 / 0 / 0 / 0** |

### Functional verification (post-cleanup)

| check | result |
|---|---|
| user count before == after | 18 == 18 ✓ |
| admin-tier / staff still present | 13 / 5 ✓ |
| create a real GR → `status_counts` | total `0 → 1`, pending `0 → 1`, outstanding `0 → 500.0` — **counters move from real query data**; delete it → back to `0` |
| GR-create / order-repository path | works normally ✓ |
| roles / permissions / user IDs / credentials | untouched ✓ |

---

## 5. The Neon dashboard number (~154 MB)

`pg_database_size` — the live logical database — is now **11 MB**. If the Neon
console still shows a larger "storage" figure, that is **history storage**, not live
data:

- Neon stores every page change as WAL and retains it for the branch's
  **history-retention / point-in-time-restore window** (project setting; commonly
  1–7 days). The 150k-row seed, its bulk delete, and this `TRUNCATE` all wrote a lot
  of WAL that Neon keeps until that window rolls past — this is normal, legitimate,
  and self-correcting.
- It **shrinks automatically** once the retention window advances past those write
  bursts (a few days of no large writes).
- To reclaim it **immediately** (optional, and a Neon control-plane action I cannot
  perform from the database connection):
  - Neon Console → Project → Settings → **Storage / History retention** → lower the
    retention window, or
  - Create a fresh branch from `HEAD` and point the app at it (the new branch starts
    with near-zero history), or
  - `neonctl branches reset` if the Neon CLI is configured.

No further Postgres-level cleanup is possible or needed — the live database is at
its clean-production floor (schema + 18 users + master config + empty transactional
tables ≈ 11 MB).

---

## 6. Guarantees met

- ✓ All users preserved (18 → 18), IDs/credentials/roles/permissions/status untouched
- ✓ All required master/config data preserved
- ✓ All old test/transactional/derived data removed (genuinely 0 rows, not UI-faked)
- ✓ All calculated business metrics start at 0 — verified they come from live queries
- ✓ 95.4 MB reclaimed at the Postgres level (107 → 11 MB); residual Neon history is
  explained and self-clearing
- ✓ No `VACUUM FULL` / `DROP` / `TRUNCATE ALL` / schema recreation
- ✓ No foreign-key damage, no orphan rows, no authentication change

# Production Data Reset — completed (3rd run, 2026-09-06)

**Script:** `backend/scripts/reset_production_data.py` (committed, tracked in git).

```
.venv\Scripts\python.exe -m scripts.reset_production_data --dry-run   # report only
.venv\Scripts\python.exe -m scripts.reset_production_data --yes       # apply
```

Idempotent. Runs in a single transaction (all-or-nothing). Safe to re-run any
time dev/test activity re-accumulates operational rows before the real
production cutover.

## Why another run

This exact reset ran twice earlier in the project. Since the last run, normal
backend dev/test work re-accumulated **805 operational rows** (348 GRs, 13
payments, 360 status-history events, 66 auto-created shops, 18 Excel-import
logs). That is expected — every test that creates a GR leaves rows behind. This
run clears them back to the same clean baseline. The categorization is
unchanged from the confirmed plan.

---

## What was done

**805 operational rows deleted. 0 identity / auth / master rows touched.**

| Wiped (transactional / operational / derived / test-era) | rows |
|---|---:|
| `orders` — GR / shipment records | 348 |
| `order_status_history` — delivery/status events | 360 |
| `payments` — collection ledger | 13 |
| `shops` — all auto-created from consignee names | 66 |
| `import_history` — Excel bulk-import run log | 18 |
| `order_attachments` — slip photos | 0 |
| `staff_settlements` — owner/labour/driver cash handovers | 0 |
| `notifications` | 0 |
| `audit_logs` | 0 |
| `approval_logs` | 0 |
| `reports` — generated CSV report records | 0 |
| **total** | **805** |
| `drivers.totalDeliveries` / `currentLocation` → empty state | 0 rows needed reset |

| Preserved — untouched | rows |
|---|---:|
| `users` (13 admin-tier + 5 staff = 18) | 18 |
| `companies` | 17 |
| `employees` (staff identity + GR-assignment link) | 4 |
| `drivers` (identity) | 1 |
| `refresh_tokens` (active login sessions — nobody logged out) | 1147 |
| `registration_requests` | 17 |
| `email_otps` | 48 |
| roles / permissions / role_permissions / licenses / devices / customers / vehicles / driver_documents / driver_locations / vehicle_assignments / vehicle_images / password_resets | as-is (all 0 already) |
| `alembic_version` (schema version) | 1 |

No user IDs, credentials, password hashes, roles, company links, `isActive` /
`isApproved` / `isVerified` flags, or session tokens were modified.

Every `public` table is explicitly categorized — nothing was missed
(verified against `information_schema.tables`).

---

## Verification (run immediately after the reset)

| check | result |
|---|---|
| `orders`, `payments`, `order_status_history`, `shops`, `import_history`, `staff_settlements`, `notifications`, `audit_logs`, `approval_logs`, `reports`, `order_attachments` | **all 0** |
| identity tables unchanged | users 18, companies 17, employees 4, drivers 1 — all `OK` |
| **live metric probe** (same aggregates the dashboards run, not hardcoded) | live GR count `0`, `SUM(payments.amount)` `0`, `SUM(orders.toPay)` active `0.0`, `SUM(staff_settlements.amount)` `0` |
| admin-tier accounts still present & loginable | 13 (`super_admin` + 12 `admin`), credentials unchanged |
| staff accounts still present & loginable | 5, credentials unchanged |
| **create a real GR** (`gr_status_service.status_counts`) | company total `0 → 1`, pending `0 → 1`, outstanding `0 → 1000.0` — counters move from **real query data**; delete the GR → back to `0` |

The GR-create check proves the zeros are computed on demand from `orders` +
`payments` + `staff_settlements`, not faked in the UI: the moment one real row
exists, every counter reflects it.

---

## Notes / reminders

- **Shops are wiped by design** — in this database every `shops` row was
  auto-created from an imported consignee name, not entered as a master record.
  "All Shops" reads 0 until the first real GR/import, then a shop row
  regenerates automatically from the consignee (`ShopRepository.get_or_create`).
- **Nothing in this app persists dashboard/report/analytics numbers.** Every
  metric (Total GR, Delivered/Pending/Cleared/Uncleared, collections, revenue,
  staff performance, shop totals, daily/monthly stats) is computed live from
  the transaction tables. Clearing those tables ⇒ every counter reads 0. There
  was no cached statistic to reset.
- **Test-artifact accounts** (`@example.com`, `pwreset-test-*`, `debugfilter`,
  `mdtest-verify`, `diag-staff`, etc.) are still present — the "do not delete
  users" rule is absolute. The real client accounts are the `@gmail.com` ones.
  Delete the test accounts manually later if desired; that is out of scope for
  this reset.
- Re-run this script any time before the production cutover to clear whatever
  dev/test activity has piled up since.

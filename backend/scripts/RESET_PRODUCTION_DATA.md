# Production Data Reset — completed

**Script:** `backend/scripts/reset_production_data.py`
**Run against:** the database your `.env` / `DATABASE_URL` points at (Neon).
**Mode:** single transaction — all-or-nothing. Re-runnable (idempotent: a second
run deletes 0 rows).

```
.venv\Scripts\python.exe -m scripts.reset_production_data --dry-run   # report only
.venv\Scripts\python.exe -m scripts.reset_production_data --yes       # apply
```

---

## What was done

**447 operational rows deleted, 0 identity/auth rows touched.**

| Wiped (transactional / derived / test-era) | rows |
|---|---|
| `orders` (GR / shipment records) | 78 |
| `payments` (collection ledger) | 4 |
| `order_status_history` (delivery/status events) | 85 |
| `order_attachments` (slip photos) | 16 |
| `staff_settlements` (owner/labour/driver handovers) | 19 |
| `shops` (all auto-created from test imports) | 99 |
| `import_history` (Excel import run log) | 53 |
| `notifications` | 22 |
| `audit_logs` | 47 |
| `approval_logs` | 24 |
| `reports` | 0 |
| **total** | **447** |

Plus: `drivers.totalDeliveries` / `currentLocation` reset to empty state (the one
driver row was already at 0 — nothing to change).

| Preserved — untouched | rows |
|---|---|
| `users` (admins, staff, owners) | 17 |
| `companies` | 17 |
| `employees` (staff identity + assignment link) | 3 |
| `drivers` (identity) | 1 |
| `refresh_tokens` (active login sessions) | 956 |
| `registration_requests` (onboarding trail) | 17 |
| `email_otps` | 48 |
| `roles`, `permissions`, `role_permissions`, `licenses`, `devices`, `customers`, `vehicles`, `driver_documents`, `driver_locations`, `vehicle_assignments`, `vehicle_images`, `password_resets` | as-is |

No user IDs, credentials, roles, company links, or approval flags were modified.

---

## Why the metrics now read 0 (not hardcoded)

Nothing in this app stores dashboard / report / analytics numbers. Every metric —
Total GR, Pending, Delivered, Cleared, Uncleared, collections, revenue, staff
performance, shop totals, daily/monthly stats — is computed on demand from
`orders` + `payments` + `staff_settlements` (`gr_status_service`,
`staff_work_service`, `order_repository.get_revenue_overview`). With those rows
gone, every query returns 0. There is no cache table and no seeded zero.

---

## Verification (run after the reset)

| check | result |
|---|---|
| `status_counts` (platform-wide) | `total 0, pending 0, cleared 0, uncleared 0, delivered 0` |
| `status_counts` per company (both real admins) | all 0 |
| `get_revenue_overview` (today/week/month/prev) | all `0.0` |
| staff `daily_activity` (real staff account, today) | all 0 |
| identity tables unchanged | users 17, companies 17, employees 3, drivers 1 — all OK |
| 3 real accounts: `status`, `isActive`, `isApproved`, `isVerified`, password hash | intact |
| employees still linked to their user + company rows | yes |
| login endpoint, real email + wrong password | clean `401 Invalid email or password.` (pipeline intact, not a crash) |
| login endpoint, unknown email | `401` |
| **create a real GR** (in a rolled-back tx) | company `total 0 → 1`, `pending 0 → 1`, then back to 0 after rollback — counters move from real data |

12 admin-tier and 5 staff accounts remain and can log in with unchanged
credentials. Existing sessions are not invalidated.

---

## Notes / follow-ups

- **Shops were wiped** (your choice). "All Shops" shows 0 until real GRs arrive;
  a shop row is recreated automatically from the consignee name the moment a
  real GR is created or imported. Nothing else references `shops`
  (`orders.shopId` is `ON DELETE SET NULL`).
- **Test-artifact user accounts** still present (not deleted — per your rule):
  `listings-admin1@example.com`, `mdtest-verify@example.com`,
  `pwpolicy-test-*`, `pwreset-test-*` (×2), `listings-emp4@example.com`,
  `diag-staff@example.com`, `p48818849@gmail.com`. These are from the automated
  test suites. Real client accounts are the `@gmail.com` ones. Say the word if
  you want a second pass to remove the obvious test accounts.
- The one remaining UI step is a manual login on the real app — every layer
  beneath it (DB rows, auth pipeline, metric queries, GR-create path) is
  verified above.
- `backend/scripts/reset_production_data.py` is new and currently uncommitted.

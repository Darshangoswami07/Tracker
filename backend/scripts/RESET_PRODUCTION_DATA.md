# Production Data Reset — completed (2nd run)

**Script:** `backend/scripts/reset_production_data.py` (now committed, tracked in git —
see [note below](#note-why-a-second-run-was-needed)).

```
.venv\Scripts\python.exe -m scripts.reset_production_data --dry-run   # report only
.venv\Scripts\python.exe -m scripts.reset_production_data --yes       # apply
```

## Note: why a second run was needed

This exact reset was already run once earlier in this session (447 rows wiped
then). Since that run, further dev/test activity re-accumulated 313 rows of
new operational data (105 GRs, 26 payments, 63 shops, etc.) — a normal side
effect of continued backend work against the same database, not a failure of
the first reset. This run clears that back out to the same clean baseline.
The categorization decisions (wipe shops — they're 100% import-derived here;
clear import/notification/audit/approval logs; keep `refresh_tokens` so no
one is logged out) are unchanged from the first run's confirmed plan.

---

## What was done

**313 operational rows deleted, 0 identity/auth rows touched.**

| Wiped (transactional / derived / test-era) | rows |
|---|---|
| `orders` (GR / shipment records) | 105 |
| `payments` (collection ledger) | 26 |
| `order_status_history` (delivery/status events) | 113 |
| `order_attachments` (slip photos) | 0 |
| `staff_settlements` (owner/labour/driver handovers) | 2 |
| `shops` (all auto-created from consignee names) | 63 |
| `import_history` (Excel import run log) | 3 |
| `notifications` | 0 |
| `audit_logs` | 1 |
| `approval_logs` | 0 |
| `reports` | 0 |
| **total** | **313** |

| Preserved — untouched | rows |
|---|---|
| `users` (admins, staff, owners) | 17 |
| `companies` | 17 |
| `employees` (staff identity + assignment link) | 4 |
| `drivers` (identity) | 1 |
| `refresh_tokens` (active login sessions) | 1018 |
| `registration_requests`, `email_otps`, roles/permissions/licenses/devices/customers/vehicles | as-is |

No user IDs, credentials, roles, company links, or approval flags were modified.

---

## Verification (run after the reset)

| check | result |
|---|---|
| `status_counts` (platform-wide) | `total 0, pending 0, cleared 0, uncleared 0, delivered 0` |
| `revenue_overview.totalCollected` | `0.0` |
| identity tables unchanged | users 17, companies 17, employees 4, drivers 1 — all OK |
| 2 real accounts: `status`, `isActive`, `isApproved`, `isVerified`, password hash | intact |
| login endpoint, real email + wrong password | clean `401 Invalid email or password.` (pipeline intact, not a crash) |
| **create a real GR** (in a rolled-back tx) | `total 0 → 1, pending 0 → 1`, then back to `0` after rollback — counters move from real data, nothing hardcoded |

12 admin-tier and 5 staff accounts remain and can log in with unchanged credentials.

---

## Reminder

- Shops are wiped by design — "All Shops" reads 0 until a real GR/import creates one; a shop row regenerates automatically from the consignee name.
- Test-artifact accounts (`@example.com`, `pwreset-test-*`, etc.) are still present — not deleted, per the "do not delete users" rule. Real accounts are the `@gmail.com` ones.
- This script is idempotent and safe to re-run any time dev/test activity needs clearing again before the real production cutover — it always reports before/after counts and only ever touches the transactional tables listed above.

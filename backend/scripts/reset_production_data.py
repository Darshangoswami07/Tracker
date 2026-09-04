"""Production data reset — wipe operational/transactional data, keep identity.

Prepares the database for a clean client production start. It deletes **only**
business/transactional rows (GRs, payments, deliveries, collections,
settlements, import runs, activity logs, shops) and rebuilds the two stored
performance counters. It never touches users, companies, staff/employee,
driver *identity*, roles, permissions, licences, devices, login sessions, OTP
records or onboarding/approval state — so every existing account logs in
afterward with the exact same credentials, role and company.

Nothing in this app persists dashboard/report/analytics values — every metric
(Total GR, Delivered, Pending, Cleared, Uncleared, collections, revenue,
staff performance, shop totals, daily/monthly stats) is computed on demand
from ``orders`` + ``payments`` + ``staff_settlements``. So once those rows are
gone every counter naturally reads 0; there is no cached number to fake.

Usage (from ``backend/``)::

    .venv\\Scripts\\python.exe -m scripts.reset_production_data --dry-run
    .venv\\Scripts\\python.exe -m scripts.reset_production_data --yes

Run it once, against the environment your ``.env`` / ``DATABASE_URL`` points
at. It runs everything in a single transaction: it either completes fully or
changes nothing.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

try:  # keep the report readable on a legacy Windows code page
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from sqlalchemy import text  # noqa: E402

from app.database.db import session_scope  # noqa: E402

# ---------------------------------------------------------------------------
# PRESERVED — identity, access, master & configuration data. NEVER touched.
# ---------------------------------------------------------------------------
PRESERVED_TABLES = [
    "users",                 # all accounts: admins, staff, business owners
    "companies",             # tenants
    "employees",             # staff identity / company link / assignment target
    "drivers",               # driver identity (perf counters reset below, row kept)
    "vehicles",
    "customers",
    "roles",
    "permissions",
    "role_permissions",
    "licenses",
    "devices",
    "refresh_tokens",        # active login sessions — nobody gets logged out
    "email_otps",            # transient auth codes
    "password_resets",
    "registration_requests", # onboarding trail for the existing accounts
    "driver_documents",
    "driver_locations",
    "vehicle_assignments",
    "vehicle_images",
]

# ---------------------------------------------------------------------------
# WIPED — transactional / operational / derived / test-era activity.
# Ordered child-before-parent so a plain DELETE is always FK-safe even though
# most order-child FKs are ON DELETE CASCADE.
# ---------------------------------------------------------------------------
WIPED_TABLES = [
    "payments",              # collection ledger
    "order_status_history",  # delivery / status events
    "order_attachments",     # slip photos on GRs
    "staff_settlements",     # owner / labour / driver cash handovers
    "orders",                # GR / shipment records (the heart of it)
    "shops",                 # all import-derived; recreated from consignee on first real GR
    "import_history",        # Excel bulk-import run log
    "notifications",         # in-app activity notifications
    "audit_logs",            # system action audit trail (test era)
    "approval_logs",         # approval/rejection action log (test era)
    "reports",               # generated CSV report records
]

# Stored performance counters on preserved rows → back to their empty state.
COUNTER_RESETS = [
    ('UPDATE drivers SET "totalDeliveries" = 0, "currentLocation" = NULL '
     'WHERE "totalDeliveries" <> 0 OR "currentLocation" IS NOT NULL'),
]


async def _counts(session, tables: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for t in tables:
        out[t] = (await session.execute(text(f'SELECT count(*) FROM "{t}"'))).scalar() or 0
    return out


async def _print_metric_probe(session) -> None:
    """Hit the same aggregates the dashboards/reports use, to prove they read 0
    from real queries (not hardcoded)."""
    gr_total = (await session.execute(text(
        'SELECT count(*) FROM orders WHERE "isActive" = true AND "deletedAt" IS NULL'
    ))).scalar()
    collected = (await session.execute(text(
        "SELECT COALESCE(SUM(amount), 0) FROM payments"
    ))).scalar()
    outstanding = (await session.execute(text(
        'SELECT COALESCE(SUM("toPay"), 0) FROM orders '
        'WHERE "isActive" = true AND "deletedAt" IS NULL'
    ))).scalar()
    settlements = (await session.execute(text(
        "SELECT COALESCE(SUM(amount), 0) FROM staff_settlements"
    ))).scalar()
    print(f"    live GR count (dashboard 'Total GR')      : {gr_total}")
    print(f"    SUM(payments.amount) (collections/revenue) : {collected}")
    print(f"    SUM(orders.toPay) active (outstanding)     : {outstanding}")
    print(f"    SUM(staff_settlements.amount)              : {settlements}")


async def main(dry_run: bool, assume_yes: bool) -> None:
    async with session_scope() as session:
        print("=" * 70)
        print("PRODUCTION DATA RESET" + ("  [DRY RUN]" if dry_run else ""))
        print("=" * 70)

        preserved = await _counts(session, PRESERVED_TABLES)
        wiped = await _counts(session, WIPED_TABLES)

        print("\nPRESERVED (untouched):")
        for t, n in preserved.items():
            print(f"  {t:24} {n:>8}")
        print(f"\n  users still able to log in           : {preserved['users']}")

        print("\nTO BE WIPED:")
        total_wipe = 0
        for t, n in wiped.items():
            total_wipe += n
            print(f"  {t:24} {n:>8}")
        print(f"  {'TOTAL ROWS TO DELETE':24} {total_wipe:>8}")
        print("  drivers.totalDeliveries / currentLocation -> reset to empty state")

        if dry_run:
            print("\nDRY RUN — no changes made.")
            return

        if not assume_yes:
            print(
                "\nThis permanently deletes the rows above. Users, logins, roles "
                "and company config are NOT affected."
            )
            reply = input('Type  RESET  to proceed: ').strip()
            if reply != "RESET":
                print("Aborted — nothing changed.")
                return

        # Single transaction: all-or-nothing.
        print("\nApplying reset...")
        for t in WIPED_TABLES:
            res = await session.execute(text(f'DELETE FROM "{t}"'))
            print(f"  deleted {res.rowcount:>8}  from {t}")
        for stmt in COUNTER_RESETS:
            res = await session.execute(text(stmt))
            print(f"  reset   {res.rowcount:>8}  rows ({stmt.split()[1]} counters)")
        # session_scope commits on exit.

    # Fresh connection for verification.
    async with session_scope() as session:
        print("\n" + "-" * 70)
        print("VERIFICATION")
        print("-" * 70)
        after_wiped = await _counts(session, WIPED_TABLES)
        bad = {t: n for t, n in after_wiped.items() if n != 0}
        for t, n in after_wiped.items():
            print(f"  {t:24} {n:>8}")
        after_preserved = await _counts(session, PRESERVED_TABLES)
        print("\n  identity/master tables unchanged:")
        for t in ("users", "companies", "employees", "drivers"):
            mark = "OK" if after_preserved[t] == preserved[t] else "CHANGED!"
            print(f"    {t:22} {after_preserved[t]:>6}  ({mark})")

        print("\n  live metric probe (must all be 0):")
        await _print_metric_probe(session)

        admins = (await session.execute(text(
            "SELECT email, role FROM users WHERE role IN "
            "('admin','super_admin','business_owner') ORDER BY role, email"
        ))).all()
        staff = (await session.execute(text(
            "SELECT email FROM users WHERE role IN ('staff','employee') ORDER BY email"
        ))).all()
        print(f"\n  admin-tier accounts preserved ({len(admins)}):")
        for e, r in admins:
            print(f"    {r:14} {e}")
        print(f"  staff accounts preserved ({len(staff)}):")
        for (e,) in staff:
            print(f"    {e}")

        if bad:
            print(f"\n!! WARNING: these tables are not empty: {bad}")
            sys.exit(1)
        print("\nRESET COMPLETE — database is at a clean production baseline.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    ap.add_argument("--yes", action="store_true", help="skip the interactive confirmation")
    args = ap.parse_args()
    asyncio.run(main(dry_run=args.dry_run, assume_yes=args.yes))

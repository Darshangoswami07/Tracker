"""Postgres/Neon storage audit — measure where bytes actually live, before and
after any cleanup. Read-only unless --vacuum is passed.

    .venv\\Scripts\\python.exe -m scripts.storage_audit
    .venv\\Scripts\\python.exe -m scripts.storage_audit --vacuum   # VACUUM (ANALYZE) tables with dead tuples
"""
from __future__ import annotations

import argparse
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from sqlalchemy import text  # noqa: E402

from app.database.db import _get_engine, session_scope  # noqa: E402

IDENTITY_MASTER = {
    "users", "companies", "employees", "drivers", "vehicles", "customers",
    "roles", "permissions", "role_permissions", "licenses", "devices",
    "refresh_tokens", "email_otps", "password_resets", "registration_requests",
    "driver_documents", "driver_locations", "vehicle_assignments", "vehicle_images",
    "alembic_version",
}


async def _one(s, sql, **kw):
    return (await s.execute(text(sql), kw)).scalar()


async def audit(vacuum: bool) -> None:
    async with session_scope() as s:
        dbname = await _one(s, "SELECT current_database()")
        dbsize = await _one(s, "SELECT pg_size_pretty(pg_database_size(current_database()))")
        dbsize_b = await _one(s, "SELECT pg_database_size(current_database())")
        print("=" * 78)
        print(f"STORAGE AUDIT — {dbname}")
        print("=" * 78)
        print(f"pg_database_size : {dbsize}  ({dbsize_b:,} bytes)")

        print("\n--- per-table size (table + TOAST + indexes), largest first ---")
        print(f"  {'table':26} {'rows':>9} {'total':>11} {'table':>10} {'toast':>9} {'indexes':>10}  class")
        rows = (await s.execute(text("""
            SELECT c.relname AS name,
                   c.reltuples::bigint AS est_rows,
                   pg_total_relation_size(c.oid) AS total,
                   pg_table_size(c.oid) - COALESCE(pg_relation_size(c.reltoastrelid),0) AS heap,
                   COALESCE(pg_relation_size(c.reltoastrelid),0) AS toast,
                   pg_indexes_size(c.oid) AS idx
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r'
            ORDER BY pg_total_relation_size(c.oid) DESC
        """))).all()
        for r in rows:
            cls = "KEEP (identity/master)" if r.name in IDENTITY_MASTER else "transactional"
            print(f"  {r.name:26} {r.est_rows:>9} {_pp(r.total):>11} {_pp(r.heap):>10} "
                  f"{_pp(r.toast):>9} {_pp(r.idx):>10}  {cls}")

        print("\n--- dead tuples / bloat (pg_stat_user_tables) ---")
        print(f"  {'table':26} {'live':>10} {'dead':>10} {'dead%':>7}  last_(auto)vacuum")
        dead = (await s.execute(text("""
            SELECT relname, n_live_tup, n_dead_tup,
                   GREATEST(last_vacuum, last_autovacuum) AS lv
            FROM pg_stat_user_tables
            ORDER BY n_dead_tup DESC, n_live_tup DESC
        """))).all()
        vacuum_targets = []
        for r in dead:
            pct = (r.n_dead_tup / (r.n_live_tup + r.n_dead_tup) * 100) if (r.n_live_tup + r.n_dead_tup) else 0
            if r.n_dead_tup > 50 or pct > 10:
                vacuum_targets.append(r.relname)
            print(f"  {r.relname:26} {r.n_live_tup:>10} {r.n_dead_tup:>10} {pct:>6.1f}%  {r.lv or '-'}")

        print("\n--- index usage (idx_scan = times used since stats reset) ---")
        print(f"  {'index':40} {'on table':20} {'scans':>9} {'size':>10}")
        idx = (await s.execute(text("""
            SELECT i.indexrelname AS idx, i.relname AS tbl, i.idx_scan,
                   pg_relation_size(i.indexrelid) AS sz,
                   ix.indisunique, ix.indisprimary
            FROM pg_stat_user_indexes i
            JOIN pg_index ix ON ix.indexrelid = i.indexrelid
            ORDER BY i.idx_scan ASC, pg_relation_size(i.indexrelid) DESC
        """))).all()
        for r in idx:
            tag = "PK" if r.indisprimary else ("UNIQUE" if r.indisunique else "")
            flag = "  <-- 0 scans" if r.idx_scan == 0 and not r.indisprimary and not r.indisunique else ""
            print(f"  {r.idx:40} {r.tbl:20} {r.idx_scan:>9} {_pp(r.sz):>10} {tag}{flag}")

        print("\n--- sequences ---")
        seqs = (await s.execute(text(
            "SELECT relname FROM pg_class WHERE relkind='S'"))).scalars().all()
        print(f"  {len(seqs)} sequence(s): {', '.join(seqs) or '(none)'}")

        print("\n--- business-data counts (must be 0 for a clean production start) ---")
        for t in ("orders", "payments", "order_status_history", "order_attachments",
                  "staff_settlements", "shops", "import_history", "notifications",
                  "audit_logs", "approval_logs", "reports"):
            print(f"  {t:26} {await _one(s, f'SELECT count(*) FROM \"{t}\"'):>8}")

        print("\n--- identity / master (preserved) ---")
        for t in ("users", "companies", "employees", "drivers", "roles",
                  "permissions", "role_permissions", "refresh_tokens", "registration_requests"):
            print(f"  {t:26} {await _one(s, f'SELECT count(*) FROM \"{t}\"'):>8}")

    if vacuum and vacuum_targets:
        print(f"\n--- VACUUM (ANALYZE) on {len(vacuum_targets)} table(s) with dead tuples ---")
        # VACUUM cannot run inside a transaction block → autocommit connection.
        raw = await _get_engine().connect()
        await raw.execution_options(isolation_level="AUTOCOMMIT")
        for t in vacuum_targets:
            await raw.execute(text(f'VACUUM (ANALYZE, VERBOSE) "{t}"'))
            print(f"  vacuumed {t}")
        await raw.close()
        print("\nRe-run without --vacuum to see the after picture.")
    elif vacuum:
        print("\nNo tables need vacuuming (no significant dead-tuple accumulation).")


def _pp(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024:
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--vacuum", action="store_true")
    asyncio.run(audit(ap.parse_args().vacuum))

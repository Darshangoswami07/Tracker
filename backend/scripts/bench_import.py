"""Repeatable benchmark for POST /api/v1/admin/orders/import.

Creates a throwaway admin + company + staff, drives the REAL endpoint through
the ASGI app (real auth, real validation, real DB writes) for 29/100/200/500/
1000 rows, counts SQL statements via a SQLAlchemy event hook, prints per-stage
timing, then deletes every row it created (orders + histories + import_history
+ shops + the temp company/users). Nothing else in the DB is touched.

    .venv\\Scripts\\python.exe -m scripts.bench_import
"""
from __future__ import annotations

import asyncio
import sys
import time
import uuid

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import httpx  # noqa: E402
from sqlalchemy import event, text  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database.db import get_session_maker, session_scope  # noqa: E402
from app.models.enums import RegistrationStatus, UserRole  # noqa: E402
from app.repositories.user_repository import UserRepository  # noqa: E402
from main import app  # noqa: E402

SIZES = [29, 100, 200, 500, 1000]
_BENCH_TAG = uuid.uuid4().hex[:8].upper()


def _rows(n: int, offset: int) -> list[dict]:
    return [
        {
            "rowNumber": i + 1,
            "grNumber": f"BM{_BENCH_TAG}{offset + i:06d}",
            "grDateIso": "2026-06-15T00:00:00Z",
            "consignorName": f"Consignor {i % 40}",
            "consigneeName": f"Bench Shop {i % 25}",
            "fromLocation": "Bageshwar Depot",
            "toLocation": "Haldwani",
            "particulars": f"{(i % 20) + 1} boxes of goods",
            "packageCount": (i % 20) + 1,
            "weight": 10.5 + (i % 50),
            "paymentMode": ["cash", "upi", "bank_transfer"][i % 3],
            "toPay": 500 + (i % 30) * 100,
        }
        for i in range(n)
    ]


async def _setup() -> tuple[str, str, str, str]:
    repo = UserRepository()
    company_id = str(uuid.uuid4())
    async with session_scope() as s:
        from app.models.company import Company

        s.add(Company(id=uuid.UUID(company_id), name=f"Bench Co {_BENCH_TAG}"))
        await s.flush()

    async def _user(email, role):
        u = await repo.create(
            full_name="Bench", email=email, phone=f"+1555{uuid.uuid4().int % 10_000_000:07d}",
            password_hash=hash_password("BenchPass123!"), role=role,
        )
        async with session_scope() as s:
            du = await s.get(type(u), u.id)
            du.status = RegistrationStatus.ACTIVE
            du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
            du.companyId = uuid.UUID(company_id)
            await s.flush()
        return str(u.id)

    admin_email = f"bench-admin-{_BENCH_TAG}@example.com"
    staff_email = f"bench-staff-{_BENCH_TAG}@example.com"
    admin_id = await _user(admin_email, UserRole.ADMIN)
    staff_id = await _user(staff_email, UserRole.STAFF)
    r = await _client().post("/api/v1/auth/login", json={"email": admin_email, "password": "BenchPass123!"})
    token = r.json()["data"]["tokens"]["accessToken"]
    return company_id, admin_id, staff_id, token


_client_singleton: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bench")
    return _client_singleton


async def main() -> None:
    company_id, admin_id, staff_id, token = await _setup()
    h = {"Authorization": f"Bearer {token}"}
    engine = get_session_maker().kw["bind"].sync_engine

    print(f"\n{'rows':>6} {'total':>9} {'queries':>8}   endpoint result")
    print("-" * 70)
    offset = 0
    for n in SIZES:
        q = {"count": 0}

        def _count(conn, cursor, statement, params, ctx, many):  # noqa: ANN001
            q["count"] += 1

        event.listen(engine, "before_cursor_execute", _count)
        t = time.perf_counter()
        r = await _client().post(
            "/api/v1/admin/orders/import",
            headers=h,
            json={
                "fileName": f"bench-{n}.xlsx", "staffId": staff_id, "area": None,
                "rows": _rows(n, offset),
            },
        )
        dur = (time.perf_counter() - t) * 1000
        event.remove(engine, "before_cursor_execute", _count)
        offset += n
        body = r.json()
        d = body.get("data", body)
        print(f"{n:>6} {dur:>8.0f}ms {q['count']:>8}   status={r.status_code} "
              f"imported={d.get('importedRows')} dup={d.get('duplicateRows')} failed={d.get('failedRows')}")

    # ---- cleanup: delete everything this benchmark created ----
    async with session_scope() as s:
        await s.execute(text(
            'DELETE FROM orders WHERE "orderNumber" LIKE :p'), {"p": f"BM{_BENCH_TAG}%"})
        await s.execute(text(
            'DELETE FROM import_history WHERE "companyId" = :c'), {"c": company_id})
        await s.execute(text(
            'DELETE FROM shops WHERE "companyId" = :c'), {"c": company_id})
        await s.execute(text('DELETE FROM employees WHERE "companyId" = :c'), {"c": company_id})
        await s.execute(text('DELETE FROM refresh_tokens WHERE "userId" IN (:a, :b)'),
                        {"a": admin_id, "b": staff_id})
        await s.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": admin_id, "b": staff_id})
        await s.execute(text("DELETE FROM companies WHERE id = :c"), {"c": company_id})
    await _client().aclose()
    print("\ncleanup done — benchmark rows/company/users removed.")


if __name__ == "__main__":
    asyncio.run(main())

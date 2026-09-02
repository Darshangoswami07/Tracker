"""Regression test for the Excel GR bulk-import NOT NULL violation.

Reproduces the exact failure: a GR number that previously existed as a
soft-deleted Order (with its own order_status_history rows) is re-imported.
The import path physically deletes the stale Order to make way for the new
one; before the fix, SQLAlchemy's default relationship cascade nulled out
the dependent order_status_history.orderId (NOT NULL) instead of letting the
database's ON DELETE CASCADE remove the rows, causing a NotNullViolation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus, RegistrationStatus, UserRole
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
GR_BASE = "/api/v1/admin/orders"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_active_admin(client, email: str, phone: str, company_id: str, password: str = "Password123!"):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test Admin",
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=UserRole.ADMIN,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        db_user.status = RegistrationStatus.ACTIVE
        db_user.isActive = True
        db_user.isApproved = True
        db_user.isVerified = True
        db_user.otpVerified = True
        db_user.companyId = uuid.UUID(company_id)
        await session.flush()

    resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["tokens"]["accessToken"]


async def create_company(name: str = "Acme Transport") -> str:
    company = Company(name=name, status=CompanyStatus.ACTIVE)
    async with session_scope() as session:
        session.add(company)
        await session.flush()
        return str(company.id)


async def make_soft_deleted_order_with_history(gr_number: str, company_id: str) -> None:
    """Simulates a GR that was previously imported and then deleted -
    leaving behind a soft-deleted Order row plus its order_status_history."""
    async with session_scope() as session:
        order = Order(
            orderNumber=gr_number,
            companyId=company_id,
            consignorName="Old Consignor",
            consigneeName="Old Consignee",
            pickupAddress="Old Pickup",
            deliveryAddress="Old Delivery",
            pickupTime=datetime.now(timezone.utc),
            status="pending",
            source="excel",
        )
        session.add(order)
        await session.flush()
        session.add(OrderStatusHistory(orderId=order.id, status="pending", notes="Created"))
        await session.flush()
        order.soft_delete()
        await session.flush()


def import_row(row_number: int, gr_number: str) -> dict:
    return {
        "rowNumber": row_number,
        "grNumber": gr_number,
        "consignorName": "Ramesh Traders",
        "consigneeName": "Suresh & Co",
        "fromLocation": "Haldwani",
        "toLocation": "Bageshwar",
        "particulars": "3 boxes",
        "packageCount": 3,
        "weight": 45.5,
    }


async def test_import_gr_over_soft_deleted_order_does_not_null_status_history(client):
    """The exact repro for the six failing GRs (6993, 7002, 6896, 6951, 6998,
    6955): re-importing a GR number whose prior Order was soft-deleted must
    not raise a NotNullViolation on order_status_history.orderId, and the
    newly created status-history row must point at the new order's id."""
    company_id = await create_company()
    token = await create_active_admin(client, "gr-import-admin@example.com", "+15552000099", company_id)

    failing_grs = ["6993", "7002", "6896", "6951", "6998", "6955"]
    for gr in failing_grs:
        await make_soft_deleted_order_with_history(gr, company_id)

    resp = await client.post(
        f"{GR_BASE}/import",
        json={
            "fileName": "grs.xlsx",
            "area": None,
            "rows": [import_row(i + 1, gr) for i, gr in enumerate(failing_grs)],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["totalRows"] == 6
    assert data["failedRows"] == 0, data["failures"]
    assert data["importedRows"] == 6

    async with session_scope() as session:
        for gr in failing_grs:
            order = (
                await session.execute(select(Order).where(Order.orderNumber == gr, Order.deletedAt.is_(None)))
            ).scalar_one()
            history_rows = (
                await session.execute(
                    select(OrderStatusHistory).where(OrderStatusHistory.orderId == order.id)
                )
            ).scalars().all()
            assert len(history_rows) == 1
            assert history_rows[0].orderId == order.id
            assert history_rows[0].orderId is not None

            # The old soft-deleted order + its history must be gone (cascade
            # delete via ON DELETE CASCADE), not left as an orphan.
            leftover_soft_deleted = (
                await session.execute(select(Order).where(Order.orderNumber == gr, Order.deletedAt.isnot(None)))
            ).scalars().all()
            assert leftover_soft_deleted == []


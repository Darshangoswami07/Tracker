"""Excel GR bulk-import: re-importing a GR number whose prior Order was
soft-deleted.

The soft-deleted Order (plus its order_status_history and payments) is the
permanent record of what a staff member did against that GR, so the import
must NOT touch it. Instead the new live row is created alongside it — the
partial unique index on ``orders.orderNumber`` (``WHERE deletedAt IS NULL``)
allows both to coexist. Nothing is nulled and nothing cascade-deletes.
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


async def test_import_gr_over_soft_deleted_order_preserves_history(client):
    """Re-importing a GR number whose prior Order was soft-deleted:
      * succeeds, creating a NEW live Order row,
      * its new status-history row points at the NEW order's id (no
        NotNullViolation), and
      * the OLD soft-deleted Order and its status-history are PRESERVED —
        they are the permanent record of past staff work."""
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
            new_order = (
                await session.execute(select(Order).where(Order.orderNumber == gr, Order.deletedAt.is_(None)))
            ).scalar_one()
            new_history = (
                await session.execute(
                    select(OrderStatusHistory).where(OrderStatusHistory.orderId == new_order.id)
                )
            ).scalars().all()
            assert len(new_history) == 1
            assert new_history[0].orderId == new_order.id

            # The old soft-deleted order + its history MUST still exist — it is
            # the historical record of prior staff work and is never touched by
            # a re-import.
            old_order = (
                await session.execute(select(Order).where(Order.orderNumber == gr, Order.deletedAt.isnot(None)))
            ).scalar_one()
            assert old_order.id != new_order.id
            old_history = (
                await session.execute(
                    select(OrderStatusHistory).where(OrderStatusHistory.orderId == old_order.id)
                )
            ).scalars().all()
            assert len(old_history) == 1
            assert old_history[0].notes == "Created"


async def _active_staff(email: str, phone: str, company_id: str, area: str | None = None):
    repo = UserRepository()
    user = await repo.create(
        full_name="Import Staff", email=email, phone=phone,
        password_hash=hash_password("Password123!"), role=UserRole.STAFF,
    )
    async with session_scope() as session:
        du = await session.get(type(user), user.id)
        du.status = RegistrationStatus.ACTIVE
        du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
        du.companyId = uuid.UUID(company_id)
        du.area = area
        await session.flush()
    return str(user.id)


async def test_import_assigns_batch_to_selected_staff_by_user_id(client):
    """The mandatory Select-Staff step: `staffId` is the staff member's USER
    id (what `GET /admin/users?role=staff` returns). Every imported GR must
    land assigned to that staff's `employees` row, and start `pending`."""
    company_id = await create_company("Import Co A")
    token = await create_active_admin(client, "import-staff-admin@example.com", "+15552000200", company_id)
    staff_user_id = await _active_staff("import-staff-a@example.com", "+15552000201", company_id, area=None)

    grs = ["IMP-9001", "IMP-9002", "IMP-9003"]
    resp = await client.post(
        f"{GR_BASE}/import",
        json={"fileName": "s.xlsx", "area": None, "staffId": staff_user_id,
              "rows": [import_row(i + 1, g) for i, g in enumerate(grs)]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["importedRows"] == 3

    from app.models.employee import Employee
    async with session_scope() as session:
        emp_id = await session.scalar(select(Employee.id).where(Employee.userId == staff_user_id))
        assert emp_id is not None
        for g in grs:
            o = (await session.execute(select(Order).where(Order.orderNumber == g))).scalar_one()
            assert o.assignedStaffId == emp_id
            assert (o.status.value if hasattr(o.status, "value") else o.status) == "pending"


async def test_import_rejects_unknown_staff_id(client):
    company_id = await create_company("Import Co B")
    token = await create_active_admin(client, "import-staff-admin2@example.com", "+15552000202", company_id)
    resp = await client.post(
        f"{GR_BASE}/import",
        json={"fileName": "s.xlsx", "area": None, "staffId": str(uuid.uuid4()),
              "rows": [import_row(1, "IMP-9100")]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422
    assert "not be found" in resp.text or "not found" in resp.text


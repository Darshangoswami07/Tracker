"""Covers the new "Select Staff" step of the Excel GR import flow: every
imported GR must be assigned to both the picked location (`Order.area`,
already existing) and the picked staff member (`Order.assignedStaffId`,
resolved from a User id to an `employees.id` — same mechanism
`POST /{order_id}/assign-staff` already uses). The backend must never trust
the frontend's staff/location pairing: a staff member whose own `area`
doesn't match the import's `area` must be rejected, and so must an inactive
one.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.employee import Employee
from app.models.enums import CompanyStatus, RegistrationStatus, UserRole
from app.models.order import Order
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
GR_BASE = "/api/v1/admin/orders"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_company(name: str = "Staff Assign Co") -> str:
    company = Company(name=name, status=CompanyStatus.ACTIVE)
    async with session_scope() as session:
        session.add(company)
        await session.flush()
        return str(company.id)


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


async def create_staff_user(email: str, phone: str, company_id: str, area: str, active: bool = True) -> str:
    repo = UserRepository()
    user = await repo.create(
        full_name="Rahul Sharma",
        email=email,
        phone=phone,
        password_hash=hash_password("Password123!"),
        role=UserRole.STAFF,
        company_id=uuid.UUID(company_id),
        area=area,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        db_user.status = RegistrationStatus.ACTIVE if active else RegistrationStatus.SUSPENDED
        db_user.isActive = active
        await session.flush()
    return str(user.id)


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


async def test_import_assigns_gr_to_selected_area_and_staff(client):
    """Test 3 from the acceptance list: Bageshwar + Rahul Sharma → every
    imported GR carries both assignments."""
    company_id = await create_company()
    token = await create_active_admin(client, "assign-admin@example.com", "+15552000199", company_id)
    staff_id = await create_staff_user("rahul.sharma@example.com", "+15552000200", company_id, area="Bageshwar")

    resp = await client.post(
        f"{GR_BASE}/import",
        json={
            "fileName": "grs.xlsx",
            "area": "Bageshwar",
            "staffId": staff_id,
            "rows": [import_row(1, "STF-1001"), import_row(2, "STF-1002")],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["importedRows"] == 2, data

    async with session_scope() as session:
        employee = (
            await session.execute(select(Employee).where(Employee.userId == staff_id))
        ).scalar_one()
        for gr in ("STF-1001", "STF-1002"):
            order = (
                await session.execute(select(Order).where(Order.orderNumber == gr))
            ).scalar_one()
            assert order.assignedStaffId == employee.id
            assert order.area == "Bageshwar"


async def test_import_rejects_staff_from_a_different_location(client):
    """Test 6 from the acceptance list: sending a locationId + a staffId
    belonging to a different area must be rejected by the backend, not
    silently accepted."""
    company_id = await create_company()
    token = await create_active_admin(client, "assign-admin2@example.com", "+15552000299", company_id)
    # Staff belongs to Almora, but the import targets Bageshwar.
    staff_id = await create_staff_user("amit.joshi@example.com", "+15552000300", company_id, area="Almora")

    resp = await client.post(
        f"{GR_BASE}/import",
        json={
            "fileName": "grs.xlsx",
            "area": "Bageshwar",
            "staffId": staff_id,
            "rows": [import_row(1, "STF-2001")],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 422, resp.text

    async with session_scope() as session:
        leftover = (
            await session.execute(select(Order).where(Order.orderNumber == "STF-2001"))
        ).scalars().all()
        assert leftover == []


async def test_import_rejects_inactive_staff(client):
    company_id = await create_company()
    token = await create_active_admin(client, "assign-admin3@example.com", "+15552000399", company_id)
    staff_id = await create_staff_user(
        "neha.bisht@example.com", "+15552000400", company_id, area="Bageshwar", active=False
    )

    resp = await client.post(
        f"{GR_BASE}/import",
        json={
            "fileName": "grs.xlsx",
            "area": "Bageshwar",
            "staffId": staff_id,
            "rows": [import_row(1, "STF-3001")],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 422, resp.text

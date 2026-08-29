"""Multi-tenant (company/tenant) isolation tests.

Covers the core requirement: a Company Admin/Staff/Driver in Company A must
never see or modify Company B's data, even by directly targeting Company B's
IDs in the URL/payload, while Super Admin sees everything and staff/driver
creation always lands in the creator's own company.
"""
from __future__ import annotations

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import RegistrationStatus, UserRole
from app.models.order import Order, OrderStatus
from app.repositories.user_repository import UserRepository

API = "/api/v1"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create_company(name: str) -> str:
    async with session_scope() as session:
        company = Company(name=name)
        session.add(company)
        await session.flush()
        return str(company.id)


async def _create_user(
    email: str, role: UserRole, company_id: str | None, password: str = "StrongPass123!"
) -> str:
    repo = UserRepository()
    user = await repo.create(
        full_name="Test User",
        email=email,
        phone=f"+1555{abs(hash(email)) % 10_000_000:07d}",
        password_hash=hash_password(password),
        role=role,
        status=RegistrationStatus.ACTIVE.value,
        is_active=True,
        is_approved=True,
        is_verified=True,
        otp_verified=True,
        company_id=company_id,
    )
    return str(user.id)


async def _login(client, email: str, password: str = "StrongPass123!") -> str:
    resp = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["tokens"]["accessToken"]


async def _create_order(company_id: str, order_number: str) -> str:
    from datetime import datetime, timezone

    async with session_scope() as session:
        order = Order(
            orderNumber=order_number,
            companyId=company_id,
            pickupAddress="A",
            deliveryAddress="B",
            pickupTime=datetime.now(timezone.utc),
            status=OrderStatus.PENDING,
        )
        session.add(order)
        await session.flush()
        return str(order.id)


async def _two_companies_with_admins(client):
    company_a = await _create_company("Company A")
    company_b = await _create_company("Company B")
    await _create_user("admin_a@example.com", UserRole.BUSINESS_OWNER, company_a)
    await _create_user("admin_b@example.com", UserRole.BUSINESS_OWNER, company_b)
    token_a = await _login(client, "admin_a@example.com")
    token_b = await _login(client, "admin_b@example.com")
    return company_a, company_b, token_a, token_b


# --------------------------------------------------------------------------- #
# GR/shipment isolation
# --------------------------------------------------------------------------- #
async def test_company_admin_only_lists_own_company_grs(client):
    company_a, company_b, token_a, token_b = await _two_companies_with_admins(client)
    await _create_order(company_a, "GR-A-001")
    await _create_order(company_b, "GR-B-001")

    resp = await client.get(f"{API}/admin/orders", headers=auth_headers(token_a))
    assert resp.status_code == 200
    numbers = {item["orderNumber"] for item in resp.json()["data"]["items"]}
    assert numbers == {"GR-A-001"}


async def test_company_admin_cannot_fetch_other_companys_gr_by_id(client):
    company_a, company_b, token_a, token_b = await _two_companies_with_admins(client)
    order_b_id = await _create_order(company_b, "GR-B-002")

    resp = await client.get(f"{API}/admin/orders/{order_b_id}", headers=auth_headers(token_a))
    assert resp.status_code == 403


async def test_company_admin_cannot_update_other_companys_gr_status(client):
    company_a, company_b, token_a, token_b = await _two_companies_with_admins(client)
    order_b_id = await _create_order(company_b, "GR-B-003")

    resp = await client.patch(
        f"{API}/admin/orders/{order_b_id}/status",
        json={"status": "delivered"},
        headers=auth_headers(token_a),
    )
    assert resp.status_code == 403


async def test_create_gr_forces_callers_own_company(client):
    company_a, company_b, token_a, _token_b = await _two_companies_with_admins(client)

    resp = await client.post(
        f"{API}/admin/orders",
        json={
            "grNumber": "GR-A-100",
            "companyId": company_b,  # attempted bypass: target another company
            "consignorName": "X",
            "consigneeName": "Y",
            "pickupAddress": "A",
            "deliveryAddress": "B",
            "pickupTime": "2026-01-01T00:00:00Z",
        },
        headers=auth_headers(token_a),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["companyId"] == company_a


async def test_super_admin_sees_both_companies_grs(client):
    company_a, company_b, _token_a, _token_b = await _two_companies_with_admins(client)
    await _create_order(company_a, "GR-A-200")
    await _create_order(company_b, "GR-B-200")
    await _create_user("root@example.com", UserRole.SUPER_ADMIN, None)
    token_root = await _login(client, "root@example.com")

    resp = await client.get(f"{API}/admin/orders", headers=auth_headers(token_root))
    assert resp.status_code == 200
    numbers = {item["orderNumber"] for item in resp.json()["data"]["items"]}
    assert {"GR-A-200", "GR-B-200"}.issubset(numbers)


# --------------------------------------------------------------------------- #
# Users isolation
# --------------------------------------------------------------------------- #
async def test_company_admin_only_lists_own_company_users(client):
    company_a, company_b, token_a, token_b = await _two_companies_with_admins(client)
    await _create_user("staff_a@example.com", UserRole.EMPLOYEE, company_a)
    await _create_user("staff_b@example.com", UserRole.EMPLOYEE, company_b)

    resp = await client.get(f"{API}/admin/users?role=employee", headers=auth_headers(token_a))
    assert resp.status_code == 200
    emails = {item["email"] for item in resp.json()["data"]["items"]}
    assert emails == {"staff_a@example.com"}


async def test_company_admin_cannot_modify_other_companys_user(client):
    company_a, company_b, token_a, token_b = await _two_companies_with_admins(client)
    staff_b_id = await _create_user("staff_b2@example.com", UserRole.EMPLOYEE, company_b)

    resp = await client.patch(
        f"{API}/admin/users/{staff_b_id}/status",
        json={"status": "suspended"},
        headers=auth_headers(token_a),
    )
    assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# Staff/driver creation always lands in the caller's own company
# --------------------------------------------------------------------------- #
async def test_company_admin_create_staff_ignores_payload_company_id(client):
    company_a, company_b, token_a, _token_b = await _two_companies_with_admins(client)

    resp = await client.post(
        f"{API}/admin/staff",
        json={
            "firstName": "New",
            "lastName": "Staff",
            "email": "newstaff@example.com",
            "phone": "+919851234000",
            "password": "StrongPass123!",
            "companyId": company_b,  # attempted bypass
        },
        headers=auth_headers(token_a),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["companyId"] == company_a


async def test_company_admin_create_driver_ignores_payload_company_id(client):
    company_a, company_b, token_a, _token_b = await _two_companies_with_admins(client)

    resp = await client.post(
        f"{API}/admin/drivers",
        json={
            "firstName": "New",
            "lastName": "Driver",
            "email": "newdriver@example.com",
            "phone": "+919851234001",
            "password": "StrongPass123!",
            "companyId": company_b,  # attempted bypass
        },
        headers=auth_headers(token_a),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["companyId"] == company_a


# --------------------------------------------------------------------------- #
# Staff (EMPLOYEE) is company-scoped too, not just Company Admin
# --------------------------------------------------------------------------- #
async def test_staff_only_sees_own_company_orders(client):
    company_a, company_b, _token_a, _token_b = await _two_companies_with_admins(client)
    await _create_order(company_a, "GR-A-300")
    await _create_order(company_b, "GR-B-300")
    await _create_user("emp_a@example.com", UserRole.EMPLOYEE, company_a)
    token_emp_a = await _login(client, "emp_a@example.com")

    resp = await client.get(f"{API}/employee/orders", headers=auth_headers(token_emp_a))
    assert resp.status_code == 200
    numbers = {item["orderNumber"] for item in resp.json()["data"]["items"]}
    assert numbers == {"GR-A-300"}

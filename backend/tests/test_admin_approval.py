"""Tests for Staff/Driver registration + Admin-vs-Super-Admin approval scoping.

Covers: requestedRole on signup, the role filter on the pending-requests
listing, the ADMIN-vs-SUPER_ADMIN approval/rejection boundary, and the
security fixes to the unauthenticated/over-permissive registration_requests.py
endpoints.
"""
from __future__ import annotations

import uuid

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import RegistrationStatus, UserRole
from app.models.registration_request import RegistrationRequest
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
ADMIN_BASE = "/api/v1/admin"
REG_BASE = "/api/v1/registration-requests"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_pending_request(
    email: str,
    phone: str,
    role: UserRole,
    first_name: str = "Test",
    last_name: str = "Applicant",
    company_name: str = "Acme Co",
) -> RegistrationRequest:
    """Directly inserts a PENDING registration request for a given role.

    Used for roles (business/admin/super_admin/...) the public /auth/register
    endpoint cannot produce, so the ADMIN-scope boundary can be exercised.
    """
    request = RegistrationRequest(
        id=uuid.uuid4(),
        firstName=first_name,
        lastName=last_name,
        companyName=company_name,
        email=email,
        phone=phone,
        passwordHash=hash_password("Password123!"),
        requestedRole=role,
        status=RegistrationStatus.PENDING,
    )
    async with session_scope() as session:
        session.add(request)
        await session.flush()
    return request


async def create_active_user_and_login(client, role: UserRole, email: str, phone: str, password: str = "Password123!"):
    """Creates an already-active user with the given role and logs in for a bearer token."""
    repo = UserRepository()
    user = await repo.create(
        full_name="Test Actor",
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=role,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        db_user.status = RegistrationStatus.ACTIVE
        db_user.isActive = True
        db_user.isApproved = True
        db_user.isVerified = True
        db_user.otpVerified = True
        await session.flush()

    resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["data"]["tokens"]["accessToken"]
    return user, token


# --------------------------------------------------------------------------- #
# 4-5: Role filter on pending-requests listing
# --------------------------------------------------------------------------- #
async def test_pending_role_filter_employee(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-filter1@example.com", "+15551000010"
    )
    await create_pending_request("pending-emp@example.com", "+15551000011", UserRole.EMPLOYEE)
    await create_pending_request("pending-drv@example.com", "+15551000012", UserRole.DRIVER)

    resp = await client.get(
        f"{ADMIN_BASE}/registration-requests/pending",
        params={"role": "employee"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    emails = {item["email"] for item in items}
    assert "pending-emp@example.com" in emails
    assert "pending-drv@example.com" not in emails


async def test_pending_role_filter_driver(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-filter2@example.com", "+15551000020"
    )
    await create_pending_request("pending-emp2@example.com", "+15551000021", UserRole.EMPLOYEE)
    await create_pending_request("pending-drv2@example.com", "+15551000022", UserRole.DRIVER)

    resp = await client.get(
        f"{ADMIN_BASE}/registration-requests/pending",
        params={"role": "driver"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    emails = {item["email"] for item in items}
    assert "pending-drv2@example.com" in emails
    assert "pending-emp2@example.com" not in emails


# --------------------------------------------------------------------------- #
# 6-9: Admin approves/rejects Staff and Driver
# --------------------------------------------------------------------------- #
async def test_admin_approves_employee_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-approve-emp@example.com", "+15551000030"
    )
    request = await create_pending_request("approve-emp@example.com", "+15551000031", UserRole.EMPLOYEE)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["approved"] is True


async def test_admin_approves_driver_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-approve-drv@example.com", "+15551000040"
    )
    request = await create_pending_request("approve-drv@example.com", "+15551000041", UserRole.DRIVER)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["approved"] is True


async def test_admin_rejects_employee_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-reject-emp@example.com", "+15551000050"
    )
    request = await create_pending_request("reject-emp@example.com", "+15551000051", UserRole.EMPLOYEE)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/reject",
        json={"reason": "Incomplete documents"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["rejected"] is True


async def test_admin_rejects_driver_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-reject-drv@example.com", "+15551000060"
    )
    request = await create_pending_request("reject-drv@example.com", "+15551000061", UserRole.DRIVER)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/reject",
        json={"reason": "Invalid license"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["rejected"] is True


# --------------------------------------------------------------------------- #
# 10-12: Admin is blocked from out-of-scope roles
# --------------------------------------------------------------------------- #
async def test_admin_can_approve_business_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-block-approve-biz@example.com", "+15551000070"
    )
    request = await create_pending_request("biz-approve@example.com", "+15551000071", UserRole.BUSINESS)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(admin_token),
    )
    # Matches the existing admin/ web app's approvals page, which already
    # lets Admin review Business Owner/Dispatcher registrations alongside
    # Staff/Driver — ADMIN_APPROVABLE_ROLES was widened to include this.
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["approved"] is True


async def test_admin_can_reject_business_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-block-reject-biz@example.com", "+15551000080"
    )
    request = await create_pending_request("biz-reject@example.com", "+15551000081", UserRole.BUSINESS)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/reject",
        json={"reason": "n/a"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["rejected"] is True


async def test_admin_cannot_approve_admin_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "admin-block-approve-admin@example.com", "+15551000090"
    )
    request = await create_pending_request("admin-approve@example.com", "+15551000091", UserRole.ADMIN)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "forbidden"


# --------------------------------------------------------------------------- #
# 13-14: Super Admin remains unrestricted
# --------------------------------------------------------------------------- #
async def test_super_admin_can_approve_any_role(client):
    _, sa_token = await create_active_user_and_login(
        client, UserRole.SUPER_ADMIN, "superadmin-approve@example.com", "+15551000100"
    )
    request = await create_pending_request("sa-approve-biz@example.com", "+15551000101", UserRole.BUSINESS)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(sa_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["approved"] is True


async def test_super_admin_can_reject_any_role(client):
    _, sa_token = await create_active_user_and_login(
        client, UserRole.SUPER_ADMIN, "superadmin-reject@example.com", "+15551000110"
    )
    request = await create_pending_request("sa-reject-biz@example.com", "+15551000111", UserRole.BUSINESS)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/reject",
        json={"reason": "n/a"},
        headers=auth_headers(sa_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["rejected"] is True


# --------------------------------------------------------------------------- #
# 15-16: Security fixes on registration_requests.py
# --------------------------------------------------------------------------- #
async def test_unauthenticated_list_registration_requests_returns_401(client):
    resp = await client.get(REG_BASE)
    assert resp.status_code == 401, resp.text


async def test_unauthenticated_pending_registration_requests_returns_401(client):
    resp = await client.get(f"{REG_BASE}/pending")
    assert resp.status_code == 401, resp.text


async def test_business_role_cannot_approve_via_registration_requests_router(client):
    """Regression test for the passes_role() rank-fallthrough bug: BUSINESS
    previously outranked DISPATCHER (the lowest role in
    require_roles(ADMIN, DISPATCHER)) and could approve/reject requests via
    this router. require_exact_roles() must reject it now."""
    _, business_token = await create_active_user_and_login(
        client, UserRole.BUSINESS, "business-actor@example.com", "+15551000120"
    )
    request = await create_pending_request("blocked-by-business@example.com", "+15551000121", UserRole.EMPLOYEE)

    resp = await client.post(
        f"{REG_BASE}/{request.id}/approve",
        json={},
        headers=auth_headers(business_token),
    )
    assert resp.status_code == 403, resp.text


async def test_driver_role_cannot_list_registration_requests(client):
    _, driver_token = await create_active_user_and_login(
        client, UserRole.DRIVER, "driver-actor@example.com", "+15551000130"
    )
    resp = await client.get(REG_BASE, headers=auth_headers(driver_token))
    assert resp.status_code == 403, resp.text


# --------------------------------------------------------------------------- #
# Registration-status endpoint must remain public (applicant polling)
# --------------------------------------------------------------------------- #
async def test_get_single_registration_request_remains_unauthenticated(client):
    """RegistrationPendingScreen polls this endpoint before any session
    exists; it must stay reachable without a bearer token."""
    request = await create_pending_request("poll-me@example.com", "+15551000140", UserRole.EMPLOYEE)

    resp = await client.get(f"{REG_BASE}/{request.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["email"] == "poll-me@example.com"


async def test_public_register_can_request_admin_role(client):
    """`RegisterRequest.requestedRole` now accepts "admin" — public admin
    self-registration, gated by approval (only Super Admin can approve it,
    see test_plain_admin_cannot_approve_admin_request below)."""
    resp = await client.post(
        f"{AUTH_BASE}/register",
        json={
            "fullName": "Wants Admin Access",
            "email": "wants-admin-access@example.com",
            "phone": "+15551000190",
            "password": "StrongPass123!",
            "requestedRole": "admin",
            "companyName": "Dream Startup Co",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["status"] == "pending"


async def test_plain_admin_cannot_approve_admin_request(client):
    _, admin_token = await create_active_user_and_login(
        client, UserRole.ADMIN, "plain-admin-vs-admin-req@example.com", "+15551000191"
    )
    request = await create_pending_request("admin-req-blocked@example.com", "+15551000192", UserRole.ADMIN)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 403, resp.text


async def test_super_admin_can_approve_admin_request(client):
    _, super_admin_token = await create_active_user_and_login(
        client, UserRole.SUPER_ADMIN, "super-admin-approves-admin-req@example.com", "+15551000193"
    )
    request = await create_pending_request("admin-req-approved@example.com", "+15551000194", UserRole.ADMIN)

    resp = await client.post(
        f"{ADMIN_BASE}/registration-requests/{request.id}/approve",
        json={},
        headers=auth_headers(super_admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["approved"] is True

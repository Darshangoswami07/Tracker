"""End-to-end tests for the separate Staff/Admin self-service portals.

Covers the security matrix from the Staff/Admin separation spec: a Staff
account can only authenticate through the Staff portal (and only once
approved), an Admin account can only authenticate through the Admin portal,
crossing portals is always denied with a message naming the correct one,
and only an Admin (never Staff) can reach the Staff Approvals endpoints.
"""
from __future__ import annotations

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import UserRole
from app.repositories.user_repository import UserRepository

BASE = "/api/v1"


async def _create_user(email: str, password: str, role: UserRole, status: str, **extra):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test User",
        email=email,
        phone="+919850001111",
        password_hash=hash_password(password),
        role=role,
        status=status,
        **extra,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        for key, value in {
            "isActive": status == "active",
            "isApproved": status == "active",
            "isVerified": status == "active",
            "otpVerified": status == "active",
        }.items():
            setattr(db_user, key, value)
        await session.flush()
    return user


async def _admin_headers(client, email="admin@example.com", password="AdminPass123!"):
    admin = await _create_user(email, password, UserRole.ADMIN, "active")
    async with session_scope() as session:
        db_admin = await session.get(type(admin), admin.id)
        from app.models.company import Company

        company = Company(name="Acme Co")
        session.add(company)
        await session.flush()
        db_admin.companyId = company.id
        company_id = company.id
        await session.flush()
    resp = await client.post(f"{BASE}/auth/admin/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["data"]["tokens"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}, admin, company_id


# --------------------------------------------------------------------------- #
# Staff register/login
# --------------------------------------------------------------------------- #
async def test_staff_register_creates_pending_no_otp(client):
    resp = await client.post(
        f"{BASE}/auth/staff/register",
        json={
            "fullName": "Sam Staff",
            "email": "sam.staff@example.com",
            "phone": "+919850002222",
            "password": "StaffPass123!",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "pending"


async def test_pending_staff_login_denied(client):
    await _create_user("pending.staff@example.com", "StaffPass123!", UserRole.STAFF, "pending")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "pending.staff@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "user_inactive"
    assert "waiting for admin approval" in resp.json()["error"]["message"].lower()


async def test_rejected_staff_login_denied(client):
    await _create_user("rejected.staff@example.com", "StaffPass123!", UserRole.STAFF, "rejected")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "rejected.staff@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "user_not_approved"
    assert "rejected" in resp.json()["error"]["message"].lower()


async def test_approved_staff_login_allowed(client):
    await _create_user("approved.staff@example.com", "StaffPass123!", UserRole.STAFF, "active")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "approved.staff@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["user"]["role"] == "staff"


# --------------------------------------------------------------------------- #
# Cross-portal denial
# --------------------------------------------------------------------------- #
async def test_staff_account_denied_on_admin_login(client):
    await _create_user("crossed.staff@example.com", "StaffPass123!", UserRole.STAFF, "active")
    resp = await client.post(
        f"{BASE}/auth/admin/login",
        json={"email": "crossed.staff@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "wrong_portal"
    assert "registered as staff" in resp.json()["error"]["message"].lower()


async def test_admin_account_denied_on_staff_login(client):
    await _create_user("crossed.admin@example.com", "AdminPass123!", UserRole.ADMIN, "active")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "crossed.admin@example.com", "password": "AdminPass123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "wrong_portal"
    assert "registered as admin" in resp.json()["error"]["message"].lower()


async def test_wrong_password_never_reveals_wrong_portal(client):
    """A bad password must stay a generic invalid_credentials — never leak
    that the email belongs to a different portal's role."""
    await _create_user("silent.admin@example.com", "AdminPass123!", UserRole.ADMIN, "active")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "silent.admin@example.com", "password": "NotThePassword1"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_admin_login_also_accepts_super_admin(client):
    await _create_user("super@example.com", "SuperPass123!", UserRole.SUPER_ADMIN, "active")
    resp = await client.post(
        f"{BASE}/auth/admin/login",
        json={"email": "super@example.com", "password": "SuperPass123!"},
    )
    assert resp.status_code == 200


# --------------------------------------------------------------------------- #
# Admin approves/rejects Staff
# --------------------------------------------------------------------------- #
async def test_staff_cannot_reach_staff_approvals(client):
    staff = await _create_user("blocked.staff@example.com", "StaffPass123!", UserRole.STAFF, "active")
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "blocked.staff@example.com", "password": "StaffPass123!"},
    )
    token = resp.json()["data"]["tokens"]["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get(f"{BASE}/admin/staff-approvals", headers=headers)
    assert resp.status_code == 403


async def test_admin_can_list_and_approve_staff(client):
    headers, admin, company_id = await _admin_headers(client)
    pending = await _create_user("toapprove@example.com", "StaffPass123!", UserRole.STAFF, "pending")

    resp = await client.get(f"{BASE}/admin/staff-approvals", headers=headers)
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["data"]["items"]]
    assert str(pending.id) in ids

    resp = await client.post(f"{BASE}/admin/staff-approvals/{pending.id}/approve", headers=headers)
    assert resp.status_code == 200

    # Now the Staff account can log in and is scoped to the approving Admin's company.
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "toapprove@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["user"]["companyId"] == str(company_id)


async def test_admin_can_reject_staff_without_deleting(client):
    headers, admin, _ = await _admin_headers(client, email="admin2@example.com")
    pending = await _create_user("toreject@example.com", "StaffPass123!", UserRole.STAFF, "pending")

    resp = await client.post(
        f"{BASE}/admin/staff-approvals/{pending.id}/reject",
        json={"reason": "Not a real employee"},
        headers=headers,
    )
    assert resp.status_code == 200

    # The row still exists (not deleted) — login now returns the rejected message.
    resp = await client.post(
        f"{BASE}/auth/staff/login",
        json={"email": "toreject@example.com", "password": "StaffPass123!"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "user_not_approved"


async def test_staff_approve_endpoint_rejects_non_staff_account(client):
    headers, admin, _ = await _admin_headers(client, email="admin3@example.com")
    other_admin = await _create_user("other.admin@example.com", "AdminPass123!", UserRole.ADMIN, "active")

    resp = await client.post(f"{BASE}/admin/staff-approvals/{other_admin.id}/approve", headers=headers)
    assert resp.status_code == 403

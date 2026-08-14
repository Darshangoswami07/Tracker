"""Tests for the employee reports feature (real CSV generation, not mock data)."""
from __future__ import annotations

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
REPORTS_BASE = "/api/v1/employee/reports"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_active_employee(client, email: str, phone: str, password: str = "Password123!"):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test Employee",
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=UserRole.EMPLOYEE,
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
    return resp.json()["data"]["tokens"]["accessToken"]


async def test_list_reports_empty(client):
    token = await create_active_employee(client, "reports-emp1@example.com", "+15553000001")
    resp = await client.get(REPORTS_BASE, headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["items"] == []


async def test_generate_and_list_report(client):
    token = await create_active_employee(client, "reports-emp2@example.com", "+15553000002")

    gen_resp = await client.post(
        f"{REPORTS_BASE}/generate", json={"type": "orders"}, headers=auth_headers(token)
    )
    assert gen_resp.status_code == 201, gen_resp.text
    assert gen_resp.json()["data"]["status"] == "completed"

    list_resp = await client.get(REPORTS_BASE, headers=auth_headers(token))
    assert list_resp.status_code == 200, list_resp.text
    items = list_resp.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["type"] == "orders"
    assert items[0]["status"] == "completed"
    assert items[0]["downloadUrl"] is not None


async def test_download_generated_report(client):
    token = await create_active_employee(client, "reports-emp3@example.com", "+15553000003")

    gen_resp = await client.post(
        f"{REPORTS_BASE}/generate", json={"type": "revenue"}, headers=auth_headers(token)
    )
    report_id = gen_resp.json()["data"]["id"]

    download_resp = await client.get(f"{REPORTS_BASE}/{report_id}/file", headers=auth_headers(token))
    assert download_resp.status_code == 200, download_resp.text
    assert b"Order Number" in download_resp.content


async def test_reports_require_authentication(client):
    resp = await client.get(REPORTS_BASE)
    assert resp.status_code == 401, resp.text

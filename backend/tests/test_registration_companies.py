"""End-to-end tests for role-dependent company selection during registration."""
from __future__ import annotations

import pytest

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.models.user import User
from app.repositories.company_repository import CompanyRepository
from app.repositories.user_repository import UserRepository
from app.services.otp_service import otp_service

BASE = "/api/v1"

REGISTRATION_PATH = f"{BASE}/registration-requests"
COMPANIES_PATH = f"{BASE}/registration/companies"
LOGIN_PATH = f"{BASE}/auth/login"
VERIFY_OTP_PATH = f"{BASE}/otp/verify-approval"


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


async def create_company(name: str, *, active: bool = True) -> Company:
    company = await CompanyRepository().create_company(name=name, isActive=active)
    if not active:
        async with session_scope() as session:
            row = await session.get(Company, company.id)
            row.status = CompanyStatus.CLOSED
            await session.flush()
    return company


async def create_active_user(role: UserRole) -> User:
    return await UserRepository().create(
        full_name="Test Actor",
        email="test.actor@example.com",
        phone="+15550000001",
        password_hash=hash_password("ActorPass123!"),
        role=role,
        status="active",
        is_active=True,
        is_approved=True,
        is_verified=True,
        otp_verified=True,
    )


async def login(client, email: str, password: str) -> str:
    resp = await client.post(LOGIN_PATH, json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["tokens"]["accessToken"]


def admin_payload(email: str, company_name: str, **overrides) -> dict:
    return {
        "firstName": "Ravi",
        "lastName": "Kumar",
        "companyName": company_name,
        "email": email,
        "phone": "+15550001111",
        "password": "StrongPass123!",
        "requestedRole": "admin",
        **overrides,
    }


# --------------------------------------------------------------------------- #
# Public companies list
# --------------------------------------------------------------------------- #
async def test_public_companies_lists_only_active(client):
    await create_company("Acme Logistics Pvt Ltd")
    await create_company("BlueDart Express", active=False)

    resp = await client.get(COMPANIES_PATH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["total"] == 1
    items = data["data"]["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Acme Logistics Pvt Ltd"
    assert items[0]["id"]


async def test_public_companies_sorted_alphabetically(client):
    await create_company("Zebra Movers")
    await create_company("Alpha Freight")

    resp = await client.get(COMPANIES_PATH)
    names = [item["name"] for item in resp.json()["data"]["items"]]
    assert names == ["Alpha Freight", "Zebra Movers"]


# --------------------------------------------------------------------------- #
# Admin registration: free-text company name
# --------------------------------------------------------------------------- #
async def test_admin_registration_creates_company_and_links_id(client):
    resp = await client.post(
        REGISTRATION_PATH, json=admin_payload("admin1@example.com", "  Nova   Courier Co  ")
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert data["companyId"], "admin request must be linked to a company"
    assert data["companyName"] == "Nova Courier Co"

    company = await CompanyRepository().find_by_normalized_name("Nova Courier Co")
    assert company is not None
    assert str(company.id) == str(data["companyId"])


async def test_admin_registration_reuses_existing_company_case_insensitive(client):
    existing = await create_company("Acme Logistics Pvt Ltd")

    resp = await client.post(
        REGISTRATION_PATH,
        json=admin_payload("admin2@example.com", "  acme   logistics pvt ltd "),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert str(data["companyId"]) == str(existing.id)

    from sqlalchemy import select

    async with session_scope() as session:
        total = (
            await session.execute(
                select(Company).where(Company.deletedAt.is_(None))
            )
        ).scalars().all()
    assert len(total) == 1, "a duplicate company row must not be created"


async def test_admin_registration_requires_company_name(client):
    resp = await client.post(REGISTRATION_PATH, json=admin_payload("admin3@example.com", ""))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


# --------------------------------------------------------------------------- #
# Full chain: register -> approve -> OTP verify creates a linked user
# --------------------------------------------------------------------------- #
async def test_full_chain_user_created_with_company_id(client, monkeypatch):
    # Admin-role registration requests may only be approved by a SUPER_ADMIN.
    await create_active_user(UserRole.SUPER_ADMIN)
    access_token = await login(client, "test.actor@example.com", "ActorPass123!")

    # Make OTP generation deterministic so the verify step can submit it.
    monkeypatch.setattr(otp_service, "_generate_otp", lambda: "123456")

    resp = await client.post(
        REGISTRATION_PATH, json=admin_payload("chain@example.com", "Reliable Haulers")
    )
    assert resp.status_code == 201, resp.text
    request_id = resp.json()["data"]["id"]

    resp = await client.post(
        f"{REGISTRATION_PATH}/{request_id}/approve",
        json={},
        headers=auth_headers(access_token),
    )
    assert resp.status_code == 200, resp.text

    resp = await client.post(
        VERIFY_OTP_PATH,
        params={"request_id": request_id},
        json={"otp": "123456"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["user"]["email"] == "chain@example.com"

    user = await UserRepository().find_by_email("chain@example.com")
    assert user is not None
    assert user.role == UserRole.ADMIN
    assert user.companyId is not None

    company = await CompanyRepository().find_by_normalized_name("Reliable Haulers")
    assert company is not None
    assert str(user.companyId) == str(company.id)

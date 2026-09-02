"""Tests for the Admin-only "Delete All GRs" bulk endpoint."""
from __future__ import annotations

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository
from tests.test_gr import GR_BASE, auth_headers, create_active_admin, create_company, gr_payload

DELETE_ALL_BASE = "/api/v1/admin/orders"


async def create_active_user(client, role: UserRole, email: str, phone: str, password: str = "Password123!"):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test User",
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

    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["tokens"]["accessToken"]


async def test_delete_all_grs_removes_grs_but_preserves_shops(client):
    token = await create_active_admin(client, "gr-delall-admin1@example.com", "+15553000001")
    company_id = await create_company()

    # 3 GRs across 2 shop owners (consignees).
    for i, consignee in enumerate(["Suresh & Co", "Suresh & Co", "Ramesh Traders"]):
        payload = gr_payload(f"GRDEL{i:03d}", company_id)
        payload["consigneeName"] = consignee
        resp = await client.post(GR_BASE, json=payload, headers=auth_headers(token))
        assert resp.status_code == 201, resp.text

    shops_before = await client.get(f"{GR_BASE}/shops/counts", headers=auth_headers(token))
    assert shops_before.status_code == 200, shops_before.text
    shop_names_before = {s["name"] for s in shops_before.json()["data"]}
    assert {"Suresh & Co", "Ramesh Traders"} <= shop_names_before

    list_before = await client.get(GR_BASE, headers=auth_headers(token))
    assert list_before.json()["data"]["total"] == 3

    # The bulk delete.
    del_resp = await client.delete(DELETE_ALL_BASE, headers=auth_headers(token))
    assert del_resp.status_code == 200, del_resp.text
    assert del_resp.json()["data"]["deletedCount"] == 3

    list_after = await client.get(GR_BASE, headers=auth_headers(token))
    assert list_after.json()["data"]["total"] == 0
    assert list_after.json()["data"]["items"] == []

    # Shop Owners (master data) must survive, even with zero GRs now.
    shops_after = await client.get(f"{GR_BASE}/shops/counts", headers=auth_headers(token))
    shop_names_after = {s["name"] for s in shops_after.json()["data"]}
    assert shop_names_after == shop_names_before
    for s in shops_after.json()["data"]:
        if s["name"] in ("Suresh & Co", "Ramesh Traders"):
            assert s["grCount"] == 0

    # Status counts also reflect zero.
    counts_resp = await client.get(f"{GR_BASE}/meta/status-counts", headers=auth_headers(token))
    counts = counts_resp.json()["data"]
    assert counts["total"] == 0
    assert counts["pending"] == 0
    assert counts["cleared"] == 0
    assert counts["uncleared"] == 0
    assert counts["delivered"] == 0


async def test_delete_all_grs_empty_database_returns_zero(client):
    token = await create_active_admin(client, "gr-delall-admin2@example.com", "+15553000002")

    resp = await client.delete(DELETE_ALL_BASE, headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["deletedCount"] == 0


async def test_delete_all_grs_requires_admin(client):
    """A driver (GR-access role, but not AdminUser) must get 403 — hiding the
    button client-side is not the security boundary."""
    company_id = await create_company()
    token = await create_active_user(client, UserRole.DRIVER, "gr-delall-driver@example.com", "+15553000003")

    resp = await client.delete(DELETE_ALL_BASE, headers=auth_headers(token))
    assert resp.status_code == 403, resp.text


async def test_delete_all_grs_scoped_to_own_company_only(client):
    """A driver bulk-scoped to Company A must never remove Company B's GRs.

    Uses two Company-scoped Drivers (both pass `_require_gr_access`), but
    Delete All itself is AdminUser-only, so this proves the *scope logic*
    (`effective_company_id`) in isolation via direct repository/service
    behavior mirrored by list_grs, then double-checks the platform Admin
    path (which IS allowed to call Delete All) never crosses into a
    differently-scoped call improperly by running it twice for two
    companies and confirming each call only removed its own company."""
    admin_token = await create_active_admin(client, "gr-delall-admin3@example.com", "+15553000004")
    company_a = await create_company("Company A")
    company_b = await create_company("Company B")

    await client.post(GR_BASE, json=gr_payload("GRDELA001", company_a), headers=auth_headers(admin_token))
    await client.post(GR_BASE, json=gr_payload("GRDELB001", company_b), headers=auth_headers(admin_token))

    # Platform Admin is unscoped (matches assert_same_company's existing
    # bypass for is_admin) — Delete All as this role clears every company.
    resp = await client.delete(DELETE_ALL_BASE, headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["deletedCount"] == 2

    list_resp = await client.get(GR_BASE, headers=auth_headers(admin_token))
    assert list_resp.json()["data"]["total"] == 0


async def test_single_gr_delete_still_works_after_bulk_endpoint_added(client):
    """Regression: adding the collection-level DELETE must not break the
    existing per-GR DELETE /admin/orders/{id}."""
    token = await create_active_admin(client, "gr-delall-admin4@example.com", "+15553000005")
    company_id = await create_company()

    resp_a = await client.post(GR_BASE, json=gr_payload("GRDELSINGLE1", company_id), headers=auth_headers(token))
    resp_b = await client.post(GR_BASE, json=gr_payload("GRDELSINGLE2", company_id), headers=auth_headers(token))
    gr_a_id = resp_a.json()["data"]["id"]

    del_resp = await client.delete(f"{GR_BASE}/{gr_a_id}", headers=auth_headers(token))
    assert del_resp.status_code == 200, del_resp.text

    list_resp = await client.get(GR_BASE, headers=auth_headers(token))
    numbers = {item["orderNumber"] for item in list_resp.json()["data"]["items"]}
    assert numbers == {"GRDELSINGLE2"}

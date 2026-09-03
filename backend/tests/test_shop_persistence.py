"""Shop (consignee) master data must survive GR deletion.

Regression coverage for the bug where "Shops" were a purely derived
grouping that also silently vanished when a shop's last active GR was
deleted. A persisted `Shop` master row now backs every shop, keyed on the
GR's **consignee** (the destination customer shop — never the consignor),
and `GET /shops/counts` is Shop-driven with a LEFT OUTER JOIN to Order so a
Shop with zero active GRs still appears.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus, RegistrationStatus, UserRole
from app.models.shop import Shop
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


def gr_payload(gr_number: str, consignee_name: str, company_id: str) -> dict:
    # The Shop identity is the CONSIGNEE. Consignor is held constant here so
    # every test's varying name is the one that actually drives shop
    # creation/lookup.
    return {
        "grNumber": gr_number,
        "companyId": company_id,
        "pickupAddress": "Haldwani Depot",
        "deliveryAddress": "Bageshwar Depot",
        "pickupTime": "2026-08-11T10:00:00Z",
        "consignorName": "Jai Kailash Forwarding Agency",
        "consigneeName": consignee_name,
        "particulars": "3 boxes of textiles",
        "packageCount": 3,
        "weight": 45.5,
    }


async def create_gr(client, token, gr_number: str, consignee_name: str, company_id: str) -> str:
    resp = await client.post(
        GR_BASE, json=gr_payload(gr_number, consignee_name, company_id), headers=auth_headers(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def delete_gr(client, token, order_id: str) -> None:
    resp = await client.delete(f"{GR_BASE}/{order_id}", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text


async def shop_names(client, token) -> list[str]:
    resp = await client.get(f"{GR_BASE}/shops/counts", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    return [row["name"] for row in resp.json()["data"]]


async def shop_gr_count(client, token, name: str) -> int:
    resp = await client.get(f"{GR_BASE}/shops/counts", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    rows = {row["name"]: row["grCount"] for row in resp.json()["data"]}
    assert name in rows, f"{name} missing from shops/counts: {rows}"
    return rows[name]


async def test_delete_single_gr_shop_still_exists(client):
    """TEST 1: Create Shop Owner -> create GR -> delete GR -> Shop Owner still exists."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop1@example.com", "+15553000001", company_id)

    order_id = await create_gr(client, token, "GR006955", "ABC Traders", company_id)
    assert "ABC Traders" in await shop_names(client, token)

    await delete_gr(client, token, order_id)

    assert "ABC Traders" in await shop_names(client, token)
    assert await shop_gr_count(client, token, "ABC Traders") == 0

    async with session_scope() as session:
        shop = (await session.execute(select(Shop).where(Shop.name == "ABC Traders"))).scalar_one()
        assert shop is not None


async def test_delete_all_grs_shop_still_exists(client):
    """TEST 2: Create Shop Owner -> create 3 GRs -> delete all 3 -> Shop Owner still exists."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop2@example.com", "+15553000002", company_id)

    order_ids = [
        await create_gr(client, token, f"GR00700{i}", "XYZ Logistics", company_id) for i in range(1, 4)
    ]
    assert await shop_gr_count(client, token, "XYZ Logistics") == 3

    for oid in order_ids:
        await delete_gr(client, token, oid)

    assert "XYZ Logistics" in await shop_names(client, token)
    assert await shop_gr_count(client, token, "XYZ Logistics") == 0


async def test_delete_one_gr_leaves_other_gr_and_shop_intact(client):
    """TEST 3: Delete one GR while another exists -> Shop Owner remains and the
    remaining GR remains (not deleted, still counted)."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop3@example.com", "+15553000003", company_id)

    order_1 = await create_gr(client, token, "GR006951", "Ramesh Traders", company_id)
    order_2 = await create_gr(client, token, "GR006952", "Ramesh Traders", company_id)
    assert await shop_gr_count(client, token, "Ramesh Traders") == 2

    await delete_gr(client, token, order_1)

    assert "Ramesh Traders" in await shop_names(client, token)
    assert await shop_gr_count(client, token, "Ramesh Traders") == 1

    resp = await client.get(f"{GR_BASE}/{order_2}", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    # consignor stays on the GR as metadata; consignee is the shop identity.
    assert resp.json()["data"]["consigneeName"] == "Ramesh Traders"
    assert resp.json()["data"]["consignorName"] == "Jai Kailash Forwarding Agency"

    resp_deleted = await client.get(f"{GR_BASE}/{order_1}", headers=auth_headers(token))
    assert resp_deleted.status_code == 404


async def test_shop_with_zero_grs_appears_in_all_shops(client):
    """TEST 4: A Shop Owner with zero GRs (e.g. right after its last GR was
    deleted) must still appear in Admin -> All Shops (/shops/counts)."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop4@example.com", "+15553000004", company_id)

    order_id = await create_gr(client, token, "GR006896", "Bageshwar Store", company_id)
    await delete_gr(client, token, order_id)

    names = await shop_names(client, token)
    assert "Bageshwar Store" in names
    assert await shop_gr_count(client, token, "Bageshwar Store") == 0


async def test_no_shop_deletion_endpoint_exists(client):
    """TEST 5: There is no GR-triggered or implicit Shop-deletion path — Shop
    rows are only ever created (get-or-create), never removed by GR
    operations. Deleting a shop, if ever implemented, must be a dedicated
    operation; today there is none, so a Shop row is permanent once created."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop5@example.com", "+15553000005", company_id)

    order_id = await create_gr(client, token, "GR006998", "Almora Depot", company_id)
    await delete_gr(client, token, order_id)

    async with session_scope() as session:
        shops = (await session.execute(select(Shop).where(Shop.name == "Almora Depot"))).scalars().all()
        assert len(shops) == 1  # exactly one Shop row, never removed


async def test_shop_gr_delete_flow_matches_real_world_scenario(client):
    """The exact acceptance scenario: Shop Owner 'ABC Traders' with GR 6955.
    Delete GR 6955, then confirm Admin -> All Shops still shows the shop."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop6@example.com", "+15553000006", company_id)

    order_id = await create_gr(client, token, "6955", "ABC Traders", company_id)
    await delete_gr(client, token, order_id)

    names = await shop_names(client, token)
    assert "ABC Traders" in names


async def test_shop_is_the_consignee_never_the_consignor(client):
    """GR 7544: consignor 'Jai Kailash Enterprises', consignee 'New Rawal
    Video' -> the shop is 'New Rawal Video'. The consignor never appears as a
    shop."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop7@example.com", "+15553000007", company_id)

    resp = await client.post(
        GR_BASE,
        json={
            "grNumber": "7544",
            "companyId": company_id,
            "pickupAddress": "A",
            "deliveryAddress": "B",
            "pickupTime": "2026-08-11T10:00:00Z",
            "consignorName": "Jai Kailash Enterprises",
            "consigneeName": "New Rawal Video",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text

    names = await shop_names(client, token)
    assert "New Rawal Video" in names
    assert "Jai Kailash Enterprises" not in names


async def test_consignee_shop_dedupes_on_spacing_and_case(client):
    """'Shree Bagnath Paper Products', '  shree   bagnath  paper products '
    and 'SHREE BAGNATH PAPER PRODUCTS' are ONE shop with GR count 3."""
    company_id = await create_company()
    token = await create_active_admin(client, "shop8@example.com", "+15553000008", company_id)

    for i, variant in enumerate(
        [
            "Shree Bagnath Paper Products",
            "  shree   bagnath  paper products ",
            "SHREE BAGNATH PAPER PRODUCTS",
        ]
    ):
        await create_gr(client, token, f"GR75{46 + i}", variant, company_id)

    names = await shop_names(client, token)
    matches = [n for n in names if n.lower().strip() == "shree bagnath paper products"]
    assert len(matches) == 1, names
    assert await shop_gr_count(client, token, matches[0]) == 3

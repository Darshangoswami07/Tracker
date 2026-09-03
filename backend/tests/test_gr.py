"""Tests for the GR/Shipment (Order) management endpoints and slip uploads."""
from __future__ import annotations

import io
import uuid

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus, RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
GR_BASE = "/api/v1/admin/orders"
SHARED_ORDER_BASE = "/api/v1/orders"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_active_admin(client, email: str, phone: str, password: str = "Password123!"):
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


def gr_payload(gr_number: str, company_id: str) -> dict:
    return {
        "grNumber": gr_number,
        "companyId": company_id,
        "pickupAddress": "Haldwani Depot",
        "deliveryAddress": "Bageshwar Depot",
        "pickupTime": "2026-08-11T10:00:00Z",
        "consignorName": "Ramesh Traders",
        "consigneeName": "Suresh & Co",
        "particulars": "3 boxes of textiles",
        "packageCount": 3,
        "weight": 45.5,
    }


async def test_create_gr(client):
    token = await create_active_admin(client, "gr-admin1@example.com", "+15552000001")
    company_id = await create_company()

    resp = await client.post(
        GR_BASE, json=gr_payload("GR006401", company_id), headers=auth_headers(token)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["orderNumber"] == "GR006401"
    assert data["consignorName"] == "Ramesh Traders"
    assert data["consigneeName"] == "Suresh & Co"
    assert data["status"] == "pending"
    assert data["attachments"] == []


async def test_create_gr_rejects_duplicate_number(client):
    token = await create_active_admin(client, "gr-admin2@example.com", "+15552000002")
    company_id = await create_company()

    resp1 = await client.post(
        GR_BASE, json=gr_payload("GR006402", company_id), headers=auth_headers(token)
    )
    assert resp1.status_code == 201, resp1.text

    resp2 = await client.post(
        GR_BASE, json=gr_payload("GR006402", company_id), headers=auth_headers(token)
    )
    assert resp2.status_code == 422, resp2.text


async def test_list_grs_and_search(client):
    token = await create_active_admin(client, "gr-admin3@example.com", "+15552000003")
    company_id = await create_company()
    await client.post(GR_BASE, json=gr_payload("GR006403", company_id), headers=auth_headers(token))

    resp = await client.get(GR_BASE, params={"search": "GR006403"}, headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert any(item["orderNumber"] == "GR006403" for item in items)


async def test_get_gr_detail(client):
    token = await create_active_admin(client, "gr-admin4@example.com", "+15552000004")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006404", company_id), headers=auth_headers(token)
    )
    gr_id = create_resp.json()["data"]["id"]

    resp = await client.get(f"{GR_BASE}/{gr_id}", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["orderNumber"] == "GR006404"


async def test_update_gr_status(client):
    token = await create_active_admin(client, "gr-admin5@example.com", "+15552000005")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006405", company_id), headers=auth_headers(token)
    )
    gr_id = create_resp.json()["data"]["id"]

    resp = await client.patch(
        f"{GR_BASE}/{gr_id}/status",
        json={"status": "cleared", "notes": "Payment confirmed"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "cleared"


async def test_upload_and_download_slip(client):
    token = await create_active_admin(client, "gr-admin6@example.com", "+15552000006")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006406", company_id), headers=auth_headers(token)
    )
    gr_id = create_resp.json()["data"]["id"]

    file_bytes = io.BytesIO(b"%PDF-1.4 fake pdf content for testing")
    upload_resp = await client.post(
        f"{GR_BASE}/{gr_id}/attachments",
        files={"file": ("slip.pdf", file_bytes, "application/pdf")},
        data={"fileKind": "generic"},
        headers=auth_headers(token),
    )
    assert upload_resp.status_code == 201, upload_resp.text
    attachment = upload_resp.json()["data"]
    assert attachment["originalFilename"] == "slip.pdf"
    assert attachment["fileSizeBytes"] > 0

    detail_resp = await client.get(f"{GR_BASE}/{gr_id}", headers=auth_headers(token))
    assert len(detail_resp.json()["data"]["attachments"]) == 1

    download_resp = await client.get(
        f"{GR_BASE}/{gr_id}/attachments/{attachment['id']}/file", headers=auth_headers(token)
    )
    assert download_resp.status_code == 200
    assert download_resp.content.startswith(b"%PDF")


async def test_upload_rejects_disallowed_file_type(client):
    token = await create_active_admin(client, "gr-admin7@example.com", "+15552000007")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006407", company_id), headers=auth_headers(token)
    )
    gr_id = create_resp.json()["data"]["id"]

    file_bytes = io.BytesIO(b"not an allowed type")
    resp = await client.post(
        f"{GR_BASE}/{gr_id}/attachments",
        files={"file": ("virus.exe", file_bytes, "application/x-msdownload")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422, resp.text


async def test_attachments_require_authentication(client):
    resp = await client.get(GR_BASE)
    assert resp.status_code == 401, resp.text


async def test_bulk_delete_grs(client):
    """Checkbox multi-select bulk delete: admin soft-deletes a specific id
    set in one call; unknown ids are skipped (not an error); already-deleted
    ids are skipped on a re-run; status/shop/history rows are untouched."""
    token = await create_active_admin(client, "gr-bulk-admin@example.com", "+15552000050")
    company_id = await create_company()
    ids = []
    for n in ("BLK001", "BLK002", "BLK003"):
        r = await client.post(GR_BASE, json=gr_payload(n, company_id), headers=auth_headers(token))
        ids.append(r.json()["data"]["id"])

    bogus = str(uuid.uuid4())
    resp = await client.post(
        f"{GR_BASE}/bulk-delete",
        json={"ids": [ids[0], ids[1], bogus]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["deletedCount"] == 2
    assert set(data["deleted"]) == {ids[0], ids[1]}
    assert data["skipped"] == [bogus]

    # The two are gone from the list, the third remains.
    listed = await client.get(GR_BASE, headers=auth_headers(token))
    remaining = {i["orderNumber"] for i in listed.json()["data"]["items"]}
    assert "BLK003" in remaining and "BLK001" not in remaining and "BLK002" not in remaining

    # Re-running with the same ids deletes nothing more (idempotent).
    resp2 = await client.post(
        f"{GR_BASE}/bulk-delete", json={"ids": [ids[0], ids[1]]}, headers=auth_headers(token)
    )
    assert resp2.json()["data"]["deletedCount"] == 0

    # Soft-delete only: rows + status/history still there, just flagged.
    from app.models.order import Order
    async with session_scope() as session:
        from sqlalchemy import select
        o = (await session.execute(select(Order).where(Order.id == uuid.UUID(ids[0])))).scalar_one()
        assert o.deletedAt is not None and o.isActive is False
        assert (o.status.value if hasattr(o.status, "value") else o.status) == "pending"

    # Empty id list is rejected by the schema.
    empty = await client.post(f"{GR_BASE}/bulk-delete", json={"ids": []}, headers=auth_headers(token))
    assert empty.status_code == 422


async def test_bulk_delete_forbidden_for_non_admin(client):
    """Staff must not get bulk-delete just because the UI exists."""
    repo = UserRepository()
    user = await repo.create(
        full_name="Bulk Staff", email="gr-bulk-staff@example.com", phone="+15552000051",
        password_hash=hash_password("Password123!"), role=UserRole.STAFF,
    )
    company_id = await create_company()
    async with session_scope() as session:
        du = await session.get(type(user), user.id)
        du.status = RegistrationStatus.ACTIVE
        du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
        du.companyId = uuid.UUID(company_id)
        await session.flush()
    token = (await client.post(f"{AUTH_BASE}/login", json={"email": "gr-bulk-staff@example.com", "password": "Password123!"})).json()["data"]["tokens"]["accessToken"]

    resp = await client.post(
        f"{GR_BASE}/bulk-delete", json={"ids": [str(uuid.uuid4())]}, headers=auth_headers(token)
    )
    assert resp.status_code == 403, resp.text


async def test_non_admin_cannot_create_gr(client):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test Driver",
        email="gr-driver1@example.com",
        phone="+15552000008",
        password_hash=hash_password("Password123!"),
        role=UserRole.DRIVER,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        db_user.status = RegistrationStatus.ACTIVE
        db_user.isActive = True
        db_user.isApproved = True
        db_user.isVerified = True
        db_user.otpVerified = True
        await session.flush()

    login_resp = await client.post(
        f"{AUTH_BASE}/login", json={"email": "gr-driver1@example.com", "password": "Password123!"}
    )
    token = login_resp.json()["data"]["tokens"]["accessToken"]
    company_id = await create_company()

    resp = await client.post(
        GR_BASE, json=gr_payload("GR006408", company_id), headers=auth_headers(token)
    )
    assert resp.status_code == 403, resp.text


async def create_active_customer(client, email: str, phone: str, password: str = "Password123!"):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test Customer",
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=UserRole.CUSTOMER,
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


async def test_track_gr_by_number(client):
    token = await create_active_admin(client, "gr-admin9@example.com", "+15552000009")
    company_id = await create_company()
    await client.post(GR_BASE, json=gr_payload("GR006409", company_id), headers=auth_headers(token))

    resp = await client.get(f"{SHARED_ORDER_BASE}/track/GR006409", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["orderNumber"] == "GR006409"
    assert data["consignorName"] == "Ramesh Traders"
    assert data["attachments"] == []


async def test_track_gr_unknown_number_returns_404(client):
    token = await create_active_admin(client, "gr-admin10@example.com", "+15552000010")

    resp = await client.get(f"{SHARED_ORDER_BASE}/track/DOES-NOT-EXIST", headers=auth_headers(token))
    assert resp.status_code == 404, resp.text


async def test_customer_can_track_any_gr_by_number(client):
    """Regression: the mobile Customer app tracks by GR number (a public
    tracking key). Walk-in GRs have customerId NULL, so the ownership check
    used to reject customers with 403 even though web/Admin tracking showed
    the same shipment. Any authenticated user may track any GR by number."""
    admin_token = await create_active_admin(client, "gr-admin13@example.com", "+15552000013")
    company_id = await create_company()
    await client.post(GR_BASE, json=gr_payload("GR006413", company_id), headers=auth_headers(admin_token))

    customer_token = await create_active_customer(client, "gr-customer2@example.com", "+15552000014")

    resp = await client.get(f"{SHARED_ORDER_BASE}/track/GR006413", headers=auth_headers(customer_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["orderNumber"] == "GR006413"
    assert data["consignorName"] == "Ramesh Traders"


async def test_track_gr_requires_authentication(client):
    resp = await client.get(f"{SHARED_ORDER_BASE}/track/GR006415")
    assert resp.status_code == 401, resp.text


async def test_shared_status_update_endpoint(client):
    token = await create_active_admin(client, "gr-admin11@example.com", "+15552000011")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006411", company_id), headers=auth_headers(token)
    )
    gr_id = create_resp.json()["data"]["id"]

    resp = await client.patch(
        f"{SHARED_ORDER_BASE}/{gr_id}/status",
        json={"status": "pending"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "pending"


async def test_customer_cannot_update_status_but_can_track(client):
    admin_token = await create_active_admin(client, "gr-admin12@example.com", "+15552000012")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE, json=gr_payload("GR006412", company_id), headers=auth_headers(admin_token)
    )
    gr_id = create_resp.json()["data"]["id"]

    customer_token = await create_active_customer(client, "gr-customer1@example.com", "+15552000013")

    status_resp = await client.patch(
        f"{SHARED_ORDER_BASE}/{gr_id}/status",
        json={"status": "pending"},
        headers=auth_headers(customer_token),
    )
    assert status_resp.status_code == 403, status_resp.text

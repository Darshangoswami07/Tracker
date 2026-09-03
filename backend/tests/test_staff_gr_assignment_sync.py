"""End-to-end coverage for the Staff -> My Slips GR assignment sync bug.

Reproduces the exact real-world scenario: an Admin assigns/reassigns/removes
GRs for a Staff member while that Staff member stays logged in (no
logout/login), and `GET /admin/orders` (the backend for the mobile "My
Slips" screen) must reflect the CURRENT database assignment on every call —
never a stale snapshot from login time.

Exercises the `Order.assignedStaffId` mechanism directly (set at GR-create
time or via `POST /admin/orders/{id}/assign-staff`), which is what
`OrderRepository.get_all_orders`'s new `staff_scope` OR-filter
(`assignedStaffId == me` OR `area == my area`) is built to honour without
either mechanism silently hiding GRs the other one is responsible for.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus, RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
GR_BASE = "/api/v1/admin/orders"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_company(name: str = "Acme Transport") -> str:
    company = Company(name=name, status=CompanyStatus.ACTIVE)
    async with session_scope() as session:
        session.add(company)
        await session.flush()
        return str(company.id)


def gr_payload(gr_number: str, consignee_name: str, company_id: str, assigned_staff_id: str | None = None) -> dict:
    # The Shop identity is the CONSIGNEE — the varying name is the consignee;
    # the consignor is held constant (GR metadata only).
    payload = {
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
    if assigned_staff_id is not None:
        payload["assignedStaffId"] = assigned_staff_id
    return payload


async def test_staff_gr_assignment_sync_full_lifecycle(client):
    company_id = await create_company()

    async def _create_active(email: str, phone: str, role: UserRole) -> tuple[str, str]:
        repo = UserRepository()
        user = await repo.create(
            full_name="Test User",
            email=email,
            phone=phone,
            password_hash=hash_password("Password123!"),
            role=role,
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
        resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": "Password123!"})
        assert resp.status_code == 200, resp.text
        return str(user.id), resp.json()["data"]["tokens"]["accessToken"]

    admin_id, admin_token = await _create_active("gr-sync-admin@example.com", "+15554000001", UserRole.ADMIN)
    staff_a_id, staff_a_token = await _create_active("gr-sync-staffa@example.com", "+15554000002", UserRole.STAFF)
    staff_b_id, staff_b_token = await _create_active("gr-sync-staffb@example.com", "+15554000003", UserRole.STAFF)

    async def list_as(token: str) -> dict:
        resp = await client.get(GR_BASE, headers=auth_headers(token))
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    # --- CASE A: 0 -> 6 -------------------------------------------------- #
    before = await list_as(staff_a_token)
    assert before["total"] == 0
    assert before["items"] == []

    gr_numbers = ["GR6951", "GR6896", "GR6993", "GR6998", "GR7002", "GR6955"]
    order_ids: dict[str, str] = {}
    for i, gr_number in enumerate(gr_numbers):
        resp = await client.post(
            GR_BASE,
            json=gr_payload(gr_number, f"Shop {i}", company_id, assigned_staff_id=staff_a_id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201, resp.text
        order_ids[gr_number] = resp.json()["data"]["id"]

    after_assign = await list_as(staff_a_token)
    assert after_assign["total"] == 6, after_assign
    assert {item["orderNumber"] for item in after_assign["items"]} == set(gr_numbers)
    # No duplicates on a plain re-fetch.
    again = await list_as(staff_a_token)
    assert again["total"] == 6
    assert len({item["id"] for item in again["items"]}) == 6

    # Staff B (never assigned anything) must see none of Staff A's GRs.
    staff_b_empty = await list_as(staff_b_token)
    assert staff_b_empty["total"] == 0

    # --- CASE D: reassign GR6951 and GR6896 from Staff A -> Staff B ------ #
    for gr_number in ("GR6951", "GR6896"):
        resp = await client.post(
            f"{GR_BASE}/{order_ids[gr_number]}/assign-staff",
            json={"staffId": staff_b_id},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200, resp.text

    # --- CASE B: 6 -> 4 for Staff A --------------------------------------#
    after_reassign = await list_as(staff_a_token)
    assert after_reassign["total"] == 4, after_reassign
    assert {item["orderNumber"] for item in after_reassign["items"]} == {
        "GR6993", "GR6998", "GR7002", "GR6955",
    }

    staff_b_now = await list_as(staff_b_token)
    assert staff_b_now["total"] == 2
    assert {item["orderNumber"] for item in staff_b_now["items"]} == {"GR6951", "GR6896"}

    # --- CASE C: 4 -> 5 for Staff A (assign one back) --------------------#
    resp = await client.post(
        f"{GR_BASE}/{order_ids['GR6951']}/assign-staff",
        json={"staffId": staff_a_id},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text

    after_reassign_back = await list_as(staff_a_token)
    assert after_reassign_back["total"] == 5, after_reassign_back
    assert "GR6951" in {item["orderNumber"] for item in after_reassign_back["items"]}

    staff_b_after = await list_as(staff_b_token)
    assert staff_b_after["total"] == 1
    assert staff_b_after["items"][0]["orderNumber"] == "GR6896"

    # --- CASE E: delete GR6998 -> disappears from My Slips, shop remains -#
    del_resp = await client.delete(f"{GR_BASE}/{order_ids['GR6998']}", headers=auth_headers(admin_token))
    assert del_resp.status_code == 200, del_resp.text

    after_delete = await list_as(staff_a_token)
    assert after_delete["total"] == 4, after_delete
    assert "GR6998" not in {item["orderNumber"] for item in after_delete["items"]}

    shops_resp = await client.get(f"{GR_BASE}/shops/counts", headers=auth_headers(admin_token))
    assert shops_resp.status_code == 200, shops_resp.text
    assert "Shop 3" in [row["name"] for row in shops_resp.json()["data"]]  # GR6998 was "Shop 3"


async def test_staff_sees_area_routed_grs_without_explicit_assignment(client):
    """The area-routing mechanism (a Staff-created/area-stamped GR, no
    `assignedStaffId`) must keep working — the new `staff_scope` OR-filter
    must not regress the pre-existing, actually-wired-up-in-the-UI path."""
    company_id = await create_company("Beta Transport")
    repo = UserRepository()
    staff = await repo.create(
        full_name="Area Staff",
        email="gr-sync-area-staff@example.com",
        phone="+15554000004",
        password_hash=hash_password("Password123!"),
        role=UserRole.STAFF,
        area="Bageshwar",
    )
    async with session_scope() as session:
        db_user = await session.get(type(staff), staff.id)
        db_user.status = RegistrationStatus.ACTIVE
        db_user.isActive = True
        db_user.isApproved = True
        db_user.isVerified = True
        db_user.otpVerified = True
        db_user.companyId = uuid.UUID(company_id)
        await session.flush()

    login = await client.post(
        f"{AUTH_BASE}/login", json={"email": "gr-sync-area-staff@example.com", "password": "Password123!"}
    )
    assert login.status_code == 200, login.text
    staff_token = login.json()["data"]["tokens"]["accessToken"]

    # Staff creates their own GR — the backend stamps `area` from the
    # creator's own profile area (no `assignedStaffId` involved at all).
    resp = await client.post(
        GR_BASE,
        json=gr_payload("GR9001", "Area Shop", company_id),
        headers=auth_headers(staff_token),
    )
    assert resp.status_code == 201, resp.text

    listed = await client.get(GR_BASE, headers=auth_headers(staff_token))
    assert listed.status_code == 200, listed.text
    data = listed.json()["data"]
    assert data["total"] == 1
    assert data["items"][0]["orderNumber"] == "GR9001"


async def test_explicit_assignment_excludes_other_same_area_staff(client):
    """Regression for the exact reported bug: Admin picks Area=Bageshwar +
    Staff=Abhishek during Excel import; the GR must show ONLY on Abhishek's
    dashboard, never on another Staff member's dashboard just because that
    other Staff member's own profile `area` also happens to be Bageshwar
    (previously: the area-match OR-condition leaked every same-area GR to
    every same-area Staff member regardless of `assignedStaffId`). An
    UNASSIGNED same-area GR must still reach both, via the untouched
    fallback."""
    company_id = await create_company("Bageshwar Transport")

    async def _staff(email: str, phone: str, area: str) -> tuple[str, str]:
        repo = UserRepository()
        u = await repo.create(
            full_name="Staff", email=email, phone=phone,
            password_hash=hash_password("Password123!"), role=UserRole.STAFF, area=area,
        )
        async with session_scope() as s:
            du = await s.get(type(u), u.id)
            du.status = RegistrationStatus.ACTIVE
            du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
            du.companyId = uuid.UUID(company_id)
            await s.flush()
        r = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": "Password123!"})
        assert r.status_code == 200, r.text
        return str(u.id), r.json()["data"]["tokens"]["accessToken"]

    admin = await UserRepository().create(
        full_name="Admin", email="bageshwar-admin@example.com", phone="+15554200000",
        password_hash=hash_password("Password123!"), role=UserRole.ADMIN,
    )
    async with session_scope() as s:
        du = await s.get(type(admin), admin.id)
        du.status = RegistrationStatus.ACTIVE
        du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
        du.companyId = uuid.UUID(company_id)
        await s.flush()
    admin_tok = (
        await client.post(f"{AUTH_BASE}/login", json={"email": "bageshwar-admin@example.com", "password": "Password123!"})
    ).json()["data"]["tokens"]["accessToken"]

    abhishek_id, abhishek_tok = await _staff("abhishek-abhi@example.com", "+15554200001", "Bageshwar")
    darshan_id, darshan_tok = await _staff("darshan-goswami@example.com", "+15554200002", "Bageshwar")

    # Admin explicitly assigns a new GR to Abhishek (same shape as the Excel
    # import's "Select Staff" step: an explicit assignedStaffId at create time).
    created = await client.post(
        GR_BASE,
        json=gr_payload("GR5001", "Suresh & Co", company_id, assigned_staff_id=abhishek_id),
        headers=auth_headers(admin_tok),
    )
    assert created.status_code == 201, created.text

    abhishek_list = (await client.get(GR_BASE, headers=auth_headers(abhishek_tok))).json()["data"]
    assert abhishek_list["total"] == 1, abhishek_list
    assert abhishek_list["items"][0]["orderNumber"] == "GR5001"

    darshan_list = (await client.get(GR_BASE, headers=auth_headers(darshan_tok))).json()["data"]
    assert darshan_list["total"] == 0, darshan_list

    # An UNASSIGNED same-area GR must still reach both (existing fallback,
    # untouched) — proves this isn't a blanket area-routing removal.
    unassigned = await client.post(
        GR_BASE,
        json=gr_payload("GR5002", "Other Shop", company_id),
        headers=auth_headers(admin_tok),
    )
    assert unassigned.status_code == 201, unassigned.text
    async with session_scope() as s:
        from app.models.order import Order
        order = (await s.execute(select(Order).where(Order.orderNumber == "GR5002")))
        order = order.scalar_one()
        order.area = "Bageshwar"
        await s.flush()

    abhishek_list2 = (await client.get(GR_BASE, headers=auth_headers(abhishek_tok))).json()["data"]
    assert {i["orderNumber"] for i in abhishek_list2["items"]} == {"GR5001", "GR5002"}

    darshan_list2 = (await client.get(GR_BASE, headers=auth_headers(darshan_tok))).json()["data"]
    assert {i["orderNumber"] for i in darshan_list2["items"]} == {"GR5002"}


async def test_staff_status_update_is_pending_to_delivered_only(client):
    """Staff may move an assigned GR pending->delivered and NOTHING else.
    cleared/uncleared and any move out of a terminal status are 403 — from
    the API directly, not just hidden in the UI. Admin is unrestricted.
    Staff B cannot touch Staff A's GR."""
    company_id = await create_company("Gamma Transport")

    async def _staff(email, phone):
        repo = UserRepository()
        u = await repo.create(
            full_name="S", email=email, phone=phone,
            password_hash=hash_password("Password123!"), role=UserRole.STAFF,
        )
        async with session_scope() as s:
            du = await s.get(type(u), u.id)
            du.status = RegistrationStatus.ACTIVE
            du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
            du.companyId = uuid.UUID(company_id)
            await s.flush()
        r = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": "Password123!"})
        return str(u.id), r.json()["data"]["tokens"]["accessToken"]

    au = await UserRepository().create(
        full_name="A", email="gamma-admin@example.com", phone="+15554100000",
        password_hash=hash_password("Password123!"), role=UserRole.ADMIN,
    )
    async with session_scope() as s:
        du = await s.get(type(au), au.id)
        du.status = RegistrationStatus.ACTIVE
        du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
        du.companyId = uuid.UUID(company_id)
        await s.flush()
    admin_tok = (await client.post(f"{AUTH_BASE}/login", json={"email": "gamma-admin@example.com", "password": "Password123!"})).json()["data"]["tokens"]["accessToken"]

    staff_a_id, staff_a_tok = await _staff("gamma-a@example.com", "+15554100001")
    _, staff_b_tok = await _staff("gamma-b@example.com", "+15554100002")

    gid = (await client.post(
        GR_BASE, json=gr_payload("GRP001", "P Shop", company_id, assigned_staff_id=staff_a_id),
        headers=auth_headers(admin_tok),
    )).json()["data"]["id"]

    def patch(tok, st):
        return client.patch(f"{GR_BASE}/{gid}/status", json={"status": st}, headers=auth_headers(tok))

    assert (await patch(staff_a_tok, "cleared")).status_code == 403
    assert (await patch(staff_a_tok, "uncleared")).status_code == 403
    assert (await patch(staff_b_tok, "delivered")).status_code == 403  # not owner
    assert (await patch(staff_a_tok, "delivered")).status_code == 200
    assert (await patch(staff_a_tok, "pending")).status_code == 403
    assert (await patch(staff_a_tok, "cleared")).status_code == 403
    # admin unrestricted
    assert (await patch(admin_tok, "cleared")).status_code == 200
    assert (await patch(admin_tok, "pending")).status_code == 200

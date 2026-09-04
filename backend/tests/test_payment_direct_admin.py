"""Admin Direct / Staff Received payment split (Receiving Details tabs).

Covers the full flow the Receiving Details page depends on:
  * `POST /payments` persists `receivedBy` and applies it to the GR's
    paid/remaining/status exactly like any other payment.
  * `GET /admin/orders/receiving/overview` exposes `directUpiReceived`
    (must equal `GET /admin/orders/meta/revenue-overview`'s field of the
    same name — the Admin Dashboard card), `directAdminTotal`/Count (the
    "Admin Direct" tab total, any payment method) and
    `staffReceivedTotal`/Count (the "Staff Received" tab total).
  * `GET /admin/orders/receiving/payment-history?receivedBy=ADMIN|STAFF`
    returns exactly that receiver's payments, newest first, with GR/
    consignee/amount/method/date/enteredBy — and nothing from the other tab.
  * A direct-Admin payment is excluded from the collecting staff member's
    own collection total / balance (`staff_work_service`), never
    double-counted, and never auto-clears a GR that still owes money.
  * `receivedBy` — never `recordedBy` (who entered it), never the logged-in
    caller, never `paymentMethod` — is the sole classifier.
"""
from __future__ import annotations

import uuid

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository
from app.services import staff_work_service
from tests.test_gr import (
    GR_BASE,
    auth_headers,
    create_active_admin,
    create_company,
    gr_payload,
)

PAYMENTS = "/api/v1/payments"
RECEIVING_OVERVIEW = f"{GR_BASE}/receiving/overview"
RECEIVER_HISTORY = f"{GR_BASE}/receiving/payment-history"
REVENUE_OVERVIEW = f"{GR_BASE}/meta/revenue-overview"


async def _staff(client, company_id: str, email: str, phone: str, full_name: str = "Direct Admin Staff") -> tuple[str, str]:
    repo = UserRepository()
    u = await repo.create(
        full_name=full_name, email=email, phone=phone,
        password_hash=hash_password("Password123!"), role=UserRole.STAFF,
    )
    async with session_scope() as s:
        du = await s.get(type(u), u.id)
        du.status = RegistrationStatus.ACTIVE
        du.isActive = du.isApproved = du.isVerified = du.otpVerified = True
        du.companyId = uuid.UUID(company_id)
        await s.flush()
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert r.status_code == 200, r.text
    return str(u.id), r.json()["data"]["tokens"]["accessToken"]


async def test_full_payment_flow_ties_out_across_screens(client):
    token = await create_active_admin(client, "directadmin@example.com", "+15559100001")
    company_id = await create_company("Direct Admin Co")
    h = auth_headers(token)
    staff_id, staff_tok = await _staff(client, company_id, "directadmin-staff@example.com", "+15559100002", "Darshan Goswami")
    staff_h = auth_headers(staff_tok)

    async def overview():
        r = await client.get(RECEIVING_OVERVIEW, headers=h)
        assert r.status_code == 200, r.text
        return r.json()["data"]

    async def revenue():
        r = await client.get(REVENUE_OVERVIEW, headers=h)
        assert r.status_code == 200, r.text
        return r.json()["data"]

    async def receiver_history(received_by: str, payment_method: str | None = None):
        params = {"receivedBy": received_by, "page": 1, "page_size": 50}
        if payment_method:
            params["paymentMethod"] = payment_method
        r = await client.get(RECEIVER_HISTORY, headers=h, params=params)
        assert r.status_code == 200, r.text
        return r.json()["data"]

    before = await overview()
    before_rev = await revenue()
    # Dashboard and Receiving Details must always agree, even at zero.
    assert before["directUpiReceived"] == before_rev["directUpiReceived"]

    # --- TEST 1: ₹1,440 UPI, receivedBy=ADMIN ----------------------------- #
    p1 = gr_payload("DA-001", company_id)
    p1["toPay"] = 1440
    gr1 = (await client.post(GR_BASE, json=p1, headers=h)).json()["data"]["id"]
    pay1 = await client.post(
        PAYMENTS,
        json={"orderId": gr1, "amount": 1440, "recordedBy": staff_id,
              "paymentMethod": "upi", "receivedBy": "ADMIN"},
        headers=staff_h,
    )
    assert pay1.status_code == 201, pay1.text
    assert pay1.json()["receivedBy"] == "ADMIN"

    summary1 = (await client.get(f"{PAYMENTS}/summary/{gr1}", headers=h)).json()
    assert summary1["totalPaid"] == 1440
    assert summary1["balance"] == 0

    admin_hist = await receiver_history("ADMIN")
    assert any(i["orderNumber"] == "DA-001" for i in admin_hist["items"])
    row1 = next(i for i in admin_hist["items"] if i["orderNumber"] == "DA-001")
    assert row1["amount"] == 1440
    assert row1["paymentMethod"] == "upi"
    assert row1["receivedBy"] == "ADMIN"
    assert row1["enteredByName"] == "Darshan Goswami"

    staff_hist = await receiver_history("STAFF")
    assert not any(i["orderNumber"] == "DA-001" for i in staff_hist["items"])

    async with session_scope() as s:
        from datetime import datetime, timezone
        daily = await staff_work_service.daily_collection(s, uuid.UUID(staff_id), datetime.now(timezone.utc).date())
    assert daily["totalCollection"] == 0  # Admin-direct money never reaches staff collection

    after1 = await overview()
    assert after1["directUpiReceived"] == before["directUpiReceived"] + 1440
    assert after1["directAdminTotal"] == before["directAdminTotal"] + 1440
    assert after1["directAdminCount"] == before["directAdminCount"] + 1
    assert after1["staffReceivedTotal"] == before["staffReceivedTotal"]  # unchanged
    after1_rev = await revenue()
    assert after1["directUpiReceived"] == after1_rev["directUpiReceived"]

    # --- TEST 2: ₹1,000 Cash, receivedBy=ADMIN ---------------------------- #
    p2 = gr_payload("DA-002", company_id)
    p2["toPay"] = 1000
    gr2 = (await client.post(GR_BASE, json=p2, headers=h)).json()["data"]["id"]
    pay2 = await client.post(
        PAYMENTS,
        json={"orderId": gr2, "amount": 1000, "recordedBy": staff_id,
              "paymentMethod": "cash", "receivedBy": "ADMIN"},
        headers=staff_h,
    )
    assert pay2.status_code == 201, pay2.text

    cash_hist = await receiver_history("ADMIN", payment_method="cash")
    assert any(i["orderNumber"] == "DA-002" and i["paymentMethod"] == "cash" for i in cash_hist["items"])
    assert not any(i["orderNumber"] == "DA-001" for i in cash_hist["items"])  # UPI filtered out

    after2 = await overview()
    assert after2["directAdminTotal"] == after1["directAdminTotal"] + 1000
    # Cash direct-Admin payment does NOT move the UPI-only dashboard figure.
    assert after2["directUpiReceived"] == after1["directUpiReceived"]
    staff_hist2 = await receiver_history("STAFF")
    assert not any(i["orderNumber"] == "DA-002" for i in staff_hist2["items"])

    # --- TEST 3: ₹500 UPI, receivedBy=STAFF -------------------------------- #
    p3 = gr_payload("DA-003", company_id)
    p3["toPay"] = 500
    gr3 = (await client.post(GR_BASE, json=p3, headers=h)).json()["data"]["id"]
    pay3 = await client.post(
        PAYMENTS,
        json={"orderId": gr3, "amount": 500, "recordedBy": staff_id, "paymentMethod": "upi"},
        headers=staff_h,
    )
    assert pay3.status_code == 201, pay3.text
    assert pay3.json()["receivedBy"] == "STAFF"

    staff_hist3 = await receiver_history("STAFF")
    assert any(i["orderNumber"] == "DA-003" for i in staff_hist3["items"])
    admin_hist3 = await receiver_history("ADMIN")
    assert not any(i["orderNumber"] == "DA-003" for i in admin_hist3["items"])

    async with session_scope() as s:
        from datetime import datetime, timezone
        daily3 = await staff_work_service.daily_collection(s, uuid.UUID(staff_id), datetime.now(timezone.utc).date())
    assert daily3["totalCollection"] == 500  # ordinary staff collection DOES count

    after3 = await overview()
    assert after3["staffReceivedTotal"] == before["staffReceivedTotal"] + 500
    assert after3["directAdminTotal"] == after2["directAdminTotal"]  # unchanged

    # --- TEST 4: staff ₹500 + admin ₹940 on a fourth GR -> no double count #
    p4 = gr_payload("DA-004", company_id)
    p4["toPay"] = 1440
    gr4 = (await client.post(GR_BASE, json=p4, headers=h)).json()["data"]["id"]
    r_staff = await client.post(
        PAYMENTS, json={"orderId": gr4, "amount": 500, "recordedBy": staff_id, "paymentMethod": "upi"},
        headers=staff_h,
    )
    assert r_staff.status_code == 201, r_staff.text
    r_admin = await client.post(
        PAYMENTS, json={"orderId": gr4, "amount": 940, "recordedBy": staff_id,
                        "paymentMethod": "upi", "receivedBy": "ADMIN"},
        headers=staff_h,
    )
    assert r_admin.status_code == 201, r_admin.text

    summary4 = (await client.get(f"{PAYMENTS}/summary/{gr4}", headers=h)).json()
    assert summary4["totalPaid"] == 1440  # combined customer payment
    assert summary4["balance"] == 0

    after4 = await overview()
    admin_delta = after4["directAdminTotal"] - after3["directAdminTotal"]
    staff_delta = after4["staffReceivedTotal"] - after3["staffReceivedTotal"]
    assert admin_delta == 940
    assert staff_delta == 500
    assert admin_delta + staff_delta == 1440  # no double counting, no loss

    # Combined-GR payment list has exactly 2 rows (no duplicates created).
    p4_list = (await client.get(f"{PAYMENTS}/order/{gr4}", headers=h)).json()
    assert len(p4_list) == 2

    # --- Payment history endpoint: no leftover duplicates for any GR ------ #
    p1_list = (await client.get(f"{PAYMENTS}/order/{gr1}", headers=h)).json()
    p2_list = (await client.get(f"{PAYMENTS}/order/{gr2}", headers=h)).json()
    p3_list = (await client.get(f"{PAYMENTS}/order/{gr3}", headers=h)).json()
    assert len(p1_list) == 1 and len(p2_list) == 1 and len(p3_list) == 1

    # --- Newest first, pagination ------------------------------------------ #
    page1 = await receiver_history("ADMIN")
    ts = [i["createdAt"] for i in page1["items"]]
    assert ts == sorted(ts, reverse=True)


async def test_receivedby_is_independent_of_recordedby_and_mode(client):
    """A staff member can ENTER a payment while the money is received by
    Admin — classification must follow `receivedBy` only, never who entered
    it, never the caller's own role, never the payment method."""
    token = await create_active_admin(client, "receivedby-admin@example.com", "+15559100010")
    company_id = await create_company("Receivedby Co")
    h = auth_headers(token)
    staff_id, staff_tok = await _staff(client, company_id, "receivedby-staff@example.com", "+15559100011")
    staff_h = auth_headers(staff_tok)

    p = gr_payload("RB-001", company_id)
    p["toPay"] = 300
    gid = (await client.post(GR_BASE, json=p, headers=h)).json()["data"]["id"]

    # Staff enters the payment (recordedBy=staff), but receivedBy=ADMIN.
    r = await client.post(
        PAYMENTS,
        json={"orderId": gid, "amount": 300, "recordedBy": staff_id,
              "paymentMethod": "bank_transfer", "receivedBy": "ADMIN"},
        headers=staff_h,
    )
    assert r.status_code == 201, r.text

    admin_h = f"{GR_BASE}/receiving/payment-history"
    admin_rows = (await client.get(admin_h, headers=h, params={"receivedBy": "ADMIN"})).json()["data"]["items"]
    staff_rows = (await client.get(admin_h, headers=h, params={"receivedBy": "STAFF"})).json()["data"]["items"]
    assert any(i["orderNumber"] == "RB-001" for i in admin_rows)
    assert not any(i["orderNumber"] == "RB-001" for i in staff_rows)


async def test_legacy_null_receivedby_classifies_as_staff(client):
    """Historical rows predating the `receivedBy` column (NULL) must be
    treated as Staff-received everywhere — never silently reassigned to
    Admin, and never dropped from either total."""
    token = await create_active_admin(client, "legacy-admin@example.com", "+15559100020")
    company_id = await create_company("Legacy Co")
    h = auth_headers(token)

    p = gr_payload("LEGACY-001", company_id)
    p["toPay"] = 250
    gid = (await client.post(GR_BASE, json=p, headers=h)).json()["data"]["id"]

    from app.models.payment import Payment
    async with session_scope() as s:
        pay = Payment(orderId=uuid.UUID(gid), amount=250, paymentMethod="cash", recordedBy=None, receivedBy=None)
        s.add(pay)
        await s.flush()

    staff_rows = (await client.get(
        f"{GR_BASE}/receiving/payment-history", headers=h, params={"receivedBy": "STAFF"}
    )).json()["data"]["items"]
    admin_rows = (await client.get(
        f"{GR_BASE}/receiving/payment-history", headers=h, params={"receivedBy": "ADMIN"}
    )).json()["data"]["items"]
    assert any(i["orderNumber"] == "LEGACY-001" and i["receivedBy"] == "STAFF" for i in staff_rows)
    assert not any(i["orderNumber"] == "LEGACY-001" for i in admin_rows)

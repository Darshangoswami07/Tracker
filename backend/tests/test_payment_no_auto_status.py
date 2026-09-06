"""Regression: recording a payment must NEVER change a GR's delivery status.

Payment settlement and delivery status are independent concerns. The only way
a GR moves ``pending -> delivered`` is the explicit "Update Status" action
(``PATCH /admin/orders/{id}/status``). This locks that rule down so the
auto-flip-on-full-payment behaviour can never come back.
"""
from __future__ import annotations

import uuid

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import RegistrationStatus, UserRole
from app.repositories.user_repository import UserRepository
from tests.test_gr import (
    GR_BASE,
    auth_headers,
    create_active_admin,
    create_company,
    gr_payload,
)

PAYMENTS = "/api/v1/payments"


async def _raw_status(gr_id: str) -> str:
    """The persisted `Order.status` column — the delivery status, not the
    payment-derived reporting bucket."""
    from app.models.order import Order

    async with session_scope() as s:
        o = await s.get(Order, uuid.UUID(gr_id))
        return o.status.value if hasattr(o.status, "value") else o.status


async def _make_gr(client, h, company_id, number, to_pay) -> str:
    p = gr_payload(number, company_id)
    p["toPay"] = to_pay
    r = await client.post(GR_BASE, json=p, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _pay(client, h, gr_id, amount) -> None:
    r = await client.post(
        PAYMENTS, json={"orderId": gr_id, "amount": amount, "recordedBy": None}, headers=h
    )
    assert r.status_code == 201, r.text


async def _summary(client, h, gr_id) -> dict:
    return (await client.get(f"{PAYMENTS}/summary/{gr_id}", headers=h)).json()


async def test_payment_never_changes_delivery_status(client):
    token = await create_active_admin(client, "nostatus@example.com", "+15559300001")
    company_id = await create_company("No Auto Status Co")
    h = auth_headers(token)

    # TEST 1 — Pending + ₹0 paid -> GR pending, payment unpaid
    g1 = await _make_gr(client, h, company_id, "NAS-1", 1000)
    assert await _raw_status(g1) == "pending"
    s1 = await _summary(client, h, g1)
    assert s1["totalPaid"] == 0 and s1["balance"] == 1000

    # TEST 2 — Pending + partial payment -> GR STAYS pending
    g2 = await _make_gr(client, h, company_id, "NAS-2", 1000)
    await _pay(client, h, g2, 400)
    assert await _raw_status(g2) == "pending"
    s2 = await _summary(client, h, g2)
    assert s2["totalPaid"] == 400 and s2["balance"] == 600
    assert s2["paymentStatus"] == "partial"

    # TEST 3 (MOST IMPORTANT) — Pending + FULL payment -> GR STAYS pending
    g3 = await _make_gr(client, h, company_id, "NAS-3", 1440)
    await _pay(client, h, g3, 1440)
    assert await _raw_status(g3) == "pending", "full payment auto-advanced the GR status — the bug is back"
    s3 = await _summary(client, h, g3)
    assert s3["totalPaid"] == 1440 and s3["balance"] == 0
    assert s3["paymentStatus"] == "paid"
    # The GR list's reporting bucket for an undelivered GR is always "pending"
    # regardless of payment.
    r = await client.get(GR_BASE, headers=h, params={"page_size": 100})
    item = next(i for i in r.json()["data"]["items"] if i["id"] == g3)
    assert item["status"] == "pending"
    assert item["reportingStatus"] == "pending"

    # TEST 3b — full payment in a SINGLE shot on a brand-new GR, then split
    g3b = await _make_gr(client, h, company_id, "NAS-3b", 500)
    await _pay(client, h, g3b, 200)
    await _pay(client, h, g3b, 300)
    assert await _raw_status(g3b) == "pending"

    # TEST 4 — Pending + full payment, THEN manual Update Status -> Delivered
    g4 = await _make_gr(client, h, company_id, "NAS-4", 800)
    await _pay(client, h, g4, 800)
    assert await _raw_status(g4) == "pending"
    r = await client.patch(f"{GR_BASE}/{g4}/status", json={"status": "delivered"}, headers=h)
    assert r.status_code == 200, r.text
    assert await _raw_status(g4) == "delivered"
    s4 = await _summary(client, h, g4)
    assert s4["balance"] == 0 and s4["paymentStatus"] == "paid"

    # TEST 5 — Delivered + payment update -> GR STAYS delivered
    g5 = await _make_gr(client, h, company_id, "NAS-5", 1000)
    assert (await client.patch(f"{GR_BASE}/{g5}/status", json={"status": "delivered"}, headers=h)).status_code == 200
    await _pay(client, h, g5, 250)
    assert await _raw_status(g5) == "delivered"

    # TEST 6 — Delivered + FULL payment -> GR STAYS delivered, payment paid
    g6 = await _make_gr(client, h, company_id, "NAS-6", 600)
    assert (await client.patch(f"{GR_BASE}/{g6}/status", json={"status": "delivered"}, headers=h)).status_code == 200
    await _pay(client, h, g6, 600)
    assert await _raw_status(g6) == "delivered"
    assert (await _summary(client, h, g6))["paymentStatus"] == "paid"

    # TEST 7 / 8 — reload from the backend after full payment: still pending
    reloaded = (await client.get(f"{GR_BASE}/{g3}", headers=h)).json()["data"]
    assert reloaded["status"] == "pending"
    assert await _raw_status(g3) == "pending"


async def test_creating_an_already_paid_gr_starts_pending(client):
    """A GR created with `toPay = 0` (nothing to collect) or later edited so
    the bill is fully covered must still start / stay pending — creation and
    bill edits never advance delivery status."""
    token = await create_active_admin(client, "nostatus2@example.com", "+15559300002")
    company_id = await create_company("No Auto Status Co 2")
    h = auth_headers(token)

    g0 = await _make_gr(client, h, company_id, "NAS0-1", 0)
    assert await _raw_status(g0) == "pending"

    g1 = await _make_gr(client, h, company_id, "NAS0-2", 500)
    await _pay(client, h, g1, 500)
    # edit the bill down to what's already paid
    r = await client.patch(f"{GR_BASE}/{g1}", json={"toPay": 500}, headers=h)
    assert r.status_code == 200, r.text
    assert await _raw_status(g1) == "pending"


async def test_staff_full_payment_does_not_bypass_manual_delivery(client):
    """A STAFF member collecting the full amount must not auto-deliver the GR
    — they must still perform the explicit pending->delivered action, which
    is the ONLY transition their role is allowed."""
    company_id = await create_company("No Auto Status Staff Co")

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
        r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
        return str(u.id), r.json()["data"]["tokens"]["accessToken"]

    admin_tok = await create_active_admin(client, "nas-staff-admin@example.com", "+15559300010")
    admin_h = auth_headers(admin_tok)
    staff_id, staff_tok = await _staff("nas-staff@example.com", "+15559300011")
    staff_h = auth_headers(staff_tok)

    gid = await _make_gr(client, admin_h, company_id, "NAS-STAFF-1", 900)
    assert (await client.post(f"{GR_BASE}/{gid}/assign-staff", json={"staffId": staff_id}, headers=admin_h)).status_code == 200

    await _pay(client, staff_h, gid, 900)
    assert await _raw_status(gid) == "pending"

    # staff now explicitly delivers it — allowed, and the only way it moves
    assert (await client.patch(f"{GR_BASE}/{gid}/status", json={"status": "delivered"}, headers=staff_h)).status_code == 200
    assert await _raw_status(gid) == "delivered"

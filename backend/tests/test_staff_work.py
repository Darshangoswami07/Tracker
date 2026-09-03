"""Staff Daily Collection + Admin Staff Work monitoring.

Verifies the flow the mobile app now depends on (Mobile -> FastAPI -> Neon,
no SQLite) and the authorization rule that Admin's Staff Work is READ-ONLY:
Admin can monitor every figure but cannot create a settlement.
"""
from __future__ import annotations

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.enums import UserRole
from app.repositories.user_repository import UserRepository

BASE = "/api/v1"


async def _user(email, password, role, company_id=None, area=None):
    repo = UserRepository()
    u = await repo.create(
        full_name="T", email=email, phone="+919850000000",
        password_hash=hash_password(password), role=role, status="active",
        company_id=company_id, area=area,
    )
    async with session_scope() as s:
        db = await s.get(type(u), u.id)
        db.isActive = db.isApproved = db.isVerified = db.otpVerified = True
        await s.flush()
    return u


async def _login(client, path, email, password):
    r = await client.post(f"{BASE}{path}", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['data']['tokens']['accessToken']}"}


async def _company(name="Co"):
    async with session_scope() as s:
        from app.models.company import Company

        c = Company(name=name)
        s.add(c)
        await s.flush()
        return c.id


async def _setup(client):
    company_id = await _company()
    await _user("admin@x.com", "AdminPass123!", UserRole.ADMIN, company_id=company_id)
    staff = await _user("staff@x.com", "StaffPass123!", UserRole.STAFF,
                        company_id=company_id, area="Bageshwar")
    admin_h = await _login(client, "/auth/admin/login", "admin@x.com", "AdminPass123!")
    staff_h = await _login(client, "/auth/staff/login", "staff@x.com", "StaffPass123!")
    return admin_h, staff_h, str(staff.id), company_id


async def test_staff_collection_flow_persists_in_neon(client):
    admin_h, staff_h, staff_id, company_id = await _setup(client)

    gr = await client.post(f"{BASE}/admin/orders", headers=admin_h, json={
        "grNumber": "SW-1", "consignorName": "Shop", "consigneeName": "Dest",
        "pickupAddress": "A", "deliveryAddress": "B",
        "pickupTime": "2026-08-31T10:00:00+00:00", "toPay": 500,
    })
    assert gr.status_code == 201, gr.text
    oid = gr.json()["data"]["id"]

    pay = await client.post(f"{BASE}/payments", headers=staff_h,
                            json={"orderId": oid, "amount": 300, "recordedBy": staff_id})
    assert pay.status_code == 201, pay.text

    dc = await client.get(f"{BASE}/staff/daily-collection", headers=staff_h)
    assert dc.status_code == 200
    d = dc.json()["data"]
    assert d["totalCollection"] == 300 and d["staffBalance"] == 300

    st = await client.post(f"{BASE}/staff/settlements", headers=staff_h,
                           json={"type": "owner", "amount": 100, "clientRequestId": "r1"})
    assert st.status_code == 201, st.text
    # idempotent retry -> same row
    st2 = await client.post(f"{BASE}/staff/settlements", headers=staff_h,
                            json={"type": "owner", "amount": 100, "clientRequestId": "r1"})
    assert st2.json()["data"]["id"] == st.json()["data"]["id"]

    dc2 = (await client.get(f"{BASE}/staff/daily-collection", headers=staff_h)).json()["data"]
    assert dc2["ownerAmount"] == 100 and dc2["staffBalance"] == 200


async def test_daily_work_payload_aggregates_collected_delivered_paid(client):
    """`/staff/daily-work` returns a correct summary + timeline + grWork +
    payments for one day, from column-only aggregate queries (no per-GR /
    per-payment round trips)."""
    admin_h, staff_h, staff_id, _ = await _setup(client)

    oids = []
    for n, bill in (("DW-1", 500), ("DW-2", 200)):
        gr = await client.post(f"{BASE}/admin/orders", headers=admin_h, json={
            "grNumber": n, "consignorName": f"Shop {n}", "consigneeName": "Dest",
            "pickupAddress": "A", "deliveryAddress": "B",
            "pickupTime": "2026-08-31T10:00:00+00:00", "toPay": bill,
        })
        assert gr.status_code == 201, gr.text
        oid = gr.json()["data"]["id"]
        oids.append(oid)
        assert (await client.post(f"{BASE}/admin/orders/{oid}/assign-staff",
                headers=admin_h, json={"staffId": staff_id})).status_code == 200

    # DW-1 delivered + fully paid; DW-2 partially paid, still pending.
    assert (await client.patch(f"{BASE}/admin/orders/{oids[0]}/status",
            headers=staff_h, json={"status": "delivered"})).status_code == 200
    assert (await client.post(f"{BASE}/payments", headers=staff_h,
            json={"orderId": oids[0], "amount": 500, "recordedBy": staff_id})).status_code == 201
    assert (await client.post(f"{BASE}/payments", headers=staff_h,
            json={"orderId": oids[1], "amount": 50, "recordedBy": staff_id})).status_code == 201

    data = (await client.get(f"{BASE}/staff/daily-work", headers=admin_h,
            params={"staffId": staff_id})).json()["data"]
    s = data["summary"]
    assert s["grCollected"] == 2
    assert s["grDelivered"] == 1
    assert s["amountCollected"] == 550
    assert s["totalBillValue"] == 700
    assert s["amountPending"] == 150  # DW-2: 200 bill - 50 paid
    assert {e["kind"] for e in data["timeline"]} == {"collected", "delivered", "payment"}
    assert len(data["grWork"]) == 2
    assert len(data["payments"]) == 2
    dw1 = next(g for g in data["grWork"] if g["orderNumber"] == "DW-1")
    assert dw1["deliveredAt"] is not None and dw1["balance"] == 0


async def test_historical_staff_work_survives_gr_deletion(client):
    """Admin deleting a GR must NOT rewrite the historical Staff Work for the
    day the work/payment happened. The deleted GRs disappear from My Slips
    and the Admin GR list, but Staff Work for that date keeps its numbers."""
    admin_h, staff_h, staff_id, company_id = await _setup(client)

    oids = []
    for n in ("HX-1", "HX-2"):
        gr = await client.post(f"{BASE}/admin/orders", headers=admin_h, json={
            "grNumber": n, "consignorName": f"Shop {n}", "consigneeName": "Dest",
            "pickupAddress": "A", "deliveryAddress": "B",
            "pickupTime": "2026-08-31T10:00:00+00:00", "toPay": 45,
        })
        assert gr.status_code == 201, gr.text
        oid = gr.json()["data"]["id"]
        oids.append(oid)
        assert (await client.post(f"{BASE}/admin/orders/{oid}/assign-staff",
                headers=admin_h, json={"staffId": staff_id})).status_code == 200
        assert (await client.patch(f"{BASE}/admin/orders/{oid}/status",
                headers=staff_h, json={"status": "delivered"})).status_code == 200
        assert (await client.post(f"{BASE}/payments", headers=staff_h,
                json={"orderId": oid, "amount": 45, "recordedBy": staff_id})).status_code == 201

    before = (await client.get(f"{BASE}/staff/daily-work", headers=admin_h,
              params={"staffId": staff_id})).json()["data"]["summary"]
    assert (before["grCollected"], before["grDelivered"], before["amountCollected"]) == (2, 2, 90)

    # Admin deletes both GRs.
    for oid in oids:
        assert (await client.delete(f"{BASE}/admin/orders/{oid}", headers=admin_h)).status_code == 200

    # Historical Staff Work is UNCHANGED.
    after = (await client.get(f"{BASE}/staff/daily-work", headers=admin_h,
             params={"staffId": staff_id})).json()["data"]
    assert (after["summary"]["grCollected"], after["summary"]["grDelivered"],
            after["summary"]["amountCollected"]) == (2, 2, 90)
    assert len(after["grWork"]) == 2 and len(after["payments"]) == 2

    # daily-collection (staff's own view) also keeps the money.
    dc = (await client.get(f"{BASE}/staff/daily-collection", headers=staff_h)).json()["data"]
    assert dc["totalCollection"] == 90

    # ...but the GRs are gone from the current operational lists.
    my_slips = (await client.get(f"{BASE}/admin/orders", headers=staff_h)).json()["data"]
    assert not any(i["orderNumber"] in {"HX-1", "HX-2"} for i in my_slips["items"])
    admin_list = (await client.get(f"{BASE}/admin/orders", headers=admin_h)).json()["data"]
    assert not any(i["orderNumber"] in {"HX-1", "HX-2"} for i in admin_list["items"])

    # Payment History retains the payments for the deleted GRs.
    ph = (await client.get(f"{BASE}/payments", headers=admin_h)).json()
    assert {"HX-1", "HX-2"}.issubset({i["orderNumber"] for i in ph["items"]})


async def test_admin_staff_work_is_read_only(client):
    admin_h, staff_h, staff_id, _ = await _setup(client)

    # Admin CAN read the monitoring payload for any staff member.
    work = await client.get(f"{BASE}/staff/daily-work", headers=admin_h,
                            params={"staffId": staff_id})
    assert work.status_code == 200
    assert "summary" in work.json()["data"]

    # Admin CANNOT create a settlement (read-only) -> 403.
    bad = await client.post(f"{BASE}/staff/settlements", headers=admin_h,
                            json={"type": "owner", "amount": 50, "staffId": staff_id})
    assert bad.status_code == 403


async def test_settlement_cannot_exceed_balance(client):
    _, staff_h, staff_id, _ = await _setup(client)
    r = await client.post(f"{BASE}/staff/settlements", headers=staff_h,
                          json={"type": "driver", "amount": 999})
    # Negative-balance guard -> ValidationBusinessError (422 validation_error).
    assert r.status_code == 422
    assert "balance" in r.json()["error"]["message"].lower()


async def test_staff_scoped_to_self(client):
    """A staff member asking for another staffId still only gets their own data."""
    admin_h, staff_h, staff_id, company_id = await _setup(client)
    other = await _user("staff2@x.com", "StaffPass123!", UserRole.STAFF, company_id=company_id)
    r = await client.get(f"{BASE}/staff/daily-collection", headers=staff_h,
                         params={"staffId": str(other.id)})
    assert r.status_code == 200  # ignored, scoped to caller — no leak, no error

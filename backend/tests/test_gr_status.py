"""Canonical GR reporting-status classification.

Covers the four buckets (pending / cleared / uncleared / delivered), the exact
spec test cases, the full payment lifecycle, and the count invariant
``pending + cleared + uncleared + delivered == total`` shared by the Admin
Dashboard and GR / Shipments screens.
"""
from __future__ import annotations

from app.services.gr_status_service import classify
from tests.test_gr import (
    GR_BASE,
    auth_headers,
    create_active_admin,
    create_company,
    gr_payload,
)

COUNTS = f"{GR_BASE}/meta/status-counts"
PAYMENTS = "/api/v1/payments"


# --- pure classifier: the 7 spec cases -------------------------------------
def test_classify_spec_cases():
    cases = [
        (False, 0, 500, "pending"),      # case 1
        (True, 0, 500, "delivered"),     # case 2
        (True, 200, 500, "uncleared"),   # case 3
        (True, 499, 500, "uncleared"),   # case 4
        (True, 500, 500, "cleared"),     # case 5
        (True, 600, 500, "cleared"),     # case 6
        (False, 200, 500, "pending"),    # case 7 — undelivered + partial stays PENDING
        # Nothing owed on a delivered GR is settled -> CLEARED, whether or not
        # any payment was recorded (a GR with no bill, or toPay lowered to 0).
        (True, 0, 0, "cleared"),
        (True, 0, None, "cleared"),
        (True, 50, 0, "cleared"),
        (False, 0, 0, "pending"),         # undelivered + nothing owed stays PENDING
    ]
    for delivered, paid, bill, expected in cases:
        assert classify(delivered, paid, bill) == expected, (delivered, paid, bill)


# --- full lifecycle through the real API + count invariant ----------------
async def _paid_total(client, headers, order_id) -> float:
    r = await client.get(f"{PAYMENTS}/summary/{order_id}", headers=headers)
    assert r.status_code == 200, r.text
    return float(r.json()["totalPaid"])


async def test_status_lifecycle_and_counts(client):
    token = await create_active_admin(client, "grstatus@example.com", "+15559000123")
    company_id = await create_company("Status Co")
    h = auth_headers(token)

    async def counts() -> dict:
        r = await client.get(COUNTS, headers=h)
        assert r.status_code == 200, r.text
        return r.json()["data"]

    async def bucket_of(gr_id: str) -> str:
        # Find the GR in the list and read its canonical reportingStatus.
        r = await client.get(GR_BASE, headers=h, params={"page_size": 100})
        assert r.status_code == 200, r.text
        for it in r.json()["data"]["items"]:
            if it["id"] == gr_id:
                return it["reportingStatus"]
        raise AssertionError("GR missing from list")

    def assert_sum(c: dict):
        assert c["pending"] + c["cleared"] + c["uncleared"] + c["delivered"] == c["total"]

    # 1. Create GR — bill 1000, nothing paid, not delivered -> PENDING
    payload = gr_payload("GRSTAT001", company_id)
    payload["toPay"] = 1000
    r = await client.post(GR_BASE, json=payload, headers=h)
    assert r.status_code == 201, r.text
    gr_id = r.json()["data"]["id"]

    assert await bucket_of(gr_id) == "pending"
    c = await counts()
    assert (c["total"], c["pending"], c["cleared"], c["uncleared"], c["delivered"]) == (1, 1, 0, 0, 0)
    assert_sum(c)

    # 2. Mark delivered, still nothing paid -> DELIVERED
    r = await client.patch(f"{GR_BASE}/{gr_id}/status", json={"status": "delivered"}, headers=h)
    assert r.status_code == 200, r.text
    assert await bucket_of(gr_id) == "delivered"
    c = await counts()
    assert (c["pending"], c["cleared"], c["uncleared"], c["delivered"]) == (0, 0, 0, 1)
    assert_sum(c)

    # 3. Receive 400 of 1000 -> UNCLEARED
    r = await client.post(PAYMENTS, json={"orderId": gr_id, "amount": 400, "recordedBy": None}, headers=h)
    assert r.status_code == 201, r.text
    assert await _paid_total(client, h, gr_id) == 400.0
    assert await bucket_of(gr_id) == "uncleared"
    c = await counts()
    assert (c["pending"], c["cleared"], c["uncleared"], c["delivered"]) == (0, 0, 1, 0)
    assert_sum(c)

    # 4. Receive the remaining 600 -> CLEARED
    r = await client.post(PAYMENTS, json={"orderId": gr_id, "amount": 600, "recordedBy": None}, headers=h)
    assert r.status_code == 201, r.text
    assert await bucket_of(gr_id) == "cleared"
    c = await counts()
    assert (c["pending"], c["cleared"], c["uncleared"], c["delivered"]) == (0, 1, 0, 0)
    assert_sum(c)


async def test_undelivered_partial_payment_stays_pending(client):
    token = await create_active_admin(client, "grstatus2@example.com", "+15559000456")
    company_id = await create_company("Status Co 2")
    h = auth_headers(token)

    payload = gr_payload("GRSTAT050", company_id)
    payload["toPay"] = 500
    r = await client.post(GR_BASE, json=payload, headers=h)
    gr_id = r.json()["data"]["id"]

    # Partial payment WITHOUT ever marking delivered.
    r = await client.post(PAYMENTS, json={"orderId": gr_id, "amount": 200, "recordedBy": None}, headers=h)
    assert r.status_code == 201, r.text

    r = await client.get(GR_BASE, headers=h, params={"page_size": 100})
    item = next(i for i in r.json()["data"]["items"] if i["id"] == gr_id)
    assert item["reportingStatus"] == "pending"

    # And the ?status= filter agrees with the count.
    r = await client.get(GR_BASE, headers=h, params={"status": "pending", "page_size": 100})
    assert any(i["id"] == gr_id for i in r.json()["data"]["items"])
    r = await client.get(GR_BASE, headers=h, params={"status": "uncleared", "page_size": 100})
    assert not any(i["id"] == gr_id for i in r.json()["data"]["items"])


async def test_status_filter_returns_only_that_bucket(client):
    """`GET /admin/orders?status=<bucket>` must return ONLY GRs whose canonical
    reporting status is that bucket — and every returned item's
    ``reportingStatus`` must equal the requested filter. Regression for the
    Staff "Uncleared" filter showing a Cleared GR."""
    token = await create_active_admin(client, "sfilter@example.com", "+15559000222")
    company_id = await create_company("Status Filter Co")
    h = auth_headers(token)

    async def make(num: str, bill: int, deliver: bool, pay: int) -> str:
        p = gr_payload(num, company_id)
        p["toPay"] = bill
        gid = (await client.post(GR_BASE, json=p, headers=h)).json()["data"]["id"]
        if deliver:
            assert (await client.patch(f"{GR_BASE}/{gid}/status",
                    json={"status": "delivered"}, headers=h)).status_code == 200
        if pay:
            assert (await client.post(PAYMENTS, json={"orderId": gid, "amount": pay,
                    "recordedBy": None}, headers=h)).status_code == 201
        return gid

    ids = {
        "pending": await make("SF-PEND", 500, deliver=False, pay=0),
        "delivered": await make("SF-DELV", 500, deliver=True, pay=0),
        "uncleared": await make("SF-UNCL", 500, deliver=True, pay=200),
        "cleared": await make("SF-CLRD", 500, deliver=True, pay=500),
    }

    for bucket, expected_id in ids.items():
        r = await client.get(GR_BASE, headers=h, params={"status": bucket, "page_size": 100})
        assert r.status_code == 200, r.text
        items = r.json()["data"]["items"]
        got = {i["id"] for i in items}
        assert got == {expected_id}, f"{bucket}: {[(i['orderNumber'], i['reportingStatus']) for i in items]}"
        # Every returned row genuinely IS that bucket.
        assert all(i["reportingStatus"] == bucket for i in items), bucket
        assert all(i["id"] != ids["cleared"] or bucket == "cleared" for i in items)

    # And the counts endpoint agrees with the filtered lists.
    c = (await client.get(COUNTS, headers=h)).json()["data"]
    assert (c["pending"], c["delivered"], c["uncleared"], c["cleared"]) == (1, 1, 1, 1)


async def test_payment_history_endpoint_one_request_paginated(client):
    """`GET /payments` returns paginated payment history with each row's GR
    number + consignee already joined in — so the Payment History screen
    needs NO per-payment / per-order follow-up request. Newest first."""
    token = await create_active_admin(client, "phist@example.com", "+15559000789")
    company_id = await create_company("Payment History Co")
    h = auth_headers(token)

    gr_ids = []
    for n in ("PH-1", "PH-2", "PH-3"):
        p = gr_payload(n, company_id)
        p["toPay"] = 300
        p["consigneeName"] = f"Shop {n}"
        r = await client.post(GR_BASE, json=p, headers=h)
        gr_ids.append(r.json()["data"]["id"])
    # 4 payments total (one GR gets two).
    for gid, amt in [(gr_ids[0], 100), (gr_ids[0], 50), (gr_ids[1], 200), (gr_ids[2], 300)]:
        r = await client.post(PAYMENTS, json={"orderId": gid, "amount": amt, "recordedBy": None}, headers=h)
        assert r.status_code == 201, r.text

    hist = (await client.get(PAYMENTS, headers=h, params={"page": 1, "page_size": 2})).json()
    assert hist["total"] == 4
    assert len(hist["items"]) == 2
    row = hist["items"][0]
    # GR identity is embedded — no follow-up call needed to render the card.
    assert set(row) >= {"id", "orderId", "orderNumber", "consigneeName", "amount", "paymentMethod", "createdAt"}
    assert row["orderNumber"] in {"PH-1", "PH-2", "PH-3"}
    # Newest first, page 2 continues.
    ts = [i["createdAt"] for i in hist["items"]]
    assert ts == sorted(ts, reverse=True)
    page2 = (await client.get(PAYMENTS, headers=h, params={"page": 2, "page_size": 2})).json()
    assert len(page2["items"]) == 2
    assert {i["id"] for i in hist["items"]}.isdisjoint({i["id"] for i in page2["items"]})

    # Search narrows to one GR's payments.
    ph1 = (await client.get(PAYMENTS, headers=h, params={"search": "PH-1"})).json()
    assert ph1["total"] == 2 and all(i["orderNumber"] == "PH-1" for i in ph1["items"])

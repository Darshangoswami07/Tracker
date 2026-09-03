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

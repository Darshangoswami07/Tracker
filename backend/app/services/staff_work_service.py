"""Staff Daily Collection / Staff Work aggregation.

Single source of truth for the money figures shown on both the Staff Daily
Collection page (the staff member's own) and the Admin Staff Work monitoring
page (read-only). Ported from the former mobile-SQLite
``orderRepository.getStaffDailyActivity`` / ``getStaffDailyCollection`` /
``getStaffSettlementTotals`` so Admin and Staff always see identical numbers.

Attribution rules (unchanged from the mobile implementation):
  * a GR is attributed to a staff member via ``orders.assignedStaffId``
    (which stores an ``employees.id``);
  * a payment via ``payments.recordedBy`` (a ``users.id`` string — who
    actually recorded the collection);
  * "delivered" is read off ``order_status_history`` (status == 'delivered');
  * settlements via ``staff_settlements.staffId`` (a ``users.id``).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.models.payment import Payment
from app.models.staff_settlement import StaffSettlement
from app.core.exceptions import ValidationBusinessError


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    end = datetime.combine(day, time.max, tzinfo=timezone.utc)
    return start, end


async def _employee_id_for_user(session: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(
        select(Employee.id).where(Employee.userId == str(user_id))
    )


async def _settlement_totals(
    session: AsyncSession, staff_user_id: uuid.UUID, day: date
) -> dict:
    start, end = _day_bounds(day)
    rows = (
        await session.execute(
            select(StaffSettlement)
            .where(
                StaffSettlement.staffId == staff_user_id,
                StaffSettlement.createdAt >= start,
                StaffSettlement.createdAt <= end,
            )
            .order_by(StaffSettlement.createdAt.asc())
        )
    ).scalars().all()
    owner = labour = driver = 0.0
    events = []
    for r in rows:
        amt = float(r.amount)
        if r.type == "owner":
            owner += amt
        elif r.type == "labour":
            labour += amt
        elif r.type == "driver":
            driver += amt
        events.append(
            {
                "id": f"settlement:{r.id}",
                "kind": r.type,
                "amount": amt,
                "notes": r.notes,
                "createdAt": r.createdAt,
            }
        )
    return {"owner": owner, "labour": labour, "driver": driver, "events": events}


async def daily_collection(
    session: AsyncSession, staff_user_id: uuid.UUID, day: date
) -> dict:
    start, end = _day_bounds(day)
    payment_rows = (
        await session.execute(
            select(Payment, Order.orderNumber, Order.consignorName)
            .join(Order, Order.id == Payment.orderId)
            .where(
                # Historical report — count payments even if the GR was later
                # soft-deleted by an Admin. See ``daily_activity`` docstring.
                Payment.recordedBy == str(staff_user_id),
                Payment.createdAt >= start,
                Payment.createdAt <= end,
            )
            .order_by(Payment.createdAt.asc())
        )
    ).all()

    total_collection = sum(float(p.amount) for p, *_ in payment_rows)
    # All-time amount this staff member has personally collected (same
    # ``recordedBy`` scope as the day figure, without the date bound).
    lifetime_collection = float(
        (
            await session.execute(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    Payment.recordedBy == str(staff_user_id)
                )
            )
        ).scalar()
        or 0
    )
    st = await _settlement_totals(session, staff_user_id, day)

    collection_events = [
        {
            "id": f"collection:{p.id}",
            "kind": "collection",
            "amount": float(p.amount),
            "orderId": p.orderId,
            "orderNumber": order_number,
            "consignorName": consignor,
            "createdAt": p.createdAt,
        }
        for p, order_number, consignor in payment_rows
    ]
    transactions = sorted(
        collection_events + st["events"], key=lambda e: e["createdAt"]
    )

    return {
        "date": day.isoformat(),
        "totalCollection": total_collection,
        "lifetimeCollection": lifetime_collection,
        "ownerAmount": st["owner"],
        "labourAmount": st["labour"],
        "driverAmount": st["driver"],
        "staffBalance": total_collection - st["owner"] - st["labour"] - st["driver"],
        "transactions": transactions,
    }


async def daily_summary(
    session: AsyncSession, staff_user_id: uuid.UUID, day: date
) -> dict:
    start, end = _day_bounds(day)
    row = (
        await session.execute(
            select(
                func.coalesce(func.sum(Payment.amount), 0),
                func.count(func.distinct(Payment.orderId)),
            )
            .join(Order, Order.id == Payment.orderId)
            .where(
                Payment.recordedBy == str(staff_user_id),
                Payment.createdAt >= start,
                Payment.createdAt <= end,
            )
        )
    ).one()
    return {"totalCollection": float(row[0] or 0), "totalGRs": int(row[1] or 0)}


async def daily_summary_all(
    session: AsyncSession, day: date, company_id: uuid.UUID | None = None
) -> dict[str, dict]:
    """``{recordedBy(users.id) -> {totalCollection, totalGRs}}`` for a single
    day, in ONE grouped query — replaces N per-staff ``daily_summary`` round
    trips on the Payment History screen's Staff Daily Work section."""
    start, end = _day_bounds(day)
    conds = [
        Payment.createdAt >= start,
        Payment.createdAt <= end,
        Payment.recordedBy.isnot(None),
    ]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    rows = (
        await session.execute(
            select(
                Payment.recordedBy,
                func.coalesce(func.sum(Payment.amount), 0),
                func.count(func.distinct(Payment.orderId)),
            )
            .join(Order, Order.id == Payment.orderId)
            .where(*conds)
            .group_by(Payment.recordedBy)
        )
    ).all()
    return {
        str(r[0]): {"totalCollection": float(r[1] or 0), "totalGRs": int(r[2] or 0)}
        for r in rows
    }


async def daily_grs(
    session: AsyncSession, staff_user_id: uuid.UUID, day: date
) -> list[dict]:
    start, end = _day_bounds(day)
    rows = (
        await session.execute(
            select(
                Order.id,
                Order.orderNumber,
                Order.consignorName,
                Order.consigneeName,
                Order.status,
                func.sum(Payment.amount).label("amountCollected"),
                func.max(Payment.createdAt).label("lastPaymentAt"),
            )
            .join(Order, Order.id == Payment.orderId)
            .where(
                Payment.recordedBy == str(staff_user_id),
                Payment.createdAt >= start,
                Payment.createdAt <= end,
            )
            .group_by(Order.id, Order.orderNumber, Order.consignorName, Order.consigneeName, Order.status)
            .order_by(func.max(Payment.createdAt).desc())
        )
    ).all()
    return [
        {
            "orderId": str(r.id),
            "orderNumber": r.orderNumber,
            "consignorName": r.consignorName,
            "consigneeName": r.consigneeName,
            "status": r.status.value if hasattr(r.status, "value") else r.status,
            "amountCollected": float(r.amountCollected or 0),
        }
        for r in rows
    ]


async def _total_paid_map(session: AsyncSession, order_ids: list[uuid.UUID]) -> dict:
    if not order_ids:
        return {}
    rows = (
        await session.execute(
            select(Payment.orderId, func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.orderId.in_(order_ids))
            .group_by(Payment.orderId)
        )
    ).all()
    return {oid: float(total) for oid, total in rows}


_ORDER_COLS = (
    Order.id,
    Order.orderNumber,
    Order.consignorName,
    Order.consigneeName,
    Order.status,
    Order.createdAt,
    Order.toPay,
    Order.deletedAt,
)


async def daily_activity(
    session: AsyncSession, staff_user_id: uuid.UUID, day: date
) -> dict:
    """Full Staff Work payload for one day.

    Performance: every query below selects **scalar columns only** — never a
    ``select(Order)`` entity, which would trigger ``Order``'s 8 ``lazy=
    "selectin"`` relationship loads (company/customer/driver/vehicle/staff/
    shop/history/attachments) and turn one logical query into ~9 remote round
    trips. The independent lookups also run **concurrently**, so the endpoint
    costs ~3 sequential round trips instead of ~30.

    History vs. current state: this is a *historical* report — "what did this
    staff member do on <day>". A GR that was worked/paid on <day> and later
    soft-deleted by an Admin (``deletedAt`` set, ``isActive = False``) MUST
    still be counted here — its row, payments and status-history all survive
    the soft delete. So NONE of the queries below filter on ``deletedAt``.
    Current operational screens (My Slips, Admin GR list) keep their
    ``isActive``/``deletedAt`` filters and are unaffected.
    """
    start, end = _day_bounds(day)
    import asyncio as _asyncio

    from app.database.db import session_scope

    # --- round-trip 1: three independent lookups in parallel ------------- #
    async def _emp() -> uuid.UUID | None:
        async with session_scope() as s:
            return await _employee_id_for_user(s, staff_user_id)

    async def _payments() -> list:
        async with session_scope() as s:
            return (
                await s.execute(
                    select(
                        Payment.id,
                        Payment.orderId,
                        Payment.amount,
                        Payment.createdAt,
                        Order.orderNumber,
                        Order.consignorName,
                        Order.consigneeName,
                    )
                    .join(Order, Order.id == Payment.orderId)
                    .where(
                        Payment.recordedBy == str(staff_user_id),
                        Payment.createdAt >= start,
                        Payment.createdAt <= end,
                    )
                    .order_by(Payment.createdAt.asc())
                )
            ).all()

    async def _settlements() -> dict:
        async with session_scope() as s:
            return await _settlement_totals(s, staff_user_id, day)

    employee_id, payment_rows, st = await _asyncio.gather(
        _emp(), _payments(), _settlements()
    )

    # --- round-trip 2: collected + delivered in parallel ---------------- #
    async def _collected() -> list:
        if employee_id is None:
            return []
        async with session_scope() as s:
            return (
                await s.execute(
                    select(*_ORDER_COLS)
                    .where(
                        Order.assignedStaffId == employee_id,
                        Order.createdAt >= start,
                        Order.createdAt <= end,
                    )
                    .order_by(Order.createdAt.asc())
                )
            ).all()

    async def _delivered() -> list:
        if employee_id is None:
            return []
        async with session_scope() as s:
            return (
                await s.execute(
                    select(
                        *_ORDER_COLS,
                        func.max(OrderStatusHistory.createdAt).label("deliveredAt"),
                    )
                    .join(OrderStatusHistory, OrderStatusHistory.orderId == Order.id)
                    .where(
                        Order.assignedStaffId == employee_id,
                        OrderStatusHistory.status == "delivered",
                        OrderStatusHistory.createdAt >= start,
                        OrderStatusHistory.createdAt <= end,
                    )
                    .group_by(*_ORDER_COLS)
                    .order_by(func.max(OrderStatusHistory.createdAt).asc())
                )
            ).all()

    collected, delivered = await _asyncio.gather(_collected(), _delivered())

    # Order metadata we already have in hand (no extra fetch for these).
    order_meta: dict[uuid.UUID, dict] = {}
    for r in collected:
        order_meta[r.id] = {
            "orderNumber": r.orderNumber,
            "consignorName": r.consignorName,
            "consigneeName": r.consigneeName,
            "status": r.status.value if hasattr(r.status, "value") else r.status,
            "createdAt": r.createdAt,
            "toPay": float(r.toPay or 0),
            "deleted": r.deletedAt is not None,
        }
    delivered_at_map: dict[uuid.UUID, datetime] = {}
    for r in delivered:
        delivered_at_map[r.id] = r.deliveredAt
        order_meta.setdefault(
            r.id,
            {
                "orderNumber": r.orderNumber,
                "consignorName": r.consignorName,
                "consigneeName": r.consigneeName,
                "status": r.status.value if hasattr(r.status, "value") else r.status,
                "createdAt": r.createdAt,
                "toPay": float(r.toPay or 0),
                "deleted": r.deletedAt is not None,
            },
        )
    for p in payment_rows:
        order_meta.setdefault(
            p.orderId,
            {
                "orderNumber": p.orderNumber,
                "consignorName": p.consignorName,
                "consigneeName": p.consigneeName,
                "status": None,
                "createdAt": None,
                "toPay": 0.0,
                "deleted": False,
            },
        )

    union_ids: list[uuid.UUID] = list(order_meta.keys())

    # --- round-trip 3: paid totals + any missing toPay/status in parallel #
    payment_only_ids = [
        oid
        for oid in union_ids
        if oid not in {r.id for r in collected} and oid not in {r.id for r in delivered}
    ]

    async def _paid() -> dict:
        async with session_scope() as s:
            return await _total_paid_map(s, union_ids)

    async def _fill_missing() -> list:
        if not payment_only_ids:
            return []
        async with session_scope() as s:
            return (
                await s.execute(
                    select(
                        Order.id, Order.status, Order.toPay, Order.createdAt, Order.deletedAt
                    ).where(Order.id.in_(payment_only_ids))
                )
            ).all()

    paid_map, missing_rows = await _asyncio.gather(_paid(), _fill_missing())
    for r in missing_rows:
        m = order_meta.get(r.id)
        if m is not None:
            m["status"] = r.status.value if hasattr(r.status, "value") else r.status
            m["toPay"] = float(r.toPay or 0)
            m["createdAt"] = r.createdAt
            m["deleted"] = r.deletedAt is not None

    ledger: dict[uuid.UUID, dict] = {
        oid: {
            **meta,
            "totalPaid": paid_map.get(oid, 0.0),
            "deliveredAt": delivered_at_map.get(oid),
        }
        for oid, meta in order_meta.items()
    }

    timeline = []
    for r in collected:
        timeline.append(
            {
                "id": f"collected:{r.id}",
                "kind": "collected",
                "orderId": r.id,
                "orderNumber": r.orderNumber,
                "consignorName": r.consignorName,
                "consigneeName": r.consigneeName,
                "createdAt": r.createdAt,
                "toPay": float(r.toPay or 0),
                "deleted": r.deletedAt is not None,
            }
        )
    for r in delivered:
        timeline.append(
            {
                "id": f"delivered:{r.id}",
                "kind": "delivered",
                "orderId": r.id,
                "orderNumber": r.orderNumber,
                "consignorName": r.consignorName,
                "consigneeName": r.consigneeName,
                "createdAt": r.deliveredAt,
                "deleted": r.deletedAt is not None,
            }
        )
    payment_events = []
    for p in payment_rows:
        led = ledger.get(p.orderId)
        remaining = max(0.0, led["toPay"] - led["totalPaid"]) if led else None
        payment_events.append(
            {
                "id": f"payment:{p.id}",
                "kind": "payment",
                "orderId": p.orderId,
                "orderNumber": p.orderNumber,
                "consignorName": p.consignorName,
                "consigneeName": p.consigneeName,
                "createdAt": p.createdAt,
                "amount": float(p.amount),
                "remaining": remaining,
                "deleted": bool(led["deleted"]) if led else False,
            }
        )
    timeline.extend(payment_events)
    timeline.sort(key=lambda e: e["createdAt"])

    gr_work = sorted(
        (
            {
                "orderId": oid,
                "orderNumber": led["orderNumber"],
                "consignorName": led["consignorName"],
                "consigneeName": led["consigneeName"],
                "status": led["status"],
                "collectedAt": led["createdAt"],
                "deliveredAt": led["deliveredAt"],
                "toPay": led["toPay"],
                "totalPaid": led["totalPaid"],
                "balance": max(0.0, led["toPay"] - led["totalPaid"]),
                "deleted": bool(led.get("deleted")),
            }
            for oid, led in ledger.items()
        ),
        key=lambda g: (g["collectedAt"] is None, g["collectedAt"]),
    )

    collected_ids = {r.id for r in collected}
    amount_collected = sum(float(p.amount) for p in payment_rows)
    total_bill_value = sum(float(r.toPay or 0) for r in collected)
    amount_pending = sum(
        max(0.0, ledger[oid]["toPay"] - ledger[oid]["totalPaid"])
        for oid in collected_ids
        if oid in ledger
    )
    shops_visited = len(
        {led["consignorName"] for led in ledger.values() if led["consignorName"]}
    )

    return {
        "summary": {
            "grCollected": len(collected),
            "grDelivered": len(delivered),
            "amountCollected": amount_collected,
            "amountPending": amount_pending,
            "totalBillValue": total_bill_value,
            "shopsVisited": shops_visited,
            "ownerAmount": st["owner"],
            "labourAmount": st["labour"],
            "driverAmount": st["driver"],
            "staffBalance": amount_collected - st["owner"] - st["labour"] - st["driver"],
        },
        "timeline": timeline,
        "grWork": gr_work,
        "payments": payment_events,
        "settlements": st["events"],
    }


async def create_settlement(
    session: AsyncSession,
    staff_user_id: uuid.UUID,
    settlement_type: str,
    amount: Decimal,
    notes: str | None,
    created_by: uuid.UUID,
    client_request_id: str | None,
) -> StaffSettlement:
    """Records a settlement with negative-balance protection: an outgoing
    settlement can never exceed what is left of *today's* collection after
    today's existing settlements."""
    if client_request_id:
        existing = await session.scalar(
            select(StaffSettlement).where(
                StaffSettlement.clientRequestId == client_request_id
            )
        )
        if existing is not None:
            return existing

    amount = Decimal(amount)
    if amount <= 0:
        raise ValidationBusinessError("Enter a valid amount greater than ₹0.")

    today = datetime.now(timezone.utc).date()
    collection = await daily_collection(session, staff_user_id, today)
    if float(amount) > collection["staffBalance"] + 0.005:
        raise ValidationBusinessError(
            "Settlement amount cannot exceed available balance."
        )

    row = StaffSettlement(
        staffId=staff_user_id,
        type=settlement_type,
        amount=amount,
        notes=(notes or "").strip() or None,
        createdBy=created_by,
        clientRequestId=client_request_id,
    )
    session.add(row)
    await session.flush()
    return row

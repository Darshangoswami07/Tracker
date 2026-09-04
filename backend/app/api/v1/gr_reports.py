"""GR aggregation / reporting endpoints + Excel bulk import.

Ported from the former mobile-SQLite ``orderRepository`` aggregation methods
so every figure the mobile dashboards/lists show comes from Neon via the
API. Server-side filtering only — the mobile app never pulls the whole table.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi import Depends
from pydantic import BaseModel, Field
import time as _time

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import GRAccessUser
from app.core.exceptions import NotFoundError, ValidationBusinessError
from app.core.tenancy import assert_same_company, effective_company_id, resolve_gr_staff_scope
from app.database.db import get_db_session
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.models.shop import Shop
from app.models.payment import Payment
from app.models.user import User
from app.models.import_history import ImportHistory
from app.repositories.order_repository import OrderRepository
from app.schemas.order import GRCreateRequest
from app.services.gr_status_service import status_counts
from app.utils.responses import success

router = APIRouter(prefix="/admin/orders", tags=["gr-reports"])
order_repo = OrderRepository()
logger = logging.getLogger(__name__)


def _effective_area(admin) -> str | None:
    return getattr(admin, "area", None)


def _paid_subq(session):
    return (
        select(Payment.orderId, func.coalesce(func.sum(Payment.amount), 0).label("paid"))
        .group_by(Payment.orderId)
        .subquery()
    )


@router.get("/track/{gr_number}")
async def track_gr(gr_number: str, admin: GRAccessUser) -> dict:
    order = await order_repo.get_by_order_number(gr_number)
    if order is None or order.deletedAt is not None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
    area = _effective_area(admin)
    if area and order.area != area:
        raise NotFoundError("GR not found.")
    from app.api.v1.gr import _gr_out  # reuse the full serializer

    detail = await order_repo.get_order_with_details(order.id)
    return success((await _gr_out(detail or order)).model_dump(mode="json"), message="GR retrieved successfully.")


@router.get("/meta/status-counts")
async def gr_status_counts(
    admin: GRAccessUser,
    search: Optional[str] = None,
    area: Optional[str] = None,
    consignor: Optional[str] = None,
    dateFrom: Optional[str] = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Canonical GR reporting counts (pending / cleared / uncleared / delivered)
    plus the matching money totals, for the caller's tenant + optional filters.

    Same classification and filter semantics as ``GET /admin/orders`` and its
    ``?status=`` filter (see ``app.services.gr_status_service``), so the numbers
    here always reconcile with the list and always satisfy
    ``pending + cleared + uncleared + delivered == total``. Used by both the
    Admin Dashboard status overview and the GR / Shipments summary cards."""
    company_id = await effective_company_id(admin)
    # STAFF callers are scoped to their *own* GRs (assignment OR area — see
    # resolve_gr_staff_scope), exactly like GET /admin/orders, so the Staff
    # Dashboard's Assigned/Pending/Completed cards reconcile with My Slips.
    staff_scope = await resolve_gr_staff_scope(admin, area)
    scoped_area = None if staff_scope is not None else (_effective_area(admin) or area)
    parsed_from = (
        datetime.fromisoformat(dateFrom.replace("Z", "+00:00")) if dateFrom else None
    )
    counts = await status_counts(
        session,
        company_id=company_id,
        area=scoped_area,
        search=search,
        consignor=consignor,
        date_from=parsed_from,
        staff_scope=staff_scope,
    )
    return success(counts, message="GR status counts retrieved successfully.")


@router.get("/meta/consignors")
async def list_consignors(admin: GRAccessUser) -> dict:
    names = await order_repo.distinct_shop_names(
        company_id=await effective_company_id(admin), area=_effective_area(admin)
    )
    return success(names, message="Consignors retrieved successfully.")


@router.get("/meta/activity")
async def recent_activity(
    admin: GRAccessUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    base = [Order.deletedAt.is_(None)]
    if company_id is not None:
        base.append(Order.companyId == company_id)
    if area:
        base.append(Order.area == area)

    hist = (
        await session.execute(
            select(OrderStatusHistory, Order.orderNumber)
            .join(Order, Order.id == OrderStatusHistory.orderId)
            .where(*base)
            .order_by(OrderStatusHistory.createdAt.desc())
            .limit(max(limit * 4, 40))
        )
    ).all()

    by_order: dict[UUID, list] = {}
    for h, _num in reversed(hist):
        by_order.setdefault(h.orderId, []).append((h, _num))
    events = []
    for rows in by_order.values():
        for idx, (h, num) in enumerate(rows):
            is_created = idx == 0 and (h.notes or "") == "Created"
            events.append(
                {
                    "id": str(h.id),
                    "kind": "created" if is_created else "status",
                    "orderId": str(h.orderId),
                    "orderNumber": num,
                    "status": h.status,
                    "previousStatus": rows[idx - 1][0].status if idx > 0 else None,
                    "createdAt": h.createdAt.isoformat(),
                }
            )
    events.sort(key=lambda e: e["createdAt"], reverse=True)
    return success(events[:limit], message="Activity retrieved successfully.")


@router.get("/meta/revenue-overview")
async def revenue_overview(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    today = datetime.now(timezone.utc).date()

    def day_start(d: date) -> datetime:
        return datetime.combine(d, time.min, tzinfo=timezone.utc)

    start_today = day_start(today)
    start_yesterday = start_today - timedelta(days=1)
    start_week = day_start(today - timedelta(days=today.weekday()))
    start_prev_week = start_week - timedelta(weeks=1)
    start_month = day_start(today.replace(day=1))
    prev_month_last = start_month - timedelta(days=1)
    start_prev_month = day_start(prev_month_last.replace(day=1))
    end_now = start_today + timedelta(days=1)

    paid = _paid_subq(session)
    base = [Order.isActive == True, Order.deletedAt.is_(None)]
    if company_id is not None:
        base.append(Order.companyId == company_id)
    if area:
        base.append(Order.area == area)

    total_paid_expr = func.greatest(func.coalesce(paid.c.paid, 0), func.coalesce(Order.paymentAmount, 0))

    # "Collected" money = the sum of PAYMENT TRANSACTIONS, bucketed by when
    # each payment was recorded. Scoped to the caller's company/area via the
    # Order join, but deliberately NOT filtered by `Order.deletedAt` /
    # `isActive`: a payment is a persistent financial event, so soft-deleting
    # its GR later must never remove it from "Collected Today" /
    # "Total Collected" / the weekly & monthly collection figures. "Collected
    # Today" also resets to 0 by calendar date on its own — there are simply
    # no payment rows dated the new day yet.
    pay_scope = []
    if company_id is not None:
        pay_scope.append(Order.companyId == company_id)
    if area:
        pay_scope.append(Order.area == area)

    def collected(lo, hi):
        return func.coalesce(
            func.sum(Payment.amount).filter(
                and_(Payment.createdAt >= lo, Payment.createdAt < hi, *pay_scope)
            ),
            0,
        )

    total_collected_col = func.sum(Payment.amount)
    if pay_scope:
        total_collected_col = total_collected_col.filter(and_(*pay_scope))

    # "Direct UPI Received" — money the customer paid straight to the
    # Admin/owner (never in a staff member's hand) via UPI specifically.
    # Only receivedBy == 'ADMIN' AND paymentMethod == 'upi' contribute; a
    # normal staff UPI collection, or an Admin payment via cash/bank/cheque,
    # must NOT. Legacy rows (receivedBy IS NULL) predate this feature and
    # were always ordinary staff collections, so they never count here.
    direct_upi_col = func.sum(Payment.amount).filter(
        and_(
            Payment.receivedBy == "ADMIN",
            func.lower(Payment.paymentMethod) == "upi",
            *pay_scope,
        )
    )

    row = (
        await session.execute(
            select(
                collected(start_today, end_now).label("today"),
                collected(start_yesterday, start_today).label("yesterday"),
                collected(start_week, end_now).label("week"),
                collected(start_prev_week, start_week).label("prev_week"),
                collected(start_month, end_now).label("month"),
                collected(start_prev_month, start_month).label("prev_month"),
                func.coalesce(total_collected_col, 0).label("total_collected"),
                collected(start_month, end_now).label("collected_this_month"),
                collected(start_prev_month, start_month).label("collected_prev_month"),
                func.coalesce(direct_upi_col, 0).label("direct_upi_received"),
            )
            .select_from(Payment)
            .join(Order, Order.id == Payment.orderId)
        )
    ).one()

    # Outstanding ("Amount to Collect") and the GR counts are about LIVE GRs
    # — there is nothing to collect on a deleted GR — so they keep the
    # active / not-soft-deleted filter.
    counts = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        func.greatest(func.coalesce(Order.toPay, 0) - total_paid_expr, 0)
                    ).filter(and_(*base)),
                    0,
                ).label("outstanding"),
                func.count(Order.id).filter(and_(*base, total_paid_expr > 0)).label("collected_count"),
                func.count(Order.id)
                .filter(and_(*base, func.coalesce(Order.toPay, 0) - total_paid_expr > 0.005))
                .label("outstanding_count"),
            )
            .select_from(Order)
            .outerjoin(paid, paid.c.orderId == Order.id)
        )
    ).one()
    ptrend = (row.collected_this_month, row.collected_prev_month)

    return success(
        {
            "today": float(row.today),
            "yesterday": float(row.yesterday),
            "week": float(row.week),
            "prevWeek": float(row.prev_week),
            "month": float(row.month),
            "prevMonth": float(row.prev_month),
            "totalCollected": float(row.total_collected),
            "directUpiReceived": float(row.direct_upi_received),
            "outstandingAmount": float(counts.outstanding),
            "collectedGRCount": int(counts.collected_count),
            "outstandingGRCount": int(counts.outstanding_count),
            "collectedThisMonth": float(ptrend[0]),
            "collectedPrevMonth": float(ptrend[1]),
        },
        message="Revenue overview retrieved successfully.",
    )


def _payment_status_expr(paid_col):
    to_pay = func.coalesce(Order.toPay, 0)
    p = func.coalesce(paid_col, 0)
    return case(
        (to_pay <= 0, "paid"),
        (p <= 0, "unpaid"),
        (and_(p >= to_pay, p == to_pay), "paid"),
        (p >= to_pay, "overpaid"),
        else_="partial",
    )


@router.get("/meta/today-collection")
async def today_collection(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    conds = [Payment.createdAt >= start, Payment.createdAt < start + timedelta(days=1)]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    total = (
        await session.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .join(Order, Order.id == Payment.orderId)
            .where(*conds)
        )
    ).scalar() or 0
    return success(float(total), message="Today's collection retrieved successfully.")


@router.get("/receiving")
async def list_receiving(
    admin: GRAccessUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Optional[str] = None,
    paymentStatus: Optional[str] = None,
    customerId: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    paid = _paid_subq(session)
    conds = [Order.deletedAt.is_(None)]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    if search:
        like = f"%{search}%"
        conds.append(
            Order.orderNumber.ilike(like)
            | Order.consigneeName.ilike(like)
            | Order.consignorName.ilike(like)
        )
    if customerId:
        conds.append(Order.consigneeName == customerId)
    eff = func.coalesce(Order.grDate, Order.createdAt)
    if dateFrom:
        conds.append(eff >= datetime.fromisoformat(dateFrom.replace("Z", "+00:00")))
    if dateTo:
        conds.append(eff <= datetime.fromisoformat(dateTo.replace("Z", "+00:00")))

    paid_col = func.coalesce(paid.c.paid, 0)
    status_expr = _payment_status_expr(paid.c.paid).label("payment_status")
    q = (
        select(Order, paid_col.label("total_paid"), status_expr)
        .select_from(Order)
        .outerjoin(paid, paid.c.orderId == Order.id)
        .where(*conds)
    )
    if paymentStatus and paymentStatus != "all":
        q = q.where(status_expr == paymentStatus)

    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    rows = (
        await session.execute(
            q.order_by(Order.createdAt.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()
    items = []
    for o, total_paid, pstatus in rows:
        to_pay = float(o.toPay or 0)
        tp = float(total_paid or 0)
        items.append(
            {
                "id": str(o.id),
                "orderNumber": o.orderNumber,
                "consigneeName": o.consigneeName,
                "consignorName": o.consignorName,
                "pickupAddress": o.pickupAddress,
                "deliveryAddress": o.deliveryAddress,
                "grStatus": o.status.value if hasattr(o.status, "value") else o.status,
                "toPay": to_pay,
                "totalPaid": tp,
                "balance": to_pay - tp,
                "paymentStatus": pstatus,
                "paymentCount": 0,
                "createdAt": o.createdAt.isoformat(),
            }
        )
    return success({"items": items, "total": total}, message="Receiving list retrieved successfully.")


@router.get("/receiving/overview")
async def receiving_overview(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    paid = _paid_subq(session)
    conds = [Order.deletedAt.is_(None)]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    paid_col = func.coalesce(paid.c.paid, 0)
    status_expr = _payment_status_expr(paid.c.paid)
    rows = (
        await session.execute(
            select(
                func.coalesce(func.sum(func.coalesce(Order.toPay, 0)), 0),
                func.coalesce(func.sum(paid_col), 0),
                func.count(Order.id),
                func.count(Order.id).filter(status_expr == "unpaid"),
                func.count(Order.id).filter(status_expr == "partial"),
                func.count(Order.id).filter(status_expr == "paid"),
                func.count(Order.id).filter(status_expr == "overpaid"),
            )
            .select_from(Order)
            .outerjoin(paid, paid.c.orderId == Order.id)
            .where(*conds)
        )
    ).one()
    total_to_pay, total_paid, gr_count, unpaid, partial, paid_c, overpaid = rows
    txn = (
        await session.execute(
            select(func.count(Payment.id))
            .join(Order, Order.id == Payment.orderId)
            .where(*conds)
        )
    ).scalar() or 0

    # Receiver split (Receiving Details "Admin Direct" / "Staff Received"
    # tabs) — the SAME two conditions used everywhere else this distinction
    # matters (`app/services/staff_work_service.py`'s `NOT_ADMIN_RECEIVED`,
    # `meta/revenue-overview`'s `direct_upi_col`): a payment counts as
    # Admin-direct only when `receivedBy == 'ADMIN'`; every other payment
    # (including legacy rows with `receivedBy IS NULL`, which predate this
    # column and were always ordinary staff collections) counts as
    # Staff-received. Scoped like `revenue-overview`'s `pay_scope` — company/
    # area only, NOT `Order.deletedAt` — a payment is a persistent financial
    # event that must keep counting even if its GR is later soft-deleted.
    pay_scope = []
    if company_id is not None:
        pay_scope.append(Order.companyId == company_id)
    if area:
        pay_scope.append(Order.area == area)
    admin_received = Payment.receivedBy == "ADMIN"
    staff_received = or_(Payment.receivedBy.is_(None), Payment.receivedBy != "ADMIN")
    direct_row = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(Payment.amount).filter(
                        and_(admin_received, func.lower(Payment.paymentMethod) == "upi", *pay_scope)
                    ),
                    0,
                ).label("direct_upi"),
                func.coalesce(
                    func.sum(Payment.amount).filter(and_(admin_received, *pay_scope)), 0
                ).label("admin_direct_total"),
                func.count(Payment.id).filter(and_(admin_received, *pay_scope)).label("admin_direct_count"),
                func.coalesce(
                    func.sum(Payment.amount).filter(and_(staff_received, *pay_scope)), 0
                ).label("staff_received_total"),
                func.count(Payment.id).filter(and_(staff_received, *pay_scope)).label("staff_received_count"),
            )
            .select_from(Payment)
            .join(Order, Order.id == Payment.orderId)
        )
    ).one()

    return success(
        {
            "totalToPay": float(total_to_pay),
            "totalPaid": float(total_paid),
            "outstanding": float(total_to_pay) - float(total_paid),
            "totalTransactions": int(txn),
            "unpaidCount": int(unpaid),
            "partialCount": int(partial),
            "paidCount": int(paid_c),
            "overpaidCount": int(overpaid),
            "grCount": int(gr_count),
            # Same expression `meta/revenue-overview` uses for the Admin
            # Dashboard's "Direct UPI Received" card — identical numbers,
            # guaranteed (test 16 in the spec: dashboard figure == SUM(Admin
            # Direct payments WHERE paymentMethod = upi), never the broader total).
            "directUpiReceived": float(direct_row.direct_upi),
            "directAdminTotal": float(direct_row.admin_direct_total),
            "directAdminCount": int(direct_row.admin_direct_count),
            "staffReceivedTotal": float(direct_row.staff_received_total),
            "staffReceivedCount": int(direct_row.staff_received_count),
        },
        message="Receiving overview retrieved successfully.",
    )


@router.get("/receiving/payment-history")
async def receiving_payment_history(
    admin: GRAccessUser,
    receivedBy: Annotated[str, Query(pattern="^(ADMIN|STAFF)$")] = "ADMIN",
    paymentMethod: Optional[str] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Payment history split by WHO RECEIVED the money — backs the Receiving
    Details "Admin Direct" / "Staff Received" tabs.

    ``receivedBy`` is the single source of truth (never who entered the
    payment, never the currently-logged-in user, never the payment mode): a
    staff member can record a payment with `enteredBy=<themselves>` and
    `receivedBy='ADMIN'` — that row belongs in Admin Direct and nowhere else.
    ``receivedBy=STAFF`` matches legacy rows (`receivedBy IS NULL`) too, same
    as `receiving_overview`/`staff_work_service.NOT_ADMIN_RECEIVED` above, so
    historical payments predating this column classify identically everywhere.

    ONE query: Payment (join) Order (outer join) User for the name of who
    entered it — no per-row follow-up request, DB-level pagination via a
    window count. Not filtered by `Order.deletedAt` — a payment is a
    permanent financial record and must remain visible even if its GR is
    later soft-deleted."""
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    receiver_cond = (
        Payment.receivedBy == "ADMIN"
        if receivedBy == "ADMIN"
        else or_(Payment.receivedBy.is_(None), Payment.receivedBy != "ADMIN")
    )
    conds = [receiver_cond]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    if paymentMethod:
        conds.append(func.lower(Payment.paymentMethod) == paymentMethod.strip().lower())

    base = (
        select(
            Payment.id,
            Payment.orderId,
            Payment.amount,
            Payment.paymentMethod,
            Payment.notes,
            Payment.recordedBy,
            Payment.receivedBy,
            Payment.createdAt,
            Order.orderNumber,
            Order.consigneeName,
            Order.consignorName,
            User.firstName,
            User.lastName,
            func.count().over().label("_total"),
        )
        .select_from(Payment)
        .join(Order, Order.id == Payment.orderId)
        .outerjoin(User, cast(User.id, String) == Payment.recordedBy)
        .where(*conds)
        .order_by(Payment.createdAt.desc(), Payment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(base)).all()
    total = int(rows[0]._total) if rows else 0
    items = []
    for r in rows:
        entered_by = f"{r.firstName or ''} {r.lastName or ''}".strip() or None
        items.append(
            {
                "id": str(r.id),
                "orderId": str(r.orderId),
                "orderNumber": r.orderNumber,
                "consigneeName": r.consigneeName,
                "consignorName": r.consignorName,
                "amount": float(r.amount),
                "paymentMethod": r.paymentMethod,
                "notes": r.notes,
                "receivedBy": r.receivedBy or "STAFF",
                "enteredByName": entered_by,
                "createdAt": r.createdAt.isoformat(),
            }
        )
    return success(
        {"items": items, "total": total, "page": page, "pageSize": page_size},
        message="Payment history retrieved successfully.",
    )


@router.get("/shops/overview")
async def shops_overview(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    paid = _paid_subq(session)
    conds = [Order.deletedAt.is_(None), Order.area.isnot(None), Order.area != ""]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    tp = func.greatest(func.coalesce(paid.c.paid, 0), func.coalesce(Order.paymentAmount, 0))
    rows = (
        await session.execute(
            select(
                Order.area,
                func.count(Order.id),
                func.count(Order.id).filter(Order.status == "pending"),
                func.count(Order.id).filter(Order.status == "cleared"),
                func.count(Order.id).filter(Order.status == "uncleared"),
                func.count(Order.id).filter(Order.status == "delivered"),
                func.coalesce(func.sum(func.coalesce(Order.toPay, 0)), 0),
                func.coalesce(func.sum(tp), 0),
            )
            .select_from(Order)
            .outerjoin(paid, paid.c.orderId == Order.id)
            .where(*conds)
            .group_by(Order.area)
        )
    ).all()
    out = []
    for a, total, pending, cleared, uncleared, delivered, ttp, tc in rows:
        ttp_f, tc_f = float(ttp), float(tc)
        out.append(
            {
                "area": a,
                "total": int(total),
                "pending": int(pending),
                "cleared": int(cleared),
                "uncleared": int(uncleared),
                "delivered": int(delivered),
                "totalToPay": ttp_f,
                "totalCollected": tc_f,
                "outstanding": max(0.0, ttp_f - tc_f),
            }
        )
    return success(out, message="Shops overview retrieved successfully.")


@router.get("/shops/counts")
async def shops_with_counts(
    admin: GRAccessUser,
    search: Optional[str] = None,
    area: Optional[str] = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Every registered Shop (consignee master data) in scope, each with its
    live count of active (non-deleted) GRs. Queries FROM the Shop master table
    with a LEFT OUTER JOIN to Order — not the other way around — so a Shop
    with zero active GRs (including one whose only/last GR was just deleted)
    still appears here instead of silently disappearing.

    Rows are collapsed by **normalized, case-insensitive name**: two Shop
    records that represent the same consignee (e.g. one per area, or a
    spacing/casing variant) come back as ONE card with the GR counts summed,
    so the client never sees — or key-collides on — duplicate shop names."""
    company_id = await effective_company_id(admin)
    scoped_area = _effective_area(admin) or area
    conds = []
    if company_id is not None:
        conds.append(Shop.companyId == company_id)
    if scoped_area:
        conds.append(Shop.area == scoped_area)
    if search and search.strip():
        conds.append(Shop.name.ilike(f"%{search.strip()}%"))
    active_gr_count = func.count(Order.id).filter(Order.deletedAt.is_(None))
    name_key = func.lower(func.trim(Shop.name))
    rows = (
        await session.execute(
            select(func.min(Shop.name), active_gr_count)
            .select_from(Shop)
            .outerjoin(Order, Order.shopId == Shop.id)
            .where(*conds)
            .group_by(name_key)
            .order_by(func.min(Shop.name).asc())
        )
    ).all()
    return success(
        [{"name": n, "grCount": int(c)} for n, c in rows],
        message="Shops retrieved successfully.",
    )


class ImportRow(BaseModel):
    rowNumber: int
    grNumber: str
    grDateIso: Optional[str] = None
    consignorName: Optional[str] = None
    consigneeName: Optional[str] = None
    fromLocation: Optional[str] = None
    toLocation: Optional[str] = None
    particulars: Optional[str] = None
    packageCount: Optional[int] = None
    weight: Optional[float] = None
    paymentMode: Optional[str] = None
    paymentAmount: Optional[float] = None
    toPay: Optional[float] = None
    chalaanNo: Optional[str] = None
    chalaanDate: Optional[str] = None
    transportGrn: Optional[str] = None
    grSourceLabel: Optional[str] = None
    resolvedArea: Optional[str] = None


class ImportRequest(BaseModel):
    fileName: str
    importedByName: Optional[str] = None
    area: Optional[str] = None
    # Staff member the WHOLE batch is assigned to (the new mandatory
    # "Select Staff" step). A User id — resolved to an `employees.id` via
    # `_resolve_employee_id`, same as `POST /{order_id}/assign-staff`.
    # Optional so older clients / other callers keep working unchanged.
    staffId: Optional[UUID] = None
    rows: list[ImportRow] = Field(default_factory=list)


@router.post("/import", status_code=201)
async def bulk_import(
    payload: ImportRequest,
    admin: GRAccessUser,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Bulk-creates already-validated Excel GR rows. Skips GR numbers that
    already exist and are still live; a soft-deleted GR with the same number
    is left untouched (it is the permanent record of past staff work — see
    ``_write_batch``) and the new live row is created alongside it. Records
    one ``import_history`` row for the batch. Ported from the mobile
    ``importRepository.bulkImportGRs``."""
    # `None` for platform ADMIN/SUPER_ADMIN (they may act across companies);
    # a concrete id for a company-scoped admin/owner.
    company_id = await effective_company_id(admin)
    staff_area = _effective_area(admin)
    is_staff = staff_area is not None

    # Resolve + validate the batch-level staff assignment (the mandatory
    # "Select Staff" step). The backend never trusts the frontend's choice:
    # the target user must EXIST, be a staff-tier role, be active, and — when a
    # location was also picked — belong to that location. `assignedStaffId` on
    # every row this batch creates comes from here (same resolution
    # `assign-staff` uses). The frontend sends the staff member's **User id**
    # (`AdminUserOut.id`, exactly what `GET /admin/users?role=staff` returns).
    staff_employee_id = None
    target_staff = None
    if payload.staffId is not None:
        from app.models.enums import RegistrationStatus, UserRole
        from app.services.user_service import user_service

        target_staff = await user_service.get_by_id(str(payload.staffId))
        logger.info(
            "GR import: staffId=%s -> resolved user=%s company=%s role=%s",
            payload.staffId,
            getattr(target_staff, "id", None),
            getattr(target_staff, "companyId", None),
            getattr(target_staff, "role", None),
        )
        if target_staff is None:
            raise ValidationBusinessError("Selected staff member was not found.")
        if target_staff.role not in (UserRole.EMPLOYEE, UserRole.STAFF):
            raise ValidationBusinessError("Selected user is not a staff member.")
        if not target_staff.isActive or target_staff.status != RegistrationStatus.ACTIVE:
            raise ValidationBusinessError(
                f"{target_staff.firstName} {target_staff.lastName} is not an active staff member."
            )
        if company_id is None:
            # Platform ADMIN/SUPER_ADMIN: the batch belongs to the selected
            # staff member's OWN company (the company whose GRs this staff
            # works). This is what makes the "Select Staff" list — which for a
            # platform admin spans every company — actually usable.
            company_id = target_staff.companyId
        elif target_staff.companyId != company_id:
            # A company-scoped admin/owner picked someone outside their tenant.
            raise ValidationBusinessError(
                f"{target_staff.firstName} {target_staff.lastName} belongs to a "
                "different company and cannot be assigned GRs in this import."
            )

    if company_id is None:  # platform admin, no staff picked, no own company
        company_id = getattr(admin, "companyId", None)
    if company_id is None:
        raise ValidationBusinessError(
            "Your account is not linked to a company. Ask an administrator to "
            "assign one before importing GRs."
        )

    if target_staff is not None:
        if payload.area and target_staff.area and target_staff.area != payload.area:
            raise ValidationBusinessError(
                f"{target_staff.firstName} {target_staff.lastName} is not assigned to {payload.area}."
            )
        from app.api.v1.gr import _resolve_employee_id

        staff_employee_id = await _resolve_employee_id(target_staff.id, company_id)

    from app.repositories.shop_repository import normalize_shop_name

    _t0 = _time.monotonic()
    _tick = _t0

    def _lap(label: str) -> None:
        nonlocal _tick
        now = _time.monotonic()
        logger.info("GR import: %s %.0fms", label, (now - _tick) * 1000)
        _tick = now

    # ── One query for every GR number in the file that already exists ──────
    gr_numbers_in_file = [(r.grNumber or "").strip() for r in payload.rows]
    existing = (
        await session.execute(
            select(Order.orderNumber, Order.deletedAt, Order.id).where(
                Order.orderNumber.in_(gr_numbers_in_file)
            )
        )
    ).all()
    active = {n for n, deleted, _ in existing if deleted is None}
    _lap("existing-gr-check")

    # ── One query to resolve every distinct consignee Shop, bulk-insert the
    #    missing ones. Keyed on the same normalized, case-insensitive form
    #    ShopRepository.get_or_create matches on, so no per-row round trip. ──
    def _row_area(r) -> str | None:
        return staff_area if is_staff else (r.resolvedArea or payload.area)

    wanted_shops: dict[tuple[str | None, str], None] = {}
    for r in payload.rows:
        norm = normalize_shop_name(r.consigneeName)
        if norm:
            wanted_shops[(_row_area(r), norm)] = None

    shop_map: dict[tuple[str | None, str], Shop] = {}
    if wanted_shops:
        wanted_lower = list({n.lower() for (_a, n) in wanted_shops})
        rows = (
            await session.execute(
                select(Shop).where(
                    Shop.companyId == company_id,
                    func.lower(func.trim(Shop.name)).in_(wanted_lower),
                )
            )
        ).scalars().all()
        for sh in rows:
            key = (sh.area, normalize_shop_name(sh.name).lower())
            # First (oldest) row wins, matching get_or_create's ordering.
            shop_map.setdefault(key, sh)
        new_shops = []
        for (area_val, norm) in wanted_shops:
            if (area_val, norm.lower()) not in shop_map:
                sh = Shop(companyId=company_id, area=area_val, name=norm)
                new_shops.append(sh)
                shop_map[(area_val, norm.lower())] = sh
        if new_shops:
            session.add_all(new_shops)
            await session.flush()  # one round trip for every new shop
    _lap("shop-bulk-resolve")

    def _shop_for(r) -> Shop | None:
        norm = normalize_shop_name(r.consigneeName)
        return shop_map.get((_row_area(r), norm.lower())) if norm else None

    imported = failed = 0
    duplicate_numbers: list[str] = []
    failures: list[dict] = []

    # ── Build every Order in memory (no DB). Row-level problems (bad date,
    #    in-file duplicate, already-active GR number) are decided here. ──────
    seen_in_file: set[str] = set()
    pending_orders: list[Order] = []
    pending_rows: list = []
    for r in payload.rows:
        gr_number = (r.grNumber or "").strip()
        if gr_number in active or gr_number in seen_in_file:
            # Already in the DB (active) OR a second occurrence in this same
            # file — both count as "duplicate", never a failure.
            duplicate_numbers.append(r.grNumber)
            continue
        seen_in_file.add(gr_number)
        try:
            row_area = _row_area(r)
            shop = _shop_for(r)
            order = Order(
                orderNumber=gr_number,
                companyId=company_id,
                shopId=shop.id if shop else None,
                assignedStaffId=staff_employee_id,
                consignorName=r.consignorName,
                consigneeName=r.consigneeName,
                particulars=r.particulars,
                packageCount=r.packageCount or 1,
                pickupAddress=r.fromLocation or "—",
                deliveryAddress=r.toLocation or "—",
                pickupTime=datetime.now(timezone.utc),
                weight=r.weight,
                status="pending",  # ALWAYS pending — Excel status is ignored
                source="excel",
                grDate=datetime.fromisoformat(r.grDateIso.replace("Z", "+00:00")) if r.grDateIso else None,
                fromLocation=r.fromLocation,
                toLocation=r.toLocation,
                paymentMode=r.paymentMode,
                toPay=r.toPay,
                paymentAmount=r.paymentAmount,
                chalaanNo=r.chalaanNo,
                chalaanDate=r.chalaanDate,
                transportGrn=r.transportGrn,
                grSourceLabel=r.grSourceLabel,
                area=row_area,
            )
            pending_orders.append(order)
            pending_rows.append(r)
        except Exception as exc:  # noqa: BLE001 — one bad row must not abort the batch
            failed += 1
            logger.warning("GR import row %s (GR %s) build failed: %s", r.rowNumber, gr_number, exc)
            failures.append({"rowNumber": r.rowNumber, "grNumber": r.grNumber, "message": str(exc)})
    _lap("row-build")

    # ── One transaction for the writes: bulk-insert the new Orders, then
    #    bulk-insert one 'pending' history row each. A soft-deleted GR that
    #    shares a number with one of these rows is NEVER touched — it (and its
    #    payments / status history) is the permanent record of the staff work
    #    done against it; the partial unique index on `orderNumber`
    #    (`deletedAt IS NULL`) lets the new live row coexist with it. ────────
    async def _write_batch(orders: list[Order]) -> int:
        if not orders:
            return 0
        async with session.begin_nested():
            session.add_all(orders)
            await session.flush()  # ONE batched INSERT (insertmanyvalues) — ids populated
            session.add_all(
                [
                    OrderStatusHistory(orderId=o.id, status="pending", notes="Imported from Excel")
                    for o in orders
                ]
            )
            await session.flush()  # ONE batched INSERT for the history rows
        return len(orders)

    try:
        imported += await _write_batch(pending_orders)
    except IntegrityError:
        # A concurrent import raced one or more of these GR numbers in between
        # our upfront check and now. Re-check, drop the ones that are now
        # taken (they become 'duplicate'), retry the rest once.
        logger.warning("GR import: bulk insert hit a unique-constraint race — re-checking and retrying")
        now_taken = {
            n for (n,) in (
                await session.execute(
                    select(Order.orderNumber).where(
                        Order.orderNumber.in_([o.orderNumber for o in pending_orders]),
                        Order.deletedAt.is_(None),
                    )
                )
            ).all()
        }
        retry_orders, retry_rows = [], []
        for o, r in zip(pending_orders, pending_rows):
            if o.orderNumber in now_taken:
                duplicate_numbers.append(o.orderNumber)
                if o in session:  # drop it so the next flush doesn't retry it
                    session.expunge(o)
            else:
                retry_orders.append(o)
                retry_rows.append(r)
        try:
            imported += await _write_batch(retry_orders)
        except IntegrityError as exc:
            failed += len(retry_orders)
            for r in retry_rows:
                failures.append({"rowNumber": r.rowNumber, "grNumber": r.grNumber, "message": "GR number already exists."})
            logger.warning("GR import: retry still failed: %s", exc)
    _lap("bulk-write")

    hist = ImportHistory(
        fileName=payload.fileName,
        importedAt=datetime.now(timezone.utc),
        importedByName=payload.importedByName,
        importedBy=admin.id,
        companyId=company_id,
        area=staff_area if is_staff else payload.area,
        totalRows=len(payload.rows),
        importedRows=imported,
        duplicateRows=len(duplicate_numbers),
        failedRows=failed,
    )
    session.add(hist)
    await session.flush()

    return success(
        {
            "totalRows": len(payload.rows),
            "importedRows": imported,
            "duplicateRows": len(duplicate_numbers),
            "failedRows": failed,
            "duplicateGRNumbers": duplicate_numbers,
            "failures": failures,
        },
        message="Import complete.",
    )


@router.get("/import-history")
async def import_history(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    area = _effective_area(admin)
    company_id = await effective_company_id(admin)
    q = select(ImportHistory)
    if company_id is not None:
        q = q.where(ImportHistory.companyId == company_id)
    if area:
        q = q.where(ImportHistory.area == area)
    rows = (await session.execute(q.order_by(ImportHistory.importedAt.desc()))).scalars().all()
    return success(
        [
            {
                "id": str(r.id),
                "fileName": r.fileName,
                "importedAt": r.importedAt.isoformat(),
                "importedByName": r.importedByName,
                "area": r.area,
                "totalRows": r.totalRows,
                "importedRows": r.importedRows,
                "duplicateRows": r.duplicateRows,
                "failedRows": r.failedRows,
            }
            for r in rows
        ],
        message="Import history retrieved successfully.",
    )

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

from fastapi import APIRouter, BackgroundTasks, Query
from fastapi import Depends
from pydantic import BaseModel, Field
import time as _time

from sqlalchemy import String, and_, case, cast, func, or_, select
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
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.schemas.order import GRCreateRequest
from app.services import staff_work_service
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


async def _compute_recent_activity(admin, session: AsyncSession, limit: int) -> list[dict]:
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
    return events[:limit]


@router.get("/meta/activity")
async def recent_activity(
    admin: GRAccessUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    events = await _compute_recent_activity(admin, session, limit)
    return success(events, message="Activity retrieved successfully.")


async def _compute_revenue_overview(admin, session: AsyncSession) -> dict:
    """Core revenue-overview computation, shared by the standalone
    ``GET /meta/revenue-overview`` route and the consolidated
    ``GET /meta/dashboard-summary`` route so both stay byte-for-byte
    consistent and neither duplicates the query-building logic."""
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

    return {
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
    }


@router.get("/meta/revenue-overview")
async def revenue_overview(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    data = await _compute_revenue_overview(admin, session)
    return success(data, message="Revenue overview retrieved successfully.")


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


async def _compute_today_collection(admin, session: AsyncSession) -> float:
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
    return float(total)


@router.get("/meta/today-collection")
async def today_collection(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    total = await _compute_today_collection(admin, session)
    return success(total, message="Today's collection retrieved successfully.")


@router.get("/meta/dashboard-summary")
async def admin_dashboard_summary(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    """Everything the Admin Dashboard screen needs in ONE authenticated
    request instead of five.

    Each of status-counts / revenue-overview / today-collection / activity /
    pending-approvals stays available as its own standalone endpoint (other
    screens — GR/Shipments, Receiving Details, Payment History — still call
    those directly and are untouched). This route exists purely to cut a
    cost that was being paid FIVE TIMES per dashboard load: the
    ``GRAccessUser`` auth dependency re-queries the ``users`` table by id on
    every single authenticated request, and each request separately
    acquires its own pooled DB connection. Firing 5 concurrent requests from
    the app meant 5 concurrent user-lookups + 5 concurrent connection
    acquisitions all contending at once — here it happens exactly once,
    with every query reusing the one connection already open for this
    request.

    Deliberately does NOT reuse the heavier admin-stats endpoint elsewhere
    in the app — that route runs several extra queries (drivers/vehicles/
    companies/users/registration-requests/revenue) to serve fields an
    admin-management screen needs, but the Dashboard screen itself only
    ever reads `pendingApprovals` and a hardcoded `systemHealth` string
    from it. Pulling those extra queries in here would be exactly the
    "blindly fetch more than the screen needs" anti-pattern — so this
    computes only the one cheap count it actually uses.
    """
    reg_request_repo = RegistrationRequestRepository(session=session)

    status = await status_counts(
        session, company_id=await effective_company_id(admin), area=_effective_area(admin)
    )
    revenue = await _compute_revenue_overview(admin, session)
    today = await _compute_today_collection(admin, session)
    activity = await _compute_recent_activity(admin, session, limit=8)
    _latest, pending_approvals = await reg_request_repo.find_pending_requests(page=1, page_size=1)

    return success(
        {
            "statusCounts": status,
            "revenue": revenue,
            "todayCollection": today,
            "activity": activity,
            "pendingApprovals": pending_approvals,
            "systemHealth": "healthy",
        },
        message="Dashboard summary retrieved successfully.",
    )


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


async def _compute_outstanding_total(admin, session: AsyncSession) -> float:
    """Just the one number the Staff Dashboard's "Amount to Collect" card
    reads out of the full `/receiving/overview` response. That route runs
    3 queries (outstanding + transaction count + Admin/Staff receiver
    split) to serve the Receiving Details screen, which genuinely needs all
    of it; the Staff Dashboard never did, so the summary endpoint below
    computes only this one aggregate instead of paying for the other two.
    Same scope as `/receiving/overview` (company/area — deliberately NOT
    staff-assignment-scoped, matching that endpoint exactly)."""
    company_id = await effective_company_id(admin)
    area = _effective_area(admin)
    paid = _paid_subq(session)
    conds = [Order.deletedAt.is_(None)]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    row = (
        await session.execute(
            select(
                func.coalesce(func.sum(func.coalesce(Order.toPay, 0)), 0),
                func.coalesce(func.sum(func.coalesce(paid.c.paid, 0)), 0),
            )
            .select_from(Order)
            .outerjoin(paid, paid.c.orderId == Order.id)
            .where(*conds)
        )
    ).one()
    total_to_pay, total_paid = row
    return float(total_to_pay) - float(total_paid)


@router.get("/meta/staff-dashboard-summary")
async def staff_dashboard_summary(
    admin: GRAccessUser, session: AsyncSession = Depends(get_db_session)
) -> dict:
    """Everything the Staff Dashboard screen needs in ONE authenticated
    request instead of three (status-counts, receiving/overview,
    staff/daily-collection) — same rationale as
    `GET /meta/dashboard-summary` above: one auth lookup and one pooled
    connection instead of three concurrent ones. The three original
    endpoints are untouched and still used elsewhere (My Slips filters,
    Receiving Details, Admin's staff-monitoring views)."""
    area = _effective_area(admin)
    staff_scope = await resolve_gr_staff_scope(admin, area)
    scoped_area = None if staff_scope is not None else area
    status = await status_counts(
        session,
        company_id=await effective_company_id(admin),
        area=scoped_area,
        staff_scope=staff_scope,
    )
    outstanding = await _compute_outstanding_total(admin, session)
    daily = await staff_work_service.daily_collection(session, admin.id, datetime.now(timezone.utc).date())

    return success(
        {
            "statusCounts": status,
            "outstanding": outstanding,
            "todayCollection": float(daily.get("totalCollection", 0) or 0),
            "totalCollection": float(daily.get("lifetimeCollection", 0) or 0),
        },
        message="Staff dashboard summary retrieved successfully.",
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
    background_tasks: BackgroundTasks,
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

    import asyncio as _asyncio
    import uuid as _uuid

    from sqlalchemy.dialects.postgresql import insert as _pg_insert

    from app.database.db import session_scope
    from app.models.employee import Employee
    from app.repositories.shop_repository import normalize_shop_name

    _t0 = _time.monotonic()
    _tick = _t0

    def _lap(label: str) -> None:
        # DEBUG level: the per-stage timing is developer instrumentation, not
        # something every production import should log.
        nonlocal _tick
        now = _time.monotonic()
        logger.debug("GR import: %s %.0fms", label, (now - _tick) * 1000)
        _tick = now

    def _row_area(r) -> str | None:
        return staff_area if is_staff else (r.resolvedArea or payload.area)

    # ── Pure-Python prep: every key we'll need to look up, gathered up front ─
    gr_numbers_in_file = [(r.grNumber or "").strip() for r in payload.rows]
    wanted_shops: dict[tuple[str | None, str], None] = {}
    for r in payload.rows:
        norm = normalize_shop_name(r.consigneeName)
        if norm:
            wanted_shops[(_row_area(r), norm)] = None
    wanted_shop_lower = list({n.lower() for (_a, n) in wanted_shops})

    # ── ONE parallel round trip for every independent read: the existing-GR
    #    check, the staff member's `employees` row, and the consignee Shops.
    #    Each on its own connection (concurrent use of one AsyncSession is
    #    unsafe), so the wall time is a single DB round trip, not three. ─────
    async def _fetch_existing() -> set[str]:
        async with session_scope() as s:
            rows = (
                await s.execute(
                    select(Order.orderNumber).where(
                        Order.orderNumber.in_(gr_numbers_in_file),
                        Order.deletedAt.is_(None),
                    )
                )
            ).scalars().all()
        return set(rows)

    async def _fetch_employee_id():
        if target_staff is None:
            return "n/a"
        async with session_scope() as s:
            return await s.scalar(select(Employee.id).where(Employee.userId == str(target_staff.id)))

    async def _fetch_shops() -> list[Shop]:
        if not wanted_shop_lower:
            return []
        async with session_scope() as s:
            return (
                await s.execute(
                    select(Shop)
                    .where(
                        Shop.companyId == company_id,
                        func.lower(func.trim(Shop.name)).in_(wanted_shop_lower),
                    )
                    .order_by(Shop.createdAt.asc())  # oldest wins, like get_or_create
                )
            ).scalars().all()

    active, resolved_employee_id, existing_shop_rows = await _asyncio.gather(
        _fetch_existing(), _fetch_employee_id(), _fetch_shops()
    )
    _lap("parallel prep (existing GRs + staff employee + shops)")

    # The staff member had no `employees` row yet — one is created in the same
    # write transaction below (mirrors `_resolve_employee_id`). Common in prod
    # only for a staff member's very first assignment.
    new_employee: Employee | None = None
    if target_staff is not None and resolved_employee_id is None:
        new_employee = Employee(
            id=_uuid.uuid4(), userId=str(target_staff.id), companyId=company_id, role="staff"
        )
        staff_employee_id = new_employee.id
    elif target_staff is not None:
        staff_employee_id = resolved_employee_id

    # ── Resolve/prepare Shop rows (no more DB reads). New shops get a
    #    pre-generated id so an Order can reference `shopId` before the shop
    #    row is even flushed. ───────────────────────────────────────────────
    shop_id_map: dict[tuple[str | None, str], _uuid.UUID] = {}
    for sh in existing_shop_rows:
        shop_id_map.setdefault((sh.area, normalize_shop_name(sh.name).lower()), sh.id)
    new_shops: list[Shop] = []
    for (area_val, norm) in wanted_shops:
        if (area_val, norm.lower()) not in shop_id_map:
            sh = Shop(id=_uuid.uuid4(), companyId=company_id, area=area_val, name=norm)
            new_shops.append(sh)
            shop_id_map[(area_val, norm.lower())] = sh.id

    def _shop_id_for(r) -> _uuid.UUID | None:
        norm = normalize_shop_name(r.consigneeName)
        return shop_id_map.get((_row_area(r), norm.lower())) if norm else None

    imported = failed = 0
    duplicate_numbers: list[str] = []
    failures: list[dict] = []
    _now = datetime.now(timezone.utc)

    # ── Build every Order as a plain dict for one bulk INSERT (no per-row ORM
    #    object, no per-row flush). Row-level problems (bad date, in-file
    #    duplicate, already-active GR number) are decided here, in memory. ───
    seen_in_file: set[str] = set()
    order_values: list[dict] = []
    row_by_number: dict[str, object] = {}
    for r in payload.rows:
        gr_number = (r.grNumber or "").strip()
        if gr_number in active or gr_number in seen_in_file:
            duplicate_numbers.append(r.grNumber)
            continue
        seen_in_file.add(gr_number)
        try:
            grd = (
                datetime.fromisoformat(r.grDateIso.replace("Z", "+00:00"))
                if r.grDateIso
                else None
            )
            order_values.append(
                {
                    "id": _uuid.uuid4(),
                    "orderNumber": gr_number,
                    "companyId": company_id,
                    "shopId": _shop_id_for(r),
                    "assignedStaffId": staff_employee_id,
                    "consignorName": r.consignorName,
                    "consigneeName": r.consigneeName,
                    "particulars": r.particulars,
                    "packageCount": r.packageCount or 1,
                    "pickupAddress": r.fromLocation or "—",
                    "deliveryAddress": r.toLocation or "—",
                    "pickupTime": _now,
                    "weight": r.weight,
                    "status": "pending",  # ALWAYS pending — Excel status is ignored
                    "source": "excel",
                    "grDate": grd,
                    "fromLocation": r.fromLocation,
                    "toLocation": r.toLocation,
                    "paymentMode": r.paymentMode,
                    "toPay": r.toPay,
                    "paymentAmount": r.paymentAmount,
                    "chalaanNo": r.chalaanNo,
                    "chalaanDate": r.chalaanDate,
                    "transportGrn": r.transportGrn,
                    "grSourceLabel": r.grSourceLabel,
                    "area": _row_area(r),
                    # Columns whose defaults are ORM-side only (no server_default)
                    # — a Core INSERT must supply them explicitly.
                    "priority": "normal",
                    "distance": 0.0,
                    "isActive": True,
                    "createdAt": _now,
                    "updatedAt": _now,
                }
            )
            row_by_number[gr_number] = r
        except Exception as exc:  # noqa: BLE001 — one bad row must not abort the batch
            failed += 1
            logger.warning("GR import row %s (GR %s) build failed: %s", r.rowNumber, gr_number, exc)
            failures.append({"rowNumber": r.rowNumber, "grNumber": r.grNumber, "message": str(exc)})
    _lap("row-build")

    # ── Writes, in the request's single transaction ──────────────────────
    # 1. new shops / employee first (Orders FK-reference them).
    if new_shops or new_employee is not None:
        session.add_all([*new_shops, *([new_employee] if new_employee else [])])
        await session.flush()

    if order_values:
        # 2. ONE bulk INSERT. `ON CONFLICT DO NOTHING` on the partial unique
        #    index (`orderNumber` WHERE deletedAt IS NULL) makes this
        #    race-safe at the DATABASE level — a concurrent import that grabs
        #    the same GR number in between our check and now is skipped, not
        #    an error, so no SAVEPOINT / retry dance is needed. A soft-deleted
        #    GR with the same number is untouched (it's outside the partial
        #    index). RETURNING tells us exactly which rows landed.
        stmt = (
            _pg_insert(Order)
            .values(order_values)
            .on_conflict_do_nothing(
                index_elements=["orderNumber"], index_where=Order.deletedAt.is_(None)
            )
            .returning(Order.id, Order.orderNumber)
        )
        inserted = (await session.execute(stmt)).all()
        imported = len(inserted)
        inserted_numbers = {num for _id, num in inserted}
        for d in order_values:
            if d["orderNumber"] not in inserted_numbers:
                # Raced with a concurrent import — counts as duplicate.
                duplicate_numbers.append(d["orderNumber"])

        # 3. ONE bulk INSERT for the "Imported from Excel" timeline rows.
        if inserted:
            await session.execute(
                _pg_insert(OrderStatusHistory).values(
                    [
                        {
                            "id": _uuid.uuid4(),
                            "orderId": oid,
                            "status": "pending",
                            "notes": "Imported from Excel",
                            "timestamp": _now,
                            "createdAt": _now,
                            "updatedAt": _now,
                        }
                        for oid, _num in inserted
                    ]
                )
            )
    _lap("bulk-write")

    # The batch's audit record — not on the critical path. Written after the
    # response is sent so the client never waits on it.
    background_tasks.add_task(
        _write_import_history,
        file_name=payload.fileName,
        imported_by_name=payload.importedByName,
        imported_by=admin.id,
        company_id=company_id,
        area=(staff_area if is_staff else payload.area),
        total_rows=len(payload.rows),
        imported_rows=imported,
        duplicate_rows=len(duplicate_numbers),
        failed_rows=failed,
    )

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


async def _write_import_history(
    *, file_name, imported_by_name, imported_by, company_id, area,
    total_rows, imported_rows, duplicate_rows, failed_rows,
) -> None:
    """Persists the ``import_history`` audit row after the import response has
    already been returned (it is not something the client waits on)."""
    try:
        from app.database.db import session_scope

        async with session_scope() as s:
            s.add(
                ImportHistory(
                    fileName=file_name,
                    importedAt=datetime.now(timezone.utc),
                    importedByName=imported_by_name,
                    importedBy=imported_by,
                    companyId=company_id,
                    area=area,
                    totalRows=total_rows,
                    importedRows=imported_rows,
                    duplicateRows=duplicate_rows,
                    failedRows=failed_rows,
                )
            )
    except Exception:  # noqa: BLE001 — an audit-row failure must not surface to the user
        logging.getLogger(__name__).warning("GR import: import_history write failed", exc_info=True)


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

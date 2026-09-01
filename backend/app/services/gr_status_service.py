"""Canonical GR reporting-status classification.

ONE authoritative definition of the four reporting buckets, consumed by every
dashboard / list surface (Admin Dashboard, GR / Shipments, Staff-visible GR
data). Never re-implement this logic anywhere else.

    PENDING    - not delivered (workflow), regardless of money received
    DELIVERED  - delivered, nothing received
    UNCLEARED  - delivered, part paid            (0 < totalPaid < totalBill)
    CLEARED    - delivered, fully paid            (totalPaid >= totalBill)

"delivered (workflow)" == the GR has left the ``pending`` order status, i.e.
someone explicitly marked it delivered (or the fully-paid auto-reconcile in
``payment.py`` / ``OrderRepository.reconcile_delivered_status`` did). An
undelivered GR that has a partial payment stays PENDING - it is never
UNCLEARED.

    totalPaid = GREATEST(SUM(payments.amount), COALESCE(orders.paymentAmount, 0))
    totalBill = COALESCE(orders.toPay, 0)

``orders.paymentAmount`` is folded in because the Excel bulk import records a
paid figure straight onto the order without a ``payments`` ledger row, and the
delivered-reconcile already treats it the same way.
"""
from __future__ import annotations

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.payment import Payment

REPORTING_STATUSES = ("pending", "cleared", "uncleared", "delivered")

# Float tolerance so ₹499.999… vs ₹500 rounding never mis-buckets a GR.
_EPS = 0.005


def classify(delivered: bool, total_paid: float | None, total_bill: float | None) -> str:
    """Pure-Python classifier - the single source of truth, mirrored exactly by
    the SQL ``reporting_status_expr`` below. Use for per-record checks / tests."""
    tp = float(total_paid or 0)
    tb = float(total_bill or 0)
    if not delivered:
        return "pending"
    if tb > 0:
        if tp >= tb - _EPS:
            return "cleared"
        if tp > 0:
            return "uncleared"
        return "delivered"
    # No bill recorded: "fully paid" only makes sense if something was paid.
    return "cleared" if tp > 0 else "delivered"


def paid_subquery():
    """orderId -> SUM(payments.amount), as a joinable subquery."""
    return (
        select(
            Payment.orderId.label("orderId"),
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .group_by(Payment.orderId)
        .subquery()
    )


def total_paid_expr(paid_col):
    """GREATEST(ledger sum, legacy order.paymentAmount)."""
    return func.greatest(
        func.coalesce(paid_col, 0), func.coalesce(Order.paymentAmount, 0)
    )


def reporting_status_expr(paid_col):
    """SQL CASE mirroring :func:`classify` - resolves to one of
    :data:`REPORTING_STATUSES`."""
    tp = total_paid_expr(paid_col)
    tb = func.coalesce(Order.toPay, 0)
    return case(
        (Order.status == "pending", "pending"),
        (and_(tb > 0, tp >= tb - _EPS), "cleared"),
        (and_(tb > 0, tp > 0), "uncleared"),
        (and_(tb <= 0, tp > 0), "cleared"),
        else_="delivered",
    )


def _list_filters(company_id, area, search, consignor, date_from):
    """Same predicate set as ``OrderRepository.get_all_orders`` so counts and
    the paginated list always reconcile."""
    conds = [Order.isActive == True]  # noqa: E712 - SQLAlchemy boolean column
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if area:
        conds.append(Order.area == area)
    if search:
        like = f"%{search}%"
        conds.append(
            or_(
                Order.orderNumber.ilike(like),
                Order.trackingCode.ilike(like),
                Order.pickupAddress.ilike(like),
                Order.deliveryAddress.ilike(like),
                Order.consignorName.ilike(like),
                Order.consigneeName.ilike(like),
            )
        )
    if consignor:
        conds.append(Order.consignorName == consignor)
    if date_from is not None:
        conds.append(func.coalesce(Order.grDate, Order.createdAt) >= date_from)
    return conds


async def status_counts(
    session: AsyncSession,
    *,
    company_id=None,
    area: str | None = None,
    search: str | None = None,
    consignor: str | None = None,
    date_from=None,
) -> dict:
    """One aggregate query -> the four reporting counts + the matching money
    totals for the same filtered dataset.

    Guarantees ``pending + cleared + uncleared + delivered == total``.
    """
    paid = paid_subquery()
    rs = reporting_status_expr(paid.c.paid)
    tp = total_paid_expr(paid.c.paid)
    tb = func.coalesce(Order.toPay, 0)
    conds = _list_filters(company_id, area, search, consignor, date_from)

    row = (
        await session.execute(
            select(
                func.count(Order.id).label("total"),
                func.count(Order.id).filter(rs == "pending").label("pending"),
                func.count(Order.id).filter(rs == "cleared").label("cleared"),
                func.count(Order.id).filter(rs == "uncleared").label("uncleared"),
                func.count(Order.id).filter(rs == "delivered").label("delivered"),
                func.coalesce(func.sum(tb), 0).label("total_to_pay"),
                func.coalesce(func.sum(tp), 0).label("total_received"),
                func.coalesce(
                    func.sum(func.greatest(tb - tp, 0)), 0
                ).label("total_outstanding"),
            )
            .select_from(Order)
            .outerjoin(paid, paid.c.orderId == Order.id)
            .where(*conds)
        )
    ).one()

    return {
        "total": int(row.total),
        "pending": int(row.pending),
        "cleared": int(row.cleared),
        "uncleared": int(row.uncleared),
        "delivered": int(row.delivered),
        "totalToPay": float(row.total_to_pay),
        "totalReceived": float(row.total_received),
        "totalOutstanding": float(row.total_outstanding),
    }

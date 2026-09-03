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
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import GRAccessUser
from app.core.exceptions import NotFoundError, ValidationBusinessError
from app.core.tenancy import assert_same_company, effective_company_id, resolve_gr_staff_scope
from app.database.db import get_db_session
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.models.shop import Shop
from app.models.payment import Payment
from app.models.import_history import ImportHistory
from app.repositories.order_repository import OrderRepository
from app.repositories.shop_repository import ShopRepository
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

    eff = func.coalesce(Order.grDate, Order.createdAt)
    rev = func.coalesce(Order.paymentAmount, 0) + func.coalesce(Order.toPay, 0)
    total_paid_expr = func.greatest(func.coalesce(paid.c.paid, 0), func.coalesce(Order.paymentAmount, 0))

    def bucket(lo, hi):
        return func.coalesce(func.sum(rev).filter(and_(*base, eff >= lo, eff < hi)), 0)

    q = (
        select(
            bucket(start_today, end_now).label("today"),
            bucket(start_yesterday, start_today).label("yesterday"),
            bucket(start_week, end_now).label("week"),
            bucket(start_prev_week, start_week).label("prev_week"),
            bucket(start_month, end_now).label("month"),
            bucket(start_prev_month, start_month).label("prev_month"),
            func.coalesce(func.sum(total_paid_expr).filter(and_(*base)), 0).label("total_collected"),
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
    row = (await session.execute(q)).one()

    pbase = list(base)
    ptrend = (
        await session.execute(
            select(
                func.coalesce(func.sum(Payment.amount).filter(Payment.createdAt >= start_month), 0),
                func.coalesce(
                    func.sum(Payment.amount).filter(
                        and_(Payment.createdAt >= start_prev_month, Payment.createdAt < start_month)
                    ),
                    0,
                ),
            )
            .select_from(Payment)
            .join(Order, Order.id == Payment.orderId)
            .where(*pbase)
        )
    ).one()

    return success(
        {
            "today": float(row.today),
            "yesterday": float(row.yesterday),
            "week": float(row.week),
            "prevWeek": float(row.prev_week),
            "month": float(row.month),
            "prevMonth": float(row.prev_month),
            "totalCollected": float(row.total_collected),
            "outstandingAmount": float(row.outstanding),
            "collectedGRCount": int(row.collected_count),
            "outstandingGRCount": int(row.outstanding_count),
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
        },
        message="Receiving overview retrieved successfully.",
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
    already exist (active), physically replaces soft-deleted ones, records one
    ``import_history`` row for the batch. Ported from the mobile
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

    existing = (
        await session.execute(
            select(Order.orderNumber, Order.deletedAt, Order.id).where(
                Order.orderNumber.in_([(r.grNumber or "").strip() for r in payload.rows])
            )
        )
    ).all()
    active = {n for n, deleted, _ in existing if deleted is None}
    soft_deleted = {n: i for n, deleted, i in existing if deleted is not None}

    imported = failed = 0
    duplicate_numbers: list[str] = []
    failures: list[dict] = []
    shop_repo = ShopRepository(session)  # bound to the request session — no nested txn
    # In-batch Shop cache: a single import file usually repeats the same
    # consignee across many rows. Resolve each distinct (area, consignee) once
    # instead of a round-trip to Neon per row. Keyed on the same normalized,
    # case-insensitive form ShopRepository matches on.
    from app.repositories.shop_repository import normalize_shop_name

    shop_cache: dict[tuple[str | None, str | None], object] = {}

    async def resolve_shop(area_val: str | None, consignee: str | None):
        norm = normalize_shop_name(consignee)
        key = (area_val, norm.lower() if norm else None)
        if key not in shop_cache:
            shop_cache[key] = await shop_repo.get_or_create(
                company_id=company_id, area=area_val, name=consignee
            )
        return shop_cache[key]

    for r in payload.rows:
        gr_number = (r.grNumber or "").strip()
        logger.info("GR import row %s: GR from Excel=%r normalized=%r", r.rowNumber, r.grNumber, gr_number)
        if gr_number in active:
            duplicate_numbers.append(r.grNumber)
            continue
        try:
            row_area = staff_area if is_staff else (r.resolvedArea or payload.area)
            # Resolve the consignee Shop BEFORE the per-row SAVEPOINT: a Shop is
            # master data (a get-or-create that a failing GR row must never roll
            # back), and resolving it outside the savepoint also keeps the
            # in-batch `shop_cache` consistent with what's actually committed.
            shop = await resolve_shop(row_area, r.consigneeName)
            # SAVEPOINT per row: a single bad row rolls back only itself and the
            # loop continues, instead of aborting the whole batch transaction.
            async with session.begin_nested():
                if gr_number in soft_deleted:
                    stale_id = soft_deleted[gr_number]
                    logger.info(
                        "GR %s: lookup field=orders.id value=%s (soft-deleted order being replaced)",
                        gr_number, stale_id,
                    )
                    stale = await session.get(Order, stale_id)
                    if stale is not None:
                        # Relies on Order.statusHistory / Order.attachments being
                        # configured with cascade="all, delete-orphan" +
                        # passive_deletes=True so the DB's ON DELETE CASCADE
                        # removes dependent rows instead of the ORM nulling out
                        # their NOT NULL orderId FK before the parent delete.
                        await session.delete(stale)
                        await session.flush()
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
                    status="pending",
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
                session.add(order)
                await session.flush()
                logger.info(
                    "GR %s: matched/created Order id=%s orderNumber=%s",
                    gr_number, order.id, order.orderNumber,
                )

                # Defensive guard (required — never let a status-history row be
                # written with a missing/None orderId).
                if not order or not order.id:
                    raise ValueError(f"Unable to resolve order for GR {gr_number}")

                history = OrderStatusHistory(orderId=order.id, status="pending", notes="Imported from Excel")
                session.add(history)
                await session.flush()
                logger.info("GR %s: created order_status_history id=%s orderId=%s", gr_number, history.id, history.orderId)
                # NO reconcile_delivered_status here. Business rule: every GR
                # created by Excel import starts in `pending`, full stop — the
                # sheet's toPay / paymentAmount / payment-mode columns are
                # financial metadata, not workflow state, and must never
                # auto-advance a brand-new import to delivered/cleared. A
                # staff/admin action (or a later real payment via the payments
                # endpoint, which runs its own reconcile) is what moves it on.
            active.add(gr_number)
            imported += 1
        except Exception as exc:  # noqa: BLE001 — per-row isolation
            failed += 1
            logger.warning("GR import row %s (GR %s) failed: %s", r.rowNumber, gr_number, exc)
            failures.append({"rowNumber": r.rowNumber, "grNumber": r.grNumber, "message": str(exc)})

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

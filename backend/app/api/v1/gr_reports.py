"""GR aggregation / reporting endpoints + Excel bulk import.

Ported from the former mobile-SQLite ``orderRepository`` aggregation methods
so every figure the mobile dashboards/lists show comes from Neon via the
API. Server-side filtering only — the mobile app never pulls the whole table.
"""
from __future__ import annotations

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
from app.core.tenancy import assert_same_company, effective_company_id
from app.database.db import get_db_session
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.models.payment import Payment
from app.models.import_history import ImportHistory
from app.repositories.order_repository import OrderRepository
from app.schemas.order import GRCreateRequest
from app.utils.responses import success

router = APIRouter(prefix="/admin/orders", tags=["gr-reports"])
order_repo = OrderRepository()


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


@router.get("/meta/consignors")
async def list_consignors(admin: GRAccessUser) -> dict:
    names = await order_repo.distinct_consignors(
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
    company_id = await effective_company_id(admin)
    scoped_area = _effective_area(admin) or area
    conds = [
        Order.deletedAt.is_(None),
        Order.consignorName.isnot(None),
        Order.consignorName != "",
    ]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if scoped_area:
        conds.append(Order.area == scoped_area)
    if search and search.strip():
        conds.append(Order.consignorName.ilike(f"%{search.strip()}%"))
    rows = (
        await session.execute(
            select(Order.consignorName, func.count(Order.id))
            .where(*conds)
            .group_by(Order.consignorName)
            .order_by(Order.consignorName.asc())
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
    company_id = await effective_company_id(admin)
    if company_id is None:  # platform ADMIN/SUPER_ADMIN — use their own company
        company_id = getattr(admin, "companyId", None)
    if company_id is None:
        raise ValidationBusinessError(
            "Your account is not linked to a company. Ask an administrator to "
            "assign one before importing GRs."
        )
    staff_area = _effective_area(admin)
    is_staff = staff_area is not None

    existing = (
        await session.execute(
            select(Order.orderNumber, Order.deletedAt, Order.id).where(
                Order.orderNumber.in_([r.grNumber for r in payload.rows])
            )
        )
    ).all()
    active = {n for n, deleted, _ in existing if deleted is None}
    soft_deleted = {n: i for n, deleted, i in existing if deleted is not None}

    imported = failed = 0
    duplicate_numbers: list[str] = []
    failures: list[dict] = []
    repo = OrderRepository(session)  # bound to the request session — no nested txn
    for r in payload.rows:
        if r.grNumber in active:
            duplicate_numbers.append(r.grNumber)
            continue
        try:
            # SAVEPOINT per row: a single bad row rolls back only itself and the
            # loop continues, instead of aborting the whole batch transaction.
            async with session.begin_nested():
                if r.grNumber in soft_deleted:
                    stale = await session.get(Order, soft_deleted[r.grNumber])
                    if stale is not None:
                        await session.delete(stale)
                        await session.flush()
                row_area = staff_area if is_staff else (r.resolvedArea or payload.area)
                order = Order(
                    orderNumber=r.grNumber,
                    companyId=company_id,
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
                session.add(
                    OrderStatusHistory(orderId=order.id, status="pending", notes="Imported from Excel")
                )
                await session.flush()
                await repo.reconcile_delivered_status(order.id)
            active.add(r.grNumber)
            imported += 1
        except Exception as exc:  # noqa: BLE001 — per-row isolation
            failed += 1
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

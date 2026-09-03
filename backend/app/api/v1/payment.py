"""Payment API endpoints.

Handles recording payments against GR/Orders, listing payment history,
and retrieving aggregated payment summaries.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from typing import Annotated, Optional

from fastapi import Query

from app.api.deps import GRAccessUser
from app.core.rbac import is_admin
from app.core.tenancy import assert_same_company, effective_company_id
from app.database.db import get_db_session
from app.models.enums import OrderStatus, UserRole
from app.models.order import Order
from app.models.payment import Payment
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentCreateRequest, PaymentOut, PaymentSummaryOut

router = APIRouter(prefix="/payments", tags=["Payments"])

_STAFF_ROLES = (UserRole.STAFF, UserRole.EMPLOYEE)


async def _publish_gr_after_payment(order_id: UUID) -> None:
    """Runs as a FastAPI BackgroundTask — i.e. AFTER the payment transaction
    has committed. Re-reads the (now durable) order and fans its current
    reporting status out to connected GR dashboards, so a payment that
    settles the balance flips the admin list ``delivered → cleared`` (or
    ``uncleared → cleared``) live, with no polling."""
    try:
        from app.api.v1.gr import _publish_gr_change
        from app.database.db import session_scope

        async with session_scope() as s:
            order = await s.get(Order, order_id)
            ledger = float(
                (await s.execute(
                    select(func.coalesce(func.sum(Payment.amount), 0.0)).where(Payment.orderId == order_id)
                )).scalar() or 0.0
            )
        if order is not None:
            legacy = float(order.paymentAmount) if order.paymentAmount is not None else 0.0
            await _publish_gr_change(
                order, previous_status=None, event="gr.status", total_paid=max(ledger, legacy)
            )
    except Exception:  # noqa: BLE001 — realtime is advisory
        import logging

        logging.getLogger(__name__).warning("payment realtime publish failed", exc_info=True)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreateRequest,
    admin: GRAccessUser,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
):
    """Record a new payment against an order.

    Requires a valid bearer token (``GRAccessUser`` — Admin/Company
    Admin/Staff/Driver) and is scoped to the caller's own company via
    ``assert_same_company``, matching every other order-mutating endpoint in
    ``gr.py``. Runs in the single request-scoped session (auto-committed by
    ``get_db_session`` on success, rolled back on exception), so the payment
    insert and the order's status flip to DELIVERED commit or roll back
    together — the database can never end up with totalPaid >= toPay but
    status still PENDING.
    """
    order = await session.get(Order, body.orderId)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await assert_same_company(admin, order.companyId, session)

    to_pay = float(order.toPay or 0)
    already_paid_stmt = select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
        Payment.orderId == body.orderId
    )
    already_paid = float((await session.execute(already_paid_stmt)).scalar() or 0.0)

    if to_pay > 0 and already_paid + body.amount > to_pay + 0.005:
        remaining = max(0.0, to_pay - already_paid)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment cannot exceed the remaining amount of {remaining:.2f}.",
        )

    # STAFF/EMPLOYEE can only ever attribute a collection to themselves — a
    # client-supplied recordedBy is never trusted for them, so a caller can
    # neither spoof another staff member's collection nor silently vanish
    # from their own Staff Daily Collection by omitting the field. ADMIN/
    # SUPER_ADMIN may record a collection on a specific staff member's behalf
    # (see AdminGRDetailsScreen's `collectedByStaffId` picker), so their
    # explicit recordedBy is respected.
    recorded_by = str(admin.id) if admin.role in _STAFF_ROLES else body.recordedBy

    repo = PaymentRepository(session)
    payment = Payment(
        orderId=body.orderId,
        amount=body.amount,
        paymentMethod=body.paymentMethod,
        notes=body.notes,
        recordedBy=recorded_by,
    )
    await repo.save(payment)

    total_paid = already_paid + body.amount
    if to_pay > 0 and total_paid >= to_pay - 0.005 and order.status != OrderStatus.DELIVERED:
        order.status = OrderStatus.DELIVERED
        session.add(order)

    # After the response is sent (transaction committed) tell the GR
    # dashboards the reporting status may have moved (uncleared/delivered →
    # cleared once nothing is outstanding). Never before the commit.
    background_tasks.add_task(_publish_gr_after_payment, body.orderId)

    return payment


@router.get("")
async def list_payment_history(
    admin: GRAccessUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
    search: Annotated[Optional[str], Query(max_length=200)] = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Paginated payment history across every GR the caller can see — ONE
    query (Payment ⨝ Order), tenant-scoped by ``effective_company_id``
    exactly like the GR list, newest first. Each row already carries the GR
    number + consignor/consignee so the Payment History screen needs NO
    per-payment / per-order follow-up request. Money totals for the summary
    cards come from the existing ``GET /admin/orders/receiving/overview``."""
    company_id = await effective_company_id(admin)
    conds = [Order.deletedAt.is_(None)]
    if company_id is not None:
        conds.append(Order.companyId == company_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        conds.append(
            Order.orderNumber.ilike(like)
            | Order.consigneeName.ilike(like)
            | Order.consignorName.ilike(like)
            | Payment.notes.ilike(like)
        )

    base = (
        select(
            Payment.id,
            Payment.orderId,
            Payment.amount,
            Payment.paymentMethod,
            Payment.notes,
            Payment.recordedBy,
            Payment.createdAt,
            Order.orderNumber,
            Order.consigneeName,
            Order.consignorName,
            func.count().over().label("_total"),
        )
        .join(Order, Order.id == Payment.orderId)
        .where(*conds)
        .order_by(Payment.createdAt.desc(), Payment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(base)).all()
    total = int(rows[0]._total) if rows else 0
    items = [
        {
            "id": str(r.id),
            "orderId": str(r.orderId),
            "orderNumber": r.orderNumber,
            "consigneeName": r.consigneeName,
            "consignorName": r.consignorName,
            "amount": float(r.amount),
            "paymentMethod": r.paymentMethod,
            "notes": r.notes,
            "recordedBy": r.recordedBy,
            "createdAt": r.createdAt.isoformat(),
        }
        for r in rows
    ]
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 1,
    }


@router.get("/order/{order_id}", response_model=list[PaymentOut])
async def list_payments_for_order(
    order_id: UUID,
    admin: GRAccessUser,
    session: AsyncSession = Depends(get_db_session),
):
    """List all payments for a specific order. Requires a valid bearer token,
    scoped to the caller's own company."""
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await assert_same_company(admin, order.companyId, session)

    repo = PaymentRepository(session)
    payments = await repo.list_by_order(order_id)
    return payments


@router.get("/summary/{order_id}", response_model=PaymentSummaryOut)
async def get_payment_summary(
    order_id: UUID,
    admin: GRAccessUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Get aggregated payment summary for an order. Requires a valid bearer
    token, scoped to the caller's own company."""
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await assert_same_company(admin, order.companyId, session)

    repo = PaymentRepository(session)
    summary = await repo.get_order_summary(order_id)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    payments = await repo.list_by_order(order_id)
    summary["payments"] = [PaymentOut.model_validate(p) for p in payments]
    return summary

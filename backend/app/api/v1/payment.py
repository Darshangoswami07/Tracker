"""Payment API endpoints.

Handles recording payments against GR/Orders, listing payment history,
and retrieving aggregated payment summaries.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import GRAccessUser
from app.core.rbac import is_admin
from app.core.tenancy import assert_same_company
from app.database.db import get_db_session
from app.models.enums import OrderStatus, UserRole
from app.models.order import Order
from app.models.payment import Payment
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentCreateRequest, PaymentOut, PaymentSummaryOut

router = APIRouter(prefix="/payments", tags=["Payments"])

_STAFF_ROLES = (UserRole.STAFF, UserRole.EMPLOYEE)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreateRequest,
    admin: GRAccessUser,
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

    return payment


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

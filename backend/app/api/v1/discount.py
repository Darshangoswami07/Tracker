"""Admin-only GR Discount endpoints.

Discount is a separate, independently-tracked reduction of a GR's bill — it
is NEVER a payment transaction, NEVER folds into `Payment`/`totalPaid`, and
NEVER changes `Order.toPay` (the original bill). Every "remaining" figure is
computed as ``toPay - totalPaid - discountAmount`` (see
``app.services.gr_status_service.effective_to_pay``).

Gated end-to-end by ``AdminUser`` (mirrors how ``payment.py``'s
``POST /payments`` is gated by ``GRAccessUser``): a Staff/non-admin caller
gets a 403 before any DB read happens, never a silently-filtered result.

Apply/modify/cancel each run inside the single request-scoped transaction
(``get_db_session`` — committed on success, rolled back on exception) and
lock the order row with ``SELECT ... FOR UPDATE`` before validating, so a
double-submit (two concurrent "Apply Discount" taps) can never apply two
discounts: the second request blocks on the lock until the first commits,
then re-reads `discountAmount` fresh and is rejected by the
already-active-discount check below.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.core.exceptions import NotFoundError, ValidationBusinessError
from app.core.tenancy import assert_same_company
from app.database.db import get_db_session
from app.models.order import Order
from app.models.order_discount_history import OrderDiscountHistory
from app.models.payment import Payment
from app.models.user import User
from app.schemas.discount import (
    DiscountActionOut,
    DiscountApplyRequest,
    DiscountCancelRequest,
    DiscountHistoryItemOut,
    DiscountModifyRequest,
)
from app.utils.responses import success

router = APIRouter(prefix="/admin/orders", tags=["discount"])

_EPS = 0.005


async def _locked_order(session: AsyncSession, order_id: UUID) -> Order:
    order = (
        await session.execute(
            select(Order).where(Order.id == order_id).with_for_update()
        )
    ).scalar_one_or_none()
    if order is None:
        raise NotFoundError("GR not found.")
    return order


async def _total_paid(session: AsyncSession, order_id: UUID) -> float:
    return float(
        (
            await session.execute(
                select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                    Payment.orderId == order_id
                )
            )
        ).scalar()
        or 0.0
    )


def _out(order: Order, total_paid: float) -> DiscountActionOut:
    to_pay = float(order.toPay or 0)
    discount = float(order.discountAmount or 0)
    effective_remaining = max(0.0, to_pay - discount - total_paid)
    return DiscountActionOut(
        orderId=order.id,
        toPay=to_pay,
        totalPaid=total_paid,
        discountAmount=discount,
        effectiveRemaining=effective_remaining,
    )


@router.post("/{order_id}/discount")
async def apply_discount(
    order_id: UUID,
    payload: DiscountApplyRequest,
    admin: AdminUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Applies a NEW discount. Fails (400) if a discount is already active on
    this GR — use ``PATCH`` to change it instead."""
    order = await _locked_order(session, order_id)
    await assert_same_company(admin, order.companyId, session=session)

    current_discount = float(order.discountAmount or 0)
    if current_discount > 0:
        raise ValidationBusinessError(
            "A discount is already active on this GR. Modify it instead of applying a new one."
        )

    to_pay = float(order.toPay or 0)
    total_paid = await _total_paid(session, order_id)
    remaining = max(0.0, to_pay - total_paid)
    if remaining <= _EPS:
        raise ValidationBusinessError("There is no remaining balance to discount on this GR.")
    if payload.amount > remaining + _EPS:
        raise ValidationBusinessError(
            f"Discount cannot exceed the remaining amount of {remaining:.2f}."
        )

    now = datetime.now(timezone.utc)
    order.discountAmount = payload.amount
    order.discountReason = payload.reason
    order.discountedBy = admin.id
    order.discountedAt = now

    session.add(
        OrderDiscountHistory(
            orderId=order_id,
            action="applied",
            discountAmount=payload.amount,
            previousDiscountAmount=None,
            reason=payload.reason,
            appliedBy=admin.id,
        )
    )
    await session.flush()

    await _publish_discount_change(order)
    return success(_out(order, total_paid).model_dump(mode="json"), message="Discount applied successfully.")


@router.patch("/{order_id}/discount")
async def modify_discount(
    order_id: UUID,
    payload: DiscountModifyRequest,
    admin: AdminUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Replaces the currently active discount with a new amount/reason.
    Validated against the remaining BEFORE the existing discount (i.e.
    ``toPay - totalPaid``) since this REPLACES it, not stacks on top of it."""
    order = await _locked_order(session, order_id)
    await assert_same_company(admin, order.companyId, session=session)

    current_discount = float(order.discountAmount or 0)
    if current_discount <= 0:
        raise ValidationBusinessError("There is no active discount on this GR to modify. Apply one instead.")

    to_pay = float(order.toPay or 0)
    total_paid = await _total_paid(session, order_id)
    remaining_before_discount = max(0.0, to_pay - total_paid)
    if payload.amount > remaining_before_discount + _EPS:
        raise ValidationBusinessError(
            f"Discount cannot exceed the remaining amount of {remaining_before_discount:.2f}."
        )

    now = datetime.now(timezone.utc)
    order.discountAmount = payload.amount
    order.discountReason = payload.reason
    order.discountedBy = admin.id
    order.discountedAt = now

    session.add(
        OrderDiscountHistory(
            orderId=order_id,
            action="modified",
            discountAmount=payload.amount,
            previousDiscountAmount=current_discount,
            reason=payload.reason,
            appliedBy=admin.id,
        )
    )
    await session.flush()

    await _publish_discount_change(order)
    return success(_out(order, total_paid).model_dump(mode="json"), message="Discount updated successfully.")


@router.delete("/{order_id}/discount")
async def cancel_discount(
    order_id: UUID,
    admin: AdminUser,
    payload: DiscountCancelRequest | None = None,
    session: AsyncSession = Depends(get_db_session),
):
    """Cancels the currently active discount (back to ₹0) — the history row
    for this action is kept forever; only the CURRENT total on ``Order``
    resets."""
    order = await _locked_order(session, order_id)
    await assert_same_company(admin, order.companyId, session=session)

    current_discount = float(order.discountAmount or 0)
    if current_discount <= 0:
        raise ValidationBusinessError("There is no active discount on this GR to cancel.")

    total_paid = await _total_paid(session, order_id)

    order.discountAmount = None
    order.discountReason = None
    order.discountedBy = None
    order.discountedAt = None

    session.add(
        OrderDiscountHistory(
            orderId=order_id,
            action="cancelled",
            discountAmount=0,
            previousDiscountAmount=current_discount,
            reason=(payload.reason if payload else None),
            appliedBy=admin.id,
        )
    )
    await session.flush()

    await _publish_discount_change(order)
    return success(_out(order, total_paid).model_dump(mode="json"), message="Discount cancelled successfully.")


@router.get("/{order_id}/discount/history")
async def get_discount_history(
    order_id: UUID,
    admin: AdminUser,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Full discount audit trail for this GR — Admin-only (who/when/reason/
    amount for every apply/modify/cancel action, newest first)."""
    order = await session.get(Order, order_id)
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId, session=session)

    rows = (
        await session.execute(
            select(
                OrderDiscountHistory.id,
                OrderDiscountHistory.orderId,
                OrderDiscountHistory.action,
                OrderDiscountHistory.discountAmount,
                OrderDiscountHistory.previousDiscountAmount,
                OrderDiscountHistory.reason,
                OrderDiscountHistory.appliedBy,
                OrderDiscountHistory.createdAt,
                User.firstName,
                User.lastName,
            )
            .outerjoin(User, User.id == OrderDiscountHistory.appliedBy)
            .where(OrderDiscountHistory.orderId == order_id)
            .order_by(OrderDiscountHistory.createdAt.desc())
        )
    ).all()

    items = [
        DiscountHistoryItemOut(
            id=r.id,
            orderId=r.orderId,
            action=r.action,
            discountAmount=float(r.discountAmount),
            previousDiscountAmount=float(r.previousDiscountAmount) if r.previousDiscountAmount is not None else None,
            reason=r.reason,
            appliedBy=r.appliedBy,
            appliedByName=(f"{r.firstName or ''} {r.lastName or ''}".strip() or None),
            createdAt=r.createdAt,
        )
        for r in rows
    ]
    return success([i.model_dump(mode="json") for i in items], message="Discount history retrieved successfully.")


async def _publish_discount_change(order: Order) -> None:
    """Fans the updated totals out to connected GR screens (same in-process
    pub/sub as every other GR mutation). Deliberately mirrors
    `gr.py::_publish_gr_change`'s payload shape (toPay/paymentAmount/status)
    and adds NOTHING discount-specific — the realtime channel is shared by
    Staff and Admin subscribers alike (see `app/realtime.py`), so a discount
    amount/reason must never travel over it. Connected screens simply
    refetch on `gr.updated`, same as any other edit."""
    try:
        from app.api.v1.gr import _publish_gr_change

        await _publish_gr_change(order, previous_status=None, event="gr.updated")
    except Exception:  # noqa: BLE001 — realtime is advisory, never load-bearing
        import logging

        logging.getLogger(__name__).warning("discount realtime publish failed", exc_info=True)

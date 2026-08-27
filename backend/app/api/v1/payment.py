"""Payment API endpoints.

Handles recording payments against GR/Orders, listing payment history,
and retrieving aggregated payment summaries.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_db_session
from app.models.payment import Payment
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentCreateRequest, PaymentOut, PaymentSummaryOut

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreateRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Record a new payment against an order."""
    repo = PaymentRepository(session)
    payment = Payment(
        orderId=body.orderId,
        amount=body.amount,
        paymentMethod=body.paymentMethod,
        notes=body.notes,
        recordedBy=body.recordedBy,
    )
    await repo.save(payment)
    return payment


@router.get("/order/{order_id}", response_model=list[PaymentOut])
async def list_payments_for_order(
    order_id: UUID,
    session: AsyncSession = Depends(get_db_session),
):
    """List all payments for a specific order."""
    repo = PaymentRepository(session)
    payments = await repo.list_by_order(order_id)
    return payments


@router.get("/summary/{order_id}", response_model=PaymentSummaryOut)
async def get_payment_summary(
    order_id: UUID,
    session: AsyncSession = Depends(get_db_session),
):
    """Get aggregated payment summary for an order."""
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

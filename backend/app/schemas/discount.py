"""Schemas for the Admin-only GR Discount feature.

Discount is stored completely separately from `Payment` — it is never a
payment transaction, never folds into `Payment.amount`/`totalPaid`, and never
changes `Order.toPay` (the original bill). See `app/api/v1/discount.py` for
the apply/modify/cancel semantics and `app/services/gr_status_service` for
the canonical `toPay - totalPaid - discountAmount` formula.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DiscountApplyRequest(BaseModel):
    """Apply a NEW discount to a GR. Fails if one is already active — use
    ``PATCH`` (modify) to change an existing discount instead. Double-apply /
    duplicate-request protection is a DB-level guard (the order row is
    locked with ``SELECT ... FOR UPDATE`` and re-validated against the
    freshly-locked state — see ``app/api/v1/discount.py``), not a client
    idempotency key."""

    amount: float = Field(gt=0, description="Discount amount must be positive")
    reason: Optional[str] = Field(default=None, max_length=500)


class DiscountModifyRequest(BaseModel):
    """Replace the currently active discount with a new amount/reason."""

    amount: float = Field(gt=0, description="Discount amount must be positive")
    reason: Optional[str] = Field(default=None, max_length=500)


class DiscountCancelRequest(BaseModel):
    """Cancels the currently active discount (sets it back to ₹0)."""

    reason: Optional[str] = Field(default=None, max_length=500)


class DiscountActionOut(BaseModel):
    """Updated totals after an apply/modify/cancel action — Admin-only
    (the endpoints that return this are all gated by ``AdminUser``)."""

    orderId: UUID
    toPay: float
    totalPaid: float
    discountAmount: float
    effectiveRemaining: float


class DiscountHistoryItemOut(BaseModel):
    id: UUID
    orderId: UUID
    action: str  # 'applied' | 'modified' | 'cancelled'
    discountAmount: float
    previousDiscountAmount: Optional[float] = None
    reason: Optional[str] = None
    appliedBy: Optional[UUID] = None
    appliedByName: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True

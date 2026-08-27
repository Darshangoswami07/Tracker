"""Schemas for Payment management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PaymentCreateRequest(BaseModel):
    """Request to record a new payment against an order."""
    orderId: UUID
    amount: float = Field(gt=0, description="Payment amount must be positive")
    paymentMethod: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=500)
    recordedBy: Optional[str] = Field(default=None, max_length=160)


class PaymentOut(BaseModel):
    """Payment record output."""
    id: UUID
    orderId: UUID
    amount: float
    paymentMethod: Optional[str] = None
    notes: Optional[str] = None
    recordedBy: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class PaymentSummaryOut(BaseModel):
    """Aggregated payment summary for a single order."""
    orderId: UUID
    orderNumber: str
    toPay: float
    totalPaid: float
    balance: float
    paymentStatus: str  # "unpaid" | "partial" | "paid" | "overpaid"
    paymentCount: int
    payments: list[PaymentOut] = []

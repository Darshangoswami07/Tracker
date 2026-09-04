"""Schemas for Payment management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# Who the money actually belongs to. "STAFF" = the collector kept/holds it
# for the normal staff settlement flow (default — matches every payment
# recorded before this field existed). "ADMIN" = the customer paid the
# owner/admin directly; a staff member may still be the one entering it.
RECEIVED_BY_VALUES = ("STAFF", "ADMIN")


class PaymentCreateRequest(BaseModel):
    """Request to record a new payment against an order."""
    orderId: UUID
    amount: float = Field(gt=0, description="Payment amount must be positive")
    paymentMethod: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=500)
    recordedBy: Optional[str] = Field(default=None, max_length=160)
    receivedBy: Optional[str] = Field(
        default=None,
        max_length=16,
        description='Who received the money: "STAFF" (default) or "ADMIN".',
    )

    @field_validator("receivedBy")
    @classmethod
    def _normalize_received_by(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        norm = v.strip().upper()
        if norm not in RECEIVED_BY_VALUES:
            raise ValueError(f"receivedBy must be one of {RECEIVED_BY_VALUES}")
        return norm


class PaymentOut(BaseModel):
    """Payment record output."""
    id: UUID
    orderId: UUID
    amount: float
    paymentMethod: Optional[str] = None
    notes: Optional[str] = None
    recordedBy: Optional[str] = None
    receivedBy: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True

    @field_validator("receivedBy")
    @classmethod
    def _default_received_by(cls, v: Optional[str]) -> str:
        # Rows created before this column existed are NULL — they were
        # always ordinary staff collections, so default them the same way
        # new rows are: "STAFF". Never surfaced as NULL to callers.
        return v or "STAFF"


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

"""Schemas for Staff Daily Collection / Staff Work monitoring.

These back the mobile Staff Daily Collection page (Staff can add today's
collection) and the Admin Staff Work page (read-only monitoring). All
financial figures are derived server-side from Neon so Admin and Staff never
disagree.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

SettlementType = Literal["owner", "labour", "driver"]


class StaffSettlementCreateRequest(BaseModel):
    """Records a cash handover out of a staff member's own day's collection."""

    # Optional: Staff callers are always scoped to themselves server-side.
    staffId: Optional[UUID] = None
    type: SettlementType
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=500)
    # Idempotency key — a retry reuses this so the handover is not double-recorded.
    clientRequestId: Optional[str] = Field(default=None, max_length=100)


class CollectionTransactionOut(BaseModel):
    id: str
    kind: str  # 'collection' | 'owner' | 'labour' | 'driver'
    amount: float
    orderId: Optional[UUID] = None
    orderNumber: Optional[str] = None
    consignorName: Optional[str] = None
    notes: Optional[str] = None
    createdAt: datetime


class StaffDailyCollectionOut(BaseModel):
    date: str
    totalCollection: float
    ownerAmount: float
    labourAmount: float
    driverAmount: float
    staffBalance: float
    transactions: list[CollectionTransactionOut] = []


class StaffDailySummaryOut(BaseModel):
    totalCollection: float
    totalGRs: int


class StaffActivityEventOut(BaseModel):
    id: str
    kind: str  # 'collected' | 'delivered' | 'payment'
    orderId: UUID
    orderNumber: str
    consignorName: Optional[str] = None
    consigneeName: Optional[str] = None
    createdAt: datetime
    amount: Optional[float] = None
    remaining: Optional[float] = None
    toPay: Optional[float] = None


class StaffWorkGROut(BaseModel):
    orderId: UUID
    orderNumber: str
    consignorName: Optional[str] = None
    consigneeName: Optional[str] = None
    status: str
    collectedAt: datetime
    deliveredAt: Optional[datetime] = None
    toPay: float
    totalPaid: float
    balance: float


class StaffDailySummaryBlock(BaseModel):
    grCollected: int
    grDelivered: int
    amountCollected: float
    amountPending: float
    totalBillValue: float
    shopsVisited: int
    ownerAmount: float
    labourAmount: float
    driverAmount: float
    staffBalance: float


class StaffDailyActivityOut(BaseModel):
    summary: StaffDailySummaryBlock
    timeline: list[StaffActivityEventOut] = []
    grWork: list[StaffWorkGROut] = []
    payments: list[StaffActivityEventOut] = []
    settlements: list[CollectionTransactionOut] = []

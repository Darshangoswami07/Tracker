"""Payment entity.

Tracks individual payment records against GR/Order shipments.
Each payment records the amount, method, and who recorded it.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "payments"
    __table_args__ = (
        # Supports the Staff Daily Collection / Staff Work "payments by this
        # staff member on this day" query pattern.
        Index("ix_payments_recordedBy", "recordedBy"),
        Index("ix_payments_createdAt", "createdAt"),
    )

    orderId: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    paymentMethod: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recordedBy: Mapped[str | None] = mapped_column(String(160), nullable=True)

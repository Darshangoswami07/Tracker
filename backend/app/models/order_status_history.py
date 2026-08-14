"""Order status history to track order state changes over time."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OrderStatusHistory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "order_status_history"

    orderId: Mapped[str] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped["Order"] = relationship(back_populates="statusHistory", lazy="selectin")


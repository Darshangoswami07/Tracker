"""Order discount audit trail.

Append-only history of every Discount apply/modify/cancel action against a
GR (see ``app/api/v1/discount.py``). Never update or delete a row here — the
current active discount lives on ``Order.discountAmount`` /
``discountReason`` / ``discountedBy`` / ``discountedAt``; this table is only
the permanent record of how it got there. Modeled directly on
``OrderStatusHistory``'s shape.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OrderDiscountHistory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "order_discount_history"

    orderId: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    # 'applied' | 'modified' | 'cancelled'
    action: Mapped[str] = mapped_column(String(20))
    discountAmount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    previousDiscountAmount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    appliedBy: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    order: Mapped["Order"] = relationship(lazy="selectin")

"""Staff cash settlement entity.

Money a staff member hands out of their own daily collection: an owner
handover, labour wages, or a driver payment. Not tied to a single GR/order
(a settlement is usually a lump sum from the day's total collection across
several GRs), so it cannot live in the ``payments`` table, which requires an
``orderId``.

Previously stored on-device in mobile SQLite (``staff_settlements``); moved
here so Neon is the single source of truth and Admin's read-only Staff Work
monitoring page and the Staff Daily Collection page derive the same figures.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

# Allowed settlement kinds (mirrors the mobile ``SettlementType`` union).
SETTLEMENT_TYPES = ("owner", "labour", "driver")


class StaffSettlement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "staff_settlements"
    __table_args__ = (
        CheckConstraint(
            "type IN ('owner', 'labour', 'driver')",
            name="ck_staff_settlements_type",
        ),
        CheckConstraint("amount > 0", name="ck_staff_settlements_amount_positive"),
        Index("ix_staff_settlements_createdAt", "createdAt"),
        Index(
            "uq_staff_settlements_clientRequestId",
            "clientRequestId",
            unique=True,
            postgresql_where=text('"clientRequestId" IS NOT NULL'),
        ),
    )

    # The staff member the settlement belongs to (a ``users.id`` — the id
    # every staff picker in the app already returns).
    staffId: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(16))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who recorded it (a ``users.id``): the staff member themselves, or an
    # Admin acting on their behalf via a permitted flow.
    createdBy: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Client-supplied idempotency key: a network retry of the same settlement
    # write reuses this value so the unique index collapses the duplicate
    # rather than recording the handover twice (Step 17 — duplicate
    # prevention for financial operations).
    # Unique enforced by a partial index (``clientRequestId IS NOT NULL``)
    # created in migration 017 — not a plain UNIQUE, so many NULLs are allowed.
    clientRequestId: Mapped[str | None] = mapped_column(String(100), nullable=True)

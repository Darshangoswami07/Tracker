"""Shared column mixins for all domain models."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Uuid
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class UUIDPrimaryKeyMixin:
    """UUID primary key with a generator default."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)


class TimestampMixin:
    """created_at / updated_at that are maintained by the ORM."""

    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
    )


class SoftDeleteMixin:
    """Adds a nullable deleted_at column for soft deletes."""

    deletedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    def soft_delete(self) -> None:
        self.deletedAt = utcnow()

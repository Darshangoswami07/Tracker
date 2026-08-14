"""Generated employee/admin reports (CSV exports of real order data)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Report(Base, UUIDPrimaryKeyMixin):
    """A generated report file (implements the previously-unused
    ReportFormat/ReportPeriod enums with an actual generation pipeline)."""

    __tablename__ = "reports"

    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="completed")
    storagePath: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fileSizeBytes: Mapped[int] = mapped_column(default=0)
    generatedBy: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

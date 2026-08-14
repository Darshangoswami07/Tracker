"""General audit log for tracking all important system actions."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.helpers import utcnow


class AuditLog(Base):
    """General audit log for tracking system actions."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    userId: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True, nullable=True)
    adminId: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entityType: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entityId: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    oldValues: Mapped[str | None] = mapped_column(Text, nullable=True)
    newValues: Mapped[str | None] = mapped_column(Text, nullable=True)
    ipAddress: Mapped[str | None] = mapped_column(String(45), nullable=True)
    userAgent: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
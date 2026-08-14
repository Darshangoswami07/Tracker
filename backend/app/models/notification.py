"""In-app notifications delivered to users (and via WebSocket)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import NotificationType
from app.models.helpers import enum_values, utcnow


class Notification(Base):
    """A single notification row for a user."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    userId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(String(500))
    type: Mapped[NotificationType] = mapped_column(
        SqlEnum(
            NotificationType,
            values_callable=enum_values,
            native_enum=False,
            name="notification_type",
        ),
        default=NotificationType.INFO,
    )
    isRead: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

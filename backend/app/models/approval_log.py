"""Audit log for approval and rejection actions."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SqlEnum, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import RegistrationStatus
from app.models.helpers import enum_values, utcnow


class ApprovalLog(Base):
    """Record of an admin approval or rejection action."""

    __tablename__ = "approval_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    registrationRequestId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    adminId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    action: Mapped[RegistrationStatus] = mapped_column(
        SqlEnum(
            RegistrationStatus,
            values_callable=enum_values,
            native_enum=False,
            name="approval_action",
        ),
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
"""Server-side record of a valid refresh token (enables revocation)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SqlEnum, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import RefreshTokenStatus
from app.models.helpers import enum_values, utcnow


class RefreshToken(Base):
    """Tracks a refresh token session so it can be rotated and revoked."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    jti: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    userId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    status: Mapped[RefreshTokenStatus] = mapped_column(
        SqlEnum(
            RefreshTokenStatus,
            values_callable=enum_values,
            native_enum=False,
            name="refresh_token_status",
        ),
        default=RefreshTokenStatus.ACTIVE,
    )
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    userAgent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revokedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

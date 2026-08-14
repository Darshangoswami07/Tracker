"""One-time password reset tokens (stored hashed for security)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.helpers import utcnow


class PasswordReset(Base):
    """A one-time password reset token, stored as a hash.

    Only the SHA-256 digest of the reset token is persisted, so a database
    leak cannot be used to reset another user's password.
    """

    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tokenHash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    userId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    usedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

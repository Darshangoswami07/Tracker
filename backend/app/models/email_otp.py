"""One-time password tokens for email verification (approval, password reset, etc.)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import OTPIntent
from app.models.helpers import enum_values, utcnow


class EmailOTP(Base):
    """A one-time password for email-based verification flows.

    Only the SHA-256 digest of the OTP is persisted. The plain OTP is never stored.
    """

    __tablename__ = "email_otps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    otpHash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    userId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    intent: Mapped[OTPIntent] = mapped_column(
        SqlEnum(OTPIntent, values_callable=enum_values, native_enum=False, name="otp_intent"),
    )
    attempts: Mapped[int] = mapped_column(default=0)
    maxAttempts: Mapped[int] = mapped_column(default=5)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    usedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdBy: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
"""Registration request for new user accounts requiring admin approval."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import RegistrationStatus, UserRole
from app.models.helpers import enum_values, utcnow


class RegistrationRequest(Base):
    """A user registration request awaiting admin approval."""

    __tablename__ = "registration_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    firstName: Mapped[str] = mapped_column(String(60))
    lastName: Mapped[str] = mapped_column(String(60))
    companyName: Mapped[str] = mapped_column(String(160))
    companyId: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("companies.id"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(16), index=True)
    passwordHash: Mapped[str] = mapped_column(String(60))
    requestedRole: Mapped[UserRole] = mapped_column(
        SqlEnum(
            UserRole,
            values_callable=enum_values,
            native_enum=False,
            name="user_role",
            length=30,
        ),
        default=UserRole.EMPLOYEE,
    )
    status: Mapped[RegistrationStatus] = mapped_column(
        SqlEnum(
            RegistrationStatus,
            values_callable=enum_values,
            native_enum=False,
            name="registration_status",
            length=30,
        ),
        default=RegistrationStatus.PENDING,
        index=True,
    )
    isVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    isApproved: Mapped[bool] = mapped_column(Boolean, default=False)
    isActive: Mapped[bool] = mapped_column(Boolean, default=False)
    otpVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    rejectedBy: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    rejectedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejectionReason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approvedBy: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    approvedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
    )
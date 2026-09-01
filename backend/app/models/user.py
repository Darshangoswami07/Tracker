"""User row in the ``users`` table."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import RegistrationStatus, UserRole
from app.models.helpers import enum_values, utcnow


class User(Base):
    """A registered user of the transport management system."""

    __tablename__ = "users"
    # One account per (email, role) — created in migration 008. Declared here
    # (inside the class — it was previously a stray module-level name that
    # SQLAlchemy never saw, which made `alembic check` want to drop it).
    __table_args__ = (
        UniqueConstraint("email", "role", name="uq_email_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    firstName: Mapped[str] = mapped_column(String(60))
    lastName: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(320), index=True)
    phone: Mapped[str] = mapped_column(String(16), index=True)
    passwordHash: Mapped[str] = mapped_column(String(60))
    role: Mapped[UserRole] = mapped_column(
        SqlEnum(
            UserRole,
            values_callable=enum_values,
            native_enum=False,
            name="user_role",
            length=30,
        ),
        default=UserRole.EMPLOYEE,
    )
    # The user's tenant/company. NULL for platform-level roles (ADMIN,
    # SUPER_ADMIN); required in practice for company-scoped roles (Company
    # Admin/BUSINESS_OWNER, Staff/EMPLOYEE, DRIVER) — enforced at creation
    # time, not by a DB constraint, so existing rows stay valid as NULL.
    companyId: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id"), nullable=True, index=True
    )
    profileImage: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Assigned operational area for staff users. Null for admin/owner roles.
    area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[RegistrationStatus] = mapped_column(
        SqlEnum(
            RegistrationStatus,
            values_callable=enum_values,
            native_enum=False,
            name="user_status",
        ),
        default=RegistrationStatus.PENDING,
        index=True,
    )
    isVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    isApproved: Mapped[bool] = mapped_column(Boolean, default=False)
    isActive: Mapped[bool] = mapped_column(Boolean, default=False)
    otpVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
    )

    @property
    def fullName(self) -> str:
        """Return the user's full name."""
        parts = [self.firstName, self.lastName]
        return " ".join(p for p in parts if p)

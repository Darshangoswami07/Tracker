"""License bound to a registered device (centralized control data).

Like :class:`app.models.device.Device`, licenses live on the Neon control
plane. A license ties an activation to a specific device and can be revoked or
allowed to expire independently of the user account.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import LicenseStatus
from app.models.helpers import enum_values, utcnow


class License(Base):
    """An activation license granted to a registered device.

    ``licenseKey`` is generated server-side and stored hashed (SHA-256) so a
    database leak never exposes raw license keys.
    """

    __tablename__ = "licenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The platform user (admin) who owns this license.
    userId: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True
    )
    # The device the license is bound to.
    deviceId: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id"), nullable=True, index=True
    )
    licenseKeyHash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[LicenseStatus] = mapped_column(
        SqlEnum(
            LicenseStatus,
            values_callable=enum_values,
            native_enum=False,
            name="license_status",
        ),
        default=LicenseStatus.ACTIVE,
        index=True,
    )
    issuedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expiresAt: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
    )
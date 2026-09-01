"""Registered mobile device bound to a platform user (centralized control data).

Neon is the single source of truth for all data. Devices are part of the
control plane: Neon records which physical device is allowed to run the app
and the license bound to it.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import DevicePlatform, DeviceStatus
from app.models.helpers import enum_values, utcnow


class Device(Base):
    """A registered device authorized to run the DeliveryHub mobile app.

    A device is bound to the admin user who activated it (``userId``). The
    physical device reports its unique ``deviceId`` at registration and keeps
    a heartbeat so Neon can track ``lastSeenAt`` and revoke access remotely.
    """

    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The platform user (admin) who owns this device.
    userId: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True
    )
    # Unique identifier the app generates once per installation.
    deviceId: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    deviceName: Mapped[str] = mapped_column(String(120))
    platform: Mapped[DevicePlatform] = mapped_column(
        SqlEnum(
            DevicePlatform,
            values_callable=enum_values,
            native_enum=False,
            name="device_platform",
        ),
        default=DevicePlatform.ANDROID,
    )
    appVersion: Mapped[str | None] = mapped_column(String(32), nullable=True)
    osVersion: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pushToken: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[DeviceStatus] = mapped_column(
        SqlEnum(
            DeviceStatus,
            values_callable=enum_values,
            native_enum=False,
            name="device_status",
        ),
        default=DeviceStatus.ACTIVE,
        index=True,
    )
    lastSeenAt: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    activatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
    )
"""Driver entity with personal and professional details.

Drivers are associated with one company and can be assigned vehicles.
They have documents, status, and performance metrics.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.company import Company
from app.models.enums import DriverDocumentKind, DriverDocumentStatus, DriverStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Driver(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "drivers"

    userId: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    companyId: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    licenseNumber: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    licenseExpiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rating: Mapped[float] = mapped_column(default=5.0)
    totalDeliveries: Mapped[int] = mapped_column(default=0)
    status: Mapped[DriverStatus] = mapped_column(
        enum_column(DriverStatus, "driver_status"), default=DriverStatus.OFFLINE
    )
    currentLocation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)

    company: Mapped["Company"] = relationship(back_populates="drivers", lazy="selectin")
    documents: Mapped[list["DriverDocument"]] = relationship(back_populates="driver", lazy="selectin")
    assignments: Mapped[list["VehicleAssignment"]] = relationship(back_populates="driver", lazy="selectin")
    orders: Mapped[list["Order"]] = relationship(back_populates="driver", lazy="selectin")  # noqa: F821

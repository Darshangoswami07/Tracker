"""Vehicle entity.

Vehicles belong to a company and can be assigned to drivers.
They have status, type, and assignment tracking.
"""
from __future__ import annotations

import uuid
from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.company import Company
from app.models.enums import VehicleStatus, VehicleType
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


class Vehicle(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "vehicles"

    companyId: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    vehicleType: Mapped[VehicleType] = mapped_column(
        enum_column(VehicleType, "vehicle_type"), default=VehicleType.TRUCK
    )
    make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    year: Mapped[int | None] = mapped_column(nullable=True)
    licensePlate: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    vin: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    capacity: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[VehicleStatus] = mapped_column(
        enum_column(VehicleStatus, "vehicle_status"), default=VehicleStatus.AVAILABLE
    )
    lastMaintenance: Mapped[str | None] = mapped_column(String(500), nullable=True)
    nextMaintenance: Mapped[str | None] = mapped_column(String(500), nullable=True)
    images: Mapped[list["VehicleImage"]] = relationship(back_populates="vehicle", lazy="selectin")
    assignments: Mapped[list["VehicleAssignment"]] = relationship(back_populates="vehicle", lazy="selectin")

    company: Mapped["Company"] = relationship(back_populates="vehicles", lazy="selectin")
    orders: Mapped[list["Order"]] = relationship(back_populates="vehicle", lazy="selectin")  # noqa: F821

"""Vehicle assignment to drivers."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VehicleAssignment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vehicle_assignments"

    vehicleId: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id"), index=True)
    driverId: Mapped[uuid.UUID] = mapped_column(ForeignKey("drivers.id"), index=True)
    assignedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    unassignedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="assignments", lazy="selectin")
    driver: Mapped["Driver"] = relationship(back_populates="assignments", lazy="selectin")
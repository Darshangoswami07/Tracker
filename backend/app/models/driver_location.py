"""Real-time driver location pings used for tracking."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.helpers import utcnow


class DriverLocation(Base):
    """A single GPS sample reported by a driver."""

    __tablename__ = "driver_locations"
    __table_args__ = (
        # Lookups always filter by driver and sort by recency.
        Index("ix_driver_locations_driver_timestamp", "driverId", "timestamp"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    driverId: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

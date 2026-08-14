"""Vehicle image model."""
from __future__ import annotations

import uuid

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class VehicleImage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vehicle_images"

    vehicleId: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id"), index=True)
    imageUrl: Mapped[str] = mapped_column(String(500))
    caption: Mapped[str | None] = mapped_column(String(200), nullable=True)
    isPrimary: Mapped[bool] = mapped_column(default=False)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="images", lazy="selectin")
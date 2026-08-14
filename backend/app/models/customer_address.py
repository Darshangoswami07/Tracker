"""Customer address model."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class CustomerAddress(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "customer_addresses"

    customerId: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    label: Mapped[str] = mapped_column(String(50))
    address: Mapped[str] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(2), default="IN")
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    isDefault: Mapped[bool] = mapped_column(Boolean, default=False)

    customer: Mapped["Customer"] = relationship(back_populates="addresses", lazy="selectin")
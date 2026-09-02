"""Shop (consignor) master entity.

A Shop represents a consignor business — master data, independent of any
individual GR/shipment. GRs (``Order`` rows) reference a Shop via
``Order.shopId``; deleting a GR (soft-delete) never touches this table, and
a Shop with zero GRs is still a valid, listable record (see
``GET /admin/orders/shops/counts``).
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Shop(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "shops"
    __table_args__ = (
        UniqueConstraint("companyId", "area", "name", name="uq_shops_company_area_name"),
    )

    companyId: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    # Mirrors Order.area — the fixed region name ("Bageshwar", "Almora",
    # "Garur Someshwar") or None for area-less (Admin-created) GRs.
    area: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    # Mirrors Order.consignorName — the shop/consignor's display name.
    name: Mapped[str] = mapped_column(String(160), index=True)

    orders: Mapped[list["Order"]] = relationship(back_populates="shop", lazy="noload")

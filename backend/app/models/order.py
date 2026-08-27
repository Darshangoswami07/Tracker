"""Order entity - the heart of the logistics platform."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Float, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.company import Company
from app.models.customer import Customer
from app.models.driver import Driver
from app.models.employee import Employee
from app.models.enums import OrderPriority, OrderStatus
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from app.models.sql_enum import enum_column
from app.models.vehicle import Vehicle


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Order(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "orders"

    # `orderNumber` doubles as the GR (goods receipt / transport slip) number
    # for the GR/shipment tracking feature - one order, one GR, no separate table.
    orderNumber: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    companyId: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    # Nullable: a GR created directly by Admin/Staff for a walk-in consignor/
    # consignee does not always have a registered Customer account.
    customerId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id"), nullable=True, index=True)
    driverId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("drivers.id"), nullable=True, index=True)
    vehicleId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True, index=True)
    assignedStaffId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)

    # Area assignment for staff-based access control. Stores the area name
    # (e.g. "Bageshwar", "Almora", "Garur Someshwar") to scope staff
    # access to GRs from their assigned region.
    area: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # GR-specific fields (transport slip: consignor/consignee, particulars).
    consignorName: Mapped[str | None] = mapped_column(String(160), nullable=True)
    consigneeName: Mapped[str | None] = mapped_column(String(160), nullable=True)
    particulars: Mapped[str | None] = mapped_column(String(500), nullable=True)
    packageCount: Mapped[int | None] = mapped_column(nullable=True)

    # Extended GR/slip fields - structured business information read off a
    # transport slip that goes beyond the original 10-field GR form. All
    # nullable/optional: a GR can always be created without them (manual
    # entry), and OCR only ever fills in what it can confidently read.
    grDate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transportCompanyName: Mapped[str | None] = mapped_column(String(160), nullable=True)
    transportGstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ewbNumber: Mapped[str | None] = mapped_column(String(50), nullable=True)
    billType: Mapped[str | None] = mapped_column(String(30), nullable=True)
    specialService: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fromLocation: Mapped[str | None] = mapped_column(String(160), nullable=True)
    toLocation: Mapped[str | None] = mapped_column(String(160), nullable=True)
    deliveryAt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    goodsValue: Mapped[float | None] = mapped_column(Float, nullable=True)
    grCharge: Mapped[float | None] = mapped_column(Float, nullable=True)
    freight: Mapped[float | None] = mapped_column(Float, nullable=True)
    labour: Mapped[float | None] = mapped_column(Float, nullable=True)
    pf: Mapped[float | None] = mapped_column(Float, nullable=True)
    doorDelivery: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxGst: Mapped[float | None] = mapped_column(Float, nullable=True)
    netAmount: Mapped[float | None] = mapped_column(Float, nullable=True)
    toPay: Mapped[float | None] = mapped_column(Float, nullable=True)
    proprietorName: Mapped[str | None] = mapped_column(String(160), nullable=True)
    proprietorPhone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    packageType: Mapped[str | None] = mapped_column(String(80), nullable=True)
    consignorGstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consignorPhone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consigneeGstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consigneePhone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    pickupAddress: Mapped[str] = mapped_column(String(500))
    deliveryAddress: Mapped[str] = mapped_column(String(500))
    pickupTime: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deliveryTime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    distance: Mapped[float] = mapped_column(Float, default=0.0)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    dimensions: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[OrderPriority] = mapped_column(
        enum_column(OrderPriority, "order_priority"), default=OrderPriority.NORMAL
    )
    status: Mapped[OrderStatus] = mapped_column(
        enum_column(OrderStatus, "order_status"), default=OrderStatus.PENDING
    )

    currentLocation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proofOfDeliveryUrl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paymentStatus: Mapped[str | None] = mapped_column(String(50), nullable=True)
    paymentAmount: Mapped[Decimal | None] = mapped_column(nullable=True)

    isActive: Mapped[bool] = mapped_column(Boolean, default=True)
    trackingCode: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="orders", lazy="selectin")
    customer: Mapped["Customer | None"] = relationship(back_populates="orders", lazy="selectin")
    driver: Mapped["Driver | None"] = relationship(back_populates="orders", lazy="selectin")
    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="orders", lazy="selectin")
    assignedStaff: Mapped["Employee | None"] = relationship(lazy="selectin")
    statusHistory: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order", lazy="selectin"
    )
    attachments: Mapped[list["OrderAttachment"]] = relationship(
        back_populates="order", lazy="selectin", order_by="desc(OrderAttachment.createdAt)"
    )


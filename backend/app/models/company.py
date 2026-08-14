"""Company (business) entity."""
from __future__ import annotations

from sqlalchemy import Boolean, Index, String, column, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import CompanyStatus
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


class Company(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "companies"
    __table_args__ = (
        # Case/whitespace-insensitive uniqueness for non-deleted companies —
        # the registration flow find-or-creates a company by normalized name.
        Index(
            "uq_companies_name_lower",
            func.lower(column("name")),
            unique=True,
            postgresql_where=text('"deletedAt" IS NULL'),
        ),
    )

    name: Mapped[str] = mapped_column(String(160), index=True)
    legalName: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(400), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(2), default="IN")
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    logoFileId: Mapped[str | None] = mapped_column(String(36), nullable=True)
    website: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[CompanyStatus] = mapped_column(
        enum_column(CompanyStatus, "company_status"), default=CompanyStatus.ACTIVE
    )
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)

    employees: Mapped[list["Employee"]] = relationship(back_populates="company", lazy="selectin")  # noqa: F821
    drivers: Mapped[list["Driver"]] = relationship(back_populates="company", lazy="selectin")  # noqa: F821
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="company", lazy="selectin")  # noqa: F821
    orders: Mapped[list["Order"]] = relationship(back_populates="company", lazy="selectin")  # noqa: F821

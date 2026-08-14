"""Business employee (staff) management.

Employees belong to a company and have a role within that company.
They can be owners, managers, dispatchers, or staff members.
"""
from __future__ import annotations

import uuid
from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.company import Company
from app.models.enums import EmployeeRole
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


class Employee(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "employees"

    userId: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    companyId: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), index=True)
    role: Mapped[EmployeeRole] = mapped_column(
        enum_column(EmployeeRole, "employee_role"), default=EmployeeRole.STAFF
    )
    salary: Mapped[float | None] = mapped_column(nullable=True)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)

    company: Mapped["Company"] = relationship(back_populates="employees", lazy="selectin")

"""User public schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import UserRole, RegistrationStatus


class UserOut(BaseModel):
    """Public user profile returned by the API. Never exposes password hashes."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    fullName: str
    email: str
    phone: str
    role: UserRole
    companyId: str | None = None
    profileImage: str | None
    isActive: bool
    # Operational area (Staff/employee accounts) — see `app/utils/areas.py`.
    # Null for admin/owner roles and accounts registered before areas existed.
    area: str | None = None
    status: RegistrationStatus
    createdAt: datetime
    updatedAt: datetime

    @field_validator("id", "companyId", mode="before")
    @classmethod
    def id_to_str(cls, value: object) -> str | None:
        return str(value) if value is not None else None
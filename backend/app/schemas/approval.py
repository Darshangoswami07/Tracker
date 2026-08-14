"""Approval system request/response schemas with validation."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from uuid import UUID

from app.models.enums import RegistrationStatus, UserRole
from app.schemas.common import Paginated
from app.schemas.user import UserOut
from app.utils.company import normalize_company_name


# --- Registration Request Schemas ---

class RegistrationRequestCreate(BaseModel):
    """Schema for creating a new registration request.

    Company selection is role-dependent:
    - ``admin``: ``companyName`` is required (free text). ``companyId`` is
      ignored — the backend creates/finds the company and links it.
    - ``employee`` / ``driver``: ``companyId`` is required (picked from the
      public companies list). ``companyName`` is ignored.
    """
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=72)
    requestedRole: Literal["employee", "driver", "admin"] = "employee"
    companyName: Optional[str] = Field(default=None, max_length=160)
    companyId: Optional[UUID] = None

    @field_validator("firstName", "lastName")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("companyName", mode="before")
    @classmethod
    def clean_company_name(cls, value):
        if value is None:
            return None
        value = normalize_company_name(str(value))
        return value or None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        value = value.strip()
        digits = [ch for ch in value if ch.isdigit() or ch == "+"]
        normalized = "".join(digits)
        if not normalized.lstrip("+").isdigit():
            raise ValueError("Phone must contain only digits and an optional leading +")
        if not 10 <= len(normalized.lstrip("+")) <= 15:
            raise ValueError("Phone number must be between 10 and 15 digits")
        return normalized

    @model_validator(mode="after")
    def validate_company_fields(self) -> "RegistrationRequestCreate":
        if self.requestedRole == "admin":
            if not self.companyName:
                raise ValueError("Company name is required for admin registration")
            self.companyId = None
        else:
            if not self.companyId:
                raise ValueError("Please select a company")
            self.companyName = None
        return self


class RegistrationRequestOut(BaseModel):
    """Schema for returning registration request data."""
    id: UUID
    firstName: str
    lastName: str
    companyName: str
    companyId: UUID | None = None
    email: str
    phone: str
    requestedRole: UserRole
    status: RegistrationStatus
    isVerified: bool
    isApproved: bool
    isActive: bool
    otpVerified: bool
    rejectionReason: str | None = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class RegistrationRequestCreateResponse(BaseModel):
    """Response schema for registration request creation with status info."""
    status: str  # "pending", "awaiting_otp", "already_registered"
    registration_id: UUID
    message: str
    request: Optional[RegistrationRequestOut] = None

    class Config:
        from_attributes = True


class RegistrationRequestListOut(BaseModel):
    """Schema for paginated list of registration requests."""
    items: list[RegistrationRequestOut]
    total: int
    page: int
    pageSize: int
    pages: int


# --- Admin Approval/Rejection Schemas ---

class ApproveRequest(BaseModel):
    """Schema for approving a registration request."""
    pass


class RejectRequest(BaseModel):
    """Schema for rejecting a registration request."""
    reason: str = Field(min_length=1, max_length=500)


class ApprovalLogOut(BaseModel):
    """Schema for approval log entry."""
    id: UUID
    registrationRequestId: UUID
    adminId: UUID
    action: RegistrationStatus
    reason: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class ApprovalLogListOut(BaseModel):
    """Schema for paginated list of approval logs."""
    items: list[ApprovalLogOut]
    total: int
    page: int
    pageSize: int
    pages: int


# --- OTP Verification Schemas ---

class OTPVerifyRequest(BaseModel):
    """Schema for OTP verification."""
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class OTPVerifyResponse(BaseModel):
    """Response after successful OTP verification."""
    user: UserOut
    tokens: "AuthResponse"


class ResendOTPRequest(BaseModel):
    """Schema for resending OTP."""
    pass


# --- Password Reset with OTP ---

class ForgotPasswordOTPRequest(BaseModel):
    """Request password reset OTP."""
    email: EmailStr


class ResetPasswordOTPRequest(BaseModel):
    """Reset password with OTP."""
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=72)


# --- Admin User Management ---

class AdminUserOut(BaseModel):
    """User schema for admin views."""
    id: UUID
    firstName: str
    lastName: str
    email: str
    phone: str
    role: UserRole
    companyId: UUID | None = None
    status: RegistrationStatus
    isVerified: bool
    isApproved: bool
    isActive: bool
    otpVerified: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class AdminUserListOut(Paginated[AdminUserOut]):
    """Paginated list of users for admin."""
    pass


class CreateAdminRequest(BaseModel):
    """Create an ADMIN account (SUPER_ADMIN only)."""
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("firstName", "lastName")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        value = value.strip()
        digits = [ch for ch in value if ch.isdigit() or ch == "+"]
        normalized = "".join(digits)
        if not normalized.lstrip("+").isdigit():
            raise ValueError("Phone must contain only digits and an optional leading +")
        if not 10 <= len(normalized.lstrip("+")) <= 15:
            raise ValueError("Phone number must be between 10 and 15 digits")
        return normalized


class CreateCompanyUserRequest(BaseModel):
    """Create a Staff or Driver account under a company.

    ``companyId`` is accepted for Super Admin bootstrap use only — a Company
    Admin caller always gets the account created under their own company
    regardless of what (if anything) is sent here; see
    ``UserService.create_company_user``.
    """
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=72)
    companyId: Optional[UUID] = None
    licenseNumber: Optional[str] = Field(default=None, max_length=60)

    @field_validator("firstName", "lastName")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip()

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        value = value.strip()
        digits = [ch for ch in value if ch.isdigit() or ch == "+"]
        normalized = "".join(digits)
        if not normalized.lstrip("+").isdigit():
            raise ValueError("Phone must contain only digits and an optional leading +")
        if not 10 <= len(normalized.lstrip("+")) <= 15:
            raise ValueError("Phone number must be between 10 and 15 digits")
        return normalized


class UpdateUserStatusRequest(BaseModel):
    """Request to update user status."""
    status: RegistrationStatus
    reason: Optional[str] = None


# --- Audit Log Schemas ---

class AuditLogOut(BaseModel):
    """Schema for audit log entry."""
    id: UUID
    userId: Optional[UUID] = None
    adminId: Optional[UUID] = None
    action: str
    entityType: Optional[str] = None
    entityId: Optional[UUID] = None
    oldValues: Optional[str] = None
    newValues: Optional[str] = None
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class AuditLogListOut(Paginated[AuditLogOut]):
    """Paginated list of audit logs."""
    pass


# Forward reference for AuthResponse
from app.schemas.auth import AuthResponse
OTPVerifyResponse.model_rebuild()
"""Authentication request/response schemas with validation."""
from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.enums import UserRole
from app.schemas.user import UserOut

PASSWORD_MIN = 8
PASSWORD_MAX = 72  # bcrypt ignores bytes beyond 72.


class RegisterRequest(BaseModel):
    fullName: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    requestedRole: Literal["employee", "driver", "admin"] = "employee"
    # Company selection is role-dependent (see validate_company_fields):
    # admin supplies ``companyName`` (free text); staff/driver supply
    # ``companyId`` picked from the public companies list.
    companyName: Optional[str] = Field(default=None, max_length=160)
    companyId: Optional[UUID] = None

    @field_validator("fullName")
    @classmethod
    def full_name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Full name cannot be blank")
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
    def validate_company_fields(self) -> "RegisterRequest":
        if self.requestedRole == "admin":
            if not self.companyName:
                raise ValueError("Company name is required for admin registration")
            self.companyId = None
        else:
            if not self.companyId:
                raise ValueError("Please select a company")
            self.companyName = None
        return self


class CustomerRegisterRequest(BaseModel):
    """Self-service signup for end-user customer accounts.

    Customers are platform users, NOT members of any company: they create a
    personal account (active immediately, no admin approval, no company) so
    they can track parcels and manage their own orders.
    """
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    role: UserRole | None = None


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)


class TokenPairOut(BaseModel):
    accessToken: str
    refreshToken: str
    expiresIn: int
    tokenType: str = "Bearer"


class AuthResponse(BaseModel):
    """Payload returned by login/register/refresh."""

    user: UserOut
    tokens: TokenPairOut


class ResumeRegistrationResponse(BaseModel):
    """Response for resumable registration flow."""

    flow: str
    status: str
    registration_id: str
    email: str | None = None
    message: str

    class Config:
        from_attributes = True


class LoginFlowResponse(BaseModel):
    """Response when registration is completed - user should login."""

    flow: str = "login"
    message: str

    class Config:
        from_attributes = True
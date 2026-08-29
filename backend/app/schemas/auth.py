"""Authentication request/response schemas with validation."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.enums import UserRole
from app.schemas.user import UserOut
from app.utils.company import normalize_company_name

PASSWORD_MIN = 8
PASSWORD_MAX = 72  # bcrypt ignores bytes beyond 72.


class RegisterRequest(BaseModel):
    fullName: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=13, max_length=13)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    requestedRole: Literal["admin"] = "admin"
    # Admin registrations supply a free-text company name; the backend
    # creates/finds the company and links it.
    companyName: Optional[str] = Field(default=None, max_length=160)

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
        from app.utils.phone import validate_indian_phone

        return validate_indian_phone(value)

    @model_validator(mode="after")
    def validate_company_fields(self) -> "RegisterRequest":
        if not self.companyName:
            raise ValueError("Company name is required for admin registration")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    role: UserRole | None = None


class StaffRegisterRequest(BaseModel):
    """Self-service Staff signup — no company, no OTP/email approval."""

    fullName: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=13, max_length=13)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    # Required — every Staff account is permanently tied to one of the fixed
    # operational areas at signup (see `app/utils/areas.py`), the same areas
    # used by the "All Shops" GR feature. Normalized so casing/spacing
    # differences in what the client sends never create near-duplicate areas.
    area: str = Field(min_length=1, max_length=100)

    @field_validator("fullName")
    @classmethod
    def full_name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Full name cannot be blank")
        return value.strip()

    @field_validator("area")
    @classmethod
    def area_must_be_known(cls, value: str) -> str:
        from app.utils.areas import normalize_area

        normalized = normalize_area(value)
        if not normalized:
            raise ValueError("Location must be one of the operational areas.")
        return normalized

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        from app.utils.phone import validate_indian_phone

        return validate_indian_phone(value)


class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


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
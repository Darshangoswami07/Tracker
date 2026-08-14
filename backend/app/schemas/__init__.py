"""Schemas package exports."""

from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RegisterRequest,
    ResetPasswordRequest,
    RefreshRequest,
    TokenPairOut,
)
from app.schemas.common import (
    MessageOut,
    Paginated,
    StandardErrorResponse,
    StandardResponse,
)
from app.schemas.approval import (
    AdminUserListOut,
    AdminUserOut,
    ApprovalLogListOut,
    ApprovalLogOut,
    ApproveRequest,
    AuditLogListOut,
    AuditLogOut,
    ForgotPasswordOTPRequest,
    OTPVerifyRequest,
    OTPVerifyResponse,
    RejectRequest,
    RegistrationRequestCreate,
    RegistrationRequestListOut,
    RegistrationRequestOut,
    ResendOTPRequest,
    ResetPasswordOTPRequest,
    UpdateUserStatusRequest,
)

from app.schemas.user import UserOut

__all__ = [
    # Auth
    "AuthResponse",
    "ForgotPasswordRequest",
    "LoginRequest",
    "LogoutRequest",
    "RegisterRequest",
    "ResetPasswordRequest",
    "RefreshRequest",
    "TokenPairOut",
    # Common
    "MessageOut",
    "Paginated",
    "StandardErrorResponse",
    "StandardResponse",
    # Approval
    "RegistrationRequestCreate",
    "RegistrationRequestOut",
    "RegistrationRequestListOut",
    "ApproveRequest",
    "RejectRequest",
    "ApprovalLogOut",
    "ApprovalLogListOut",
    "OTPVerifyRequest",
    "OTPVerifyResponse",
    "ResendOTPRequest",
    "ForgotPasswordOTPRequest",
    "ResetPasswordOTPRequest",
    "AdminUserOut",
    "AdminUserListOut",
    "UpdateUserStatusRequest",
    "AuditLogOut",
    "AuditLogListOut",
    # User
    "UserOut",
]
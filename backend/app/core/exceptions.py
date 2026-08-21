"""Application-level exceptions carrying an HTTP status and error code.

These are translated into the consistent API error envelope by the global
exception handlers registered in ``main.py``.
"""
from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for all controllable API errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        self.message = message or self.default_message
        self.details = details
        super().__init__(self.message)


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "invalid_credentials"
    default_message = "Invalid email or password."


class WrongPortalError(AppError):
    status_code = 403
    code = "wrong_portal"
    default_message = "This account is registered under a different portal."


class UserNotFoundError(AppError):
    status_code = 404
    code = "user_not_found"
    default_message = "No account found with this email address."


class UserInactiveError(AppError):
    status_code = 403
    code = "user_inactive"
    default_message = "This account has been deactivated."


class EmailAlreadyRegisteredError(AppError):
    status_code = 409
    code = "email_already_registered"
    default_message = "An account already exists with this email address."

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, details)


class PhoneAlreadyRegisteredError(AppError):
    status_code = 409
    code = "phone_already_registered"
    default_message = "An account already exists with this phone number."

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, details)


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    default_message = "Authentication is required."


class TokenExpiredError(AppError):
    status_code = 401
    code = "token_expired"
    default_message = "The provided token has expired."


class TokenInvalidError(AppError):
    status_code = 401
    code = "token_invalid"
    default_message = "The provided token is invalid."


class ResetTokenInvalidError(AppError):
    status_code = 400
    code = "reset_token_invalid"
    default_message = "The password reset token is invalid or has expired."


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"
    default_message = "Too many requests. Please try again later."


class ValidationBusinessError(AppError):
    status_code = 422
    code = "validation_error"
    default_message = "The provided data is invalid."


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
    default_message = "You do not have permission to perform this action."


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    default_message = "The requested resource was not found."


class BusinessNotFoundError(AppError):
    status_code = 404
    code = "business_not_found"
    default_message = "No business found with this id."


class OrderNotFoundError(AppError):
    status_code = 404
    code = "order_not_found"
    default_message = "No order found with this id."


class DriverNotFoundError(AppError):
    status_code = 404
    code = "driver_not_found"
    default_message = "No driver found with this id."


class VehicleNotFoundError(AppError):
    status_code = 404
    code = "vehicle_not_found"
    default_message = "No vehicle found with this id."


class NotificationNotFoundError(AppError):
    status_code = 404
    code = "notification_not_found"
    default_message = "No notification found with this id."


class InvalidOrderStatusError(AppError):
    status_code = 409
    code = "invalid_order_status"
    default_message = "The order cannot transition to the requested status."


class OrderAlreadyAssignedError(AppError):
    status_code = 409
    code = "order_already_assigned"
    default_message = "The order already has an assigned driver."


class InvalidLocationError(AppError):
    status_code = 422
    code = "invalid_location"
    default_message = "The provided coordinates are invalid."


class UserNotApprovedError(AppError):
    status_code = 403
    code = "user_not_approved"
    default_message = "Your account has been rejected by the administrator."


class UserNotVerifiedError(AppError):
    status_code = 403
    code = "user_not_verified"
    default_message = "Your account has been approved. Please verify the OTP sent to your email."


class OTPExpiredError(AppError):
    status_code = 400
    code = "otp_expired"
    default_message = "Your verification code has expired. A new code has been sent to your email."


class OTPInvalidError(AppError):
    status_code = 400
    code = "otp_invalid"
    default_message = "The verification code you entered is incorrect. Please try again."


class OTPMaxAttemptsError(AppError):
    status_code = 400
    code = "otp_max_attempts"
    default_message = "Too many verification attempts. A new code has been sent to your email."


class OTPResendCooldownError(AppError):
    status_code = 429
    code = "otp_resend_cooldown"
    default_message = "Please wait a moment before requesting another verification code."


class EmailSendFailedError(AppError):
    status_code = 502
    code = "email_send_failed"
    default_message = "We couldn't send the verification email. Please try again."


class RegistrationStateError(AppError):
    status_code = 409
    code = "registration_state_conflict"
    default_message = "This registration request cannot be processed in its current state."


class ApprovalAlreadyCompletedError(AppError):
    status_code = 409
    code = "already_approved"
    default_message = "This registration request has already been approved."


class RegistrationRequestExistsError(AppError):
    status_code = 409
    code = "registration_request_exists"
    default_message = "A registration request with this email or phone already exists."

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, details)


class OCRServiceUnavailableError(AppError):
    status_code = 503
    code = "ocr_service_unavailable"
    default_message = "The OCR service is not configured. Ask an administrator to set OCR_SPACE_API_KEY."


class OCRServiceError(AppError):
    status_code = 502
    code = "ocr_service_error"
    default_message = "The OCR service could not process this slip."

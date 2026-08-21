"""OTP verification endpoints for users."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_agent
from app.database.db import get_db_session
from app.schemas.approval import (
    ForgotPasswordOTPRequest,
    OTPVerifyRequest,
    OTPVerifyResponse,
    ResetPasswordOTPRequest,
    ResendOTPRequest,
)
from app.schemas.auth import AuthResponse
from app.services.otp_service import otp_service
from app.services.user_service import user_service
from app.utils.responses import success

router = APIRouter(prefix="/otp", tags=["otp"])


@router.post("/verify-approval")
async def verify_approval_otp(
    request_id: str = Query(..., alias="request_id"),
    payload: OTPVerifyRequest = None,
    user_agent: str | None = Depends(get_user_agent),
) -> dict:
    """Verify approval OTP and activate user account."""
    if not payload:
        from app.core.exceptions import ValidationBusinessError
        raise ValidationBusinessError("OTP is required")

    _, user = await otp_service.verify_approval_otp(request_id, payload.otp)

    # Issue a fresh token pair so the user is signed in immediately.
    from app.services.token_service import token_service
    from app.schemas.auth import AuthResponse, UserOut
    tokens = await token_service.issue_tokens(user, user_agent=user_agent)
    auth_result = AuthResponse(user=UserOut.model_validate(user), tokens=tokens)

    return success(
        {
            "user": auth_result.user.model_dump(mode="json"),
            "tokens": auth_result.tokens.model_dump(mode="json"),
        },
        message="Account activated successfully. Welcome to DeliveryHub!",
    )


@router.post("/verify-password-reset")
async def verify_password_reset_otp(
    payload: ResetPasswordOTPRequest,
) -> dict:
    """Verify password reset OTP and allow password change."""
    _, user = await otp_service.verify_password_reset_otp(payload.email, payload.otp)

    # Update password
    from app.core.security import hash_password
    await user_service.reset_password(user, hash_password(payload.password))

    # Invalidate any existing sessions so old tokens cannot be reused
    from app.services.token_service import token_service
    await token_service.revoke_all_for_user(str(user.id))

    return success(None, message="Password reset successfully. You can now login with your new password.")


@router.post("/forgot-password")
async def request_password_reset_otp(
    payload: ForgotPasswordOTPRequest,
) -> dict:
    """Request a password reset OTP."""
    otp, otp_record = await otp_service.create_password_reset_otp(payload.email)
    if otp_record is None:
        # Don't reveal if user exists
        return success({"message": "If an active account exists with this email, an OTP has been sent."})

    return success({"message": "If an active account exists with this email, an OTP has been sent."})


@router.post("/resend-approval/{request_id}")
async def resend_approval_otp(
    request_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Resend approval OTP to the applicant's registered email.

    Generates a NEW OTP, invalidates the previous one and persists it before
    the email is dispatched through the configured provider. The send is
    awaited: if a provider is configured and delivery fails (e.g. Brevo
    quota/HTTP error or Gmail ``550 5.4.5``), the endpoint returns a real
    error instead of a fake "OTP sent" success. Re-sends within the cooldown
    window are rejected with 429 ``otp_resend_cooldown``.
    """
    from app.repositories.registration_request_repository import RegistrationRequestRepository

    request_repo = RegistrationRequestRepository(session=db)
    request = await request_repo.find_by_id(request_id)
    if not request:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Registration request not found")

    if request.status != "approved_pending_otp":
        from app.core.exceptions import RegistrationStateError
        raise RegistrationStateError("Can only resend OTP for approved requests")

    await otp_service.resend_approval_otp(
        request_id, "system", send_email=True
    )
    return success(
        {"resent": True},
        message="A new verification code has been sent to your email.",
    )


@router.post("/resend-password-reset")
async def resend_password_reset_otp(
    payload: ForgotPasswordOTPRequest,
) -> dict:
    """Resend password reset OTP."""
    otp, otp_record = await otp_service.resend_password_reset_otp(payload.email)
    if otp_record is None:
        return success({"message": "If an active account exists with this email, an OTP has been sent."})

    return success({"message": "If an active account exists with this email, an OTP has been sent."})
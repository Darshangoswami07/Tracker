"""Service for handling email OTPs."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.core.exceptions import (
    EmailSendFailedError,
    OTPExpiredError,
    OTPInvalidError,
    OTPMaxAttemptsError,
    OTPResendCooldownError,
    RegistrationStateError,
    UserInactiveError,
    UserNotFoundError,
)
from app.core.security import hash_password
from app.models.email_otp import EmailOTP
from app.models.enums import OTPIntent, RegistrationStatus
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.repositories.email_otp_repository import EmailOTPRepository
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.user_repository import UserRepository
from app.services.email_service import email_service
from app.utils.dates import utcnow

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OTPService:
    def __init__(
        self,
        otp_repo: EmailOTPRepository,
        request_repo: RegistrationRequestRepository,
        user_repo: UserRepository,
    ) -> None:
        self.otp_repo = otp_repo
        self.request_repo = request_repo
        self.user_repo = user_repo

    def _generate_otp(self) -> str:
        """Generate a 6-digit OTP."""
        return f"{secrets.randbelow(900000) + 100000:06d}"

    def _hash_otp(self, otp: str) -> str:
        """Hash the OTP using SHA-256."""
        return hashlib.sha256(otp.encode("utf-8")).hexdigest()

    async def create_admin_otp(
        self,
        request_id: str,
    ) -> tuple[str, EmailOTP]:
        """Create an OTP for admin notification (PENDING status request)."""
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            raise UserNotFoundError()

        if request.status != "pending":
            raise RegistrationStateError("This registration request is no longer awaiting admin review.")

        # Invalidate any existing admin OTPs for this request
        await self.otp_repo.invalidate_previous_otps(request_id, OTPIntent.APPROVAL)

        # Generate OTP
        otp = self._generate_otp()
        otp_hash = self._hash_otp(otp)

        # Set expiry (configurable, defaults to 5 minutes)
        expires_at = _utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        # Create OTP record
        otp_record = await self.otp_repo.create_otp(
            otp_hash=otp_hash,
            user_id=request_id,
            email=request.email,
            intent=OTPIntent.APPROVAL,
            expires_at=expires_at,
        )

        # Send OTP email to admin
        await self._send_admin_otp_email(request, otp)

        return otp, otp_record

    async def create_user_otp(
        self,
        request_id: str,
        send_email: bool = True,
    ) -> tuple[str, EmailOTP]:
        """Create an OTP for user verification (APPROVED_PENDING_OTP status request).

        ``send_email=False`` persists the OTP record without dispatching the
        email, so the caller can background the send and keep the HTTP response
        from blocking on SMTP. The plaintext ``otp`` is still returned either way.
        """
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            raise UserNotFoundError()

        if request.status != "approved_pending_otp":
            raise RegistrationStateError("This registration request must be approved before an OTP can be sent.")

        # Invalidate any existing user OTPs for this request
        await self.otp_repo.invalidate_previous_otps(request_id, OTPIntent.APPROVAL)

        # Generate OTP
        otp = self._generate_otp()
        otp_hash = self._hash_otp(otp)

        # Set expiry (configurable, defaults to 5 minutes)
        expires_at = _utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        logger.info(
            "[OTP] approval OTP generated request_id=%s intent=%s expires_at=%s",
            request_id,
            OTPIntent.APPROVAL,
            expires_at.isoformat(),
        )

        # Create OTP record
        otp_record = await self.otp_repo.create_otp(
            otp_hash=otp_hash,
            user_id=request_id,
            email=request.email,
            intent=OTPIntent.APPROVAL,
            expires_at=expires_at,
        )
        logger.info(
            "[OTP] approval OTP database record created request_id=%s otp_id=%s",
            request_id,
            otp_record.id,
        )

        # Send OTP email to user (side effect — optional so callers can
        # background the send without blocking the HTTP request).
        if send_email:
            logger.info("[OTP] sending approval OTP email recipient=%s", request.email)
            await self._send_user_otp_email(request, otp)

        return otp, otp_record

    async def is_latest_otp_expired(
        self,
        request_id: str,
        from_admin_intent: bool = False,
    ) -> bool:
        """Check if the latest OTP for a request is expired."""
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            return True

        # Find the latest OTP (not used, not expired check - we want to know if expired)
        from app.database.db import session_scope
        from sqlalchemy import select
        from uuid import UUID
        async with session_scope() as session:
            stmt = (
                select(EmailOTP)
                .where(
                    EmailOTP.userId == UUID(request_id),
                    EmailOTP.intent == OTPIntent.APPROVAL,
                    EmailOTP.used == False,
                )
                .order_by(EmailOTP.createdAt.desc())
            )
            result = await session.execute(stmt)
            otp_record = result.scalars().first()

        if not otp_record:
            return True  # No OTP exists, treat as expired

        return otp_record.expiresAt < _utcnow()

    async def create_approval_otp(
        self,
        request_id: str,
        admin_id: str,
        send_email: bool = True,
    ) -> tuple[str, EmailOTP]:
        """Create an approval OTP for a registration request (legacy - used by admin approval).

        ``send_email=False`` persists the OTP record without dispatching the
        email so the approval flow can background the send and never let SMTP
        block (or fail) the approval itself.
        """
        return await self.create_user_otp(request_id, send_email=send_email)

    async def send_user_otp_email(self, request_id: str, otp: str) -> None:
        """Best-effort background send of an already-created approval OTP email.

        Delivery failures are logged, never raised — a quota-blocked SMTP
        account must not roll back or fail an already-approved registration.
        """
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            return
        try:
            await self._send_user_otp_email(request, otp)
        except Exception as exc:  # noqa: BLE001 - background side effect
            logger.error("[OTP] Failed to send approval OTP email for request %s: %s", request_id, exc)

    async def create_password_reset_otp(
        self,
        email: str,
    ) -> tuple[str, EmailOTP]:
        """Create a password reset OTP for a user."""
        user = await self.user_repo.find_by_email(email)
        if not user:
            # Don't reveal if user exists
            return "", None

        if user.status != "active":
            raise UserInactiveError("This account is not active so we cannot send a password reset code.")

        # Invalidate any existing password reset OTPs for this user
        await self.otp_repo.invalidate_previous_otps(str(user.id), OTPIntent.PASSWORD_RESET)

        # Generate OTP
        otp = self._generate_otp()
        otp_hash = self._hash_otp(otp)

        # Set expiry (configurable, defaults to 5 minutes)
        expires_at = _utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        # Create OTP record
        otp_record = await self.otp_repo.create_otp(
            otp_hash=otp_hash,
            user_id=str(user.id),
            email=user.email,
            intent=OTPIntent.PASSWORD_RESET,
            expires_at=expires_at,
        )

        # Send OTP email to user
        await self._send_password_reset_otp_email(user.email, user.firstName, otp)

        return otp, otp_record

    async def verify_approval_otp(
        self,
        request_id: str,
        otp: str,
    ) -> tuple[bool, Optional[User]]:
        """Verify an approval OTP and create the user account on success."""
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            raise OTPInvalidError()

        if request.status != "approved_pending_otp":
            raise OTPInvalidError()

        # Find the OTP
        otp_record = await self.otp_repo.find_latest_by_user_and_intent(
            request_id, OTPIntent.APPROVAL
        )

        if not otp_record:
            # No unused, unexpired OTP exists. If a previous OTP exists but has
            # expired, surface the expired code rather than "invalid code".
            if await self.is_latest_otp_expired(request_id):
                raise OTPExpiredError()
            raise OTPInvalidError()

        # Check attempts
        if otp_record.attempts >= otp_record.maxAttempts:
            raise OTPMaxAttemptsError()

        # Check expiry
        if otp_record.expiresAt < utcnow():
            raise OTPExpiredError()

        # Verify OTP
        otp_hash = self._hash_otp(otp)
        if otp_record.otpHash != otp_hash:
            # Increment attempts
            await self.otp_repo.increment_attempts(otp_record)
            raise OTPInvalidError()

        # Mark OTP as used
        await self.otp_repo.mark_used(otp_record)

        # Create the user account from the approved registration request
        user = await self._create_user_from_request(request)

        # Mark the request completed
        await self.request_repo.activate_user(request_id)

        # Send welcome email
        await email_service.send_welcome_email(user.email, user.firstName, user.role.value)

        # Surface in-app notifications for the newly activated account
        await self._notify_account_activated(user)

        return True, user

    async def verify_password_reset_otp(
        self,
        email: str,
        otp: str,
    ) -> tuple[bool, Optional[User]]:
        """Verify a password reset OTP."""
        user = await self.user_repo.find_by_email(email)
        if not user:
            raise OTPInvalidError()

        if user.status != "active":
            raise OTPInvalidError()

        # Find the OTP
        otp_record = await self.otp_repo.find_latest_by_user_and_intent(
            str(user.id), OTPIntent.PASSWORD_RESET
        )

        if not otp_record:
            raise OTPInvalidError()

        # Check attempts
        if otp_record.attempts >= otp_record.maxAttempts:
            raise OTPMaxAttemptsError()

        # Check expiry
        if otp_record.expiresAt < utcnow():
            raise OTPExpiredError()

        # Verify OTP
        otp_hash = self._hash_otp(otp)
        if otp_record.otpHash != otp_hash:
            await self.otp_repo.increment_attempts(otp_record)
            raise OTPInvalidError()

        # Mark OTP as used
        await self.otp_repo.mark_used(otp_record)

        return True, user

    async def resend_approval_otp(
        self,
        request_id: str,
        admin_id: str,
        send_email: bool = True,
    ) -> tuple[str, EmailOTP]:
        """Resend an approval OTP (legacy - used by admin).

        Enforces a ``OTP_RESEND_COOLDOWN_SECONDS`` window against the most
        recent OTP for the request: a fresh code is only issued once the
        previous one has aged past the cooldown (HTTP 429 otherwise).

        The new OTP is generated, persisted and the previous one invalidated
        BEFORE the email is dispatched. The send is awaited: when a provider is
        configured and delivery fails, ``EmailSendFailedError`` is raised so the
        caller returns a real error instead of a fake "OTP sent" success.
        """
        await self._assert_resend_cooldown(request_id)
        otp, otp_record = await self.create_user_otp(request_id, send_email=False)
        if send_email:
            request = await self.request_repo.find_by_id(request_id)
            if request is not None:
                await self._send_resend_user_otp_email(request, otp)
        return otp, otp_record

    async def _assert_resend_cooldown(self, request_id: str) -> None:
        """Raise ``OTPResendCooldownError`` if a code was issued too recently."""
        latest = await self.otp_repo.find_most_recent_by_user_and_intent(
            request_id, OTPIntent.APPROVAL
        )
        if latest is None:
            return
        elapsed = (_utcnow() - latest.createdAt).total_seconds()
        cooldown = settings.OTP_RESEND_COOLDOWN_SECONDS
        if elapsed < cooldown:
            remaining = max(1, int(cooldown - elapsed) + 1)
            raise OTPResendCooldownError(
                message=f"Please wait {remaining}s before requesting another code."
            )

    async def resend_password_reset_otp(
        self,
        email: str,
    ) -> tuple[str, EmailOTP]:
        """Resend a password reset OTP."""
        user = await self.user_repo.find_by_email(email)
        if not user:
            return "", None

        if user.status != "active":
            raise UserInactiveError("This account is not active so we cannot send a password reset code.")

        # Invalidate previous OTP
        await self.otp_repo.invalidate_previous_otps(str(user.id), OTPIntent.PASSWORD_RESET)

        # Generate new OTP
        otp = self._generate_otp()
        otp_hash = self._hash_otp(otp)
        expires_at = _utcnow() + timedelta(minutes=10)

        otp_record = await self.otp_repo.create_otp(
            otp_hash=otp_hash,
            user_id=str(user.id),
            email=user.email,
            intent=OTPIntent.PASSWORD_RESET,
            expires_at=expires_at,
        )

        # Send OTP email
        await self._send_password_reset_otp_email(user.email, user.firstName, otp)

        return otp, otp_record

    async def _create_user_from_request(self, request: RegistrationRequest) -> User:
        """Create a user account from an approved registration request."""
        from app.services.user_service import user_service
        return await user_service.create_user_from_request(request)

    async def _notify_account_activated(self, user: User) -> None:
        """Creates real in-app notifications for a newly activated account."""
        from app.models.enums import NotificationType
        from app.repositories.notification_repository import NotificationRepository

        notification_repo = NotificationRepository()
        try:
            await notification_repo.create(
                str(user.id),
                "Registration approved",
                "Your registration request has been approved. Welcome to DeliveryHub!",
                NotificationType.INFO,
            )
            await notification_repo.create(
                str(user.id),
                "Account activated",
                "Your account is now active. You can sign in and start using DeliveryHub.",
                NotificationType.SYSTEM,
            )
        except Exception:
            logger.error(
                "[OTP] Failed to create activation notifications for user %s", user.id
            )

    async def _send_admin_otp_email(self, request: RegistrationRequest, otp: str) -> None:
        """Send admin OTP email for pending registration request."""
        sent = await email_service.send_admin_otp_notification(request, otp)
        self._raise_if_email_failed(sent)

    async def _send_user_otp_email(self, request: RegistrationRequest, otp: str) -> None:
        """Send user OTP email for approved registration request."""
        sent = await email_service.send_otp_email(request, otp)
        if sent:
            logger.info("[OTP] email send completed recipient=%s", request.email)
        else:
            logger.warning("[OTP] email send did not complete recipient=%s", request.email)
        self._raise_if_email_failed(sent)

    async def _send_resend_user_otp_email(self, request: RegistrationRequest, otp: str) -> None:
        """Send a NEW user OTP email for a resend request.

        Delivery is awaited so a configured provider that rejects the message
        surfaces a real error (never a fake "OTP sent" success).
        """
        sent = await email_service.send_resend_otp_email(request, otp)
        self._raise_if_email_failed(sent)

    async def _send_password_reset_otp_email(self, email: str, first_name: str, otp: str) -> None:
        """Send password reset OTP email to user."""
        sent = await email_service.send_password_reset_otp(email, first_name, otp)
        self._raise_if_email_failed(sent)

    def _raise_if_email_failed(self, sent: bool) -> None:
        """Surfaces a friendly error when SMTP is configured but delivery fails."""
        if not sent and email_service._is_configured():
            raise EmailSendFailedError()

    async def cleanup_expired_otps(self) -> int:
        """Clean up expired OTPs."""
        return await self.otp_repo.cleanup_expired_otps()


otp_service = OTPService(
    EmailOTPRepository(),
    RegistrationRequestRepository(),
    UserRepository(),
)
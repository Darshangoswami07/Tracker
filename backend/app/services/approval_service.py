"""Service for handling admin approval/rejection of registration requests."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.exceptions import (
    ApprovalAlreadyCompletedError,
    EmailSendFailedError,
    ForbiddenError,
    NotFoundError,
    RegistrationStateError,
    UserNotFoundError,
)

logger = logging.getLogger("app")
from app.core.rbac import is_super_admin
from app.models.enums import UserRole
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.repositories.approval_log_repository import ApprovalLogRepository
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.user_repository import UserRepository
from app.services.email_service import email_service
from app.services.otp_service import otp_service
from app.utils.dates import utcnow

logger = logging.getLogger(__name__)

# Registration-request roles a plain ADMIN (not SUPER_ADMIN) may approve/reject.
# Matches the existing admin/ web app's approvals page, which already lets
# Admin review Business Owner and Dispatcher registrations alongside Staff
# (employee) and Driver. Only `admin`/`super_admin`-role requests are
# reserved for SUPER_ADMIN, which always bypasses this check entirely.
ADMIN_APPROVABLE_ROLES = (
    UserRole.EMPLOYEE,
    UserRole.DRIVER,
    UserRole.BUSINESS,
    UserRole.BUSINESS_OWNER,
    UserRole.DISPATCHER,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _assert_can_manage_request(actor_role: UserRole | str | None, request: RegistrationRequest) -> None:
    """Raises ForbiddenError if ``actor_role`` may not approve/reject ``request``.

    SUPER_ADMIN is unrestricted. A plain ADMIN may only act on Staff
    (``employee``) or Driver (``driver``) requests; every other requested
    role (business, business_owner, admin, super_admin, ...) is out of scope
    for ADMIN and requires SUPER_ADMIN.
    """
    if actor_role is None or is_super_admin(actor_role):
        return
    if request.requestedRole not in ADMIN_APPROVABLE_ROLES:
        raise ForbiddenError(
            "You may only approve or reject Staff or Driver registration requests."
        )


class ApprovalService:
    def __init__(
        self,
        request_repo: RegistrationRequestRepository,
        user_repo: UserRepository,
        log_repo: ApprovalLogRepository,
    ) -> None:
        self.request_repo = request_repo
        self.user_repo = user_repo
        self.log_repo = log_repo

    async def approve_request(
        self,
        request_id: str,
        admin_id: str,
        actor_role: UserRole | str | None = None,
    ) -> tuple[bool, str, str | None]:
        """Approve a registration request and create an approval OTP for the user.

        ``actor_role`` is the acting admin's role; when provided, a plain
        ADMIN is restricted to Staff/Driver requests (SUPER_ADMIN is always
        unrestricted). Omitting it (``None``) skips the check, preserving
        backward compatibility for any caller that predates this scoping.

        Returns ``(success_flag, message, otp)``. The OTP record is created and
        committed first, then its activation email is sent inline via
        ``send_approval_otp_email`` using the SAME raising path as Resend OTP —
        so the user reliably receives the code without a Celery worker, and a
        genuine delivery failure surfaces an honest error instead of a fake
        success. The OTP is already persisted before the send, so a failure is
        always recoverable via Resend OTP. A duplicate approval raises
        ``ApprovalAlreadyCompletedError`` (409) instead of returning a
        validation error.
        """
        logger.info(
            "[Admin Approval Started] request_id=%s admin_id=%s", request_id, admin_id
        )
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            raise UserNotFoundError()

        _assert_can_manage_request(actor_role, request)

        if request.status != "pending":
            if request.isApproved or request.status in ("approved_pending_otp", "approved"):
                raise ApprovalAlreadyCompletedError()
            if request.status == "rejected":
                raise RegistrationStateError(
                    "This registration request has already been rejected."
                )
            return False, "Request is not in pending status", None

        # Approve the request
        approved_request = await self.request_repo.approve_request(request_id, admin_id)
        if not approved_request:
            return False, "Failed to approve request", None

        logger.info(
            "[Admin Approved] request_id=%s status=approved_pending_otp", request_id
        )

        # Create approval log
        await self.log_repo.create_log(
            registration_request_id=request_id,
            admin_id=admin_id,
            action="approved_pending_otp",
        )

        # Create the approval OTP record (persisted + committed by the time this
        # method returns; the email is dispatched afterwards so a delivery
        # failure can never roll back the approval or the OTP itself).
        otp: str | None = None
        try:
            otp, _ = await otp_service.create_approval_otp(
                request_id, admin_id, send_email=False
            )
            logger.info("[OTP Generated] request_id=%s", request_id)
            logger.info("[OTP Persisted] request_id=%s", request_id)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[OTP] Failed to create/persist approval OTP for request %s: %s",
                request_id,
                exc,
            )
            return False, "Approved, but we couldn't generate a verification code.", None

        # Send the activation OTP email inline, mirroring the resend-approval
        # flow. The send uses the SAME raising path as resend, so a real
        # delivery failure surfaces an honest error (the OTP is already
        # persisted and recoverable via Resend OTP).
        if otp:
            await self.send_approval_otp_email(request_id, otp)

        return True, "Request approved successfully.", otp

    async def send_approval_otp_email(self, request_id: str, otp: str) -> None:
        """Send the approval OTP email using the same raising path as resend.

        Raises ``EmailSendFailedError`` on delivery failure so the caller can
        return an honest error. The OTP record is already persisted before this
        is called, so a failure here never loses the code.
        """
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            logger.error(
                "[OTP Email Dispatch Failed] request_id=%s not found", request_id
            )
            raise NotFoundError()

        logger.info(
            "[OTP Email Dispatch Started] request_id=%s recipient=%s",
            request_id,
            request.email,
        )
        try:
            await otp_service._send_user_otp_email(request, otp)
        except EmailSendFailedError:
            logger.error(
                "[OTP Email Dispatch Failed] request_id=%s recipient=%s",
                request_id,
                request.email,
            )
            raise
        except Exception as exc:  # noqa: BLE001 - wrap any provider error honestly
            logger.error(
                "[OTP Email Dispatch Failed] request_id=%s recipient=%s: %s",
                request_id,
                request.email,
                exc,
            )
            raise EmailSendFailedError() from exc
        logger.info(
            "[OTP Email Dispatch Successful] request_id=%s recipient=%s",
            request_id,
            request.email,
        )

    async def reject_request(
        self,
        request_id: str,
        admin_id: str,
        reason: str,
        actor_role: UserRole | str | None = None,
    ) -> tuple[bool, str]:
        """Reject a registration request.

        See ``approve_request`` for ``actor_role`` scoping semantics.

        The rejection email is NOT sent here — the caller schedules
        ``send_rejection_email`` as a background task so SMTP can never block
        or fail the rejection response.
        """
        request = await self.request_repo.find_by_id(request_id)
        if not request:
            raise UserNotFoundError()

        _assert_can_manage_request(actor_role, request)

        if request.status != "pending":
            return False, "Request is not in pending status"

        # Reject the request
        rejected_request = await self.request_repo.reject_request(request_id, admin_id, reason)
        if not rejected_request:
            return False, "Failed to reject request"

        # Create approval log
        await self.log_repo.create_log(
            registration_request_id=request_id,
            admin_id=admin_id,
            action="rejected",
            reason=reason,
        )

        return True, "Request rejected successfully."

    async def send_rejection_email(self, request_id: str, reason: str) -> None:
        """Best-effort background send of the rejection email. Never raises."""
        try:
            request = await self.request_repo.find_by_id(request_id)
            if request:
                await email_service.send_rejection_email(request.email, request.firstName, reason)
        except Exception as exc:  # noqa: BLE001 - background side effect
            logger.error(
                "[Approval] Failed to send rejection email for request %s: %s",
                request_id,
                exc,
            )

    async def get_approval_logs(
        self,
        request_id: str,
    ) -> list:
        return await self.log_repo.find_by_registration_request(request_id)

    async def get_admin_approval_logs(
        self,
        admin_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list, int]:
        return await self.log_repo.find_by_admin(admin_id, page, page_size)


approval_service = ApprovalService(
    RegistrationRequestRepository(),
    UserRepository(),
    ApprovalLogRepository(),
)
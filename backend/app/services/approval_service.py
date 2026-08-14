"""Service for handling admin approval/rejection of registration requests."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.exceptions import (
    ApprovalAlreadyCompletedError,
    ForbiddenError,
    RegistrationStateError,
    UserNotFoundError,
)
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

        Returns ``(success_flag, message, otp)``. The OTP record is created
        WITHOUT sending its email — the caller schedules ``send_approval_otp_email``
        as a background task so SMTP can never block or fail the approval. A
        duplicate approval raises ``ApprovalAlreadyCompletedError`` (409)
        instead of returning a validation error.
        """
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

        # Create approval log
        await self.log_repo.create_log(
            registration_request_id=request_id,
            admin_id=admin_id,
            action="approved_pending_otp",
        )

        # Create the approval OTP WITHOUT emailing it. Email is a notification
        # side effect handled by the route as a background task; even if the
        # SMTP account is quota-blocked the approval itself must succeed.
        otp: str | None = None
        try:
            otp, _ = await otp_service.create_approval_otp(
                request_id, admin_id, send_email=False
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[Approval] Failed to create approval OTP for request %s: %s",
                request_id,
                exc,
            )

        return True, "Request approved successfully.", otp

    async def send_approval_otp_email(self, request_id: str, otp: str) -> None:
        """Best-effort background send of the approval OTP email. Never raises."""
        try:
            await otp_service.send_user_otp_email(request_id, otp)
        except Exception as exc:  # noqa: BLE001 - background side effect
            logger.error(
                "[Approval] Failed to send approval OTP email for request %s: %s",
                request_id,
                exc,
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
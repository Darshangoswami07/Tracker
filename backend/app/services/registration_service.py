"""Service for handling user registration requests."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyRegisteredError,
    NotFoundError,
    ValidationBusinessError,
)
from app.models.company import Company
from app.models.enums import RegistrationStatus, UserRole
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.repositories.company_repository import CompanyRepository
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.user_repository import UserRepository
from app.services.email_service import email_service
from app.services.otp_service import otp_service
from app.utils.company import normalize_company_name
from app.utils.dates import utcnow

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RegistrationResult:
    """Result of a registration attempt with flow information."""

    def __init__(
        self,
        flow: str,
        status: str,
        registration_id: str,
        email: str | None = None,
        message: str = "",
        request: RegistrationRequest | None = None,
        otp: str | None = None,
    ):
        self.flow = flow
        self.status = status
        self.registration_id = registration_id
        self.email = email
        self.message = message
        self.request = request
        # Plaintext approval OTP to email the applicant in the background
        # (only populated on the approved-resume path). Never persisted here.
        self.otp = otp


class RegistrationService:
    def __init__(
        self,
        request_repo: RegistrationRequestRepository,
        user_repo: UserRepository,
        company_repo: CompanyRepository | None = None,
    ) -> None:
        self.request_repo = request_repo
        self.user_repo = user_repo
        self.company_repo = company_repo or CompanyRepository()

    async def create_registration_request(
        self,
        first_name: str,
        last_name: str,
        company_name: str,
        email: str,
        phone: str,
        password: str,
        requested_role: UserRole = UserRole.EMPLOYEE,
        company_id: uuid.UUID | None = None,
    ) -> RegistrationResult:
        """Create or safely resume a registration request, keyed ONLY on email.

        Identity rules:
          * EMAIL is the single unique identity. It is normalised (lowercased)
            before any lookup or insert.
          * PHONE is contact data, never an identity key. Many applicants may
            use the same phone number without any conflict.

        Company resolution:
          * ADMIN -> ``company_name`` is required; the company is found (by
            normalized name) or created, and both ``company_id`` and
            ``company_name`` are stored on the request.
          * EMPLOYEE / DRIVER -> ``company_id`` is required and must reference
            an active company; ``company_name`` is populated from that company.
          * Other roles -> no company association.

        A request is considered "registered" only when the admin-approval +
        OTP-verification + account-creation chain has finished (COMPLETED with
        an active user). Any incomplete state (PENDING / APPROVED_PENDING_OTP /
        REJECTED) is resumed, never treated as a completed registration.
        """
        email = email.strip().lower()

        # CASE: COMPLETED — an account already exists for this email + role.
        # Same email + different role is allowed; same email + same role is not.
        existing_user = await self.user_repo.find_by_email(email, requested_role)
        if existing_user is not None:
            raise EmailAlreadyRegisteredError(
                message="This email is already registered as a {role}. Please sign in.".format(
                    role=requested_role.value
                ),
                details={"conflict_type": "user_email_role", "field": "email"},
            )

        company, resolved_company_name = await self._resolve_company(
            requested_role, company_name, company_id
        )
        if company is not None:
            company_id = company.id
            company_name = company.name
        else:
            company_name = normalize_company_name(company_name or "")

        from app.core.security import hash_password

        password_hash = hash_password(password)
        role_value = (
            requested_role.value if hasattr(requested_role, "value") else requested_role
        )

        existing_request = await self.request_repo.find_by_email(email)

        # CASE: never submitted OR previously REJECTED -> open a fresh PENDING
        # request. A rejected request is reusable (its email row is re-used so
        # no email uniqueness violation) but becomes PENDING again.
        if existing_request is None:
            request = await self.request_repo.create_request(
                first_name=first_name,
                last_name=last_name,
                company_name=company_name,
                email=email,
                phone=phone,
                password_hash=password_hash,
                requested_role=role_value,
                company_id=company_id,
            )
            message = (
                "New registration request submitted successfully. "
                "Awaiting admin approval."
            )
        elif existing_request.status == RegistrationStatus.REJECTED:
            request = await self.request_repo.reset_for_resubmission(
                existing_request.id,
                first_name,
                last_name,
                company_name,
                email,
                phone,
                password_hash,
                role_value,
                company_id,
            )
            message = (
                "New registration request submitted successfully. "
                "Awaiting admin approval."
            )
        else:
            # CASE: PENDING / APPROVED_PENDING_OTP / COMPLETED (no user row).
            return await self._handle_existing_request(
                existing_request,
                first_name,
                last_name,
                company_name,
                email,
                phone,
                password_hash,
                role_value,
                company_id,
            )

        # No email is sent here: notifications are scheduled as background
        # tasks by the route so SMTP can never block the registration response.
        return RegistrationResult(
            flow="pending",
            status="pending",
            registration_id=str(request.id),
            email=request.email,
            message=message,
            request=request,
        )

    async def _resolve_company(
        self,
        requested_role: UserRole,
        company_name: str | None,
        company_id: uuid.UUID | None,
    ) -> tuple[Company | None, str]:
        """Resolves the company for a registration request by role.

        Returns ``(company, company_name)``. ``company_name`` is the resolved
        display name (the existing/new company's name for admin, or the
        referenced company's name for staff/driver).
        """
        if requested_role == UserRole.ADMIN:
            if not company_name or not company_name.strip():
                raise ValidationBusinessError(
                    message="Company name is required for admin registration."
                )
            return await self._find_or_create_company(company_name), ""

        if requested_role in (UserRole.EMPLOYEE, UserRole.DRIVER):
            if company_id is None:
                raise ValidationBusinessError(message="Please select a company.")
            company = await self.company_repo.find_active_by_id(company_id)
            if company is None:
                raise NotFoundError(
                    message="The selected company is not available for registration."
                )
            return company, company.name

        return None, ""

    async def _find_or_create_company(self, raw_name: str) -> Company:
        """Finds a company by normalized name or creates it.

        The functional unique index on ``lower(companies.name)`` (for
        non-deleted rows) makes concurrent admin registrations safe: the loser
        of a create race re-fetches the winner's row instead of failing.
        """
        normalized = normalize_company_name(raw_name)
        company = await self.company_repo.find_by_normalized_name(normalized)
        if company is not None:
            return company
        try:
            return await self.company_repo.create_company(name=normalized)
        except IntegrityError:
            company = await self.company_repo.find_by_normalized_name(normalized)
            if company is None:
                raise
            return company

    async def _handle_existing_request(
        self,
        existing_request: RegistrationRequest,
        first_name: str,
        last_name: str,
        company_name: str,
        email: str,
        phone: str,
        password_hash: str,
        role_value: str,
        company_id: uuid.UUID | None = None,
    ) -> RegistrationResult:
        status = existing_request.status

        # CASE: PENDING — already under review. Never create a second request;
        # refresh the submitted info so the latest values are on file.
        if status == RegistrationStatus.PENDING:
            request = await self.request_repo.update_request_info(
                existing_request.id,
                first_name,
                last_name,
                company_name,
                email,
                phone,
                password_hash,
                role_value,
                company_id,
            )
            logger.info(
                "Registration already PENDING for %s (ID: %s); refreshed applicant info",
                email,
                existing_request.id,
            )
            return RegistrationResult(
                flow="pending",
                status="pending",
                registration_id=str(request.id),
                email=request.email,
                message="Your registration request is already under review.",
                request=request,
            )

        # CASE: APPROVED — the admin already approved. Continue OTP verification
        # on the SAME request. Reissue the applicant's OTP bound to this request
        # id + email (never by phone). The OTP email is sent in the background.
        if status == RegistrationStatus.APPROVED_PENDING_OTP:
            logger.info(
                "Registration already approved for %s (ID: %s); re-issuing applicant OTP",
                email,
                existing_request.id,
            )
            otp = await self._create_user_otp(existing_request)
            return RegistrationResult(
                flow="awaiting_otp",
                status="awaiting_otp",
                registration_id=str(existing_request.id),
                email=existing_request.email,
                message="Your application has been approved. Please verify the OTP sent to your email.",
                request=existing_request,
                otp=otp,
            )

        # CASE: COMPLETED (or any other unexpected state) — the email is taken.
        raise EmailAlreadyRegisteredError(
            message="This email is already registered. Please sign in.",
            details={"conflict_type": "user_email", "field": "email"},
        )

    async def _create_user_otp(self, request: RegistrationRequest) -> str | None:
        """Create the applicant's approval OTP record (NO email) and return the
        plaintext value so the route can background the send.

        Returns ``None`` if the OTP could not be created — the registration
        itself stays valid and is never blocked by an email failure.
        """
        try:
            otp, _otp_record = await otp_service.create_user_otp(
                str(request.id), send_email=False
            )
            return otp
        except Exception as e:
            logger.error(
                "[Registration] Failed to create user OTP for request %s: %s",
                request.id,
                e,
            )
            return None

    async def notify_admin_of_registration(self, request: RegistrationRequest) -> None:
        """Send a plain email notification (NO OTP) to the admin mailbox about a
        new/changed registration request awaiting manual approval.

        Runs as a background task after the HTTP response is sent. A failure
        (SMTP down, Gmail quota exceeded, timeout) is logged and never surfaced
        to the applicant nor rolled back from a successful registration.
        """
        admin_email = getattr(settings, "ADMIN_NOTIFICATION_EMAIL", None)
        if not admin_email:
            logger.warning(
                "[Email] ADMIN_NOTIFICATION_EMAIL not configured; skipping admin notification"
            )
            return
        try:
            await email_service.send_registration_notification_to_admin(request)
        except Exception as e:
            logger.error(
                "[Registration] Failed to notify admin of request %s: %s", request.id, e
            )
            # A notification failure must never block the registration request.

    async def send_user_otp_email(self, request: RegistrationRequest, otp: str) -> None:
        """Email the applicant's approval OTP as a background task.

        Never raises: the OTP record is already persisted, so a delivery failure
        (e.g. Gmail quota) is logged and the applicant can use the admin resend
        flow instead of blocking their registration.
        """
        try:
            await email_service.send_approval_otp(request, otp)
        except Exception as e:
            logger.error(
                "[Registration] Failed to send user OTP email for request %s: %s",
                request.id,
                e,
            )

    async def create_customer_account(
        self,
        first_name: str,
        last_name: str,
        email: str,
        phone: str,
        password: str,
    ) -> User:
        """Creates a directly-active CUSTOMER account (self-service signup).

        Customers are platform end-users, not company members: no company is
        created or linked and no admin approval is involved. The account is
        activated immediately so the customer can sign in and track parcels.
        """
        email = email.strip().lower()

        existing_user = await self.user_repo.find_by_email(email, UserRole.CUSTOMER)
        if existing_user is not None:
            raise EmailAlreadyRegisteredError(
                message="This email is already registered as a Customer. Please sign in.",
                details={"conflict_type": "user_email_role", "field": "email"},
            )

        from app.core.security import hash_password

        password_hash = hash_password(password)
        return await self.user_repo.create(
            full_name=f"{first_name.strip()} {last_name.strip()}".strip(),
            email=email,
            phone=phone,
            password_hash=password_hash,
            role=UserRole.CUSTOMER,
            status="active",
            is_active=True,
            is_approved=True,
            is_verified=True,
            otp_verified=True,
        )

    async def get_pending_requests(
        self,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        role: str | None = None,
    ) -> tuple[list, int]:
        return await self.request_repo.find_pending_requests(page, page_size, search, role)

    async def get_all_requests(
        self,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        search: str | None = None,
    ) -> tuple[list, int]:
        return await self.request_repo.get_all_requests(page, page_size, status, search)


registration_service = RegistrationService(
    RegistrationRequestRepository(), UserRepository(), CompanyRepository()
)
"""Business logic for creating and authenticating users."""
from __future__ import annotations

from app.core.exceptions import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    PhoneAlreadyRegisteredError,
    UserInactiveError,
    UserNotApprovedError,
    UserNotVerifiedError,
    WrongPortalError,
)
from app.core.security import hash_password, verify_password_async
from app.models.enums import RegistrationStatus, UserRole
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest


class UserService:
    def __init__(self, repository: UserRepository) -> None:
        self.repository = repository

    async def register(self, payload: RegisterRequest) -> User:
        """Creates a new user, rejecting email duplicates. Passwords are hashed.

        Phone is contact info, not an identity key: it may be shared freely
        between accounts, so no phone-uniqueness check is performed.
        """
        if await self.repository.exists_with_email(payload.email):
            raise EmailAlreadyRegisteredError()

        password_hash = hash_password(payload.password)
        user = await self.repository.create(
            full_name=payload.fullName,
            email=payload.email,
            phone=payload.phone,
            password_hash=password_hash,
            role=UserRole.EMPLOYEE,
        )
        return user

    async def create_user_from_request(self, request: RegistrationRequest) -> User:
        """Create an active user from an OTP-verified registration request.

        Guards against duplicate emails: if a user already exists with the
        request's email + role the raise is a 409 ``email_already_registered``
        instead of a generic DB error.
        """
        from app.core.exceptions import EmailAlreadyRegisteredError

        existing = await self.repository.find_by_email(request.email, request.requestedRole)
        if existing is not None:
            raise EmailAlreadyRegisteredError(
                "An account with this email and role already exists."
            )

        return await self.repository.create(
            full_name=f"{request.firstName} {request.lastName}",
            email=request.email,
            phone=request.phone,
            password_hash=request.passwordHash,
            role=request.requestedRole,
            status="active",
            is_active=True,
            is_approved=True,
            is_verified=True,
            otp_verified=True,
            company_id=request.companyId,
        )

    async def authenticate(self, email: str, password: str, role: UserRole | None = None) -> User:
        """Verifies credentials. Raises typed errors the caller can expose."""
        user = await self.repository.find_by_email(email, role)
        if user is None or not await verify_password_async(password, user.passwordHash):
            raise InvalidCredentialsError()

        # Check user status
        if user.status == "pending":
            raise UserInactiveError("Your account is waiting for administrator approval.")
        elif user.status == "rejected":
            # Need to get rejection reason from registration request
            raise UserNotApprovedError("Your account has been rejected.")
        elif user.status == "approved" and not user.otpVerified:
            raise UserNotVerifiedError("Your account has been approved. Please verify the OTP sent to your email.")
        elif user.status != "active":
            raise UserInactiveError("Your account is not active.")

        return user

    # --- Staff/Admin portal (separate self-service auth surfaces) ----------

    _PORTAL_LABELS: dict[UserRole, str] = {
        UserRole.STAFF: "Staff",
        UserRole.ADMIN: "Admin",
        UserRole.SUPER_ADMIN: "Admin",
    }

    async def register_staff(
        self, full_name: str, email: str, phone: str, password: str
    ) -> User:
        """Self-service Staff signup. Creates the user directly on the
        ``users`` table — no ``RegistrationRequest`` row, no OTP, no email —
        as ``PENDING`` until an Admin approves it (see ``approve_staff``)."""
        if await self.repository.find_by_email(email, UserRole.STAFF) is not None:
            raise EmailAlreadyRegisteredError(
                "This email is already registered as Staff. Please sign in."
            )
        password_hash = hash_password(password)
        return await self.repository.create(
            full_name=full_name,
            email=email,
            phone=phone,
            password_hash=password_hash,
            role=UserRole.STAFF,
            status="pending",
            is_active=False,
            is_approved=False,
            is_verified=False,
            otp_verified=False,
            company_id=None,
        )

    async def authenticate_portal(
        self, email: str, password: str, portal_roles: UserRole | tuple[UserRole, ...]
    ) -> User:
        """Verifies credentials for a role-scoped auth portal (Staff or
        Admin). The account's real role must be one of ``portal_roles`` — a
        correct password for an account registered under a different role
        is rejected with a message naming the right portal, never silently
        authenticated. Never reveals whether an account exists on a wrong
        password (only checked once the password itself has verified).

        ``portal_roles`` accepts more than one role so the Admin portal can
        admit both ``ADMIN`` and ``SUPER_ADMIN`` accounts.
        """
        roles = (portal_roles,) if isinstance(portal_roles, UserRole) else tuple(portal_roles)
        user: User | None = None
        for role in roles:
            user = await self.repository.find_by_email(email, role)
            if user is not None:
                break

        if user is None:
            other = await self.repository.find_by_email(email)
            if other is not None and await verify_password_async(password, other.passwordHash):
                label = self._PORTAL_LABELS.get(other.role, other.role.value.title())
                raise WrongPortalError(
                    f"This account is registered as {label}. Please use {label} Login."
                )
            raise InvalidCredentialsError()

        if not await verify_password_async(password, user.passwordHash):
            raise InvalidCredentialsError()

        portal_label = self._PORTAL_LABELS.get(user.role, user.role.value.title())
        if user.status == RegistrationStatus.PENDING:
            if user.role == UserRole.STAFF:
                raise UserInactiveError(
                    "Your Staff account is waiting for Admin approval. "
                    "Please try again after your account has been approved."
                )
            raise UserInactiveError("Your account is waiting for administrator approval.")
        if user.status == RegistrationStatus.REJECTED:
            if user.role == UserRole.STAFF:
                raise UserNotApprovedError(
                    "Your Staff account has been rejected. Please contact the administrator."
                )
            raise UserNotApprovedError("Your account has been rejected.")
        if user.status == RegistrationStatus.APPROVED_PENDING_OTP and not user.otpVerified:
            raise UserNotVerifiedError(
                "Your account has been approved. Please verify the OTP sent to your email."
            )
        if user.status != RegistrationStatus.ACTIVE:
            raise UserInactiveError(f"Your {portal_label} account is not active.")

        return user

    async def get_by_id(self, user_id: str) -> User | None:
        return await self.repository.find_by_id(user_id)

    async def get_by_email(self, email: str) -> User | None:
        return await self.repository.find_by_email(email)

    async def reset_password(self, user: User, new_password: str) -> None:
        """Replaces the user's password hash and persists it."""
        from app.core.security import hash_password
        await self.repository.set_password(user, hash_password(new_password))

    async def update_status(self, user_id: str, status: str) -> bool:
        """Update user status (persisted update of the user row)."""
        return await self.repository.update_status(user_id, status)

    async def create_admin(self, payload: "CreateAdminRequest") -> User:
        """Creates a pre-activated ADMIN account (SUPER_ADMIN only)."""
        from app.schemas.approval import CreateAdminRequest
        from app.core.exceptions import EmailAlreadyRegisteredError, PhoneAlreadyRegisteredError

        if await self.repository.exists_with_email(payload.email):
            raise EmailAlreadyRegisteredError()
        if await self.repository.exists_with_phone(payload.phone):
            raise PhoneAlreadyRegisteredError()

        password_hash = hash_password(payload.password)
        return await self.repository.create(
            full_name=f"{payload.firstName} {payload.lastName}",
            email=payload.email,
            phone=payload.phone,
            password_hash=password_hash,
            role=UserRole.ADMIN,
            status="active",
            is_active=True,
            is_approved=True,
            is_verified=True,
            otp_verified=True,
        )

    async def create_company_user(
        self, payload, role: UserRole, company_id
    ) -> User:
        """Creates a pre-activated Staff (EMPLOYEE) or Driver account directly
        under ``company_id`` (Company Admin / Super Admin only — the caller
        resolves and passes ``company_id``, never trusting a client-supplied
        value for a Company Admin caller).
        """
        from app.core.exceptions import EmailAlreadyRegisteredError, PhoneAlreadyRegisteredError

        if await self.repository.exists_with_email(payload.email):
            raise EmailAlreadyRegisteredError()
        if await self.repository.exists_with_phone(payload.phone):
            raise PhoneAlreadyRegisteredError()

        password_hash = hash_password(payload.password)
        return await self.repository.create(
            full_name=f"{payload.firstName} {payload.lastName}",
            email=payload.email,
            phone=payload.phone,
            password_hash=password_hash,
            role=role,
            status="active",
            is_active=True,
            is_approved=True,
            is_verified=True,
            otp_verified=True,
            company_id=company_id,
        )

    async def delete_user(self, user_id: str) -> bool:
        """Hard-deletes a user row."""
        return await self.repository.delete_by_id(user_id)


user_service = UserService(UserRepository())
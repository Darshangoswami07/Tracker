"""Shared FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ForbiddenError,
    TokenExpiredError,
    TokenInvalidError,
    UnauthorizedError,
    UserInactiveError,
)
from app.core.rbac import is_admin, is_super_admin, passes_role
from app.core.security import decode_token
from app.database.db import get_db_session
from app.models.enums import RegistrationStatus, UserRole
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.user_service import user_service
from app.utils.pagination import PageParams, page_from_params

_bearer_scheme = HTTPBearer(auto_error=False)


async def _extract_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    credentials: HTTPAuthorizationCredentials | None = await _bearer_scheme(request)
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError()

    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenExpiredError as exc:
        raise UnauthorizedError() from exc
    except TokenInvalidError as exc:
        raise UnauthorizedError() from exc

    repo = UserRepository(session=db)
    user = await repo.find_by_id(payload.subject)
    if user is None:
        raise UnauthorizedError()
    # Authorization must use the same "active" condition as ``authenticate``
    # (login), otherwise an account that can sign in (status == active) would be
    # rejected here by a divergent ``isActive`` flag and every protected route
    # (including /me and the admin dashboard) would return 403.
    if user.status != RegistrationStatus.ACTIVE:
        raise UserInactiveError("Your account is inactive. Please contact support.")
    return user


CurrentUser = Annotated[User, Depends(_extract_user)]


def get_user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def require_roles(*roles: UserRole):
    """Dependency factory that restricts an endpoint to the given roles.

    Roles are hierarchical: a user passes if their role matches one of the
    given roles OR outranks all of them (SUPER_ADMIN always passes).
    """

    async def _check_role(user: CurrentUser) -> User:
        if not passes_role(user.role, *roles):
            raise ForbiddenError()
        return user

    return _check_role


def require_exact_roles(*roles: UserRole):
    """Dependency factory restricted to an EXACT set of roles (+ SUPER_ADMIN).

    ``require_roles``/``passes_role`` treat roles as hierarchical: an actor
    also passes if they simply outrank the *lowest*-ranked required role.
    For ``require_roles(ADMIN, DISPATCHER)`` that unintentionally admits any
    role ranked above DISPATCHER (e.g. BUSINESS/BUSINESS_OWNER), not just
    ADMIN/DISPATCHER. Use this dependency instead wherever only an exact
    role match (plus the usual SUPER_ADMIN bypass) is intended.
    """

    async def _check_role(user: CurrentUser) -> User:
        if is_super_admin(user.role) or user.role in roles:
            return user
        raise ForbiddenError()

    return _check_role


# Convenience accessors so routes can write `user: CurrentUser` or declare a
# specific role requirement independently.
async def _require_business(user: CurrentUser) -> User:
    if not passes_role(user.role, UserRole.BUSINESS, UserRole.BUSINESS_OWNER):
        raise ForbiddenError()
    return user


async def _require_driver(user: CurrentUser) -> User:
    if not passes_role(user.role, UserRole.DRIVER):
        raise ForbiddenError()
    return user


BusinessUser = Annotated[User, Depends(_require_business)]
DriverUser = Annotated[User, Depends(_require_driver)]


def _require_admin(user: CurrentUser) -> User:
    if not is_admin(user.role):
        raise ForbiddenError()
    return user


AdminUser = Annotated[User, Depends(_require_admin)]


def _require_super_admin(user: CurrentUser) -> User:
    if not is_super_admin(user.role):
        raise ForbiddenError()
    return user


SuperAdminUser = Annotated[User, Depends(_require_super_admin)]


# --- Multi-tenant (company/tenant) role gates --------------------------------
def _require_company_admin(user: CurrentUser) -> User:
    """Company Admin (BUSINESS_OWNER/BUSINESS) or platform-level Super Admin."""
    if is_admin(user.role) or passes_role(user.role, UserRole.BUSINESS, UserRole.BUSINESS_OWNER):
        return user
    raise ForbiddenError()


CompanyAdminUser = Annotated[User, Depends(_require_company_admin)]


def _require_gr_access(user: CurrentUser) -> User:
    """Roles permitted to use GR Shipment / Customer Tracking / GR Tracker
    Classic: Super Admin (global), Company Admin, Staff, Driver — each scoped
    to their own company by the caller via ``app.core.tenancy``."""
    if (
        is_admin(user.role)
        or passes_role(user.role, UserRole.BUSINESS, UserRole.BUSINESS_OWNER)
        or user.role in (UserRole.EMPLOYEE, UserRole.DRIVER)
    ):
        return user
    raise ForbiddenError()


GRAccessUser = Annotated[User, Depends(_require_gr_access)]


# --- Pagination query parameters -------------------------------------------
PageQuery = Annotated[
    PageParams,
    Depends(
        lambda page: page
    )
]


def _page_dependency(
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> PageParams:
    return page_from_params(page, page_size)


PaginationQuery = Annotated[PageParams, Depends(_page_dependency)]


def search_query(
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> str | None:
    return search.strip() if search else None


SearchQuery = Annotated[str | None, Depends(search_query)]

Dependencies = Depends
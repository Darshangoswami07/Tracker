"""Multi-tenant (company/tenant) scoping helpers.

Single source of truth for "what company does this user act as, and is this
record theirs" — used by every company-scoped route (GR/shipment, tracking,
staff, drivers, users) so isolation logic isn't duplicated per-router.

ADMIN/SUPER_ADMIN are platform-level and always unscoped (``None`` company id
== see everything). Every other role (BUSINESS_OWNER/BUSINESS "Company
Admin", EMPLOYEE "Staff", DRIVER) is scoped to their own company, resolved
from ``User.companyId`` first (set directly for accounts created via the
Company Admin staff/driver creation endpoints), falling back to the
pre-existing ``Employee`` linkage table for accounts associated with a
company that way.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.exceptions import ForbiddenError
from app.core.rbac import is_admin
from app.database.db import session_scope
from app.models.user import User


async def _resolve_company_id(user: User) -> uuid.UUID | None:
    if user.companyId is not None:
        return user.companyId
    from app.models.employee import Employee

    async with session_scope() as session:
        result = await session.execute(
            select(Employee.companyId).where(Employee.userId == str(user.id))
        )
        return result.scalar_one_or_none()


async def effective_company_id(user: User) -> uuid.UUID | None:
    """Returns the company id a request should be scoped to for ``user``.

    ``None`` means unscoped (platform-level access) — only true for
    ADMIN/SUPER_ADMIN. Every other role is scoped to their own company; if
    they haven't been assigned one yet this raises rather than returning
    ``None``, because downstream repository filters treat ``None`` as "no
    filter" — silently returning it here would leak every company's data to
    an unassigned account instead of denying access.
    """
    if is_admin(user.role):
        return None
    company_id = await _resolve_company_id(user)
    if company_id is None:
        raise ForbiddenError()
    return company_id


async def assert_same_company(user: User, record_company_id: uuid.UUID | None) -> None:
    """Raises ForbiddenError unless ``user`` may access a record belonging to
    ``record_company_id``.

    ADMIN/SUPER_ADMIN always pass. Every other role must have a company
    assigned and it must match the record's company exactly — a missing
    company id on either side is a denial, never an implicit allow.
    """
    if is_admin(user.role):
        return
    company_id = await _resolve_company_id(user)
    if company_id is None or record_company_id is None:
        raise ForbiddenError()
    if company_id != record_company_id:
        raise ForbiddenError()

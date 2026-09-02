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
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.core.rbac import is_admin
from app.database.db import session_scope
from app.models.enums import UserRole
from app.models.user import User


async def _resolve_company_id(user: User, session: Optional[AsyncSession] = None) -> uuid.UUID | None:
    if user.companyId is not None:
        return user.companyId
    from app.models.employee import Employee

    async with session_scope(session) as sess:
        result = await sess.execute(
            select(Employee.companyId).where(Employee.userId == str(user.id))
        )
        return result.scalar_one_or_none()


async def effective_company_id(user: User, session: Optional[AsyncSession] = None) -> uuid.UUID | None:
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
    company_id = await _resolve_company_id(user, session)
    if company_id is None:
        raise ForbiddenError()
    return company_id


async def resolve_gr_staff_scope(
    user: User, requested_area: str | None = None, session: Optional[AsyncSession] = None
) -> tuple[uuid.UUID | None, str | None] | None:
    """The ``(employee_id, area)`` pair that scopes a GR query to a STAFF
    member's *own* GRs, or ``None`` for every other role.

    A Staff member's GRs come from two independent mechanisms that must NOT
    gate each other (see ``OrderRepository.get_all_orders``): an explicit
    per-GR assignment (``Order.assignedStaffId``) and area-based routing
    (``Order.area`` == the staff's profile area). Either one qualifying is
    sufficient. ``employee_id`` is ``None`` when the staff member has no
    ``employees`` row yet (registration-approved staff only get one on their
    first explicit assignment); scoping then falls back to area alone.

    Returns ``None`` for ADMIN/SUPER_ADMIN/Company-Admin/Driver — those are
    scoped by company (+ optional area) only, never by assignment.
    """
    if user.role not in (UserRole.EMPLOYEE, UserRole.STAFF):
        return None
    from app.models.employee import Employee

    async with session_scope(session) as sess:
        employee_id = await sess.scalar(
            select(Employee.id).where(Employee.userId == str(user.id))
        )
    return (employee_id, requested_area or getattr(user, "area", None))


async def assert_same_company(user: User, record_company_id: uuid.UUID | None, session: Optional[AsyncSession] = None) -> None:
    """Raises ForbiddenError unless ``user`` may access a record belonging to
    ``record_company_id``.

    ADMIN/SUPER_ADMIN always pass. Every other role must have a company
    assigned and it must match the record's company exactly — a missing
    company id on either side is a denial, never an implicit allow.
    """
    if is_admin(user.role):
        return
    company_id = await _resolve_company_id(user, session)
    if company_id is None or record_company_id is None:
        raise ForbiddenError()
    if company_id != record_company_id:
        raise ForbiddenError()

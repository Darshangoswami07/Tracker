"""Staff Daily Collection + Admin Staff Work monitoring endpoints.

Data flow: Mobile -> FastAPI -> Neon. All figures are computed server-side
(``app.services.staff_work_service``) from Neon so the Staff and Admin views
never disagree.

Authorization:
  * STAFF / EMPLOYEE callers are always scoped to *themselves* — the
    ``staffId`` query param is ignored for them.
  * ADMIN / SUPER_ADMIN may read any staff member's data (read-only
    monitoring) but may NOT create/modify settlements: ``POST /staff/settlements``
    rejects them with 403.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.rbac import is_admin
from app.database.db import get_db_session
from app.models.enums import UserRole
from app.schemas.staff_work import (
    StaffDailyActivityOut,
    StaffDailyCollectionOut,
    StaffDailySummaryOut,
    StaffSettlementCreateRequest,
)
from app.services import staff_work_service
from app.utils.responses import success

router = APIRouter(prefix="/staff", tags=["staff-work"])

_STAFF_ROLES = (UserRole.STAFF, UserRole.EMPLOYEE)


def _parse_day(value: str | None) -> date:
    if not value:
        return datetime.utcnow().date()
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def _resolve_target_staff(user, requested: UUID | None) -> UUID:
    """STAFF/EMPLOYEE -> always self. ADMIN -> the requested id (or self)."""
    if is_admin(user.role):
        return requested or user.id
    return user.id


DateQuery = Annotated[str | None, Query(alias="date")]
StaffIdQuery = Annotated[UUID | None, Query(alias="staffId")]


@router.get("/daily-collection")
async def get_daily_collection(
    user: CurrentUser,
    staff_id: StaffIdQuery = None,
    date_str: DateQuery = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not (is_admin(user.role) or user.role in _STAFF_ROLES):
        raise ForbiddenError()
    target = _resolve_target_staff(user, staff_id)
    data = await staff_work_service.daily_collection(session, target, _parse_day(date_str))
    return success(
        StaffDailyCollectionOut.model_validate(data).model_dump(mode="json"),
        message="Daily collection retrieved successfully.",
    )


@router.get("/daily-summary")
async def get_daily_summary(
    user: CurrentUser,
    staff_id: StaffIdQuery = None,
    date_str: DateQuery = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not (is_admin(user.role) or user.role in _STAFF_ROLES):
        raise ForbiddenError()
    target = _resolve_target_staff(user, staff_id)
    data = await staff_work_service.daily_summary(session, target, _parse_day(date_str))
    return success(
        StaffDailySummaryOut.model_validate(data).model_dump(mode="json"),
        message="Daily summary retrieved successfully.",
    )


@router.get("/daily-summary/all")
async def get_daily_summary_all(
    user: CurrentUser,
    date_str: DateQuery = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Every staff member's own daily collection/GR totals for a day, in one
    grouped query — Admin-tier only (the Payment History "Staff Daily Work"
    section). Keyed by the staff member's ``users.id``."""
    if not is_admin(user.role):
        raise ForbiddenError()
    from app.core.tenancy import effective_company_id

    company_id = await effective_company_id(user)
    data = await staff_work_service.daily_summary_all(session, _parse_day(date_str), company_id)
    return success(data, message="Daily summary retrieved successfully.")


@router.get("/daily-work")
async def get_daily_work(
    user: CurrentUser,
    staff_id: StaffIdQuery = None,
    date_str: DateQuery = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Full Staff Work payload (summary + timeline + GR work + payments +
    settlements). Read-only — used by both the Staff dashboard and the Admin
    monitoring page."""
    if not (is_admin(user.role) or user.role in _STAFF_ROLES):
        raise ForbiddenError()
    target = _resolve_target_staff(user, staff_id)
    data = await staff_work_service.daily_activity(session, target, _parse_day(date_str))
    return success(
        StaffDailyActivityOut.model_validate(data).model_dump(mode="json"),
        message="Staff work retrieved successfully.",
    )


@router.get("/daily-grs")
async def get_daily_grs(
    user: CurrentUser,
    staff_id: StaffIdQuery = None,
    date_str: DateQuery = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not (is_admin(user.role) or user.role in _STAFF_ROLES):
        raise ForbiddenError()
    target = _resolve_target_staff(user, staff_id)
    data = await staff_work_service.daily_grs(session, target, _parse_day(date_str))
    return success(data, message="Staff daily GRs retrieved successfully.")


@router.post("/settlements", status_code=201)
async def create_settlement(
    payload: StaffSettlementCreateRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Records a cash handover (owner / labour / driver) out of the caller's
    own day's collection. STAFF/EMPLOYEE only — ADMIN/SUPER_ADMIN are
    rejected here even though they can *read* the same data above. A staff
    member can only ever record against their own account."""
    if user.role not in _STAFF_ROLES:
        raise ForbiddenError(
            "Only staff can record a collection settlement. Admin access to "
            "Staff Work is read-only."
        )
    row = await staff_work_service.create_settlement(
        session,
        staff_user_id=user.id,
        settlement_type=payload.type,
        amount=payload.amount,
        notes=payload.notes,
        created_by=user.id,
        client_request_id=payload.clientRequestId,
    )
    return success(
        {
            "id": str(row.id),
            "staffId": str(row.staffId),
            "type": row.type,
            "amount": float(row.amount),
            "notes": row.notes,
            "createdAt": row.createdAt.isoformat(),
        },
        message="Collection settlement recorded successfully.",
    )

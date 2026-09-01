"""Separate Staff and Admin self-service authentication portals.

These are new, additive endpoints living alongside (not replacing) the
existing ``/auth/login``/``/auth/register`` and ``/registration-requests``
flows. The backend, not the mobile client, decides which real role an
account has: ``/auth/staff/login`` only ever authenticates a ``STAFF``
account and ``/auth/admin/login`` only ever authenticates an
``ADMIN``/``SUPER_ADMIN`` account (see ``UserService.authenticate_portal``).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import AdminUser, get_user_agent
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationBusinessError
from app.models.enums import UserRole
from app.schemas.approval import AdminUserOut, ApproveStaffRequest, RejectRequest
from app.schemas.auth import (
    AdminLoginRequest,
    AuthResponse,
    StaffLoginRequest,
    StaffRegisterRequest,
)
from app.services.token_service import token_service
from app.services.user_service import user_service
from app.utils.responses import success

router = APIRouter(tags=["staff-admin-portal"])

UserAgent = Annotated[str | None, Depends(get_user_agent)]


# --- Staff portal (self-service, no OTP/email approval) --------------------

@router.post("/auth/staff/register")
async def staff_register(payload: StaffRegisterRequest) -> dict:
    """Creates a PENDING Staff account. No email, no OTP — the applicant
    waits for an Admin to approve it from the Staff Approvals screen."""
    user = await user_service.register_staff(
        full_name=payload.fullName,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        area=payload.area,
    )
    return success(
        {"id": str(user.id), "status": "pending"},
        message=(
            "Registration submitted successfully. Your Staff account is "
            "waiting for Admin approval."
        ),
    )


@router.post("/auth/staff/login")
async def staff_login(payload: StaffLoginRequest, user_agent: UserAgent) -> dict:
    user = await user_service.authenticate_portal(payload.email, payload.password, UserRole.STAFF)
    tokens = await token_service.issue_tokens(user, user_agent=user_agent)
    from app.schemas.auth import UserOut

    result = AuthResponse(user=UserOut.model_validate(user), tokens=tokens)
    return success(result.model_dump(mode="json"), message="Signed in successfully.")


# --- Admin portal (separate from Staff; ADMIN and SUPER_ADMIN both pass) --

@router.post("/auth/admin/login")
async def admin_login(payload: AdminLoginRequest, user_agent: UserAgent) -> dict:
    user = await user_service.authenticate_portal(
        payload.email, payload.password, (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    )
    tokens = await token_service.issue_tokens(user, user_agent=user_agent)
    from app.schemas.auth import UserOut

    result = AuthResponse(user=UserOut.model_validate(user), tokens=tokens)
    return success(result.model_dump(mode="json"), message="Signed in successfully.")


# --- Admin: Staff Approvals (available to plain Admin, not Super-Admin-only)

@router.get("/admin/staff-approvals")
async def list_staff_approvals(
    admin: AdminUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: str | None = "pending",
    search: str | None = None,
) -> dict:
    """Lists self-service Staff accounts (defaults to pending ones)."""
    from app.repositories.user_repository import UserRepository

    repo = UserRepository()
    users, total = await repo.get_all_users(
        page=page,
        page_size=page_size,
        status=status,
        search=search,
        role=UserRole.STAFF.value,
    )
    return success(
        {
            "items": [AdminUserOut.model_validate(u).model_dump(mode="json") for u in users],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="Staff approval requests retrieved successfully.",
    )


async def _get_pending_staff(user_id: str):
    target = await user_service.get_by_id(user_id)
    if target is None:
        raise NotFoundError("Staff account not found.")
    if target.role != UserRole.STAFF:
        raise ForbiddenError("This account is not a Staff account.")
    return target


@router.post("/admin/staff-approvals/{user_id}/approve")
async def approve_staff(
    user_id: str, admin: AdminUser, payload: ApproveStaffRequest = ApproveStaffRequest()
) -> dict:
    """Approves a pending Staff account: activates it and assigns it to a
    company (needed for every GR/shipment-access endpoint, which all scope
    by ``companyId`` — see ``core/tenancy.py``) — no OTP, no email, matching
    the Staff portal's no-email-approval requirement.

    ADMIN/SUPER_ADMIN are platform-level and never have a ``companyId`` of
    their own (by design), so it can never be inherited from ``admin`` the
    way ``create_gr`` inherits it from a company-scoped caller. Resolving
    *some* company here is mandatory: leaving it ``None`` would silently
    lock the new Staff account out of every company-scoped endpoint with a
    403 that has nothing to do with their actual permissions — the exact
    failure this replaces.
    """
    await _get_pending_staff(user_id)
    from app.repositories.company_repository import CompanyRepository
    from app.repositories.user_repository import UserRepository

    company_repo = CompanyRepository()
    if payload.companyId is not None:
        company = await company_repo.find_active_by_id(payload.companyId)
        if company is None:
            raise ValidationBusinessError("The selected company could not be found.")
        company_id = company.id
    elif admin.companyId is not None:
        company_id = admin.companyId
    else:
        companies = await company_repo.list_active_companies()
        if len(companies) == 1:
            company_id = companies[0].id
        elif len(companies) == 0:
            raise ValidationBusinessError(
                "No company exists yet. Create a company before approving Staff accounts."
            )
        else:
            raise ValidationBusinessError(
                "More than one company exists — specify which company this "
                "Staff account belongs to."
            )

    repo = UserRepository()
    updated = await repo.approve_staff(user_id, company_id)
    if not updated:
        raise NotFoundError("Staff account not found.")
    return success({"approved": True}, message="Staff account approved successfully.")


@router.post("/admin/staff-approvals/{user_id}/reject")
async def reject_staff(user_id: str, payload: RejectRequest, admin: AdminUser) -> dict:
    """Rejects a pending Staff account. The record is never deleted — status
    moves to REJECTED so the applicant sees a clear message on next login."""
    await _get_pending_staff(user_id)
    from app.repositories.user_repository import UserRepository

    repo = UserRepository()
    updated = await repo.update_status(user_id, "rejected")
    if not updated:
        raise NotFoundError("Staff account not found.")
    return success({"rejected": True}, message="Staff account rejected.")

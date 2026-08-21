"""Registration request endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, get_user_agent, require_exact_roles
from app.database.db import get_db_session
from app.models.enums import UserRole
from app.schemas.approval import (
    ApproveRequest,
    RegistrationRequestCreate,
    RegistrationRequestListOut,
    RegistrationRequestOut,
    RejectRequest,
)
from app.services.approval_service import approval_service
from app.services.otp_service import otp_service
from app.services.registration_service import registration_service
from app.utils.responses import success
from app.workers import tasks as email_tasks
from app.workers.dispatch import dispatch_email

router = APIRouter(prefix="/registration-requests", tags=["registration-requests"])

# Exact-match (not rank-fallthrough) check: ADMIN or DISPATCHER only, plus the
# usual SUPER_ADMIN bypass. require_roles()/passes_role()'s hierarchy
# fallthrough would otherwise also admit BUSINESS/BUSINESS_OWNER here (see
# require_exact_roles docstring in app/api/deps.py).
AdminRequired = Depends(require_exact_roles(UserRole.ADMIN, UserRole.DISPATCHER))


@router.post("", status_code=201)
async def create_registration_request(
    payload: RegistrationRequestCreate,
    user_agent: Annotated[str | None, Depends(get_user_agent)],
    background_tasks: BackgroundTasks,
) -> dict:
    """Submit a new registration request pending admin approval.

    The database write is committed and the response returned first; email
    notifications (admin alert / approval OTP) are scheduled as background
    tasks so SMTP — even a slow or quota-blocked Gmail account — can never
    block or fail a valid registration.
    """
    result = await registration_service.create_registration_request(
        first_name=payload.firstName,
        last_name=payload.lastName,
        company_name=payload.companyName or "",
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        requested_role=UserRole(payload.requestedRole),
    )

    # Email is a notification side effect: run it after the response is sent.
    if result.request is not None:
        dispatch_email(
            background_tasks, email_tasks.notify_admin_of_registration, str(result.request.id)
        )
    if result.otp and result.request is not None:
        dispatch_email(
            background_tasks, email_tasks.send_user_otp_email, str(result.request.id), result.otp
        )

    # Return the registration request (PENDING / APPROVED_PENDING_OTP resume).
    return success(
        RegistrationRequestOut.model_validate(result.request).model_dump(mode="json"),
        message=result.message,
    )


@router.get("")
async def list_registration_requests(
    admin: AdminUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: str | None = None,
    search: str | None = None,
) -> dict:
    """List registration requests (admin only)."""
    requests, total = await registration_service.get_all_requests(
        page=page,
        page_size=page_size,
        status=status,
        search=search,
    )
    return success(
        {
            "items": [RegistrationRequestOut.model_validate(r).model_dump(mode="json") for r in requests],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        message="Registration requests retrieved successfully.",
    )


@router.get("/pending")
async def list_pending_requests(
    admin: AdminUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: str | None = None,
) -> dict:
    """List pending registration requests (admin only)."""
    requests, total = await registration_service.get_pending_requests(
        page=page,
        page_size=page_size,
        search=search,
    )
    return success(
        {
            "items": [RegistrationRequestOut.model_validate(r).model_dump(mode="json") for r in requests],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        message="Pending registration requests retrieved successfully.",
    )


@router.get("/{request_id}")
async def get_registration_request(
    request_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a registration request by ID.

    Intentionally unauthenticated: the applicant polls their own submission's
    status (RegistrationPendingScreen) before any session/token exists, gated
    only by the unguessable request UUID they were given at submission time.
    Do not add an auth dependency here — see the bulk-listing endpoints above
    for the actual PII-exposure fix (those return every request, not one
    already-known id, and have no legitimate unauthenticated caller).
    """
    from app.repositories.registration_request_repository import RegistrationRequestRepository
    repo = RegistrationRequestRepository(session=db)
    request = await repo.find_by_id(request_id)
    if not request:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Registration request not found")
    return success(
        RegistrationRequestOut.model_validate(request).model_dump(mode="json"),
        message="Registration request retrieved successfully.",
    )


@router.post("/{request_id}/approve")
async def approve_registration_request(
    request_id: str,
    payload: ApproveRequest,
    admin: Annotated[AdminUser, AdminRequired],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Approve a registration request and create an approval OTP for the user.

    A plain ADMIN may only approve Staff (``employee``) or Driver
    (``driver``) requests; SUPER_ADMIN is unrestricted.

    The approval is committed first and the OTP email is dispatched as a
    background task, so SMTP can never block or fail the approval response.
    """
    success_flag, message, otp = await approval_service.approve_request(
        request_id, str(admin.id), actor_role=admin.role
    )
    if not success_flag:
        from app.core.exceptions import ValidationBusinessError
        raise ValidationBusinessError(message)

    if otp:
        dispatch_email(background_tasks, email_tasks.send_approval_otp_email, request_id, otp)

    # Return the updated request
    from app.repositories.registration_request_repository import RegistrationRequestRepository
    repo = RegistrationRequestRepository(session=db)
    request = await repo.find_by_id(request_id)
    return success(
        RegistrationRequestOut.model_validate(request).model_dump(mode="json"),
        message="Request approved successfully. An OTP email is being sent to the user.",
    )


@router.post("/{request_id}/reject")
async def reject_registration_request(
    request_id: str,
    payload: RejectRequest,
    admin: Annotated[AdminUser, AdminRequired],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Reject a registration request.

    A plain ADMIN may only reject Staff (``employee``) or Driver
    (``driver``) requests; SUPER_ADMIN is unrestricted.

    The rejection email is dispatched as a background task so SMTP can never
    block or fail the rejection response.
    """
    success_flag, message = await approval_service.reject_request(
        request_id, str(admin.id), payload.reason, actor_role=admin.role
    )
    if not success_flag:
        from app.core.exceptions import ValidationBusinessError
        raise ValidationBusinessError(message)

    dispatch_email(background_tasks, email_tasks.send_rejection_email, request_id, payload.reason)

    # Return the updated request
    from app.repositories.registration_request_repository import RegistrationRequestRepository
    repo = RegistrationRequestRepository(session=db)
    request = await repo.find_by_id(request_id)
    return success(
        RegistrationRequestOut.model_validate(request).model_dump(mode="json"),
        message=message,
    )


@router.post("/{request_id}/resend-otp")
async def resend_approval_otp_endpoint(
    request_id: str,
    admin: Annotated[AdminUser, AdminRequired],
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Resend approval OTP to user.

    Generates a NEW OTP, invalidates the previous one and persists it before
    the email is dispatched through the configured provider. The send is
    awaited: if a provider is configured and delivery fails, the endpoint
    returns a real error instead of a fake "OTP sent" success. Re-sends within
    the cooldown window are rejected with 429 ``otp_resend_cooldown``.
    """
    from app.repositories.registration_request_repository import RegistrationRequestRepository

    request_repo = RegistrationRequestRepository(session=db)
    request = await request_repo.find_by_id(request_id)
    if not request:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Registration request not found")

    if request.status != "approved_pending_otp":
        from app.core.exceptions import RegistrationStateError
        raise RegistrationStateError("Can only resend OTP for approved requests")

    await otp_service.resend_approval_otp(
        request_id, str(admin.id), send_email=True
    )
    return success(
        {"resent": True},
        message="A new verification code has been sent to your email.",
    )
"""Admin approval/rejection endpoints."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.api.deps import AdminUser, CompanyAdminUser, require_roles
from app.core.tenancy import assert_same_company, effective_company_id
from app.models.enums import UserRole
from app.schemas.approval import (
    AdminUserListOut,
    AdminUserOut,
    ApprovalLogListOut,
    ApprovalLogOut,
    ApproveRequest,
    AuditLogListOut,
    AuditLogOut,
    CreateAdminRequest,
    CreateCompanyUserRequest,
    RejectRequest,
    ResendOTPRequest,
    UpdateUserStatusRequest,
)
from app.core.rbac import can_manage, is_super_admin
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationBusinessError
from app.schemas.company import CompanyCreateRequest, CompanyUpdateRequest
from app.models.enums import RegistrationStatus, UserRole
from app.repositories.approval_log_repository import ApprovalLogRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.user_repository import UserRepository
from app.services.approval_service import approval_service
from app.services.email_service import email_service
from app.services.otp_service import otp_service
from app.services.user_service import user_service
from app.utils.responses import success

router = APIRouter(prefix="/admin", tags=["admin"])

# Require admin role for all endpoints
AdminRequired = Depends(require_roles(UserRole.ADMIN, UserRole.DISPATCHER))


@router.get("/registration-requests/stats")
async def get_registration_request_stats(
    admin: AdminUser,
) -> dict:
    """Get stats for registration requests."""
    from app.repositories.registration_request_repository import RegistrationRequestRepository
    repo = RegistrationRequestRepository()
    stats = await repo.get_stats()
    return success(stats, message="Registration request stats retrieved successfully.")


@router.get("/registration-requests/pending")
async def list_pending_requests(
    admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    role: str | None = None,
) -> dict:
    """List pending registration requests, optionally filtered by requestedRole
    (e.g. ``?role=employee`` or ``?role=driver``)."""
    from app.services.registration_service import registration_service
    requests, total = await registration_service.get_pending_requests(
        page=page,
        page_size=page_size,
        search=search,
        role=role,
    )
    from app.schemas.approval import RegistrationRequestOut
    return success(
        {
            "items": [RegistrationRequestOut.model_validate(r).model_dump(mode="json") for r in requests],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="Pending registration requests retrieved successfully.",
    )


@router.post("/registration-requests/{request_id}/approve")
async def approve_request(
    request_id: str,
    payload: ApproveRequest,
    admin: AdminUser,
    background_tasks: BackgroundTasks,
) -> dict:
    """Approve a registration request and create an approval OTP for the user.

    A plain ADMIN may only approve Staff (``employee``) or Driver
    (``driver``) requests; SUPER_ADMIN is unrestricted.

    The approval is committed first and the OTP email is dispatched as a
    background task, so a quota-blocked SMTP account can never fail or hold
    up the approval response. A duplicate approval raises a 409
    ``already_approved`` instead of a validation error.
    """
    success_flag, message, otp = await approval_service.approve_request(
        request_id, str(admin.id), actor_role=admin.role
    )
    if not success_flag:
        raise ValidationBusinessError(message)
    if otp:
        background_tasks.add_task(approval_service.send_approval_otp_email, request_id, otp)
    return success(
        {"approved": success_flag},
        message="Request approved successfully. An OTP email is being sent to the user.",
    )


@router.post("/registration-requests/{request_id}/reject")
async def reject_request(
    request_id: str,
    payload: RejectRequest,
    admin: AdminUser,
    background_tasks: BackgroundTasks,
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
        raise ValidationBusinessError(message)
    background_tasks.add_task(approval_service.send_rejection_email, request_id, payload.reason)
    return success({"rejected": success_flag}, message=message)


@router.post("/registration-requests/{request_id}/resend-otp")
async def resend_approval_otp(
    request_id: str,
    admin: AdminUser,
) -> dict:
    """Resend approval OTP to user.

    Generates a NEW OTP, invalidates the previous one and persists it before
    the email is dispatched through the configured provider. The send is
    awaited: if a provider is configured and delivery fails, the endpoint
    returns a real error instead of a fake "OTP sent" success. Re-sends within
    the cooldown window are rejected with 429 ``otp_resend_cooldown``.
    """
    from app.services.otp_service import otp_service
    from app.repositories.registration_request_repository import RegistrationRequestRepository

    request_repo = RegistrationRequestRepository()
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


@router.get("/registration-requests/{request_id}/logs")
async def get_approval_logs(
    request_id: str,
    admin: AdminUser,
) -> dict:
    """Get approval logs for a registration request."""
    logs = await approval_service.get_approval_logs(request_id)
    return success(
        [ApprovalLogOut.model_validate(log).model_dump(mode="json") for log in logs],
        message="Approval logs retrieved successfully.",
    )


# --- User Management ---

@router.get("/users")
async def list_users(
    admin: CompanyAdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    role: str | None = None,
) -> dict:
    """List users with pagination, optionally filtered by role/status. Super
    Admin sees every company; Company Admin sees only their own company's
    users."""
    user_repo = UserRepository()
    users, total = await user_repo.get_all_users(
        page, page_size, status, search, role, company_id=await effective_company_id(admin)
    )
    return success(
        {
            "items": [AdminUserOut.model_validate(u).model_dump(mode="json") for u in users],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        message="Users retrieved successfully.",
    )


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    admin: CompanyAdminUser,
) -> dict:
    """Get a user by ID. Company Admin may only view users in their own
    company."""
    user = await user_service.get_by_id(user_id)
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")
    await assert_same_company(admin, user.companyId)
    return success(AdminUserOut.model_validate(user).model_dump(mode="json"), message="User retrieved successfully.")


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    payload: UpdateUserStatusRequest,
    admin: CompanyAdminUser,
) -> dict:
    """Update user status (activate, suspend, etc.).

    Only SUPER_ADMIN may modify another SUPER_ADMIN; an ADMIN/Company Admin
    may only manage roles strictly beneath them, and a Company Admin may only
    modify accounts belonging to their own company.
    """
    target = await user_service.get_by_id(user_id)
    if not target:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")
    if not can_manage(admin.role, target.role):
        raise ForbiddenError("You are not permitted to modify this account.")
    await assert_same_company(admin, target.companyId)
    success_flag = await user_service.update_status(user_id, payload.status.value)
    if not success_flag:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")

    # Send disabled notification if the account is being suspended
    if payload.status == RegistrationStatus.SUSPENDED:
        await email_service.send_account_disabled_email(
            target.email, target.firstName, payload.reason or ""
        )

    return success({"updated": True}, message=f"User status updated to {payload.status.value}.")


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: CompanyAdminUser,
) -> dict:
    """Delete a user account (hard delete used only by the platform owner).

    A role may only delete accounts strictly beneath it, ADMIN cannot delete
    SUPER_ADMIN, and a Company Admin may only delete accounts in their own
    company.
    """
    target = await user_service.get_by_id(user_id)
    if not target:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")
    if not can_manage(admin.role, target.role):
        raise ForbiddenError("You are not permitted to delete this account.")
    await assert_same_company(admin, target.companyId)
    deleted = await user_service.delete_user(user_id)
    if not deleted:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")
    return success({"deleted": True}, message="User deleted successfully.")


@router.post("/users/admin")
async def create_admin_user(
    payload: CreateAdminRequest,
    admin: AdminUser,
) -> dict:
    """Create a new ADMIN account. Only SUPER_ADMIN can do this."""
    if not is_super_admin(admin.role):
        raise ForbiddenError("Only SUPER_ADMIN can create admin accounts.")
    user = await user_service.create_admin(payload=payload)
    return success(AdminUserOut.model_validate(user).model_dump(mode="json"), message="Admin account created.")


@router.post("/users/{user_id}/resend-otp")
async def resend_user_otp(
    user_id: str,
    admin: AdminUser,
) -> dict:
    """Resend OTP to user."""
    user = await user_service.get_by_id(user_id)
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")

    from app.services.otp_service import otp_service
    otp, _ = await otp_service.resend_approval_otp(user_id, str(admin.id))
    return success({"resent": True}, message="OTP resent successfully.")


# --- Drivers (management list, resolves name/email/phone from the linked user) ---

@router.get("/drivers")
async def list_drivers(
    admin: CompanyAdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
) -> dict:
    """List drivers with their linked user profile. Reuses DriverRepository
    (already existed, was never wired to an endpoint) and UserRepository.
    Super Admin sees every company; Company Admin sees only their own."""
    from app.repositories.driver_repository import DriverRepository

    driver_repo = DriverRepository()
    drivers, total = await driver_repo.get_all_drivers(
        page, page_size, status=status, search=search, company_id=await effective_company_id(admin)
    )

    items = []
    for driver in drivers:
        driver_user = await user_service.get_by_id(str(driver.userId)) if driver.userId else None
        items.append(
            {
                "id": str(driver.id),
                "userId": str(driver.userId) if driver.userId else None,
                "fullName": getattr(driver_user, "fullName", None) or "Unknown",
                "email": getattr(driver_user, "email", None),
                "phone": getattr(driver_user, "phone", None),
                "companyId": str(driver.companyId) if driver.companyId else None,
                "licenseNumber": driver.licenseNumber,
                "rating": driver.rating,
                "totalDeliveries": driver.totalDeliveries,
                "status": driver.status.value if hasattr(driver.status, "value") else driver.status,
                "isActive": driver.isActive,
                "createdAt": driver.createdAt.isoformat() if driver.createdAt else None,
            }
        )
    return success(
        {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="Drivers retrieved successfully.",
    )


# --- Company Admin: create Staff/Drivers scoped to their own company -------
# (Task requirement: a Company Admin creating Staff/Drivers must never be
# able to choose a different company than their own — companyId in the
# request body is only honoured for a Super Admin caller, used to bootstrap
# a brand-new company's first accounts.)

async def _resolve_target_company_id(admin, payload):
    company_id = await effective_company_id(admin)
    if company_id is not None:
        return company_id
    if payload.companyId is None:
        raise ValidationBusinessError("companyId is required when creating an account as Super Admin.")
    return payload.companyId


@router.post("/staff", status_code=201)
async def create_staff(payload: CreateCompanyUserRequest, admin: CompanyAdminUser) -> dict:
    """Company Admin creates a Staff (EMPLOYEE) account. Always created under
    the caller's own company for Company Admin callers."""
    from app.models.employee import Employee
    from app.models.enums import EmployeeRole
    from app.repositories.base import BaseRepository

    company_id = await _resolve_target_company_id(admin, payload)
    user = await user_service.create_company_user(payload, role=UserRole.EMPLOYEE, company_id=company_id)
    await BaseRepository(Employee).save(
        Employee(userId=str(user.id), companyId=company_id, role=EmployeeRole.STAFF)
    )
    return success(AdminUserOut.model_validate(user).model_dump(mode="json"), message="Staff account created.")


@router.post("/drivers", status_code=201)
async def create_driver(payload: CreateCompanyUserRequest, admin: CompanyAdminUser) -> dict:
    """Company Admin creates a Driver account. Always created under the
    caller's own company for Company Admin callers."""
    from app.models.driver import Driver
    from app.repositories.base import BaseRepository

    company_id = await _resolve_target_company_id(admin, payload)
    user = await user_service.create_company_user(payload, role=UserRole.DRIVER, company_id=company_id)
    await BaseRepository(Driver).save(
        Driver(userId=str(user.id), companyId=company_id, licenseNumber=payload.licenseNumber)
    )
    return success(AdminUserOut.model_validate(user).model_dump(mode="json"), message="Driver account created.")


# --- Companies (used by the GR/Shipment creation form's company picker) ---

@router.get("/companies")
async def list_companies(
    admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
) -> dict:
    """List companies. Reuses the existing CompanyRepository unchanged."""
    from app.repositories.company_repository import CompanyRepository

    company_repo = CompanyRepository()
    companies, total = await company_repo.get_all_companies(page, page_size, search=search)
    return success(
        {
            "items": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "email": c.email,
                    "phone": c.phone,
                    "address": c.address,
                    "status": c.status.value if hasattr(c.status, "value") else c.status,
                    "employees": len(c.employees or []),
                    "fleet": len(c.vehicles or []),
                    # No "branches" concept exists anywhere in the schema and
                    # no logo-upload flow is wired up — disclosed as 0/null
                    # rather than fabricated.
                    "branches": 0,
                    "logo": None,
                    "createdAt": c.createdAt.isoformat() if c.createdAt else None,
                }
                for c in companies
            ],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="Companies retrieved successfully.",
    )


def _company_out(c) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "legalName": c.legalName,
        "email": c.email,
        "phone": c.phone,
        "address": c.address,
        "city": c.city,
        "state": c.state,
        "pincode": c.pincode,
        "website": c.website,
        "status": c.status.value if hasattr(c.status, "value") else c.status,
        "employees": len(c.employees or []),
        "fleet": len(c.vehicles or []),
        "branches": 0,
        "logo": None,
        "createdAt": c.createdAt.isoformat() if c.createdAt else None,
    }


@router.post("/companies", status_code=201)
async def create_company(payload: CompanyCreateRequest, admin: AdminUser) -> dict:
    from app.repositories.company_repository import CompanyRepository

    company_repo = CompanyRepository()
    company = await company_repo.create_company(**payload.model_dump(exclude_unset=True))
    return success(_company_out(company), message="Company created successfully.")


@router.patch("/companies/{company_id}")
async def update_company(company_id: str, payload: CompanyUpdateRequest, admin: AdminUser) -> dict:
    from app.repositories.base import to_uuid
    from app.repositories.company_repository import CompanyRepository

    key = to_uuid(company_id)
    updates = payload.model_dump(exclude_unset=True)
    if key is None or not updates:
        raise NotFoundError("Company not found.")
    company_repo = CompanyRepository()
    company = await company_repo.update_company(key, **updates)
    if company is None:
        raise NotFoundError("Company not found.")
    return success(_company_out(company), message="Company updated successfully.")


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, admin: AdminUser) -> dict:
    from app.repositories.base import to_uuid
    from app.repositories.company_repository import CompanyRepository

    key = to_uuid(company_id)
    if key is None:
        raise NotFoundError("Company not found.")
    company_repo = CompanyRepository()
    company = await company_repo.soft_delete_company(key)
    if company is None:
        raise NotFoundError("Company not found.")
    return success(_company_out(company), message="Company deleted successfully.")


# --- Approval Logs ---

@router.get("/approval-logs")
async def list_approval_logs(
    admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """List approval logs."""
    logs, total = await approval_service.get_admin_approval_logs(str(admin.id), page, page_size)
    return success(
        {
            "items": [ApprovalLogOut.model_validate(log).model_dump(mode="json") for log in logs],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        message="Approval logs retrieved successfully.",
    )


# --- Audit Logs ---

@router.get("/audit-logs")
async def list_audit_logs(
    admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> dict:
    """List audit logs."""
    audit_repo = AuditLogRepository()
    logs, total = await audit_repo.find_all(page, page_size, action, entity_type, entity_id)
    return success(
        {
            "items": [AuditLogOut.model_validate(log).model_dump(mode="json") for log in logs],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        message="Audit logs retrieved successfully.",
    )


@router.get("/audit-logs/{log_id}")
async def get_audit_log(
    log_id: str,
    admin: AdminUser,
) -> dict:
    """Get an audit log by ID."""
    audit_repo = AuditLogRepository()
    log = await audit_repo.find_by_id(log_id)
    if not log:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Audit log not found")
    return success(AuditLogOut.model_validate(log).model_dump(mode="json"), message="Audit log retrieved successfully.")


# --- Vehicles ---

@router.get("/vehicles")
async def list_vehicles(
    admin: CompanyAdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
) -> dict:
    """List vehicles. Super Admin / Admin see every company's vehicles;
    a Company Admin sees only their own company's."""
    from app.repositories.vehicle_repository import VehicleRepository
    from app.api.v1.dashboards import _vehicle_dict

    vehicle_repo = VehicleRepository()
    vehicles, total = await vehicle_repo.get_all_vehicles(
        page=page,
        page_size=page_size,
        status=status,
        search=search,
        company_id=await effective_company_id(admin),
    )
    items = [await _vehicle_dict(v) for v in vehicles]
    return success(
        {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="Vehicles retrieved successfully.",
    )


@router.get("/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str, admin: CompanyAdminUser) -> dict:
    """Get a vehicle by ID. Company Admin may only view vehicles in their own
    company."""
    from app.repositories.base import to_uuid
    from app.repositories.vehicle_repository import VehicleRepository
    from app.api.v1.dashboards import _vehicle_detail_dict

    key = to_uuid(vehicle_id)
    if key is None:
        raise NotFoundError("Vehicle not found.")
    vehicle_repo = VehicleRepository()
    vehicle = await vehicle_repo.find_by_id(str(key))
    if vehicle is None:
        raise NotFoundError("Vehicle not found.")
    await assert_same_company(admin, vehicle.companyId)
    return success(await _vehicle_detail_dict(vehicle), message="Vehicle retrieved successfully.")
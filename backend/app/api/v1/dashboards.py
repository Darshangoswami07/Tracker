"""Shared order-detail + GR-panel endpoints.

Customer/driver/business/employee self-service dashboards have been removed
from the mobile app; only Admin/Super Admin have a mobile UI now. This
module keeps what admin still depends on:

- The `/employee/orders` listing, still used by the admin-reused "GR Tracker
  (Classic)" screen (StaffGRPanelScreen) — role-agnostic server-side for any
  GR-access role.
- A shared order-detail endpoint (GET /orders/{id}) that powers the Order
  Details screen, with per-role access control.
- `_vehicle_dict`/`_vehicle_detail_dict`, imported directly by admin.py's
  vehicle-management endpoints.

ADMIN/DISPATCHER keep using the existing /admin/dashboard/* module.
"""
from __future__ import annotations

import uuid as uuidlib
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, Query, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, require_roles
from app.core.config import settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationBusinessError
from app.core.rbac import is_admin
from app.database.db import session_scope
from app.models.customer import Customer
from app.models.employee import Employee
from app.models.enums import FileKind, UserRole
from app.repositories.driver_repository import DriverRepository
from app.repositories.order_attachment_repository import OrderAttachmentRepository
from app.repositories.order_repository import OrderRepository
from app.services.storage_service import (
    file_exists,
    generate_download_url,
    resolve_absolute_path,
    save_upload,
)
from app.services.user_service import user_service
from app.utils.pagination import clamp_page, pages_count
from app.utils.responses import success

router = APIRouter()

User = CurrentUser

# Staff-only dependency for the /employee/* routes below. Hierarchical role
# checking means EMPLOYEE and anything ranked above it (DRIVER, DISPATCHER,
# BUSINESS/BUSINESS_OWNER, ADMIN, SUPER_ADMIN) pass; CUSTOMER is rejected with
# 403. Previously these routes only depended on `CurrentUser`, so any
# authenticated customer could read platform-wide staff data.
StaffUser = Annotated[User, Depends(require_roles(UserRole.EMPLOYEE))]


def _order_dict(order) -> dict:
    """Serialises an Order into the compact shape the mobile dashboards (and
    the web `/tracker` Staff Panel, which lists via this same endpoint since
    it isn't Admin-tier) expect."""
    customer = order.customer if order.customer is not None else None
    return {
        "id": str(order.id),
        "orderNumber": order.orderNumber,
        "customerName": getattr(customer, "fullName", None) or "Walk-in",
        "status": _status_value(order.status),
        "amount": float(order.paymentAmount) if order.paymentAmount is not None else 0.0,
        "createdAt": order.createdAt.isoformat() if order.createdAt else None,
        "pickupAddress": order.pickupAddress,
        "deliveryAddress": order.deliveryAddress,
        "distance": order.distance,
        "consignorName": order.consignorName,
        "consigneeName": order.consigneeName,
        "hasSlip": bool(order.attachments),
    }


def _paginated(items: list, total: int, page: int, page_size: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "pages": pages_count(total, page_size),
    }


async def _driver_full_name(driver) -> tuple[str | None, str | None]:
    """Resolves a driver's display name + phone from their user record."""
    if driver is None or not getattr(driver, "userId", None):
        return None, None
    try:
        driver_user = await user_service.get_by_id(str(driver.userId))
    except Exception:
        return None, None
    if driver_user is None:
        return None, None
    return driver_user.fullName, driver_user.phone


def _status_value(value) -> str:
    return str(value.value) if hasattr(value, "value") else str(value)


def _attachment_url(order_id, attachment_id) -> str:
    from app.core.config import settings

    return f"{settings.APP_PUBLIC_URL}{settings.API_V1_PREFIX}/orders/{order_id}/attachments/{attachment_id}/file"


async def _order_detail_dict(order) -> dict:
    """Serialises a full order/GR with customer/driver/vehicle/timeline/slip details."""
    customer = order.customer
    driver = order.driver
    vehicle = order.vehicle
    driver_name, driver_phone = (
        await _driver_full_name(driver) if driver is not None else (None, None)
    )

    priority = _status_value(order.priority)
    status = _status_value(order.status)

    history_rows = sorted(
        order.statusHistory or [],
        key=lambda row: row.timestamp,
    )

    attachment_rows = sorted(
        order.attachments or [], key=lambda row: row.createdAt, reverse=True
    )

    return {
        "id": str(order.id),
        "orderNumber": order.orderNumber,
        "customerName": getattr(customer, "fullName", None) or "Walk-in",
        "customerPhone": (getattr(customer, "phone", None)) or None,
        "customerEmail": (getattr(customer, "email", None)) or None,
        "status": status,
        "amount": float(order.paymentAmount) if order.paymentAmount is not None else 0.0,
        "createdAt": order.createdAt.isoformat() if order.createdAt else None,
        "updatedAt": order.updatedAt.isoformat() if order.updatedAt else None,
        "pickupAddress": order.pickupAddress,
        "pickupLat": getattr(customer, "latitude", None),
        "pickupLng": getattr(customer, "longitude", None),
        "deliveryAddress": order.deliveryAddress,
        "distance": order.distance,
        "weight": order.weight,
        "dimensions": order.dimensions,
        "priority": priority,
        "notes": order.notes,
        "trackingCode": order.trackingCode,
        "driverName": driver_name,
        "driverPhone": driver_phone,
        "vehiclePlate": getattr(vehicle, "licensePlate", None),
        "vehicleType": _status_value(getattr(vehicle, "vehicleType", None))
        if vehicle is not None
        else None,
        # GR (transport slip) fields.
        "consignorName": order.consignorName,
        "consigneeName": order.consigneeName,
        "particulars": order.particulars,
        "packageCount": order.packageCount,
        "assignedStaffId": str(order.assignedStaffId) if order.assignedStaffId else None,
        "driverId": str(order.driverId) if order.driverId else None,
        "timeline": [
            {
                "id": str(item.id),
                "status": item.status,
                "description": item.notes or item.status,
                "location": item.location,
                "timestamp": item.timestamp.isoformat() if item.timestamp else None,
            }
            for item in history_rows
        ],
        "attachments": [
            {
                "id": str(row.id),
                "fileKind": row.fileKind.value if hasattr(row.fileKind, "value") else row.fileKind,
                "originalFilename": row.originalFilename,
                "mimeType": row.mimeType,
                "fileSizeBytes": row.fileSizeBytes,
                "createdAt": row.createdAt.isoformat() if row.createdAt else None,
                "url": _attachment_url(order.id, row.id),
            }
            for row in attachment_rows
        ],
        "proofOfDelivery": {
            "imageUrl": order.proofOfDeliveryUrl,
            "notes": order.notes,
            "timestamp": order.deliveryTime.isoformat() if order.deliveryTime else None,
        }
        if order.proofOfDeliveryUrl or order.deliveryTime
        else None,
    }


# ---------------------------------------------------------------------------
# Shared order detail endpoint (used by every role's Order Details screen)
# ---------------------------------------------------------------------------

@router.get("/orders/track/{gr_number}")
async def track_order_by_gr_number(
    user: User,
    gr_number: Annotated[str, Path()],
) -> dict:
    """Looks up a GR by its human-readable GR/order number (what a customer
    actually types in to track a shipment, as opposed to the internal UUID
    `GET /orders/{id}` takes). The GR number is a public tracking key — any
    authenticated user can track any shipment by number, which matches how
    the web/Admin tracking works. Ownership/role checks still apply to the
    UUID-based detail and write endpoints."""
    order_repo = OrderRepository()
    order = await order_repo.get_by_order_number(gr_number.strip())
    if order is None:
        raise NotFoundError("No shipment found with that GR number.")

    order_with_details = await order_repo.get_order_with_details(order.id)
    return success(await _order_detail_dict(order_with_details))


@router.get("/orders/{order_id}")
async def order_details(
    user: User,
    order_id: Annotated[str, Path()],
) -> dict:
    """Returns a full order, with role-based access control."""
    parsed = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    if parsed is None:
        raise NotFoundError()

    order_repo = OrderRepository()
    order = await order_repo.get_order_with_details(parsed)
    if order is None:
        raise NotFoundError()

    await _assert_order_access(user, order)
    return success(await _order_detail_dict(order))


@router.patch("/orders/{order_id}/status")
async def update_order_status_shared(
    user: User,
    order_id: Annotated[str, Path()],
    payload: dict,
) -> dict:
    """Updates a GR's status. Same visibility check as viewing the order
    (`_assert_order_access`), plus an explicit write-permission check:
    Customer is read-only even though they can view — "no administrative
    modification" per the role permission model."""
    parsed = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    if parsed is None:
        raise NotFoundError()

    order_repo = OrderRepository()
    order = await order_repo.get_order_with_details(parsed)
    if order is None:
        raise NotFoundError()

    await _assert_order_access(user, order)
    role = user.role if not isinstance(user.role, str) else UserRole(user.role)
    if role == UserRole.CUSTOMER:
        raise ForbiddenError("Customers cannot modify shipment status.")

    new_status = str(payload.get("status") or "").strip()
    if not new_status:
        raise ValidationBusinessError("status is required.")

    # Same role gate as PATCH /admin/orders/{id}/status: STAFF/EMPLOYEE may
    # only move a GR pending→delivered — never to cleared/uncleared, never
    # out of a terminal status. Admin-tier callers are unaffected.
    from app.services.gr_status_service import assert_status_transition_allowed

    assert_status_transition_allowed(user, order.status, new_status)

    updated = await order_repo.update_status(parsed, new_status, user_id=user.id)
    return success(await _order_detail_dict(updated), message="Status updated successfully.")


@router.post("/orders/{order_id}/attachments", status_code=201)
async def upload_order_attachment(
    user: User,
    order_id: Annotated[str, Path()],
    file: UploadFile = File(...),
    fileKind: Annotated[str, Form()] = FileKind.GENERIC.value,
) -> dict:
    """Uploads a slip/photo for a GR. Every role that can *view* the order can
    attempt this, except CUSTOMER (view-only per the business rules) — the
    check is enforced here, server-side, not just hidden in the UI."""
    parsed = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    if parsed is None:
        raise NotFoundError()

    order_repo = OrderRepository()
    order = await order_repo.get_order_with_details(parsed)
    if order is None:
        raise NotFoundError()

    await _assert_order_access(user, order)
    role = user.role if not isinstance(user.role, str) else UserRole(user.role)
    if role == UserRole.CUSTOMER:
        raise ForbiddenError("Customers may only view slips/documents, not upload them.")

    relative_path, size, mime_type = await save_upload(file, subdir=f"orders/{order_id}")
    attachment_repo = OrderAttachmentRepository()
    attachment = await attachment_repo.create(
        order_id=parsed,
        file_kind=fileKind,
        storage_path=relative_path,
        original_filename=file.filename or "upload",
        mime_type=mime_type,
        file_size_bytes=size,
        uploaded_by=user.id,
    )
    return success(
        {
            "id": str(attachment.id),
            "fileKind": attachment.fileKind.value if hasattr(attachment.fileKind, "value") else attachment.fileKind,
            "originalFilename": attachment.originalFilename,
            "mimeType": attachment.mimeType,
            "fileSizeBytes": attachment.fileSizeBytes,
            "createdAt": attachment.createdAt.isoformat(),
            "url": _attachment_url(parsed, attachment.id),
        },
        message="Slip uploaded successfully.",
    )


@router.get("/orders/{order_id}/attachments/{attachment_id}/file")
async def download_order_attachment(
    user: User,
    order_id: Annotated[str, Path()],
    attachment_id: Annotated[str, Path()],
) -> FileResponse:
    """Streams a slip/photo file. Requires a valid bearer token and the same
    per-role ownership check as viewing the order itself — never served from
    an unauthenticated static directory."""
    parsed_order = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    parsed_attachment = uuidlib.UUID(attachment_id) if _is_uuid(attachment_id) else None
    if parsed_order is None or parsed_attachment is None:
        raise NotFoundError()

    order_repo = OrderRepository()
    order = await order_repo.get_order_with_details(parsed_order)
    if order is None:
        raise NotFoundError()
    await _assert_order_access(user, order)

    attachment_repo = OrderAttachmentRepository()
    attachment = await attachment_repo.find_by_id(str(parsed_attachment))
    if attachment is None or attachment.orderId != parsed_order:
        raise NotFoundError("Attachment not found.")

    if not file_exists(attachment.storagePath):
        raise NotFoundError("Stored file is missing.")

    if settings.STORAGE_BACKEND == "s3":
        presigned_url = generate_download_url(attachment.storagePath)
        return RedirectResponse(url=presigned_url, status_code=302)

    absolute_path = resolve_absolute_path(attachment.storagePath)
    return FileResponse(path=absolute_path, media_type=attachment.mimeType, filename=attachment.originalFilename)


def _is_uuid(value: str) -> bool:
    try:
        uuidlib.UUID(value)
        return True
    except (ValueError, TypeError):
        return False


async def _assert_order_access(user, order) -> None:
    """Grants access based on the authenticated user's role + ownership."""
    role = user.role if not isinstance(user.role, str) else UserRole(user.role)

    if is_admin(role):
        return

    if role == UserRole.DRIVER:
        driver_repo = DriverRepository()
        driver = await driver_repo.find_by_user_id(str(user.id))
        if driver is not None and order.driverId == driver.id:
            return
        raise ForbiddenError()

    if role in (UserRole.EMPLOYEE, UserRole.BUSINESS, UserRole.BUSINESS_OWNER):
        company_id = await _company_id_for(user)
        if company_id is not None and order.companyId == company_id:
            return
        raise ForbiddenError()

    if role == UserRole.CUSTOMER:
        customer_id = await _customer_id_for(user)
        if customer_id is not None and order.customerId == customer_id:
            return
        raise ForbiddenError()

    raise ForbiddenError()


# ---------------------------------------------------------------------------
# Employee orders — still used by the admin-reused "GR Tracker (Classic)"
# screen (StaffGRPanelScreen), role-agnostic server-side for any GR-access
# role.
# ---------------------------------------------------------------------------

@router.get("/employee/orders")
async def employee_recent_orders(
    user: StaffUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """Orders for the employee dashboard, scoped to the caller's company."""
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    order_repo = OrderRepository()
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    orders, total = await order_repo.get_all_orders(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    return success(_paginated([_order_dict(o) for o in orders], total, n_page, n_size))


# ---------------------------------------------------------------------------
# _vehicle_dict/_vehicle_detail_dict below are imported directly by
# admin.py's vehicle-management endpoints — kept even though this module's
# own /employee, /business vehicle-listing routes were removed.
# ---------------------------------------------------------------------------

async def _vehicle_dict(vehicle) -> dict:
    driver_name = None
    active_assignment = next((a for a in vehicle.assignments if a.isActive), None)
    if active_assignment is not None:
        driver_repo = DriverRepository()
        assigned_driver = await driver_repo.find_by_id(active_assignment.driverId)
        driver_name, _ = await _driver_full_name(assigned_driver)
    return {
        "id": str(vehicle.id),
        "licensePlate": vehicle.licensePlate,
        "vehicleType": _status_value(vehicle.vehicleType),
        "make": vehicle.make,
        "model": vehicle.model,
        "year": vehicle.year,
        "status": _status_value(vehicle.status),
        "companyName": getattr(vehicle.company, "name", None) or "Unknown",
        "driverName": driver_name,
        # No fuel-telemetry table exists yet — this is a disclosed placeholder,
        # not real sensor data, until vehicle IoT/fuel tracking is built.
        "fuelLevel": 100,
        "lastMaintenance": vehicle.lastMaintenance,
        "nextMaintenance": vehicle.nextMaintenance,
    }


async def _vehicle_detail_dict(vehicle) -> dict:
    base = await _vehicle_dict(vehicle)
    driver_phone = None
    active_assignment = next((a for a in vehicle.assignments if a.isActive), None)
    if active_assignment is not None:
        driver_repo = DriverRepository()
        assigned_driver = await driver_repo.find_by_id(active_assignment.driverId)
        _, driver_phone = await _driver_full_name(assigned_driver)
    images = sorted(vehicle.images or [], key=lambda i: (not i.isPrimary, i.createdAt))
    return {
        **base,
        "vin": vehicle.vin,
        "color": vehicle.color,
        "capacity": vehicle.capacity,
        "driverPhone": driver_phone,
        "insuranceExpiry": None,
        "registrationExpiry": None,
        "images": [img.imageUrl for img in images],
        # No maintenance/fuel-log tables exist yet — disclosed empty lists,
        # not fabricated history.
        "maintenanceHistory": [],
        "fuelHistory": [],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _company_id_for(user) -> object | None:
    """Returns the caller's own tenant/company id.

    Prefers ``User.companyId`` (set directly for accounts created via the
    Company Admin staff/driver creation endpoints), falling back to the
    ``Employee`` linkage table for accounts associated with a company that
    way (the pre-existing mechanism, still used elsewhere/by tests)."""
    if user.companyId is not None:
        return user.companyId
    async with session_scope() as session:
        result = await session.execute(
            select(Employee.companyId).where(Employee.userId == str(user.id))
        )
        return result.scalar_one_or_none()


async def _customer_id_for(user) -> object | None:
    async with session_scope() as session:
        result = await session.execute(
            select(Customer.id).where(
                (Customer.email == user.email) | (Customer.phone == user.phone)
            ).limit(1)
        )
        return result.scalar_one_or_none()
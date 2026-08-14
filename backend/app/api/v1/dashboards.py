"""Role-scoped dashboard endpoints.

The mobile app opens a different dashboard per role. These endpoints expose
real, database-backed summaries for each role instead of inventing routes that
do not exist:

- EMPLOYEE  -> /employee/dashboard/stats + /employee/orders
- DRIVER    -> /driver/dashboard/stats + /driver/deliveries/today
- BUSINESS  -> /business/dashboard/stats + /business/orders
- CUSTOMER  -> /customer/dashboard/stats + /customer/orders

ADMIN/DISPATCHER keep using the existing /admin/dashboard/* module.

A shared order-detail endpoint (GET /orders/{id}) powers the Order Details
screens across all roles, with per-role access control.
"""
from __future__ import annotations

import uuid as uuidlib
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DriverUser, require_roles
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationBusinessError
from app.core.rbac import is_admin
from app.database.db import session_scope
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.employee import Employee
from app.models.enums import FileKind, OrderStatus, UserRole
from app.models.order import Order
from app.repositories.customer_repository import CustomerRepository
from app.repositories.driver_repository import DriverRepository
from app.repositories.order_attachment_repository import OrderAttachmentRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.services.storage_service import resolve_absolute_path, save_upload
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

    absolute_path = resolve_absolute_path(attachment.storagePath)
    if not absolute_path.exists():
        raise NotFoundError("Stored file is missing.")
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
# Employee dashboard
# ---------------------------------------------------------------------------

@router.get("/employee/dashboard/stats")
async def employee_dashboard_stats(user: StaffUser) -> dict:
    """Aggregate stats visible to an operations employee, scoped to their
    own company (Staff belongs to exactly one transport company)."""
    company_id = await _company_id_for(user)
    order_repo = OrderRepository()
    driver_repo = DriverRepository()

    stats = {
        "totalOrders": 0,
        "pendingOrders": 0,
        "inProgressOrders": 0,
        "completedOrders": 0,
        "totalRevenue": 0,
        "activeDrivers": 0,
    }
    if company_id is None:
        return success(stats)

    stats["pendingOrders"] = await order_repo.count_by_status_for_company(
        company_id, OrderStatus.PENDING.value
    )
    stats["inProgressOrders"] = sum(
        await order_repo.count_by_status_for_company(company_id, s)
        for s in (OrderStatus.ASSIGNED.value, OrderStatus.PICKUP.value, OrderStatus.IN_TRANSIT.value)
    )
    stats["completedOrders"] = await order_repo.count_by_status_for_company(
        company_id, OrderStatus.DELIVERED.value
    )
    stats["totalRevenue"] = await order_repo.sum_revenue_for_company(company_id)
    stats["activeDrivers"] = await _count_drivers_online_for_company(company_id)
    stats["totalOrders"] = (
        stats["pendingOrders"] + stats["inProgressOrders"] + stats["completedOrders"]
    )
    return success(stats)


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
# Customers / Drivers / Vehicles listings, shared by Employee (platform-wide,
# matches the existing /employee/orders convention) and Business (scoped to
# the caller's own company, matches /business/orders). These back the
# CustomersScreen/DriversScreen/VehiclesScreen mobile screens, which existed
# but called routes that were never implemented (real 404s, not a UI bug).
# ---------------------------------------------------------------------------

async def _customer_stats(session, customer_id) -> tuple[int, float, str | None]:
    result = await session.execute(
        select(
            func.count(Order.id),
            func.coalesce(func.sum(Order.paymentAmount), 0),
            func.max(Order.createdAt),
        ).where(Order.customerId == customer_id)
    )
    total_orders, total_spent, last_order_at = result.one()
    return (
        total_orders or 0,
        float(total_spent or 0),
        last_order_at.isoformat() if last_order_at else None,
    )


async def _customer_dict(customer) -> dict:
    async with session_scope() as session:
        total_orders, total_spent, last_order_date = await _customer_stats(session, customer.id)
    return {
        "id": str(customer.id),
        "fullName": customer.fullName,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "city": customer.city,
        "totalOrders": total_orders,
        "totalSpent": total_spent,
        "lastOrderDate": last_order_date,
        "isActive": customer.isActive,
        "createdAt": customer.createdAt.isoformat() if customer.createdAt else None,
    }


async def _driver_list_dict(driver) -> dict:
    driver_name, driver_phone = await _driver_full_name(driver)
    driver_user = await user_service.get_by_id(str(driver.userId)) if driver.userId else None
    vehicle_repo = VehicleRepository()
    vehicle = await vehicle_repo.find_assigned_for_driver(driver.id)
    return {
        "id": str(driver.id),
        "fullName": driver_name or "Unknown",
        "phone": driver_phone,
        "email": getattr(driver_user, "email", None),
        "licenseNumber": driver.licenseNumber,
        "licenseExpiry": driver.licenseExpiry.isoformat() if driver.licenseExpiry else None,
        "vehiclePlate": getattr(vehicle, "licensePlate", None),
        "vehicleType": _status_value(vehicle.vehicleType) if vehicle is not None else None,
        "status": _status_value(driver.status),
        "rating": driver.rating,
        "completedOrders": driver.totalDeliveries,
        "isOnline": _status_value(driver.status) == "online",
        "companyName": getattr(driver.company, "name", None) or "Unknown",
    }


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


@router.get("/employee/customers")
async def employee_customers(
    user: StaffUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    customer_repo = CustomerRepository()
    customers, total = await customer_repo.get_all_customers(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _customer_dict(c) for c in customers]
    return success(_paginated(items, total, n_page, n_size))


@router.get("/employee/drivers")
async def employee_drivers(
    user: StaffUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    driver_repo = DriverRepository()
    drivers, total = await driver_repo.get_all_drivers(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _driver_list_dict(d) for d in drivers]
    return success(_paginated(items, total, n_page, n_size))


@router.get("/employee/vehicles")
async def employee_vehicles(
    user: StaffUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    vehicle_repo = VehicleRepository()
    vehicles, total = await vehicle_repo.get_all_vehicles(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _vehicle_dict(v) for v in vehicles]
    return success(_paginated(items, total, n_page, n_size))


@router.get("/business/customers")
async def business_customers(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    customer_repo = CustomerRepository()
    customers, total = await customer_repo.get_all_customers(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _customer_dict(c) for c in customers]
    return success(_paginated(items, total, n_page, n_size))


@router.get("/business/drivers")
async def business_drivers(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    driver_repo = DriverRepository()
    drivers, total = await driver_repo.get_all_drivers(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _driver_list_dict(d) for d in drivers]
    return success(_paginated(items, total, n_page, n_size))


@router.get("/business/vehicles")
async def business_vehicles(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    vehicle_repo = VehicleRepository()
    vehicles, total = await vehicle_repo.get_all_vehicles(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    items = [await _vehicle_dict(v) for v in vehicles]
    return success(_paginated(items, total, n_page, n_size))


# ---------------------------------------------------------------------------
# Customer / Driver / Vehicle detail-by-id, backing CustomerDetailsScreen,
# DriverDetailsScreen, and VehicleDetailsScreen (mobile). These screens
# existed and called `${base}/customers/{id}` etc., but no detail-by-id
# route existed at all — only the list endpoints above. Some UI fields on
# these screens (vehicle maintenance/fuel history, vehicle photo gallery
# captions beyond what `VehicleImage` stores, driver total earnings) have no
# backing table; those are returned as empty/zero rather than fabricated.
# ---------------------------------------------------------------------------

async def _customer_detail_dict(customer) -> dict:
    async with session_scope() as session:
        total_orders, total_spent, last_order_date = await _customer_stats(session, customer.id)
        orders_result = await session.execute(
            select(Order)
            .where(Order.customerId == customer.id)
            .order_by(Order.createdAt.desc())
            .limit(10)
        )
        recent_orders = orders_result.scalars().all()
    return {
        "id": str(customer.id),
        "fullName": customer.fullName,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "city": customer.city,
        "state": customer.state,
        "pincode": customer.pincode,
        "totalOrders": total_orders,
        "totalSpent": total_spent,
        "lastOrderDate": last_order_date,
        "isActive": customer.isActive,
        "isVerified": True,
        "createdAt": customer.createdAt.isoformat() if customer.createdAt else None,
        "savedAddresses": [
            {
                "id": str(a.id),
                "label": a.label,
                "address": a.address,
                "city": a.city,
                "isDefault": a.isDefault,
            }
            for a in (customer.addresses or [])
        ],
        "recentOrders": [
            {
                "id": str(o.id),
                "orderNumber": o.orderNumber,
                "status": _status_value(o.status),
                "amount": float(o.paymentAmount) if o.paymentAmount is not None else 0.0,
                "createdAt": o.createdAt.isoformat() if o.createdAt else None,
                "pickupAddress": o.pickupAddress,
                "deliveryAddress": o.deliveryAddress,
            }
            for o in recent_orders
        ],
    }


async def _driver_detail_dict(driver) -> dict:
    driver_name, driver_phone = await _driver_full_name(driver)
    driver_user = await user_service.get_by_id(str(driver.userId)) if driver.userId else None
    vehicle_repo = VehicleRepository()
    vehicle = await vehicle_repo.find_assigned_for_driver(driver.id)
    async with session_scope() as session:
        orders_result = await session.execute(
            select(Order)
            .where(Order.driverId == driver.id)
            .where(Order.status.notin_([OrderStatus.DELIVERED, OrderStatus.CANCELLED]))
            .order_by(Order.createdAt.desc())
            .limit(20)
        )
        assigned_orders = orders_result.scalars().all()
    return {
        "id": str(driver.id),
        "fullName": driver_name or "Unknown",
        "phone": driver_phone,
        "email": getattr(driver_user, "email", None),
        "licenseNumber": driver.licenseNumber,
        "licenseExpiry": driver.licenseExpiry.isoformat() if driver.licenseExpiry else None,
        "vehiclePlate": getattr(vehicle, "licensePlate", None),
        "vehicleType": _status_value(vehicle.vehicleType) if vehicle is not None else None,
        "vehicleId": str(vehicle.id) if vehicle is not None else None,
        "status": _status_value(driver.status),
        "rating": driver.rating,
        "completedOrders": driver.totalDeliveries,
        # No earnings/payout table exists yet for drivers — disclosed zero,
        # not fabricated data.
        "totalEarnings": 0,
        "isOnline": _status_value(driver.status) == "online",
        "companyName": getattr(driver.company, "name", None) or "Unknown",
        "assignedOrders": [
            {
                "id": str(o.id),
                "orderNumber": o.orderNumber,
                "status": _status_value(o.status),
                "pickupAddress": o.pickupAddress,
                "deliveryAddress": o.deliveryAddress,
            }
            for o in assigned_orders
        ],
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


@router.get("/employee/customers/{customer_id}")
async def employee_customer_detail(user: StaffUser, customer_id: Annotated[str, Path()]) -> dict:
    company_id = await _company_id_for(user)
    customer_repo = CustomerRepository()
    customer = await customer_repo.find_by_id(customer_id)
    if customer is None:
        raise NotFoundError("Customer not found.")
    has_order_with_company = company_id is not None and any(
        o.companyId == company_id for o in (customer.orders or [])
    )
    if not has_order_with_company:
        raise ForbiddenError("This customer has no orders with your company.")
    return success(await _customer_detail_dict(customer))


@router.get("/business/customers/{customer_id}")
async def business_customer_detail(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    customer_id: Annotated[str, Path()],
) -> dict:
    company_id = await _company_id_for(user)
    customer_repo = CustomerRepository()
    customer = await customer_repo.find_by_id(customer_id)
    if customer is None:
        raise NotFoundError("Customer not found.")
    has_order_with_company = company_id is not None and any(
        o.companyId == company_id for o in (customer.orders or [])
    )
    if not has_order_with_company:
        raise ForbiddenError("This customer has no orders with your company.")
    return success(await _customer_detail_dict(customer))


@router.get("/employee/drivers/{driver_id}")
async def employee_driver_detail(user: StaffUser, driver_id: Annotated[str, Path()]) -> dict:
    company_id = await _company_id_for(user)
    driver_repo = DriverRepository()
    driver = await driver_repo.find_by_id(driver_id)
    if driver is None or company_id is None or driver.companyId != company_id:
        raise NotFoundError("Driver not found.")
    return success(await _driver_detail_dict(driver))


@router.get("/business/drivers/{driver_id}")
async def business_driver_detail(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    driver_id: Annotated[str, Path()],
) -> dict:
    company_id = await _company_id_for(user)
    driver_repo = DriverRepository()
    driver = await driver_repo.find_by_id(driver_id)
    if driver is None or company_id is None or driver.companyId != company_id:
        raise NotFoundError("Driver not found.")
    return success(await _driver_detail_dict(driver))


@router.get("/employee/vehicles/{vehicle_id}")
async def employee_vehicle_detail(user: StaffUser, vehicle_id: Annotated[str, Path()]) -> dict:
    company_id = await _company_id_for(user)
    vehicle_repo = VehicleRepository()
    vehicle = await vehicle_repo.find_by_id(vehicle_id)
    if vehicle is None or company_id is None or vehicle.companyId != company_id:
        raise NotFoundError("Vehicle not found.")
    return success(await _vehicle_detail_dict(vehicle))


@router.get("/business/vehicles/{vehicle_id}")
async def business_vehicle_detail(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    vehicle_id: Annotated[str, Path()],
) -> dict:
    company_id = await _company_id_for(user)
    vehicle_repo = VehicleRepository()
    vehicle = await vehicle_repo.find_by_id(vehicle_id)
    if vehicle is None or company_id is None or vehicle.companyId != company_id:
        raise NotFoundError("Vehicle not found.")
    return success(await _vehicle_detail_dict(vehicle))


# ---------------------------------------------------------------------------
# Employee reports (CSV export of real order data — no fake/mock report rows)
# ---------------------------------------------------------------------------

REPORT_TYPE_NAMES = {
    "orders": "Orders Report",
    "revenue": "Revenue Report",
    "drivers": "Driver Performance",
    "vehicles": "Vehicle Utilization",
    "customers": "Customer Analytics",
    "operational": "Operational Report",
}


@router.get("/employee/reports")
async def list_employee_reports(
    user: StaffUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Lists previously generated reports."""
    from app.core.config import settings
    from app.repositories.report_repository import ReportRepository

    n_page, n_size = clamp_page(page, page_size)
    report_repo = ReportRepository()
    reports, total = await report_repo.find_recent(n_page, n_size)

    items = [
        {
            "id": str(r.id),
            "name": r.name,
            "type": r.type,
            "description": REPORT_TYPE_NAMES.get(r.type, r.type),
            "generatedAt": r.createdAt.isoformat() if r.createdAt else None,
            "size": f"{max(r.fileSizeBytes // 1024, 1)} KB" if r.fileSizeBytes else "—",
            "status": r.status,
            "downloadUrl": (
                f"{settings.APP_PUBLIC_URL}{settings.API_V1_PREFIX}/employee/reports/{r.id}/file"
                if r.storagePath
                else None
            ),
        }
        for r in reports
    ]
    return success(_paginated(items, total, n_page, n_size))


@router.post("/employee/reports/generate", status_code=201)
async def generate_employee_report(user: StaffUser, payload: dict) -> dict:
    """Synchronously generates a real CSV export from live order data and
    persists it via the local file storage service. There is no background
    job queue wired up in this project (Celery isn't running), so this
    completes immediately rather than going through a `generating` state —
    the response `status` is honestly `completed`, not a fabricated
    placeholder for an async pipeline that doesn't exist."""
    import csv
    import io

    from app.repositories.report_repository import ReportRepository
    from app.services.storage_service import save_generated_file

    report_type = str(payload.get("type") or "orders")
    report_name = REPORT_TYPE_NAMES.get(report_type, report_type.title())

    order_repo = OrderRepository()
    orders, _ = await order_repo.get_all_orders(page=1, page_size=500)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Order Number", "Status", "Pickup", "Delivery", "Distance (km)", "Weight (kg)", "Amount", "Created At"])
    for o in orders:
        writer.writerow(
            [
                o.orderNumber,
                o.status.value if hasattr(o.status, "value") else o.status,
                o.pickupAddress,
                o.deliveryAddress,
                o.distance,
                o.weight or "",
                o.paymentAmount or "",
                o.createdAt.isoformat() if o.createdAt else "",
            ]
        )
    content = buffer.getvalue().encode("utf-8")

    filename = f"{report_type}_report_{user.id}.csv"
    relative_path, size = await save_generated_file(content, subdir="reports", filename=filename)

    report_repo = ReportRepository()
    report = await report_repo.create(
        name=f"{report_name} — {len(orders)} orders",
        report_type=report_type,
        generated_by=user.id,
        storage_path=relative_path,
        file_size_bytes=size,
        status="completed",
    )
    return success({"id": str(report.id), "status": "completed"}, message="Report generated successfully.")


@router.get("/business/reports")
async def list_business_reports(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Lists previously generated reports. Mirrors `/employee/reports` —
    `BusinessReportsScreen.tsx` (mobile) called this route already, but it
    never existed server-side."""
    from app.core.config import settings
    from app.repositories.report_repository import ReportRepository

    n_page, n_size = clamp_page(page, page_size)
    report_repo = ReportRepository()
    reports, total = await report_repo.find_recent(n_page, n_size)

    items = [
        {
            "id": str(r.id),
            "name": r.name,
            "type": r.type,
            "description": REPORT_TYPE_NAMES.get(r.type, r.type),
            "generatedAt": r.createdAt.isoformat() if r.createdAt else None,
            "size": f"{max(r.fileSizeBytes // 1024, 1)} KB" if r.fileSizeBytes else "—",
            "status": r.status,
            "downloadUrl": (
                f"{settings.APP_PUBLIC_URL}{settings.API_V1_PREFIX}/business/reports/{r.id}/file"
                if r.storagePath
                else None
            ),
        }
        for r in reports
    ]
    return success(_paginated(items, total, n_page, n_size))


@router.post("/business/reports/generate", status_code=201)
async def generate_business_report(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    payload: dict,
) -> dict:
    """Same synchronous CSV-generation approach as `/employee/reports/generate`,
    scoped to the caller's own company's orders."""
    import csv
    import io

    from app.repositories.report_repository import ReportRepository
    from app.services.storage_service import save_generated_file

    company_id = await _company_id_for(user)
    if company_id is None:
        raise ForbiddenError("No company is linked to this account.")

    report_type = str(payload.get("type") or "orders")
    report_name = REPORT_TYPE_NAMES.get(report_type, report_type.title())

    order_repo = OrderRepository()
    orders, _ = await order_repo.get_all_orders(page=1, page_size=500, company_id=company_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Order Number", "Status", "Pickup", "Delivery", "Distance (km)", "Weight (kg)", "Amount", "Created At"])
    for o in orders:
        writer.writerow(
            [
                o.orderNumber,
                o.status.value if hasattr(o.status, "value") else o.status,
                o.pickupAddress,
                o.deliveryAddress,
                o.distance,
                o.weight or "",
                o.paymentAmount or "",
                o.createdAt.isoformat() if o.createdAt else "",
            ]
        )
    content = buffer.getvalue().encode("utf-8")

    filename = f"{report_type}_report_{user.id}.csv"
    relative_path, size = await save_generated_file(content, subdir="reports", filename=filename)

    report_repo = ReportRepository()
    report = await report_repo.create(
        name=f"{report_name} — {len(orders)} orders",
        report_type=report_type,
        generated_by=user.id,
        storage_path=relative_path,
        file_size_bytes=size,
        status="completed",
    )
    return success({"id": str(report.id), "status": "completed"}, message="Report generated successfully.")


@router.get("/business/reports/{report_id}/file")
async def download_business_report(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    report_id: Annotated[str, Path()],
) -> FileResponse:
    from app.repositories.report_repository import ReportRepository
    from app.services.storage_service import resolve_absolute_path

    report_repo = ReportRepository()
    report = await report_repo.find_by_id(report_id)
    if report is None or not report.storagePath:
        raise NotFoundError("Report not found.")

    absolute_path = resolve_absolute_path(report.storagePath)
    if not absolute_path.exists():
        raise NotFoundError("Stored report file is missing.")
    return FileResponse(path=absolute_path, media_type="text/csv", filename=f"{report.type}_report.csv")


@router.get("/employee/reports/{report_id}/file")
async def download_employee_report(user: StaffUser, report_id: Annotated[str, Path()]) -> FileResponse:
    """Streams a generated report file. Requires a valid bearer token."""
    from app.repositories.report_repository import ReportRepository
    from app.services.storage_service import resolve_absolute_path

    report_repo = ReportRepository()
    report = await report_repo.find_by_id(report_id)
    if report is None or not report.storagePath:
        raise NotFoundError("Report not found.")

    absolute_path = resolve_absolute_path(report.storagePath)
    if not absolute_path.exists():
        raise NotFoundError("Stored report file is missing.")
    return FileResponse(path=absolute_path, media_type="text/csv", filename=f"{report.type}_report.csv")


# ---------------------------------------------------------------------------
# Driver dashboard
# ---------------------------------------------------------------------------
@router.get("/driver/dashboard/stats")
async def driver_dashboard_stats(user: DriverUser) -> dict:
    """Driver-scoped stats derived from their real orders."""
    driver_repo = DriverRepository()
    order_repo = OrderRepository()
    vehicle_repo = VehicleRepository()

    driver = await driver_repo.find_by_user_id(str(user.id))

    stats = {
        "todayDeliveries": 0,
        "completedToday": 0,
        "pendingDeliveries": 0,
        "totalEarnings": 0.0,
        "earningsToday": 0.0,
        "rating": 5.0,
        "currentVehicle": None,
    }

    if driver is not None:
        delivered = [OrderStatus.DELIVERED.value]
        active = [
            OrderStatus.ASSIGNED.value,
            OrderStatus.PICKUP.value,
            OrderStatus.IN_TRANSIT.value,
        ]
        stats["todayDeliveries"] = await order_repo.count_today_for_driver(driver.id)
        stats["completedToday"] = await order_repo.count_by_driver(driver.id, delivered)
        stats["pendingDeliveries"] = await order_repo.count_by_driver(driver.id, active)
        stats["totalEarnings"] = await order_repo.sum_earnings_for_driver(driver.id)
        stats["earningsToday"] = await order_repo.sum_earnings_today_for_driver(driver.id)
        stats["rating"] = driver.rating

        vehicle = await vehicle_repo.find_assigned_for_driver(driver.id)
        if vehicle is not None:
            vehicle_type = getattr(vehicle, "vehicleType", None)
            stats["currentVehicle"] = {
                "id": str(vehicle.id),
                "plate": vehicle.licensePlate,
                "type": str(vehicle_type.value) if hasattr(vehicle_type, "value") else str(vehicle_type),
                "fuelLevel": getattr(vehicle, "fuelLevel", 0) or 0,
            }

    return success(stats)


@router.get("/driver/deliveries/today")
async def driver_today_deliveries(
    user: DriverUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """Deliveries for the driver (filters + pagination)."""
    driver_repo = DriverRepository()
    driver = await driver_repo.find_by_user_id(str(user.id))
    if driver is None:
        return success(_paginated([], 0, 1, page_size))

    n_page, n_size = clamp_page(page, page_size)
    order_repo = OrderRepository()
    orders, total = await order_repo.get_all_orders(
        page=n_page, page_size=n_size, status=status, search=search, driver_id=driver.id
    )
    return success(_paginated([_order_dict(o) for o in orders], total, n_page, n_size))


@router.post("/driver/orders/{order_id}/proof")
async def submit_delivery_proof(
    user: DriverUser,
    order_id: Annotated[str, Path()],
    image: UploadFile = File(...),
    signature: UploadFile | None = File(None),
    notes: Annotated[str, Form()] = "",
) -> dict:
    """Submits proof of delivery (photo + optional signature) and marks the
    order delivered. `DeliveryProofScreen.tsx` (mobile) already called this
    route; it never existed server-side. Stores both files as real
    `OrderAttachment` rows (same as every other slip/photo upload in this
    app) so they're served through the existing authenticated download
    endpoint, and also mirrors the photo's URL onto `Order.proofOfDeliveryUrl`
    for the at-a-glance summary shown elsewhere."""
    parsed = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    if parsed is None:
        raise NotFoundError("Order not found.")

    order_repo = OrderRepository()
    order = await order_repo.get_order_with_details(parsed)
    if order is None:
        raise NotFoundError("Order not found.")
    await _assert_order_access(user, order)

    attachment_repo = OrderAttachmentRepository()
    relative_path, size, mime_type = await save_upload(image, subdir=f"orders/{order_id}")
    image_attachment = await attachment_repo.create(
        order_id=parsed,
        file_kind=FileKind.PROOF_OF_DELIVERY,
        storage_path=relative_path,
        original_filename=image.filename or "delivery_photo.jpg",
        mime_type=mime_type,
        file_size_bytes=size,
        uploaded_by=user.id,
    )
    if signature is not None:
        sig_path, sig_size, sig_mime = await save_upload(signature, subdir=f"orders/{order_id}")
        await attachment_repo.create(
            order_id=parsed,
            file_kind=FileKind.PROOF_OF_DELIVERY,
            storage_path=sig_path,
            original_filename=signature.filename or "signature.png",
            mime_type=sig_mime,
            file_size_bytes=sig_size,
            uploaded_by=user.id,
        )

    async with session_scope() as session:
        db_order = await session.get(Order, parsed)
        db_order.proofOfDeliveryUrl = _attachment_url(parsed, image_attachment.id)
        if notes:
            db_order.notes = notes

    updated = await order_repo.update_status(parsed, OrderStatus.DELIVERED.value, user_id=user.id)
    return success(await _order_detail_dict(await order_repo.get_order_with_details(updated.id)), message="Proof of delivery submitted successfully.")


# ---------------------------------------------------------------------------
# Business dashboard
# ---------------------------------------------------------------------------
@router.get("/business/dashboard/stats")
async def business_dashboard_stats(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
) -> dict:
    """Business-facing aggregate stats."""
    company_id = await _company_id_for(user)
    order_repo = OrderRepository()

    stats = {
        "todayOrders": 0,
        "pendingOrders": 0,
        "completedOrders": 0,
        "revenue": 0.0,
        "driversOnline": 0,
        "vehiclesActive": 0,
    }
    if company_id is None:
        return success(stats)

    stats["todayOrders"] = await order_repo.count_created_today_for_company(company_id)
    stats["pendingOrders"] = await order_repo.count_by_status_for_company(
        company_id, OrderStatus.PENDING.value
    )
    stats["completedOrders"] = await order_repo.count_by_status_for_company(
        company_id, OrderStatus.DELIVERED.value
    )
    stats["revenue"] = await order_repo.sum_revenue_for_company(company_id)
    stats["driversOnline"] = await _count_drivers_online_for_company(company_id)
    stats["vehiclesActive"] = await _count_vehicles_active_for_company(company_id)
    return success(stats)


@router.get("/business/orders")
async def business_recent_orders(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """Orders visible to the business role (filters + pagination)."""
    company_id = await _company_id_for(user)
    n_page, n_size = clamp_page(page, page_size)
    order_repo = OrderRepository()
    if company_id is None:
        return success(_paginated([], 0, n_page, n_size))
    orders, total = await order_repo.get_all_orders(
        page=n_page, page_size=n_size, status=status, search=search, company_id=company_id
    )
    return success(_paginated([_order_dict(o) for o in orders], total, n_page, n_size))


@router.post("/business/orders", status_code=201)
async def create_business_order(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    payload: dict,
) -> dict:
    """Creates an order from the Business "New Order" form. This route never
    existed — `CreateOrderScreen.tsx` (mobile) POSTs here but had nothing to
    hit. Note the form collects a few fields with no backing column on
    `Order` (orderType, pickup/delivery lat-lng, a separate codAmount) —
    those are accepted but not persisted, rather than silently invented
    schema; `value` is mapped onto the real `paymentAmount` column."""
    company_id = await _company_id_for(user)
    if company_id is None:
        raise ForbiddenError("No company is linked to this account.")

    pickup_address = str(payload.get("pickupAddress") or "").strip()
    delivery_address = str(payload.get("deliveryAddress") or "").strip()
    if not pickup_address or not delivery_address:
        raise ValidationBusinessError("pickupAddress and deliveryAddress are required.")

    scheduled_time = payload.get("scheduledTime")
    try:
        pickup_time = datetime.fromisoformat(scheduled_time) if scheduled_time else datetime.now(timezone.utc)
    except ValueError:
        pickup_time = datetime.now(timezone.utc)

    def _to_uuid(value):
        return uuidlib.UUID(value) if value and _is_uuid(str(value)) else None

    def _to_float(value):
        try:
            return float(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    order_repo = OrderRepository()
    order = await order_repo.create_order(
        orderNumber=f"ORD-{uuidlib.uuid4().hex[:10].upper()}",
        companyId=company_id,
        customerId=_to_uuid(payload.get("customerId")),
        driverId=_to_uuid(payload.get("driverId")),
        vehicleId=_to_uuid(payload.get("vehicleId")),
        pickupAddress=pickup_address,
        deliveryAddress=delivery_address,
        pickupTime=pickup_time,
        weight=_to_float(payload.get("weight")),
        dimensions=str(payload.get("dimensions") or "") or None,
        notes=str(payload.get("notes") or "") or None,
        paymentAmount=_to_float(payload.get("value")) or _to_float(payload.get("codAmount")),
        status=OrderStatus.ASSIGNED if payload.get("driverId") else OrderStatus.PENDING,
    )
    detail = await order_repo.get_order_with_details(order.id)
    return success(_order_dict(detail), message="Order created successfully.")


@router.post("/business/orders/{order_id}/assign-driver")
async def business_assign_driver(
    user: Annotated[User, Depends(require_roles(UserRole.BUSINESS, UserRole.BUSINESS_OWNER))],
    order_id: Annotated[str, Path()],
    payload: dict,
) -> dict:
    """Assigns a driver to one of the caller's own company's GRs. Mirrors
    `POST /admin/orders/{id}/assign-driver` (gr.py) but scoped to Business
    instead of Admin-tier — that endpoint 404s for Business callers today
    since `AssignVehicleScreen.tsx` (mobile) has no non-admin equivalent to
    call."""
    parsed_order = uuidlib.UUID(order_id) if _is_uuid(order_id) else None
    driver_id = payload.get("driverId")
    if parsed_order is None or not driver_id:
        raise ValidationBusinessError("A valid order id and driverId are required.")

    company_id = await _company_id_for(user)
    if company_id is None:
        raise ForbiddenError("No company is linked to this account.")

    order_repo = OrderRepository()
    order = await order_repo.find_by_id(parsed_order)
    if order is None or order.companyId != company_id:
        raise NotFoundError("Order not found.")

    driver_repo = DriverRepository()
    driver = await driver_repo.find_by_id(driver_id)
    if driver is None or driver.companyId != company_id:
        raise ValidationBusinessError("Driver not found in your company.")

    updated = await order_repo.assign_driver(parsed_order, driver.id)
    return success(_order_dict(updated), message="Driver assigned successfully.")


# ---------------------------------------------------------------------------
# Customer dashboard
# ---------------------------------------------------------------------------
@router.get("/customer/dashboard/stats")
async def customer_dashboard_stats(
    user: Annotated[User, Depends(require_roles(UserRole.CUSTOMER))],
) -> dict:
    """Personal stats for the signed-in customer."""
    customer_id = await _customer_id_for(user)
    order_repo = OrderRepository()
    active = [
        OrderStatus.PENDING.value,
        OrderStatus.ASSIGNED.value,
        OrderStatus.PICKUP.value,
        OrderStatus.IN_TRANSIT.value,
    ]
    stats = {
        "totalOrders": 0,
        "activeOrders": 0,
        "completedOrders": 0,
        "totalSpent": 0.0,
    }
    if customer_id is None:
        return success(stats)

    stats["totalOrders"] = await order_repo.count_by_customer(customer_id)
    stats["activeOrders"] = await order_repo.count_by_customer(customer_id, active)
    stats["completedOrders"] = await order_repo.count_by_customer(
        customer_id, [OrderStatus.DELIVERED.value]
    )
    stats["totalSpent"] = await order_repo.sum_spent_by_customer(customer_id)
    return success(stats)


@router.get("/customer/orders")
async def customer_recent_orders(
    user: Annotated[User, Depends(require_roles(UserRole.CUSTOMER))],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    status: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """Recent orders placed by the signed-in customer (filters + pagination)."""
    customer_id = await _customer_id_for(user)
    if customer_id is None:
        return success(_paginated([], 0, 1, page_size))

    n_page, n_size = clamp_page(page, page_size)
    order_repo = OrderRepository()
    orders, total = await order_repo.get_all_orders(
        page=n_page, page_size=n_size, status=status, search=search, customer_id=customer_id
    )
    return success(_paginated([_order_dict(o) for o in orders], total, n_page, n_size))


@router.get("/customer/addresses")
async def customer_addresses(
    user: Annotated[User, Depends(require_roles(UserRole.CUSTOMER))],
) -> dict:
    """Lists the signed-in customer's saved addresses. `AddressesScreen.tsx`
    (mobile) already calls this route (list/delete/set-default) — none of
    the three existed server-side."""
    customer_id = await _customer_id_for(user)
    if customer_id is None:
        return success(_paginated([], 0, 1, 20))
    async with session_scope() as session:
        result = await session.execute(
            select(CustomerAddress).where(CustomerAddress.customerId == customer_id)
        )
        addresses = result.scalars().all()
    items = [
        {
            "id": str(a.id),
            "label": a.label,
            "address": a.address,
            "city": a.city,
            "state": a.state,
            "pincode": a.pincode,
            "lat": a.latitude,
            "lng": a.longitude,
            "isDefault": a.isDefault,
        }
        for a in addresses
    ]
    return success(_paginated(items, len(items), 1, max(len(items), 1)))


@router.delete("/customer/addresses/{address_id}")
async def delete_customer_address(
    user: Annotated[User, Depends(require_roles(UserRole.CUSTOMER))],
    address_id: Annotated[str, Path()],
) -> dict:
    customer_id = await _customer_id_for(user)
    parsed = uuidlib.UUID(address_id) if _is_uuid(address_id) else None
    if customer_id is None or parsed is None:
        raise NotFoundError("Address not found.")
    async with session_scope() as session:
        address = await session.get(CustomerAddress, parsed)
        if address is None or address.customerId != customer_id:
            raise NotFoundError("Address not found.")
        await session.delete(address)
    return success({"deleted": True}, message="Address removed.")


@router.post("/customer/addresses/{address_id}/default")
async def set_default_customer_address(
    user: Annotated[User, Depends(require_roles(UserRole.CUSTOMER))],
    address_id: Annotated[str, Path()],
) -> dict:
    customer_id = await _customer_id_for(user)
    parsed = uuidlib.UUID(address_id) if _is_uuid(address_id) else None
    if customer_id is None or parsed is None:
        raise NotFoundError("Address not found.")
    async with session_scope() as session:
        result = await session.execute(
            select(CustomerAddress).where(CustomerAddress.customerId == customer_id)
        )
        addresses = result.scalars().all()
        target = next((a for a in addresses if a.id == parsed), None)
        if target is None:
            raise NotFoundError("Address not found.")
        for a in addresses:
            a.isDefault = a.id == parsed
    return success({"updated": True}, message="Default address updated.")


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


async def _count_drivers_online_for_company(company_id) -> int:
    from app.models.driver import Driver

    async with session_scope() as session:
        result = await session.execute(
            select(func.count(Driver.id)).where(
                Driver.companyId == company_id, Driver.isActive == True  # noqa: E712
            )
        )
        return result.scalar() or 0


async def _count_vehicles_active_for_company(company_id) -> int:
    from app.models.vehicle import Vehicle

    async with session_scope() as session:
        result = await session.execute(
            select(func.count(Vehicle.id)).where(
                Vehicle.companyId == company_id, Vehicle.status == "available"
            )
        )
        return result.scalar() or 0
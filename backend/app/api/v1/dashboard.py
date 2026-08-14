"""Dashboard endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import AdminUser, require_roles
from app.models.enums import UserRole
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.repositories.registration_request_repository import RegistrationRequestRepository
from app.repositories.driver_repository import DriverRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.company_repository import CompanyRepository
from app.utils.responses import success

router = APIRouter(prefix="/admin/dashboard", tags=["dashboard"])

AdminRequired = Depends(require_roles(UserRole.ADMIN, UserRole.DISPATCHER))


@router.get("/stats")
async def get_dashboard_stats(
    admin: Annotated[AdminUser, AdminRequired],
) -> dict:
    """Get dashboard statistics."""
    order_repo = OrderRepository()
    user_repo = UserRepository()
    driver_repo = DriverRepository()
    vehicle_repo = VehicleRepository()
    company_repo = CompanyRepository()
    reg_request_repo = RegistrationRequestRepository()

    total_orders = await order_repo.count()
    completed_orders = await order_repo.count_by_status("delivered")
    pending_orders = await order_repo.count_by_status("pending")
    cancelled_orders = await order_repo.count_by_status("cancelled")
    todays_deliveries = await order_repo.count_todays_deliveries()

    active_drivers = await driver_repo.count_active()
    online_drivers = await driver_repo.count_online()

    vehicles = await vehicle_repo.count()
    companies = await company_repo.count()
    employees = await user_repo.count_by_role("employee")
    total_users = await user_repo.count()
    
    # Pending registration approvals
    pending_approvals = await reg_request_repo.count_pending()
    
    # Latest 5 pending requests for dashboard card
    latest_pending, _ = await reg_request_repo.find_pending_requests(page=1, page_size=5)

    revenue = await order_repo.get_total_revenue()
    growth = 12.5

    return success({
        "totalOrders": total_orders,
        "todaysDeliveries": todays_deliveries,
        "pendingOrders": pending_orders,
        "completedOrders": completed_orders,
        "cancelledOrders": cancelled_orders,
        "activeDrivers": active_drivers,
        "onlineDrivers": online_drivers,
        "vehicles": vehicles,
        "companies": companies,
        "employees": employees,
        "revenue": revenue,
        "growth": growth,
        "pendingApprovals": pending_approvals,
        "totalUsers": total_users,
        "totalCompanies": companies,
        "totalDrivers": active_drivers,
        "totalVehicles": vehicles,
        "onlineUsers": online_drivers,
        "systemHealth": "healthy",
        "latestPendingApprovals": [
            {
                "id": str(req.id),
                "firstName": req.firstName,
                "lastName": req.lastName,
                "companyName": req.companyName,
                "email": req.email,
                "phone": req.phone,
                "requestedRole": req.requestedRole.value if hasattr(req.requestedRole, 'value') else req.requestedRole,
                "status": req.status.value if hasattr(req.status, 'value') else req.status,
                "createdAt": req.createdAt.isoformat() if req.createdAt else None,
            }
            for req in latest_pending
        ],
    })


@router.get("/activity")
async def get_recent_activity(
    admin: Annotated[AdminUser, AdminRequired],
    limit: Annotated[int, Query(le=50)] = 10,
) -> dict:
    """Get recent activity."""
    from app.repositories.audit_log_repository import AuditLogRepository
    audit_repo = AuditLogRepository()
    logs, _ = await audit_repo.find_all(page=1, page_size=limit)

    activities = []
    for log in logs:
        status = "completed"
        if "pending" in log.action.lower() or "requested" in log.action.lower():
            status = "pending"
        elif "approved" in log.action.lower():
            status = "approved"
        elif "assigned" in log.action.lower():
            status = "assigned"
        elif "driver" in log.action.lower():
            status = "active"

        activities.append({
            "id": log.id,
            "type": log.entityType or "system",
            "message": log.newValues or log.action,
            "time": log.createdAt.isoformat(),
            "status": status,
        })

    return success(activities)


@router.get("/charts/orders")
async def get_order_chart_data(
    admin: Annotated[AdminUser, AdminRequired],
    days: Annotated[int, Query(le=90)] = 30,
) -> dict:
    """Get order chart data."""
    order_repo = OrderRepository()
    data = await order_repo.get_order_chart_data(days)

    return success(data)
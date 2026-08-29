"""Dashboard endpoints.

Optimised for Phase 5: reduced from 14 queries to 7 by combining
independent aggregations using PostgreSQL FILTER (WHERE …) and
removing the redundant count_pending call (find_pending_requests
already returns the total).
"""
from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, require_roles
from app.core.tenancy import effective_company_id
from app.database.db import get_db_session
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
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get dashboard statistics.

    Phase 5 optimisation: 7 queries instead of 14.
    All queries share the request-scoped AsyncSession (no new connections).
    """
    order_repo = OrderRepository(session=db)
    user_repo = UserRepository(session=db)
    driver_repo = DriverRepository(session=db)
    vehicle_repo = VehicleRepository(session=db)
    company_repo = CompanyRepository(session=db)
    reg_request_repo = RegistrationRequestRepository(session=db)

    # 7 concurrent queries (was 14 before Phase 5):
    #   1) orders: total + delivered + pending + cancelled + revenue  (was 5 separate queries)
    #   2) orders: today's deliveries                                 (unchanged)
    #   3) drivers: active + online                                   (was 2 queries)
    #   4) vehicles: total count                                      (unchanged)
    #   5) companies: total count                                     (unchanged)
    #   6) users: total + employees                                   (was 2 queries)
    #   7) registration requests: count + pending list                (was 2 queries, count redundant)
    company_id = await effective_company_id(admin, db)
    (
        order_stats,
        todays_deliveries,
        driver_stats,
        vehicles,
        companies,
        user_stats,
        (latest_pending, pending_approvals),
        revenue_overview,
    ) = await asyncio.gather(
        order_repo.count_for_dashboard(),
        order_repo.count_todays_deliveries(),
        driver_repo.count_for_dashboard(),
        vehicle_repo.count(),
        company_repo.count(),
        user_repo.count_for_dashboard(),
        reg_request_repo.find_pending_requests(page=1, page_size=5),
        order_repo.get_revenue_overview(company_id=company_id),
    )
    # Real month-over-month revenue growth (was a hardcoded 12.5 before —
    # same current/previous-month figures the Revenue Overview cards use).
    prev_month = revenue_overview["prevMonth"]
    this_month = revenue_overview["month"]
    if prev_month == 0:
        growth = 100.0 if this_month > 0 else 0.0
    else:
        growth = ((this_month - prev_month) / prev_month) * 100

    return success({
        "totalOrders": order_stats["total"],
        "todaysDeliveries": todays_deliveries,
        "pendingOrders": order_stats["pending"],
        "completedOrders": order_stats["delivered"],
        "unclearedOrders": order_stats["uncleared"],
        "activeDrivers": driver_stats["active"],
        "onlineDrivers": driver_stats["online"],
        "vehicles": vehicles,
        "companies": companies,
        "employees": user_stats["employees"],
        "revenue": order_stats["revenue"],
        "growth": growth,
        "pendingApprovals": pending_approvals,
        "totalUsers": user_stats["total"],
        "totalCompanies": companies,
        "totalDrivers": driver_stats["active"],
        "totalVehicles": vehicles,
        "onlineUsers": driver_stats["online"],
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
    db: AsyncSession = Depends(get_db_session),
    limit: Annotated[int, Query(le=50)] = 10,
) -> dict:
    """Get recent activity."""
    from app.repositories.audit_log_repository import AuditLogRepository
    audit_repo = AuditLogRepository(session=db)
    logs, _ = await audit_repo.find_all(page=1, page_size=limit)

    activities = []
    for log in logs:
        status = "completed"
        if "pending" in log.action.lower() or "requested" in log.action.lower():
            status = "pending"
        elif "approved" in log.action.lower():
            status = "approved"
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
    db: AsyncSession = Depends(get_db_session),
    days: Annotated[int, Query(le=90)] = 30,
) -> dict:
    """Get order chart data."""
    order_repo = OrderRepository(session=db)
    data = await order_repo.get_order_chart_data(days)

    return success(data)


@router.get("/revenue")
async def get_revenue_overview(
    admin: Annotated[AdminUser, AdminRequired],
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get revenue overview for today, this week, and this month.

    Revenue per GR = Paid_Amt + ToPay_Amt, filtered by GRDate.
    Scoped to the caller's company (platform admins see all companies).
    """
    company_id = await effective_company_id(admin, db)
    order_repo = OrderRepository(session=db)
    data = await order_repo.get_revenue_overview(company_id=company_id)

    return success(data)
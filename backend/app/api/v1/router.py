"""Versioned API router."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, users, registration_requests, admin, otp, dashboard, dashboards, notifications, gr, gr_reports, registration, devices, staff, staff_work, payment, customers

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(registration_requests.router)
api_router.include_router(admin.router)
api_router.include_router(otp.router)
api_router.include_router(dashboard.router)
api_router.include_router(dashboards.router)
api_router.include_router(notifications.router)
api_router.include_router(gr_reports.router)
api_router.include_router(gr.router)
api_router.include_router(registration.router)
api_router.include_router(devices.router)
api_router.include_router(staff.router)
api_router.include_router(staff_work.router)
api_router.include_router(payment.router)
api_router.include_router(customers.router)
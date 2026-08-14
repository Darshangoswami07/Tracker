"""Public registration helper endpoints (pre-auth)."""
from __future__ import annotations

from fastapi import APIRouter

from app.repositories.company_repository import CompanyRepository
from app.utils.responses import success

router = APIRouter(prefix="/registration", tags=["registration"])

company_repo = CompanyRepository()


@router.get("/companies")
async def list_registration_companies() -> dict:
    """List companies eligible for staff/driver registration.

    Public by design: the applicant must pick a company BEFORE any account or
    session exists, so this cannot require authentication. It returns only the
    ``id`` and ``name`` of active, non-deleted companies — no PII or business
    configuration.
    """
    companies = await company_repo.list_active_companies()
    items = [{"id": str(c.id), "name": c.name} for c in companies]
    return success(
        {"items": items, "total": len(items)},
        message="Eligible companies retrieved successfully.",
    )

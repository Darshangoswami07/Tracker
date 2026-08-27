"""Customer list API endpoint.

Provides a lightweight customer list for dropdowns and filters.
"""
from __future__ import annotations

from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import get_db_session
from app.models.customer import Customer

router = APIRouter(prefix="/customers", tags=["Customers"])


class CustomerListItem(BaseModel):
    id: UUID
    fullName: str
    phone: Optional[str] = None
    city: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[CustomerListItem])
async def list_customers(
    session: AsyncSession = Depends(get_db_session),
):
    """Return active customers for picker/dropdown use."""
    stmt = (
        select(Customer)
        .where(Customer.isActive == True)  # noqa: E712
        .order_by(Customer.fullName)
        .limit(500)
    )
    result = await session.execute(stmt)
    customers = result.scalars().all()
    return [CustomerListItem.model_validate(c) for c in customers]

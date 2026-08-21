"""Customer repository."""
from __future__ import annotations

from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.customer import Customer
from app.models.order import Order
from app.repositories.base import BaseRepository


class CustomerRepository(BaseRepository[Customer]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Customer, session)

    async def get_all_customers(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
        company_id: Optional[UUID] = None,
    ) -> Tuple[List[Customer], int]:
        """Lists customers, optionally scoped to those who have placed at
        least one order with ``company_id`` (Customer has no companyId of its
        own — a customer can order from more than one company)."""
        async with session_scope(self._session) as session:
            query = select(Customer)

            if company_id:
                query = query.join(Order, Order.customerId == Customer.id).where(
                    Order.companyId == company_id
                )

            if status == "active":
                query = query.where(Customer.isActive == True)
            elif status == "inactive":
                query = query.where(Customer.isActive == False)

            if search:
                query = query.where(
                    or_(
                        Customer.fullName.ilike(f"%{search}%"),
                        Customer.phone.ilike(f"%{search}%"),
                        Customer.email.ilike(f"%{search}%"),
                    )
                )

            query = query.distinct()

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Customer.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            customers = result.scalars().all()

            return list(customers), total

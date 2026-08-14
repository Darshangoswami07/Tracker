"""Driver repository."""
from __future__ import annotations

from typing import Optional, Tuple, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.driver import Driver
from app.models.enums import DriverStatus
from app.repositories.base import BaseRepository


class DriverRepository(BaseRepository[Driver]):
    def __init__(self) -> None:
        super().__init__(Driver)

    async def find_by_user_id(self, user_id: str | UUID) -> Optional[Driver]:
        async with session_scope() as session:
            result = await session.execute(
                select(Driver).where(Driver.userId == str(user_id))
            )
            return result.scalar_one_or_none()

    async def find_by_id(self, driver_id: str | UUID) -> Optional[Driver]:
        return await super().find_by_id(driver_id)

    async def count(self) -> int:
        return await self._count()

    async def count_active(self) -> int:
        async with session_scope() as session:
            result = await session.execute(
                select(func.count(Driver.id)).where(
                    and_(Driver.isActive == True, Driver.status != DriverStatus.OFFLINE)
                )
            )
            return result.scalar() or 0

    async def count_online(self) -> int:
        async with session_scope() as session:
            result = await session.execute(
                select(func.count(Driver.id)).where(
                    and_(Driver.isActive == True, Driver.status == DriverStatus.ONLINE)
                )
            )
            return result.scalar() or 0

    async def get_all_drivers(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
        company_id: Optional[UUID] = None,
    ) -> Tuple[List[Driver], int]:
        async with session_scope() as session:
            query = select(Driver).where(Driver.isActive == True)

            if status:
                query = query.where(Driver.status == status)

            if search:
                query = query.where(
                    or_(
                        Driver.userId.ilike(f"%{search}%"),
                        Driver.licenseNumber.ilike(f"%{search}%"),
                    )
                )

            if company_id:
                query = query.where(Driver.companyId == company_id)

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Driver.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            drivers = result.scalars().all()

            return list(drivers), total
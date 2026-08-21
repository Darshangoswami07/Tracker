"""Vehicle repository."""
from __future__ import annotations

from typing import Optional, Tuple, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.vehicle import Vehicle
from app.models.enums import VehicleStatus
from app.repositories.base import BaseRepository


class VehicleRepository(BaseRepository[Vehicle]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Vehicle, session)

    async def find_assigned_for_driver(self, driver_id: UUID) -> Vehicle | None:
        from app.models.vehicle_assignment import VehicleAssignment

        async with session_scope(self._session) as session:
            result = await session.execute(
                select(Vehicle)
                .join(VehicleAssignment, VehicleAssignment.vehicleId == Vehicle.id)
                .where(
                    and_(
                        VehicleAssignment.driverId == driver_id,
                        VehicleAssignment.isActive == True,
                    )
                )
                .order_by(desc(VehicleAssignment.assignedAt))
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def count(self) -> int:
        return await self._count()

    async def get_all_vehicles(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
        company_id: Optional[UUID] = None,
    ) -> Tuple[List[Vehicle], int]:
        async with session_scope(self._session) as session:
            query = select(Vehicle)

            if status:
                query = query.where(Vehicle.status == status)

            if search:
                query = query.where(
                    or_(
                        Vehicle.make.ilike(f"%{search}%"),
                        Vehicle.model.ilike(f"%{search}%"),
                        Vehicle.licensePlate.ilike(f"%{search}%"),
                        Vehicle.vin.ilike(f"%{search}%"),
                    )
                )

            if company_id:
                query = query.where(Vehicle.companyId == company_id)

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Vehicle.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            vehicles = result.scalars().all()

            return list(vehicles), total
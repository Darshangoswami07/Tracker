"""Order repository."""
from __future__ import annotations

from datetime import datetime, date, timedelta, timezone
from typing import Optional, Tuple, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.repositories.base import BaseRepository


class OrderRepository(BaseRepository[Order]):
    def __init__(self) -> None:
        super().__init__(Order)

    async def count(self) -> int:
        return await self._count()

    async def count_by_status(self, status: str) -> int:
        async with session_scope() as session:
            result = await session.execute(
                select(func.count(Order.id)).where(Order.status == status)
            )
            return result.scalar() or 0

    async def count_by_statuses(self, statuses: list[str] | tuple[str, ...]) -> int:
        async with session_scope() as session:
            result = await session.execute(
                select(func.count(Order.id)).where(Order.status.in_(statuses))
            )
            return result.scalar() or 0

    async def count_by_driver(self, driver_id: UUID | str, statuses: list[str] | None = None) -> int:
        """Count orders assigned to a driver (optionally filtered by status)."""
        async with session_scope() as session:
            query = select(func.count(Order.id)).where(Order.driverId == driver_id)
            if statuses:
                query = query.where(Order.status.in_(statuses))
            result = await session.execute(query)
            return result.scalar() or 0

    async def count_by_customer(self, customer_id: UUID | str, statuses: list[str] | None = None) -> int:
        """Count orders linked to a customer (optionally filtered by status)."""
        async with session_scope() as session:
            query = select(func.count(Order.id)).where(Order.customerId == customer_id)
            if statuses:
                query = query.where(Order.status.in_(statuses))
            result = await session.execute(query)
            return result.scalar() or 0

    async def get_recent(
        self,
        page: int = 1,
        page_size: int = 10,
        driver_id: UUID | None = None,
        customer_id: UUID | None = None,
        company_id: UUID | None = None,
    ) -> Tuple[List[Order], int]:
        """Lists active orders, optionally scoped to a driver/customer/company."""
        async with session_scope() as session:
            query = select(Order).where(Order.isActive == True)
            if driver_id is not None:
                query = query.where(Order.driverId == driver_id)
            if customer_id is not None:
                query = query.where(Order.customerId == customer_id)
            if company_id is not None:
                query = query.where(Order.companyId == company_id)

            total_result = await session.execute(select(func.count()).select_from(query.subquery()))
            total = total_result.scalar() or 0

            query = query.order_by(desc(Order.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(query)
            return list(result.scalars().all()), total

    async def sum_earnings_for_driver(self, driver_id: UUID) -> float:
        """Sum of paid, delivered order amounts assigned to a driver."""
        async with session_scope() as session:
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.driverId == driver_id,
                        Order.paymentStatus == "paid",
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return float(result.scalar() or 0)

    async def sum_earnings_today_for_driver(self, driver_id: UUID) -> float:
        """Sum of paid amounts delivered today by a driver."""
        async with session_scope() as session:
            today = date.today()
            start_of_day = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_of_day = start_of_day + timedelta(days=1)
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.driverId == driver_id,
                        Order.deliveryTime >= start_of_day,
                        Order.deliveryTime < end_of_day,
                        Order.status == OrderStatus.DELIVERED,
                        Order.paymentStatus == "paid",
                    )
                )
            )
            return float(result.scalar() or 0)

    async def count_today_for_driver(self, driver_id: UUID) -> int:
        """Orders delivered today by a driver."""
        async with session_scope() as session:
            today = date.today()
            start_of_day = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_of_day = start_of_day + timedelta(days=1)
            result = await session.execute(
                select(func.count(Order.id)).where(
                    and_(
                        Order.driverId == driver_id,
                        Order.deliveryTime >= start_of_day,
                        Order.deliveryTime < end_of_day,
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return result.scalar() or 0

    async def count_todays_deliveries(self) -> int:
        async with session_scope() as session:
            today = date.today()
            start_of_day = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_of_day = start_of_day + timedelta(days=1)

            result = await session.execute(
                select(func.count(Order.id)).where(
                    and_(
                        Order.deliveryTime >= start_of_day,
                        Order.deliveryTime < end_of_day,
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return result.scalar() or 0

    async def count_created_today_for_company(self, company_id: UUID) -> int:
        async with session_scope() as session:
            today = date.today()
            start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            end = start + timedelta(days=1)
            result = await session.execute(
                select(func.count(Order.id)).where(
                    and_(Order.companyId == company_id, Order.createdAt >= start, Order.createdAt < end)
                )
            )
            return result.scalar() or 0

    async def count_by_status_for_company(self, company_id: UUID, status: str) -> int:
        async with session_scope() as session:
            result = await session.execute(
                select(func.count(Order.id)).where(
                    Order.companyId == company_id, Order.status == status
                )
            )
            return result.scalar() or 0

    async def sum_revenue_for_company(self, company_id: UUID) -> float:
        """Sum of paid, delivered amounts for a company."""
        async with session_scope() as session:
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.companyId == company_id,
                        Order.paymentStatus == "paid",
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return float(result.scalar() or 0)

    async def sum_spent_by_customer(self, customer_id: UUID) -> float:
        """Sum of paid, delivered amounts for a customer."""
        async with session_scope() as session:
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.customerId == customer_id,
                        Order.paymentStatus == "paid",
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return float(result.scalar() or 0)

    async def get_total_revenue(self) -> float:
        async with session_scope() as session:
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.paymentStatus == "paid",
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return float(result.scalar() or 0)

    async def get_order_chart_data(self, days: int = 30) -> list:
        async with session_scope() as session:
            end_date = date.today()
            start_date = end_date - timedelta(days=days - 1)

            orders_result = await session.execute(
                select(
                    func.date(Order.createdAt).label("date"),
                    func.count(Order.id).label("count")
                ).where(
                    and_(
                        func.date(Order.createdAt) >= start_date,
                        func.date(Order.createdAt) <= end_date,
                    )
                ).group_by(func.date(Order.createdAt))
            )
            orders_by_date = {str(row.date): row.count for row in orders_result}

            deliveries_result = await session.execute(
                select(
                    func.date(Order.deliveryTime).label("date"),
                    func.count(Order.id).label("count")
                ).where(
                    and_(
                        func.date(Order.deliveryTime) >= start_date,
                        func.date(Order.deliveryTime) <= end_date,
                        Order.status == OrderStatus.DELIVERED,
                    )
                ).group_by(func.date(Order.deliveryTime))
            )
            deliveries_by_date = {str(row.date): row.count for row in deliveries_result}

            result = []
            current = start_date
            while current <= end_date:
                date_str = current.isoformat()
                result.append({
                    "date": current.strftime("%b %d"),
                    "orders": orders_by_date.get(date_str, 0),
                    "deliveries": deliveries_by_date.get(date_str, 0),
                })
                current += timedelta(days=1)

            return result

    async def get_all_orders(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
        company_id: Optional[UUID] = None,
        driver_id: Optional[UUID] = None,
        customer_id: Optional[UUID] = None,
    ) -> Tuple[List[Order], int]:
        async with session_scope() as session:
            query = select(Order).where(Order.isActive == True)

            if status:
                query = query.where(Order.status == status)

            if search:
                query = query.where(
                    or_(
                        Order.orderNumber.ilike(f"%{search}%"),
                        Order.trackingCode.ilike(f"%{search}%"),
                        Order.pickupAddress.ilike(f"%{search}%"),
                        Order.deliveryAddress.ilike(f"%{search}%"),
                    )
                )

            if company_id:
                query = query.where(Order.companyId == company_id)

            if driver_id:
                query = query.where(Order.driverId == driver_id)

            if customer_id:
                query = query.where(Order.customerId == customer_id)

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Order.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            orders = result.scalars().all()

            return list(orders), total

    async def get_by_tracking_code(self, tracking_code: str) -> Optional[Order]:
        async with session_scope() as session:
            result = await session.execute(
                select(Order).where(Order.trackingCode == tracking_code)
            )
            return result.scalar_one_or_none()

    async def get_by_order_number(self, order_number: str) -> Optional[Order]:
        async with session_scope() as session:
            result = await session.execute(
                select(Order).where(Order.orderNumber == order_number)
            )
            return result.scalar_one_or_none()

    async def get_order_with_details(self, order_id: UUID) -> Optional[Order]:
        async with session_scope() as session:
            from sqlalchemy.orm import selectinload
            result = await session.execute(
                select(Order)
                .options(
                    selectinload(Order.company),
                    selectinload(Order.customer),
                    selectinload(Order.driver),
                    selectinload(Order.vehicle),
                    selectinload(Order.statusHistory),
                )
                .where(Order.id == order_id)
            )
            return result.scalar_one_or_none()

    async def update_status(self, order_id: UUID, status: str, user_id: UUID | None = None) -> Optional[Order]:
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None

            old_status = order.status
            order.status = status
            order.updatedAt = datetime.now(timezone.utc)

            if status == OrderStatus.DELIVERED:
                order.deliveryTime = datetime.now(timezone.utc)

            history = OrderStatusHistory(
                orderId=order_id,
                status=status,
                notes=f"Changed from {old_status} to {status}",
            )
            session.add(history)

            await session.flush()
            await session.refresh(order)
            return order

    async def assign_driver(self, order_id: UUID, driver_id: UUID) -> Optional[Order]:
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None

            order.driverId = driver_id
            order.status = OrderStatus.ASSIGNED
            order.updatedAt = datetime.now(timezone.utc)

            await session.flush()
            await session.refresh(order)
            return order

    async def create_order(self, **fields) -> Order:
        """Creates a new order/GR row from keyword fields matching Order columns."""
        async with session_scope() as session:
            order = Order(**fields)
            session.add(order)
            await session.flush()
            await session.refresh(order)
            return order

    async def assign_staff(self, order_id: UUID, employee_id: UUID) -> Optional[Order]:
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None
            order.assignedStaffId = employee_id
            order.updatedAt = datetime.now(timezone.utc)
            await session.flush()
            await session.refresh(order)
            return order

    async def update_fields(self, order_id: UUID, **fields) -> Optional[Order]:
        """Updates a whitelisted set of GR fields (validated by the caller)."""
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None
            for key, value in fields.items():
                setattr(order, key, value)
            order.updatedAt = datetime.now(timezone.utc)
            await session.flush()
            await session.refresh(order)
            return order

    async def soft_delete_order(self, order_id: UUID) -> Optional[Order]:
        """Soft-deletes a GR: sets `deletedAt` (SoftDeleteMixin) and `isActive`
        False so it disappears from `get_all_orders`/`get_recent` (which
        already filter on `isActive == True`), without removing the row or
        touching any related company/user/driver/vehicle record."""
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None
            order.soft_delete()
            order.isActive = False
            order.updatedAt = datetime.now(timezone.utc)
            await session.flush()
            await session.refresh(order)
            return order

    async def assign_vehicle(self, order_id: UUID, vehicle_id: UUID) -> Optional[Order]:
        async with session_scope() as session:
            order = await session.get(Order, order_id)
            if not order:
                return None

            order.vehicleId = vehicle_id
            order.updatedAt = datetime.now(timezone.utc)

            await session.flush()
            await session.refresh(order)
            return order
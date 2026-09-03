"""Order repository."""
from __future__ import annotations

from datetime import datetime, date, timedelta, timezone
from typing import Optional, Tuple, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc, case, literal_column, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.repositories.base import BaseRepository


class OrderRepository(BaseRepository[Order]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Order, session)

    async def count(self) -> int:
        return await self._count()

    async def count_by_status(self, status: str) -> int:
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(func.count(Order.id)).where(Order.status == status)
            )
            return result.scalar() or 0

    async def count_by_statuses(self, statuses: list[str] | tuple[str, ...]) -> int:
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(func.count(Order.id)).where(Order.status.in_(statuses))
            )
            return result.scalar() or 0

    async def count_by_driver(self, driver_id: UUID | str, statuses: list[str] | None = None) -> int:
        """Count orders assigned to a driver (optionally filtered by status)."""
        async with session_scope(self._session) as session:
            query = select(func.count(Order.id)).where(Order.driverId == driver_id)
            if statuses:
                query = query.where(Order.status.in_(statuses))
            result = await session.execute(query)
            return result.scalar() or 0

    async def count_by_customer(self, customer_id: UUID | str, statuses: list[str] | None = None) -> int:
        """Count orders linked to a customer (optionally filtered by status)."""
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(func.count(Order.id)).where(
                    Order.companyId == company_id, Order.status == status
                )
            )
            return result.scalar() or 0

    async def sum_revenue_for_company(self, company_id: UUID) -> float:
        """Sum of paid, delivered amounts for a company."""
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(func.coalesce(func.sum(Order.paymentAmount), 0)).where(
                    and_(
                        Order.paymentStatus == "paid",
                        Order.status == OrderStatus.DELIVERED,
                    )
                )
            )
            return float(result.scalar() or 0)

    async def count_for_dashboard(self) -> dict:
        """Single-query replacement for count() + count_by_status×3 + get_total_revenue().

        Uses PostgreSQL FILTER (WHERE ...) for conditional aggregation so all
        five metrics are computed in one table scan.
        """
        async with session_scope(self._session) as session:
            row = (await session.execute(
                select(
                    func.count(Order.id).label("total"),
                    func.count(Order.id).filter(Order.status == "delivered").label("delivered"),
                    func.count(Order.id).filter(Order.status == "pending").label("pending"),
                    func.count(Order.id).filter(Order.status == "uncleared").label("uncleared"),
                    func.coalesce(
                        func.sum(Order.paymentAmount).filter(
                            and_(Order.paymentStatus == "paid", Order.status == "delivered")
                        ),
                        0,
                    ).label("revenue"),
                )
            )).one()
            return {
                "total": row.total,
                "delivered": row.delivered,
                "pending": row.pending,
                "uncleared": row.uncleared,
                "revenue": float(row.revenue),
            }

    async def get_revenue_overview(self, company_id: UUID | None = None) -> dict:
        """Return revenue aggregation for today, this week, and this month.

        Revenue per GR = coalesce(paymentAmount, 0) + coalesce(toPay, 0).
        Optionally scoped to a single company (platform admins see all).

        Returns dicts with ``current`` and ``previous`` period totals so the
        frontend can show comparison percentages.
        """
        async with session_scope(self._session) as session:
            today = date.today()
            now = datetime.now(timezone.utc)

            # --- date boundaries (local calendar day, midnight UTC) ---
            start_of_today = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            start_of_yesterday = start_of_today - timedelta(days=1)

            # ISO week: Monday = 0
            start_of_week = datetime.combine(
                today - timedelta(days=today.weekday()), datetime.min.time()
            ).replace(tzinfo=timezone.utc)
            start_of_prev_week = start_of_week - timedelta(weeks=1)

            start_of_month = today.replace(day=1)
            start_of_month = datetime.combine(start_of_month, datetime.min.time()).replace(tzinfo=timezone.utc)
            if today.month == 1:
                start_of_prev_month = today.replace(year=today.year - 1, month=12, day=1)
            else:
                start_of_prev_month = today.replace(month=today.month - 1, day=1)
            start_of_prev_month = datetime.combine(start_of_prev_month, datetime.min.time()).replace(tzinfo=timezone.utc)

            # Revenue expression: Paid_Amt + ToPay_Amt
            revenue_expr = func.coalesce(Order.paymentAmount, 0) + func.coalesce(Order.toPay, 0)

            # Effective date for bucketing: prefer grDate, fall back to createdAt
            effective_date = func.coalesce(Order.grDate, Order.createdAt)

            # Match GR list filters: active, not soft-deleted, optional company scope
            base_filter = [Order.isActive == True, Order.deletedAt.is_(None)]
            if company_id is not None:
                base_filter.append(Order.companyId == company_id)

            # Single query with FILTER (WHERE) for 6 periods + 2 lifetime totals
            row = (await session.execute(
                select(
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_today, effective_date < start_of_today + timedelta(days=1))
                    ), 0).label("today"),
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_yesterday, effective_date < start_of_today)
                    ), 0).label("yesterday"),
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_week, effective_date < start_of_today + timedelta(days=1))
                    ), 0).label("week"),
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_prev_week, effective_date < start_of_week)
                    ), 0).label("prev_week"),
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_month, effective_date < start_of_today + timedelta(days=1))
                    ), 0).label("month"),
                    func.coalesce(func.sum(revenue_expr).filter(
                        and_(*base_filter, effective_date >= start_of_prev_month, effective_date < start_of_month)
                    ), 0).label("prev_month"),
                    func.coalesce(func.sum(Order.paymentAmount).filter(
                        and_(*base_filter),
                    ), 0).label("total_collected"),
                    func.coalesce(func.sum(Order.toPay).filter(
                        and_(*base_filter),
                    ), 0).label("outstanding"),
                )
            )).one()

            return {
                "today": float(row.today),
                "yesterday": float(row.yesterday),
                "week": float(row.week),
                "prevWeek": float(row.prev_week),
                "month": float(row.month),
                "prevMonth": float(row.prev_month),
                "totalCollected": float(row.total_collected),
                "outstandingAmount": float(row.outstanding),
            }

    async def get_order_chart_data(self, days: int = 30) -> list:
        async with session_scope(self._session) as session:
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
        area: Optional[str] = None,
        consignor: Optional[str] = None,
        staff_scope: Optional[Tuple[Optional[UUID], Optional[str]]] = None,
    ) -> Tuple[List[Order], int]:
        async with session_scope(self._session) as session:
            query = select(Order).where(Order.isActive == True)

            if status:
                # Filter by the *canonical reporting status* (pending / cleared /
                # uncleared / delivered), derived from delivery state + the
                # payments ledger - the single definition in
                # ``gr_status_service`` - NOT the raw ``Order.status`` column
                # (which the app only ever sets to 'pending' or 'delivered').
                # This keeps the GR list's filtered results in lock-step with
                # the summary counts on the Dashboard / GR-Shipments screens.
                from app.services.gr_status_service import (
                    paid_subquery,
                    reporting_status_expr,
                )

                _paid = paid_subquery()
                query = query.outerjoin(_paid, _paid.c.orderId == Order.id).where(
                    reporting_status_expr(_paid.c.paid) == status
                )

            if search:
                query = query.where(
                    or_(
                        Order.orderNumber.ilike(f"%{search}%"),
                        Order.trackingCode.ilike(f"%{search}%"),
                        Order.pickupAddress.ilike(f"%{search}%"),
                        Order.deliveryAddress.ilike(f"%{search}%"),
                        Order.consignorName.ilike(f"%{search}%"),
                        Order.consigneeName.ilike(f"%{search}%"),
                    )
                )

            if company_id:
                query = query.where(Order.companyId == company_id)

            if driver_id:
                query = query.where(Order.driverId == driver_id)

            if customer_id:
                query = query.where(Order.customerId == customer_id)

            if area:
                query = query.where(Order.area == area)

            if consignor:
                # The ``consignor`` param name is historical — it is the
                # shop-owner / shop-identity filter, and the shop identity is
                # the **consignee**. Match case-insensitively on the trimmed
                # name so a "Shop History" drill-down from the shop list
                # (whose names are normalized) still finds every GR.
                query = query.where(
                    func.lower(func.trim(Order.consigneeName)) == consignor.strip().lower()
                )

            if staff_scope is not None:
                # A Staff member's GRs come from two mechanisms, but they are
                # NOT both always-on: an explicit per-GR assignment
                # (`assignedStaffId`, set via `assign-staff` or an Excel
                # import's "Select Staff" step) always wins outright — a GR
                # assigned directly to this Staff member must show up even
                # if its `area` differs. Area-based routing is only a
                # FALLBACK for GRs with no explicit assignment; it must
                # never leak an already-assigned GR to a different
                # same-area Staff member (that was the exact bug: an
                # Excel import explicitly assigned to Staff A was still
                # showing on every other same-area Staff member's
                # dashboard). With neither an assignment nor an area on
                # file, the Staff member has no GRs (never falls through to
                # an unscoped/all-GRs query).
                employee_id, staff_area = staff_scope
                conditions = []
                if employee_id is not None:
                    conditions.append(Order.assignedStaffId == employee_id)
                if staff_area:
                    conditions.append(and_(Order.assignedStaffId.is_(None), Order.area == staff_area))
                query = query.where(or_(*conditions)) if conditions else query.where(literal_column("false"))

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Order.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            orders = result.scalars().all()

            return list(orders), total

    async def get_by_tracking_code(self, tracking_code: str) -> Optional[Order]:
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(Order).where(Order.trackingCode == tracking_code)
            )
            return result.scalar_one_or_none()

    async def get_by_order_number(self, order_number: str) -> Optional[Order]:
        async with session_scope(self._session) as session:
            result = await session.execute(
                select(Order).where(Order.orderNumber == order_number)
            )
            return result.scalar_one_or_none()

    async def get_order_with_details(self, order_id: UUID) -> Optional[Order]:
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
            order = await session.get(Order, order_id)
            if not order:
                return None

            order.driverId = driver_id
            order.updatedAt = datetime.now(timezone.utc)

            await session.flush()
            await session.refresh(order)
            return order

    async def create_order(self, **fields) -> Order:
        """Creates a new order/GR row from keyword fields matching Order columns."""
        async with session_scope(self._session) as session:
            order = Order(**fields)
            session.add(order)
            await session.flush()
            await session.refresh(order)
            return order

    async def assign_staff(self, order_id: UUID, employee_id: UUID) -> Optional[Order]:
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
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
        async with session_scope(self._session) as session:
            order = await session.get(Order, order_id)
            if not order:
                return None
            order.soft_delete()
            order.isActive = False
            order.updatedAt = datetime.now(timezone.utc)
            await session.flush()
            await session.refresh(order)
            return order

    async def soft_delete_all_orders(self, company_id: UUID | None) -> int:
        """Bulk soft-deletes every not-yet-deleted GR in scope: one UPDATE
        statement (no per-row ORM `session.delete`/loop), so it stays cheap
        regardless of how many GRs exist. Sets exactly the same two columns
        as `soft_delete_order` (`deletedAt`, `isActive`) and nothing else —
        `orders` rows are never physically removed, so `shopId` (ON DELETE
        SET NULL, never touched by an UPDATE) and every `order_status_history`
        row (FK `orderId` NOT NULL, cascade-deletes only on a real DELETE)
        stay exactly as they were. Shops/Users/Staff/Drivers/Vehicles/
        Companies are untouched — this statement only ever targets `orders`.
        `company_id=None` (platform ADMIN/SUPER_ADMIN) matches every company,
        the same unscoped access already granted to that tier by
        `assert_same_company`/`delete_gr`. Returns the number of GRs newly
        soft-deleted."""
        async with session_scope(self._session) as session:
            now = datetime.now(timezone.utc)
            stmt = (
                update(Order)
                .where(Order.deletedAt.is_(None))
                .values(deletedAt=now, isActive=False, updatedAt=now)
                .execution_options(synchronize_session=False)
            )
            if company_id is not None:
                stmt = stmt.where(Order.companyId == company_id)
            result = await session.execute(stmt)
            return result.rowcount or 0

    async def append_status_history(
        self, order_id: UUID, status: str, note: str | None = None
    ) -> None:
        async with session_scope(self._session) as session:
            session.add(
                OrderStatusHistory(orderId=order_id, status=status, notes=note)
            )
            await session.flush()

    async def reconcile_delivered_status(self, order_id: UUID) -> None:
        """Flip a GR to 'delivered' once nothing is outstanding. Ported from the
        mobile ``reconcileDeliveredStatus`` with one guard: a GR whose ``toPay``
        was never set (None) is treated as "charges not yet determined" and
        left ``pending`` — only an explicit ``toPay <= 0`` (a genuine
        nothing-to-collect GR) or a payments ledger that has reached ``toPay``
        triggers the flip. Never downgrades."""
        from app.models.payment import Payment

        async with session_scope(self._session) as session:
            order = await session.get(Order, order_id)
            if order is None or order.status == OrderStatus.DELIVERED:
                return
            ledger_paid = float(
                (
                    await session.execute(
                        select(func.coalesce(func.sum(Payment.amount), 0)).where(
                            Payment.orderId == order_id
                        )
                    )
                ).scalar()
                or 0
            )
            legacy_paid = float(order.paymentAmount or 0)
            total_paid = max(ledger_paid, legacy_paid)
            if order.toPay is None and total_paid <= 0:
                return  # nothing owed recorded, nothing paid — stay pending
            to_pay = float(order.toPay or 0)
            if to_pay > 0 and total_paid < to_pay - 0.005:
                return
            order.status = OrderStatus.DELIVERED
            order.updatedAt = datetime.now(timezone.utc)
            session.add(order)
            session.add(
                OrderStatusHistory(
                    orderId=order_id,
                    status="delivered",
                    notes="Auto-marked delivered: nothing outstanding",
                )
            )
            await session.flush()

    async def distinct_shop_names(
        self, company_id: UUID | None = None, area: str | None = None
    ) -> list[str]:
        """Distinct shop names for the "Shop Owner" filter dropdown. The shop
        identity is the **consignee** (never the consignor), collapsed
        case-insensitively so spacing/casing variants list once."""
        name_key = func.lower(func.trim(Order.consigneeName))
        async with session_scope(self._session) as session:
            q = select(func.min(func.trim(Order.consigneeName))).where(
                Order.isActive == True,
                Order.deletedAt.is_(None),
                Order.consigneeName.isnot(None),
                func.trim(Order.consigneeName) != "",
            )
            if company_id is not None:
                q = q.where(Order.companyId == company_id)
            if area:
                q = q.where(Order.area == area)
            q = q.group_by(name_key).order_by(func.min(func.trim(Order.consigneeName)).asc())
            return [r for (r,) in (await session.execute(q)).all()]

    async def assign_vehicle(self, order_id: UUID, vehicle_id: UUID) -> Optional[Order]:
        async with session_scope(self._session) as session:
            order = await session.get(Order, order_id)
            if not order:
                return None

            order.vehicleId = vehicle_id
            order.updatedAt = datetime.now(timezone.utc)

            await session.flush()
            await session.refresh(order)
            return order
"""Repository for Payment CRUD and summary queries."""
from __future__ import annotations

import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment
from app.models.order import Order
from app.repositories.base import BaseRepository


class PaymentRepository(BaseRepository[Payment]):
    def __init__(self, session: AsyncSession | None = None):
        super().__init__(Payment, session)

    async def list_by_order(self, order_id: str | uuid.UUID) -> list[Payment]:
        """Return all payments for a given order, newest first."""
        async with session_scope(self._session) as session:
            stmt = (
                select(Payment)
                .where(Payment.orderId == order_id)
                .order_by(Payment.createdAt.desc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def total_paid_for_order(self, order_id: str | uuid.UUID) -> float:
        """Return the sum of all payment amounts for an order."""
        async with session_scope(self._session) as session:
            stmt = select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.orderId == order_id
            )
            result = await session.execute(stmt)
            return float(result.scalar() or 0.0)

    async def count_by_order(self, order_id: str | uuid.UUID) -> int:
        """Return the count of payments for an order."""
        async with session_scope(self._session) as session:
            stmt = select(func.count(Payment.id)).where(Payment.orderId == order_id)
            result = await session.execute(stmt)
            return result.scalar() or 0

    async def get_order_summary(self, order_id: str | uuid.UUID) -> dict | None:
        """Build a full payment summary for an order including status."""
        async with session_scope(self._session) as session:
            order = await session.get(Order, uuid.UUID(str(order_id)) if not isinstance(order_id, uuid.UUID) else order_id)
            if order is None:
                return None

            to_pay = float(order.toPay or 0)

            total_paid_stmt = select(
                func.coalesce(func.sum(Payment.amount), 0.0)
            ).where(Payment.orderId == order.id)
            total_paid = float((await session.execute(total_paid_stmt)).scalar() or 0.0)

            count_stmt = select(func.count(Payment.id)).where(Payment.orderId == order.id)
            payment_count = (await session.execute(count_stmt)).scalar() or 0

            balance = to_pay - total_paid

            if to_pay <= 0:
                status = "paid"
            elif total_paid <= 0:
                status = "unpaid"
            elif total_paid >= to_pay:
                status = "paid" if total_paid == to_pay else "overpaid"
            else:
                status = "partial"

            return {
                "orderId": order.id,
                "orderNumber": order.orderNumber,
                "toPay": to_pay,
                "totalPaid": total_paid,
                "balance": balance,
                "paymentStatus": status,
                "paymentCount": payment_count,
            }


# session_scope import needed for the repository methods
from app.database.db import session_scope  # noqa: E402

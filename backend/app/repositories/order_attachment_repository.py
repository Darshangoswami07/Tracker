"""Data access for order (GR) slip/photo attachments."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.order_attachment import OrderAttachment
from app.repositories.base import BaseRepository


class OrderAttachmentRepository(BaseRepository[OrderAttachment]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(OrderAttachment, session)

    async def create(
        self,
        order_id: UUID,
        file_kind: str,
        storage_path: str,
        original_filename: str,
        mime_type: str,
        file_size_bytes: int,
        uploaded_by: UUID,
    ) -> OrderAttachment:
        attachment = OrderAttachment(
            orderId=order_id,
            fileKind=file_kind,
            storagePath=storage_path,
            originalFilename=original_filename,
            mimeType=mime_type,
            fileSizeBytes=file_size_bytes,
            uploadedBy=uploaded_by,
        )
        return await self.save(attachment)

    async def find_by_order(self, order_id: UUID) -> list[OrderAttachment]:
        async with session_scope(self._session) as session:
            stmt = (
                select(OrderAttachment)
                .where(OrderAttachment.orderId == order_id)
                .order_by(desc(OrderAttachment.createdAt))
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def find_by_orders(self, order_ids: list[UUID]) -> dict[UUID, list[OrderAttachment]]:
        """Batched form of ``find_by_order`` for a page of orders - one round
        trip instead of one per order (avoids N+1 latency on remote DBs)."""
        if not order_ids:
            return {}
        async with session_scope(self._session) as session:
            stmt = (
                select(OrderAttachment)
                .where(OrderAttachment.orderId.in_(order_ids))
                .order_by(desc(OrderAttachment.createdAt))
            )
            result = await session.execute(stmt)
            by_order: dict[UUID, list[OrderAttachment]] = {}
            for attachment in result.scalars().all():
                by_order.setdefault(attachment.orderId, []).append(attachment)
            return by_order

    async def find_latest_by_kind(self, order_id: UUID, file_kind: str) -> Optional[OrderAttachment]:
        async with session_scope(self._session) as session:
            stmt = (
                select(OrderAttachment)
                .where(OrderAttachment.orderId == order_id, OrderAttachment.fileKind == file_kind)
                .order_by(desc(OrderAttachment.createdAt))
                .limit(1)
            )
            return await session.scalar(stmt)

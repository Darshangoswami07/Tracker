"""Data access for the in-app notification inbox."""
from __future__ import annotations

import uuid
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.repositories.base import BaseRepository, to_uuid


class NotificationRepository(BaseRepository[Notification]):
    def __init__(self) -> None:
        super().__init__(Notification)

    async def create(
        self,
        user_id: str | uuid.UUID,
        title: str,
        message: str,
        notification_type: NotificationType = NotificationType.INFO,
    ) -> Notification:
        """Creates a notification row for a user."""
        key = to_uuid(user_id)
        if key is None:
            raise ValueError("Invalid user id for notification")
        async with session_scope() as session:
            notification = Notification(
                userId=key,
                title=title,
                message=message,
                type=notification_type,
                isRead=False,
            )
            session.add(notification)
            await session.flush()
            return notification

    async def list_for_user(
        self,
        user_id: str | uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        read: Optional[bool] = None,
    ) -> Tuple[list[Notification], int]:
        """Lists a user's notifications (newest first), optionally filtered by read state."""
        key = to_uuid(user_id)
        if key is None:
            return [], 0
        page = max(1, page)
        page_size = min(max(1, page_size), 100)

        async with session_scope() as session:
            query = select(Notification).where(Notification.userId == key)
            count_query = select(func.count(Notification.id)).where(Notification.userId == key)

            if read is not None:
                query = query.where(Notification.isRead == read)
                count_query = count_query.where(Notification.isRead == read)

            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Notification.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(query)
            return list(result.scalars().all()), total

    async def unread_count(self, user_id: str | uuid.UUID) -> int:
        key = to_uuid(user_id)
        if key is None:
            return 0
        return await self._count(Notification.userId == key, Notification.isRead == False)

    async def mark_read(self, notification_id: str | uuid.UUID, user_id: str | uuid.UUID) -> Optional[Notification]:
        """Marks a single notification as read (scoped to the owning user)."""
        nid = to_uuid(notification_id)
        uid = to_uuid(user_id)
        if nid is None or uid is None:
            return None

        async with session_scope() as session:
            notification = await session.get(Notification, nid)
            if notification is None or notification.userId != uid:
                return None
            notification.isRead = True
            await session.flush()
            return notification

    async def mark_all_read(self, user_id: str | uuid.UUID) -> int:
        """Marks every notification of a user as read. Returns the number updated."""
        uid = to_uuid(user_id)
        if uid is None:
            return 0
        async with session_scope() as session:
            from sqlalchemy import update
            result = await session.execute(
                update(Notification)
                .where(Notification.userId == uid, Notification.isRead == False)
                .values(isRead=True)
            )
            await session.flush()
            return result.rowcount or 0
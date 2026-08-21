"""Data access for audit logs."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.audit_log import AuditLog
from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(AuditLog, session)

    async def find_by_user(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AuditLog], int]:
        async with session_scope(self._session) as session:
            stmt = select(AuditLog).where(AuditLog.userId == UUID(user_id))
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0
            stmt = stmt.order_by(AuditLog.createdAt.desc()).offset(
                (page - 1) * page_size
            ).limit(page_size)
            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def find_by_admin(
        self,
        admin_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AuditLog], int]:
        async with session_scope(self._session) as session:
            stmt = select(AuditLog).where(AuditLog.adminId == UUID(admin_id))
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0
            stmt = stmt.order_by(AuditLog.createdAt.desc()).offset(
                (page - 1) * page_size
            ).limit(page_size)
            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def find_all(
        self,
        page: int = 1,
        page_size: int = 20,
        action: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> tuple[list[AuditLog], int]:
        async with session_scope(self._session) as session:
            stmt = select(AuditLog)
            if action:
                stmt = stmt.where(AuditLog.action == action)
            if entity_type:
                stmt = stmt.where(AuditLog.entityType == entity_type)
            if entity_id:
                stmt = stmt.where(AuditLog.entityId == UUID(entity_id))
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0
            stmt = stmt.order_by(AuditLog.createdAt.desc()).offset(
                (page - 1) * page_size
            ).limit(page_size)
            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def create_log(
        self,
        action: str,
        user_id: str | None = None,
        admin_id: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        old_values: str | None = None,
        new_values: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        async with session_scope(self._session) as session:
            log = AuditLog(
                userId=UUID(user_id) if user_id else None,
                adminId=UUID(admin_id) if admin_id else None,
                action=action,
                entityType=entity_type,
                entityId=UUID(entity_id) if entity_id else None,
                oldValues=old_values,
                newValues=new_values,
                ipAddress=ip_address,
                userAgent=user_agent,
            )
            session.add(log)
            await session.flush()
            return log

"""Data access for approval logs."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select

from app.database.db import session_scope
from app.models.approval_log import ApprovalLog
from app.repositories.base import BaseRepository


class ApprovalLogRepository(BaseRepository[ApprovalLog]):
    def __init__(self) -> None:
        super().__init__(ApprovalLog)

    async def find_by_registration_request(
        self,
        request_id: str,
    ) -> list[ApprovalLog]:
        async with session_scope() as session:
            stmt = (
                select(ApprovalLog)
                .where(ApprovalLog.registrationRequestId == UUID(request_id))
                .order_by(ApprovalLog.createdAt.desc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def find_by_admin(
        self,
        admin_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[ApprovalLog], int]:
        async with session_scope() as session:
            stmt = select(ApprovalLog).where(ApprovalLog.adminId == UUID(admin_id))
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0
            stmt = stmt.order_by(ApprovalLog.createdAt.desc()).offset(
                (page - 1) * page_size
            ).limit(page_size)
            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def create_log(
        self,
        registration_request_id: str,
        admin_id: str,
        action: str,
        reason: str | None = None,
    ) -> ApprovalLog:
        async with session_scope() as session:
            log = ApprovalLog(
                registrationRequestId=UUID(registration_request_id),
                adminId=UUID(admin_id),
                action=action,
                reason=reason,
            )
            session.add(log)
            await session.flush()
            return log

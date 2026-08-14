"""Data access for generated reports."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select, desc

from app.database.db import session_scope
from app.models.report import Report
from app.repositories.base import BaseRepository


class ReportRepository(BaseRepository[Report]):
    def __init__(self) -> None:
        super().__init__(Report)

    async def create(
        self,
        name: str,
        report_type: str,
        generated_by: UUID,
        storage_path: Optional[str] = None,
        file_size_bytes: int = 0,
        status: str = "completed",
    ) -> Report:
        report = Report(
            name=name,
            type=report_type,
            generatedBy=generated_by,
            storagePath=storage_path,
            fileSizeBytes=file_size_bytes,
            status=status,
        )
        return await self.save(report)

    async def find_recent(self, page: int = 1, page_size: int = 20) -> tuple[list[Report], int]:
        async with session_scope() as session:
            stmt = select(Report).order_by(desc(Report.createdAt))
            from sqlalchemy import func

            total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(stmt)
            return list(result.scalars().all()), total

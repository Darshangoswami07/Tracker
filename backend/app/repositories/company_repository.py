"""Company repository."""
from __future__ import annotations

from typing import Optional, Tuple, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.company import Company
from app.models.enums import CompanyStatus
from app.repositories.base import BaseRepository
from app.utils.company import normalize_company_name


class CompanyRepository(BaseRepository[Company]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Company, session)

    def _eligible_filters(self):
        """Companies that users can register against."""
        return [
            Company.deletedAt.is_(None),
            Company.isActive.is_(True),
            Company.status == CompanyStatus.ACTIVE,
        ]

    async def count(self) -> int:
        return await self._count()

    async def find_by_normalized_name(self, name: str) -> Optional[Company]:
        """Case- and whitespace-insensitive lookup of a non-deleted company."""
        normalized = normalize_company_name(name)
        if not normalized:
            return None
        return await self._scalar_first(
            func.lower(Company.name) == normalized.lower(),
            Company.deletedAt.is_(None),
        )

    async def find_active_by_id(self, company_id: str | UUID) -> Optional[Company]:
        """Fetches a company that is eligible for staff/driver registration."""
        return await self._scalar_first(
            Company.id == company_id,
            *self._eligible_filters(),
        )

    async def list_active_companies(self) -> List[Company]:
        """Companies eligible for staff/driver registration, alphabetical."""
        async with session_scope(self._session) as session:
            query = (
                select(Company)
                .where(*self._eligible_filters())
                .order_by(func.lower(Company.name))
            )
            result = await session.execute(query)
            return list(result.scalars().all())

    async def get_all_companies(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Company], int]:
        async with session_scope(self._session) as session:
            query = select(Company).where(Company.deletedAt.is_(None))

            if status:
                query = query.where(Company.status == status)

            if search:
                query = query.where(
                    or_(
                        Company.name.ilike(f"%{search}%"),
                        Company.legalName.ilike(f"%{search}%"),
                        Company.email.ilike(f"%{search}%"),
                        Company.city.ilike(f"%{search}%"),
                    )
                )

            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            query = query.order_by(desc(Company.createdAt))
            query = query.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(query)
            companies = result.scalars().all()

            return list(companies), total

    async def create_company(self, **fields) -> Company:
        async with session_scope(self._session) as session:
            if "name" in fields:
                fields["name"] = normalize_company_name(fields["name"])
            company = Company(**fields)
            session.add(company)
            await session.flush()
            await session.refresh(company)
            return company

    async def update_company(self, company_id: UUID, **fields) -> Optional[Company]:
        async with session_scope(self._session) as session:
            company = await session.get(Company, company_id)
            if company is None:
                return None
            for key, value in fields.items():
                setattr(company, key, value)
            await session.flush()
            await session.refresh(company)
            return company

    async def soft_delete_company(self, company_id: UUID) -> Optional[Company]:
        async with session_scope(self._session) as session:
            company = await session.get(Company, company_id)
            if company is None:
                return None
            company.soft_delete()
            company.status = CompanyStatus.CLOSED
            company.isActive = False
            await session.flush()
            await session.refresh(company)
            return company
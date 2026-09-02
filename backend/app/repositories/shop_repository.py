"""Shop (consignor master data) repository."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.shop import Shop
from app.repositories.base import BaseRepository


class ShopRepository(BaseRepository[Shop]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Shop, session)

    async def get_or_create(
        self, *, company_id: UUID, area: str | None, name: str | None
    ) -> Shop | None:
        """Finds the Shop matching (company, area, name), creating it if it
        doesn't exist yet. Returns None for a blank/missing name — a GR
        without a consignor name has nothing to link. Never deletes or
        mutates an existing Shop; only ever inserts a new one."""
        if not name or not name.strip():
            return None
        clean_name = name.strip()
        async with session_scope(self._session) as session:
            conds = [Shop.companyId == company_id, Shop.name == clean_name]
            conds.append(Shop.area.is_(None) if not area else Shop.area == area)
            existing = (await session.execute(select(Shop).where(*conds))).scalar_one_or_none()
            if existing is not None:
                return existing
            shop = Shop(companyId=company_id, area=area, name=clean_name)
            session.add(shop)
            await session.flush()
            await session.refresh(shop)
            return shop

"""Shop (consignor master data) repository."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.shop import Shop
from app.repositories.base import BaseRepository


def normalize_shop_name(name: str | None) -> str | None:
    """Canonical form used for shop de-duplication: trimmed, inner whitespace
    collapsed to single spaces. Matching is additionally case-insensitive (see
    ``get_or_create``), so ``"Amit Agencies"``, ``"  amit   agencies "`` and
    ``"AMIT AGENCIES"`` all resolve to the one Shop. The first spelling seen
    wins as the stored display name — we never rewrite it afterwards."""
    if not name:
        return None
    cleaned = " ".join(name.split())
    return cleaned or None


class ShopRepository(BaseRepository[Shop]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Shop, session)

    async def get_or_create(
        self, *, company_id: UUID, area: str | None, name: str | None
    ) -> Shop | None:
        """Finds the Shop for a GR's **consignee** (the shop identity — never
        the consignor), creating it if it doesn't exist yet. Returns None for a
        blank/missing name — a GR without a consignee has nothing to link.
        Matching is on the normalized name (whitespace-collapsed) AND
        case-insensitive, so spacing/capitalisation variants never split one
        real shop into several. Never deletes or mutates an existing Shop; only
        ever inserts a new one."""
        clean_name = normalize_shop_name(name)
        if clean_name is None:
            return None
        async with session_scope(self._session) as session:
            conds = [
                Shop.companyId == company_id,
                func.lower(Shop.name) == clean_name.lower(),
            ]
            conds.append(Shop.area.is_(None) if not area else Shop.area == area)
            existing = (
                await session.execute(select(Shop).where(*conds).order_by(Shop.createdAt.asc()))
            ).scalars().first()
            if existing is not None:
                return existing
            shop = Shop(companyId=company_id, area=area, name=clean_name)
            session.add(shop)
            await session.flush()
            await session.refresh(shop)
            return shop

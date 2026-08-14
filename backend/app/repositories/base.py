"""Base repository with shared CRUD helpers for ORM models."""
from __future__ import annotations

import uuid
from typing import Generic, TypeVar

from sqlalchemy import select, func

from app.database.base import Base
from app.database.db import session_scope

TModel = TypeVar("TModel", bound=Base)


def to_uuid(value: str | uuid.UUID) -> uuid.UUID | None:
    """Coerces a string/uuid to a UUID, returning None for invalid input."""
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


class BaseRepository(Generic[TModel]):
    """Thin base class over SQLAlchemy models to keep data access centralised."""

    def __init__(self, model: type[TModel]) -> None:
        self.model = model

    async def find_by_id(self, document_id: str | uuid.UUID) -> TModel | None:
        key = to_uuid(document_id)
        if key is None:
            return None
        async with session_scope() as session:
            return await session.get(self.model, key)

    async def save(self, instance: TModel) -> TModel:
        async with session_scope() as session:
            session.add(instance)
            await session.flush()
            return instance

    async def delete(self, instance: TModel) -> None:
        async with session_scope() as session:
            await session.delete(instance)

    async def _scalar_first(self, *criteria) -> TModel | None:
        async with session_scope() as session:
            stmt = select(self.model).where(*criteria).limit(1)
            return await session.scalar(stmt)

    async def _count(self, *criteria) -> int:
        async with session_scope() as session:
            stmt = select(func.count(self.model.id))
            if criteria:
                stmt = stmt.where(*criteria)
            result = await session.execute(stmt)
            return result.scalar() or 0

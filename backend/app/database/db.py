"""PostgreSQL connection: SQLAlchemy 2.0 async engine over psycopg 3.

Neon connection strings (including the transaction-pooler endpoint) carry
``sslmode`` and ``channel_binding`` query parameters, which psycopg 3 passes
through to libpq — so ``DATABASE_URL`` is used as-is.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.database.base import Base

# Importing the model package registers every table on ``Base.metadata``.
from app import models  # noqa: F401

_engine: AsyncEngine | None = None
_session_maker: async_sessionmaker[AsyncSession] | None = None


def _get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=1800,
            pool_size=10,
            max_overflow=5,
        )
    return _engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    global _session_maker
    if _session_maker is None:
        _session_maker = async_sessionmaker(_get_engine(), expire_on_commit=False)
    return _session_maker


@asynccontextmanager
async def session_scope(session: AsyncSession | None = None) -> AsyncIterator[AsyncSession]:
    """Yields *session* if provided, otherwise opens a fresh one (legacy path).

    Repositories call ``_session_scope`` which delegates here.  Celery tasks
    and tenancy helpers that still import ``session_scope`` directly also
    benefit: passing the request-scoped session reuses the same connection.
    """
    if session is not None:
        yield session
    else:
        async with get_session_maker()() as s:
            async with s.begin():
                yield s


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields one session per request.

    The session is auto-committed when the handler succeeds and rolled back
    on exception. It is closed at the end of the request lifecycle.
    """
    async with get_session_maker()() as session:
        async with session.begin():
            yield session


async def init_database() -> None:
    """Connects to PostgreSQL and creates any missing tables."""
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_database() -> None:
    """Drops all tracked tables (used by the test bootstrap)."""
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def close_database() -> None:
    """Disposes the async engine and clears the session factory."""
    global _engine, _session_maker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_maker = None

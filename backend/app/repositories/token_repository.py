"""Data access for refresh tokens and password resets."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.database.db import session_scope
from app.models.enums import RefreshTokenStatus
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.repositories.base import BaseRepository, to_uuid


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TokenRepository(BaseRepository[RefreshToken]):
    def __init__(self) -> None:
        super().__init__(RefreshToken)

    async def find_by_jti(self, jti: str) -> RefreshToken | None:
        async with session_scope() as session:
            stmt = select(RefreshToken).where(RefreshToken.jti == jti).limit(1)
            return await session.scalar(stmt)

    async def create_refresh_token(
        self,
        jti: str,
        user_id: str,
        expires_at: datetime,
        user_agent: str | None = None,
    ) -> RefreshToken:
        async with session_scope() as session:
            token = RefreshToken(
                jti=jti,
                userId=to_uuid(user_id),
                status=RefreshTokenStatus.ACTIVE,
                expiresAt=expires_at,
                userAgent=user_agent,
            )
            session.add(token)
            await session.flush()
            return token

    async def revoke(self, token: RefreshToken) -> None:
        async with session_scope() as session:
            record = await session.get(RefreshToken, token.id)
            if record is not None:
                record.status = RefreshTokenStatus.REVOKED
                record.revokedAt = _utcnow()

    async def revoke_all_for_user(self, user_id: str) -> int:
        user_key = to_uuid(user_id)
        if user_key is None:
            return 0
        async with session_scope() as session:
            result = await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.userId == user_key,
                    RefreshToken.status == RefreshTokenStatus.ACTIVE,
                )
                .values(status=RefreshTokenStatus.REVOKED, revokedAt=_utcnow())
            )
            return result.rowcount or 0


class PasswordResetRepository(BaseRepository[PasswordReset]):
    def __init__(self) -> None:
        super().__init__(PasswordReset)

    async def find_by_hash(self, token_hash: str) -> PasswordReset | None:
        async with session_scope() as session:
            stmt = select(PasswordReset).where(PasswordReset.tokenHash == token_hash).limit(1)
            return await session.scalar(stmt)

    async def create(self, token_hash: str, user_id: str, expires_at: datetime) -> PasswordReset:
        async with session_scope() as session:
            record = PasswordReset(
                tokenHash=token_hash,
                userId=to_uuid(user_id),
                used=False,
                expiresAt=expires_at,
            )
            session.add(record)
            await session.flush()
            return record

    async def mark_used(self, record: PasswordReset) -> None:
        async with session_scope() as session:
            row = await session.get(PasswordReset, record.id)
            if row is not None:
                row.used = True
                row.usedAt = _utcnow()

    async def invalidate_pending_for_user(self, user_id: str) -> int:
        user_key = to_uuid(user_id)
        if user_key is None:
            return 0
        async with session_scope() as session:
            result = await session.execute(
                update(PasswordReset)
                .where(PasswordReset.userId == user_key, PasswordReset.used.is_(False))
                .values(used=True, usedAt=_utcnow())
            )
            return result.rowcount or 0

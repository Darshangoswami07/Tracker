"""Token lifecycle: issue, refresh (rotation), revoke."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.exceptions import TokenExpiredError, TokenInvalidError
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.repositories.token_repository import TokenRepository
from app.schemas.auth import TokenPairOut
from app.services.user_service import user_service
from app.utils.dates import to_utc, utcnow


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TokenService:
    def __init__(self, repository: TokenRepository) -> None:
        self.repository = repository

    async def issue_tokens(self, user: User, user_agent: str | None = None) -> TokenPairOut:
        """Creates an access + refresh token pair and persists the refresh
        session so it can be revoked and rotated later."""
        access_token, _, _ = create_access_token(user.id, user.role.value)
        refresh_token, refresh_jti, refresh_lifetime = create_refresh_token(user.id, user.role.value)

        await self.repository.create_refresh_token(
            jti=refresh_jti,
            user_id=str(user.id),
            expires_at=utcnow() + refresh_lifetime,
            user_agent=user_agent,
        )

        return TokenPairOut(
            accessToken=access_token,
            refreshToken=refresh_token,
            expiresIn=int(refresh_lifetime.total_seconds()),
        )

    async def rotate(self, refresh_token: str, user_agent: str | None = None) -> TokenPairOut:
        """Validates a refresh token, revokes the old session, and issues a new
        pair. This is refresh-token rotation: a used/compromised token is
        invalidated on every refresh."""
        payload = decode_token(refresh_token, expected_type="refresh")
        record = await self.repository.find_by_jti(payload.jti)

        if record is None or record.status.value != "active":
            raise TokenInvalidError()
        if to_utc(record.expiresAt) < utcnow():
            await self.repository.revoke(record)
            raise TokenExpiredError()

        await self.repository.revoke(record)

        user = await user_service.get_by_id(record.userId)
        if user is None:
            raise TokenInvalidError()

        return await self.issue_tokens(user, user_agent=user_agent)

    async def revoke(self, refresh_token: str) -> None:
        """Revokes a refresh token by its JTI (used on logout)."""
        try:
            payload = decode_token(refresh_token, expected_type="refresh")
        except (TokenInvalidError, TokenExpiredError):
            # The client is logging out anyway; nothing to revoke.
            return
        record = await self.repository.find_by_jti(payload.jti)
        if record is not None:
            await self.repository.revoke(record)

    async def revoke_all_for_user(self, user_id: str) -> None:
        await self.repository.revoke_all_for_user(user_id)


token_service = TokenService(TokenRepository())
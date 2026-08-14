"""High-level authentication orchestration used by the API routes."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.exceptions import ResetTokenInvalidError, TokenInvalidError
from app.core.security import create_password_reset_token, decode_token
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.token_repository import PasswordResetRepository
from app.schemas.auth import AuthResponse, UserOut
from app.services.email_service import email_service
from app.services.token_service import token_service
from app.services.user_service import user_service
from app.utils.dates import to_utc, utcnow

GENERIC_RESET_MESSAGE = "If that email is registered, a reset link has been sent."


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_auth_response(user: User, tokens) -> AuthResponse:
    return AuthResponse(user=UserOut.model_validate(user), tokens=tokens)


class AuthService:
    async def login(self, email: str, password: str, role: UserRole | None = None, user_agent: str | None = None) -> AuthResponse:
        user = await user_service.authenticate(email, password, role=role)
        tokens = await token_service.issue_tokens(user, user_agent=user_agent)
        return _to_auth_response(user, tokens)

    async def refresh(self, refresh_token: str, user_agent: str | None = None) -> AuthResponse:
        tokens = await token_service.rotate(refresh_token, user_agent=user_agent)
        payload = decode_token(refresh_token, expected_type="refresh")
        user = await user_service.get_by_id(payload.subject)
        if user is None:
            raise TokenInvalidError()
        return _to_auth_response(user, tokens)

    async def logout(self, refresh_token: str) -> None:
        await token_service.revoke(refresh_token)

    async def forgot_password(self, email: str) -> dict:
        """Generates a reset token, persists its SHA-256 digest, then dispatches
        it. The response is identical whether or not the email exists so that
        account enumeration is not possible."""
        user = await user_service.get_by_email(email)
        if user is not None:
            reset_token = create_password_reset_token(user.id)
            token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
            await PasswordResetRepository().create(
                token_hash,
                str(user.id),
                expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
            )
            exposed = email_service.send_password_reset(user, reset_token)
            if exposed:
                return {
                    "message": GENERIC_RESET_MESSAGE,
                    "resetToken": exposed,
                    "expiresIn": settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES * 60,
                }
        return {"message": GENERIC_RESET_MESSAGE}

    async def reset_password(self, token: str, new_password: str) -> None:
        """Validates a one-time reset token, applies the new password, marks the
        token used and revokes all other active sessions."""
        try:
            payload = decode_token(token, expected_type="password_reset")
        except Exception as exc:  # noqa: BLE001 - mapped to a generic message
            raise ResetTokenInvalidError() from exc

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        record = await PasswordResetRepository().find_by_hash(token_hash)
        if record is None or record.used or to_utc(record.expiresAt) < utcnow():
            raise ResetTokenInvalidError()

        user = await user_service.get_by_id(payload.subject)
        if user is None:
            raise ResetTokenInvalidError()

        await user_service.reset_password(user, new_password)
        await PasswordResetRepository().mark_used(record)
        await PasswordResetRepository().invalidate_pending_for_user(str(user.id))
        await token_service.revoke_all_for_user(str(user.id))


auth_service = AuthService()
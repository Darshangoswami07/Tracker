"""Password hashing and JWT helpers."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.config import settings
from app.core.exceptions import TokenExpiredError, TokenInvalidError

TokenType = Literal["access", "refresh", "password_reset"]


class TokenPayload:
    """Decoded claims of a JWT with typed accessors."""

    __slots__ = ("subject", "jti", "token_type", "expires_at")

    def __init__(self, subject: str, jti: str, token_type: str, expires_at: datetime) -> None:
        self.subject = subject
        self.jti = jti
        self.token_type = token_type
        self.expires_at = expires_at


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    """Hashes a plaintext password with bcrypt. Passwords are never stored raw."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


# --------------------------------------------------------------------------- #
# Token creation / validation
# --------------------------------------------------------------------------- #
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _encode(payload: dict[str, Any], expires_in: timedelta, token_type: TokenType) -> str:
    now = _utcnow()
    claims = {
        "sub": str(payload["sub"]),
        "jti": uuid.uuid4().hex,
        "type": token_type,
        "iat": now,
        "nbf": now,
        "exp": now + expires_in,
        "iss": settings.JWT_ISSUER,
        "aud": settings.APP_NAME,
        "user_role": payload.get("role"),
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: str, role: str | None = None) -> tuple[str, str, timedelta]:
    """Creates an access token and returns (token, jti, lifetime)."""
    expires_in = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = _encode({"sub": user_id, "role": role}, expires_in, "access")
    claims = jwt.decode(token, options={"verify_signature": False})
    return token, claims["jti"], expires_in


def create_refresh_token(user_id: str, role: str | None = None) -> tuple[str, str, timedelta]:
    """Creates a refresh token and returns (token, jti, lifetime)."""
    expires_in = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    token = _encode({"sub": user_id, "role": role}, expires_in, "refresh")
    claims = jwt.decode(token, options={"verify_signature": False})
    return token, claims["jti"], expires_in


def create_password_reset_token(user_id: str) -> str:
    """Creates a short-lived password reset token (no persistence needed)."""
    expires_in = timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    return _encode({"sub": user_id}, expires_in, "password_reset")


def decode_token(token: str, expected_type: TokenType | None = None) -> TokenPayload:
    """Decodes and validates a JWT. Raises typed errors on failure."""
    try:
        claims = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.APP_NAME,
            options={"require": ["sub", "jti", "exp", "type", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError() from exc
    except InvalidTokenError as exc:
        raise TokenInvalidError() from exc

    token_type = claims.get("type")
    if expected_type is not None and token_type != expected_type:
        raise TokenInvalidError()

    expires_at = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    return TokenPayload(
        subject=claims["sub"],
        jti=claims["jti"],
        token_type=str(token_type or ""),
        expires_at=expires_at,
    )

"""Data access for email OTPs."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import delete, select, update

from app.database.db import session_scope
from app.models.email_otp import EmailOTP
from app.models.enums import OTPIntent
from app.repositories.base import BaseRepository


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EmailOTPRepository(BaseRepository[EmailOTP]):
    def __init__(self) -> None:
        super().__init__(EmailOTP)

    async def find_by_hash(self, otp_hash: str) -> Optional[EmailOTP]:
        async with session_scope() as session:
            stmt = select(EmailOTP).where(EmailOTP.otpHash == otp_hash)
            return await session.scalar(stmt)

    async def find_latest_by_user_and_intent(
        self,
        user_id: str,
        intent: OTPIntent,
    ) -> Optional[EmailOTP]:
        async with session_scope() as session:
            stmt = (
                select(EmailOTP)
                .where(
                    EmailOTP.userId == UUID(user_id),
                    EmailOTP.intent == intent,
                    EmailOTP.used == False,
                    EmailOTP.expiresAt > _utcnow(),
                )
                .order_by(EmailOTP.createdAt.desc())
            )
            return await session.scalar(stmt)

    async def find_most_recent_by_user_and_intent(
        self,
        user_id: str,
        intent: OTPIntent,
    ) -> Optional[EmailOTP]:
        """Return the most recently created OTP row for a user + intent
        regardless of used/expired state. Used to enforce the resend cooldown.
        """
        async with session_scope() as session:
            stmt = (
                select(EmailOTP)
                .where(
                    EmailOTP.userId == UUID(user_id),
                    EmailOTP.intent == intent,
                )
                .order_by(EmailOTP.createdAt.desc())
            )
            return await session.scalar(stmt)

    async def create_otp(
        self,
        otp_hash: str,
        user_id: str,
        email: str,
        intent: OTPIntent,
        expires_at: datetime,
        created_by: str | None = None,
    ) -> EmailOTP:
        async with session_scope() as session:
            otp = EmailOTP(
                otpHash=otp_hash,
                userId=UUID(user_id),
                email=email,
                intent=intent,
                expiresAt=expires_at,
                createdBy=created_by,
            )
            session.add(otp)
            await session.flush()
            return otp

    async def mark_used(self, otp: EmailOTP) -> None:
        async with session_scope() as session:
            record = await session.get(EmailOTP, otp.id)
            if record is not None:
                record.used = True
                record.usedAt = _utcnow()

    async def increment_attempts(self, otp: EmailOTP) -> None:
        async with session_scope() as session:
            record = await session.get(EmailOTP, otp.id)
            if record is not None:
                record.attempts += 1

    async def invalidate_previous_otps(
        self,
        user_id: str,
        intent: OTPIntent,
    ) -> int:
        async with session_scope() as session:
            result = await session.execute(
                update(EmailOTP)
                .where(
                    EmailOTP.userId == UUID(user_id),
                    EmailOTP.intent == intent,
                    EmailOTP.used == False,
                )
                .values(used=True, usedAt=_utcnow())
            )
            return result.rowcount or 0

    async def cleanup_expired_otps(self) -> int:
        """Clean up expired OTPs. Returns number of deleted records."""
        async with session_scope() as session:
            result = await session.execute(
                delete(EmailOTP).where(EmailOTP.expiresAt < _utcnow())
            )
            return result.rowcount or 0

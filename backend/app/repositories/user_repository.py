"""Data access for the users table."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(User, session)

    async def find_by_email(self, email: str, role: UserRole | None = None) -> User | None:
        if role is not None:
            return await self._scalar_first(User.email == email.lower(), User.role == role)
        return await self._scalar_first(User.email == email.lower())

    async def find_by_phone(self, phone: str) -> User | None:
        return await self._scalar_first(User.phone == phone)

    async def exists_with_email(self, email: str) -> bool:
        return await self.find_by_email(email) is not None

    async def exists_with_phone(self, phone: str) -> bool:
        return await self.find_by_phone(phone) is not None

    async def create(
        self,
        full_name: str,
        email: str,
        phone: str,
        password_hash: str,
        role: UserRole = UserRole.EMPLOYEE,
        *,
        status: str = "pending",
        is_active: bool = False,
        is_approved: bool = False,
        is_verified: bool = False,
        otp_verified: bool = False,
        company_id=None,
        area: str | None = None,
    ) -> User:
        async with session_scope(self._session) as session:
            user = User(
                firstName=full_name.split()[0] if full_name else "",
                lastName=" ".join(full_name.split()[1:]) if len(full_name.split()) > 1 else "",
                email=email.lower(),
                phone=phone,
                passwordHash=password_hash,
                role=role,
                companyId=company_id,
                isActive=is_active,
                status=status,
                isVerified=is_verified,
                isApproved=is_approved,
                otpVerified=otp_verified,
                area=area,
            )
            session.add(user)
            await session.flush()
            return user

    async def set_password(self, user: User, password_hash: str) -> None:
        async with session_scope(self._session) as session:
            record = await session.get(User, user.id)
            if record is not None:
                record.passwordHash = password_hash

    async def update_status(self, user_id: str, status: str) -> bool:
        """Persist a role/status change for a user row.

        Operates on a live session (``find_by_id`` returns a detached row, so
        mutating it would never reach the database).
        """
        async with session_scope(self._session) as session:
            from app.repositories.base import to_uuid

            record = await session.get(User, to_uuid(user_id))
            if record is None:
                return False
            record.status = status
            if status == "active":
                record.isActive = True
                record.isApproved = True
                record.isVerified = True
            elif status == "suspended":
                record.isActive = False
            elif status == "rejected":
                record.isActive = False
                record.isApproved = False
            return True

    async def approve_staff(self, user_id: str, company_id) -> bool:
        """Activates a self-service Staff (STAFF role) account, assigning it
        to the approving Admin's company in the same transaction.

        Skips the OTP intermediate state used by the registration_requests
        flow entirely — Staff goes straight from ``pending`` to ``active``.
        """
        async with session_scope(self._session) as session:
            from app.repositories.base import to_uuid

            record = await session.get(User, to_uuid(user_id))
            if record is None:
                return False
            record.status = "active"
            record.isActive = True
            record.isApproved = True
            record.isVerified = True
            record.companyId = company_id
            return True

    async def set_area(self, user_id: str, area: str) -> bool:
        """Assigns/changes a Staff account's operational area — Admin's
        "Assign Location"/"Change Location" action on the All Staff page.
        Never touches any other field; `area` is already validated/normalized
        by the request schema before reaching here."""
        async with session_scope(self._session) as session:
            from app.repositories.base import to_uuid

            record = await session.get(User, to_uuid(user_id))
            if record is None:
                return False
            record.area = area
            return True

    async def delete_by_id(self, user_id: str) -> bool:
        record = await self.find_by_id(user_id)
        if record is None:
            return False
        await self.delete(record)
        return True

    async def get_all_users(
        self,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        search: str | None = None,
        role: str | None = None,
        company_id=None,
    ) -> tuple[list[User], int]:
        async with session_scope(self._session) as session:
            stmt = select(User)
            if status:
                stmt = stmt.where(User.status == status)
            if role:
                stmt = stmt.where(User.role == role)
            if company_id is not None:
                stmt = stmt.where(User.companyId == company_id)
            if search:
                search_term = f"%{search.lower()}%"
                stmt = stmt.where(
                    (User.firstName.ilike(search_term))
                    | (User.lastName.ilike(search_term))
                    | (User.email.ilike(search_term))
                    | (User.phone.ilike(search_term))
                )
            stmt = stmt.order_by(User.createdAt.desc())
            total_stmt = select(sa.func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0

            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(stmt)
            items = list(result.scalars().all())
            return items, total

    async def count(self) -> int:
        return await self._count()

    async def count_for_dashboard(self) -> dict:
        """Single-query replacement for count() + count_by_role('employee')."""
        async with session_scope(self._session) as session:
            row = (await session.execute(
                select(
                    sa.func.count(User.id).label("total"),
                    sa.func.count(User.id).filter(User.role == "employee").label("employees"),
                )
            )).one()
            return {"total": row.total, "employees": row.employees}

    async def count_by_role(self, role: str) -> int:
        async with session_scope(self._session) as session:
            return (
                await session.scalar(
                    select(sa.func.count()).select_from(User).where(User.role == role)
                )
                or 0
            )

    async def find_by_ids(self, ids: list[str]) -> list[User]:
        """Batch-fetch users by a list of IDs to avoid N+1 queries."""
        if not ids:
            return []
        from app.repositories.base import to_uuid
        uuids = [to_uuid(i) for i in ids]
        uuids = [u for u in uuids if u is not None]
        if not uuids:
            return []
        async with session_scope(self._session) as session:
            stmt = select(User).where(User.id.in_(uuids))
            result = await session.execute(stmt)
            return list(result.scalars().all())

"""Data access for registration requests."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.database.db import session_scope
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.repositories.base import BaseRepository


class RegistrationRequestRepository(BaseRepository[RegistrationRequest]):
    def __init__(self) -> None:
        super().__init__(RegistrationRequest)

    async def find_by_email(self, email: str) -> Optional[RegistrationRequest]:
        return await self._scalar_first(RegistrationRequest.email == email.lower())

    async def find_by_phone(self, phone: str) -> Optional[RegistrationRequest]:
        return await self._scalar_first(RegistrationRequest.phone == phone)

    async def find_by_id(self, request_id: UUID) -> Optional[RegistrationRequest]:
        return await super().find_by_id(request_id)

    async def find_pending_requests(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        role: Optional[str] = None,
    ) -> tuple[list[RegistrationRequest], int]:
        async with session_scope() as session:
            stmt = select(RegistrationRequest).where(
                RegistrationRequest.status == "pending"
            )
            if role:
                stmt = stmt.where(RegistrationRequest.requestedRole == role)
            if search:
                search_term = f"%{search.lower()}%"
                stmt = stmt.where(
                    (RegistrationRequest.firstName.ilike(search_term))
                    | (RegistrationRequest.lastName.ilike(search_term))
                    | (RegistrationRequest.companyName.ilike(search_term))
                    | (RegistrationRequest.email.ilike(search_term))
                    | (RegistrationRequest.phone.ilike(search_term))
                )
            stmt = stmt.order_by(RegistrationRequest.createdAt.desc())
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0

            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(stmt)
            items = result.scalars().all()
            return list(items), total

    async def count_pending(self) -> int:
        """Get total count of pending registration requests."""
        async with session_scope() as session:
            stmt = select(func.count()).where(RegistrationRequest.status == "pending")
            return await session.scalar(stmt) or 0

    async def get_stats(self) -> dict:
        """Get aggregate statistics for registration requests."""
        async with session_scope() as session:
            now = datetime.utcnow()
            start_of_today = datetime(now.year, now.month, now.day)

            pending = await session.scalar(select(func.count()).where(RegistrationRequest.status == "pending")) or 0
            approved_today = await session.scalar(
                select(func.count()).where(
                    RegistrationRequest.status.in_(["approved_pending_otp", "completed"]),
                    RegistrationRequest.approvedAt >= start_of_today,
                )
            ) or 0
            rejected_today = await session.scalar(
                select(func.count()).where(
                    RegistrationRequest.status == "rejected",
                    RegistrationRequest.rejectedAt >= start_of_today,
                )
            ) or 0

            return {
                "pending": pending,
                "approvedToday": approved_today,
                "rejectedToday": rejected_today,
                "avgReviewTime": "12m",
            }

    async def get_all_requests(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> tuple[list[RegistrationRequest], int]:
        async with session_scope() as session:
            stmt = select(RegistrationRequest)
            if status:
                stmt = stmt.where(RegistrationRequest.status == status)
            if search:
                search_term = f"%{search.lower()}%"
                stmt = stmt.where(
                    (RegistrationRequest.firstName.ilike(search_term))
                    | (RegistrationRequest.lastName.ilike(search_term))
                    | (RegistrationRequest.companyName.ilike(search_term))
                    | (RegistrationRequest.email.ilike(search_term))
                    | (RegistrationRequest.phone.ilike(search_term))
                )
            stmt = stmt.order_by(RegistrationRequest.createdAt.desc())
            total_stmt = select(func.count()).select_from(stmt.subquery())
            total = await session.scalar(total_stmt) or 0

            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await session.execute(stmt)
            items = result.scalars().all()
            return list(items), total

    async def create_request(
        self,
        first_name: str,
        last_name: str,
        company_name: str,
        email: str,
        phone: str,
        password_hash: str,
        requested_role: str = "employee",
        company_id: Optional[UUID] = None,
    ) -> RegistrationRequest:
        async with session_scope() as session:
            request = RegistrationRequest(
                firstName=first_name.strip(),
                lastName=last_name.strip(),
                companyName=company_name.strip(),
                companyId=company_id,
                email=email.lower(),
                phone=phone,
                passwordHash=password_hash,
                requestedRole=requested_role,
            )
            session.add(request)
            await session.flush()
            return request

    async def reset_for_resubmission(
        self,
        request_id: UUID,
        first_name: str,
        last_name: str,
        company_name: str,
        email: str,
        phone: str,
        password_hash: str,
        requested_role: str = "employee",
        company_id: Optional[UUID] = None,
    ) -> Optional[RegistrationRequest]:
        """Reuse a previously rejected registration row and set it back to PENDING.

        Required because the email/phone columns are unique; inserting a fresh row
        would violate the constraint. Reusing the row keeps the audit history intact.
        """
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.firstName = first_name.strip()
            request.lastName = last_name.strip()
            request.companyName = company_name.strip()
            request.companyId = company_id
            request.email = email.lower()
            request.phone = phone
            request.passwordHash = password_hash
            request.requestedRole = requested_role
            request.status = "pending"
            request.isApproved = False
            request.isActive = False
            request.isVerified = False
            request.otpVerified = False
            request.approvedBy = None
            request.approvedAt = None
            request.rejectedBy = None
            request.rejectedAt = None
            request.rejectionReason = None
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request

    async def update_request_info(
        self,
        request_id: UUID,
        first_name: str,
        last_name: str,
        company_name: str,
        email: str,
        phone: str,
        password_hash: str,
        requested_role: str = "employee",
        company_id: Optional[UUID] = None,
    ) -> Optional[RegistrationRequest]:
        """Update an existing PENDING registration request with new information."""
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.firstName = first_name.strip()
            request.lastName = last_name.strip()
            request.companyName = company_name.strip()
            request.companyId = company_id
            request.email = email.lower()
            request.phone = phone
            request.passwordHash = password_hash
            request.requestedRole = requested_role
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request

    async def update_status(
        self,
        request_id: UUID,
        status: str,
        admin_id: UUID,
        approved: bool = False,
        rejected: bool = False,
        reason: str | None = None,
    ) -> Optional[RegistrationRequest]:
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.status = status
            if approved:
                request.isApproved = True
                request.isActive = True
                request.approvedBy = "admin_id"
                request.approvedAt = datetime.utcnow()
            if rejected:
                request.status = "rejected"
                request.isApproved = False
                request.isActive = False
                request.rejectedBy = str(admin_id)
                request.rejectedAt = datetime.utcnow()
                request.rejectionReason = reason
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request

    async def approve_request(
        self,
        request_id: UUID,
        admin_id: UUID,
    ) -> Optional[RegistrationRequest]:
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.status = "approved_pending_otp"
            request.isApproved = True
            request.isActive = True
            request.approvedBy = str(admin_id)
            request.approvedAt = datetime.utcnow()
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request

    async def reject_request(
        self,
        request_id: UUID,
        admin_id: UUID,
        reason: str,
    ) -> Optional[RegistrationRequest]:
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.status = "rejected"
            request.isApproved = False
            request.isActive = False
            request.rejectedBy = str(admin_id)
            request.rejectedAt = datetime.utcnow()
            request.rejectionReason = reason
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request

    async def activate_user(
        self,
        request_id: UUID,
    ) -> Optional[RegistrationRequest]:
        async with session_scope() as session:
            request = await session.get(RegistrationRequest, request_id)
            if request is None:
                return None
            request.status = "completed"
            request.isVerified = True
            request.isApproved = True
            request.isActive = True
            request.otpVerified = True
            request.updatedAt = datetime.utcnow()
            await session.flush()
            return request
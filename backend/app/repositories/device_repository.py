"""Data access for registered devices and their licenses."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.db import session_scope
from app.models.device import Device
from app.models.license import License
from app.models.enums import DeviceStatus, LicenseStatus
from app.repositories.base import BaseRepository


class DeviceRepository(BaseRepository[Device]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(Device, session)

    async def find_by_device_id(self, device_id: str) -> Optional[Device]:
        return await self._scalar_first(Device.deviceId == device_id)

    async def find_active_by_device_id(self, device_id: str) -> Optional[Device]:
        return await self._scalar_first(
            Device.deviceId == device_id,
            Device.status == DeviceStatus.ACTIVE,
        )

    async def list_for_user(
        self, user_id: uuid.UUID, status: Optional[DeviceStatus] = None
    ) -> list[Device]:
        async with session_scope(self._session) as session:
            stmt = select(Device).where(Device.userId == user_id)
            if status is not None:
                stmt = stmt.where(Device.status == status)
            stmt = stmt.order_by(Device.createdAt.desc())
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def touch_heartbeat(self, device: Device) -> None:
        """Persist ``lastSeenAt`` for an active device (heartbeat)."""
        async with session_scope(self._session) as session:
            await session.execute(
                update(Device)
                .where(Device.id == device.id)
                .values(lastSeenAt=Device.__table__.c.lastSeenAt.default.arg())
            )

    async def set_status(self, device: Device, status: DeviceStatus) -> Device:
        async with session_scope(self._session) as session:
            obj = await session.get(Device, device.id)
            if obj is None:
                return device
            obj.status = status
            await session.flush()
            return obj


class LicenseRepository(BaseRepository[License]):
    def __init__(self, session: AsyncSession | None = None) -> None:
        super().__init__(License, session)

    async def find_active_for_device(self, device: Device) -> Optional[License]:
        return await self._scalar_first(
            License.deviceId == device.id,
            License.status == LicenseStatus.ACTIVE,
        )

    async def find_by_key_hash(self, key_hash: str) -> Optional[License]:
        return await self._scalar_first(License.licenseKeyHash == key_hash)

    async def set_status(self, license: License, status: LicenseStatus) -> License:
        async with session_scope(self._session) as session:
            obj = await session.get(License, license.id)
            if obj is None:
                return license
            obj.status = status
            await session.flush()
            return obj
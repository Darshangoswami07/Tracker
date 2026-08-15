"""Device registration, heartbeat and status schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field
from uuid import UUID

from app.models.enums import DeviceStatus


class DeviceRegisterRequest(BaseModel):
    """Body for registering the current device after activation/login."""

    deviceId: str = Field(min_length=1, max_length=128)
    deviceName: str = Field(min_length=1, max_length=120)
    platform: Literal["ios", "android", "web"] = "android"
    appVersion: Optional[str] = Field(default=None, max_length=32)
    osVersion: Optional[str] = Field(default=None, max_length=32)
    pushToken: Optional[str] = Field(default=None, max_length=512)


class LicenseOut(BaseModel):
    """License summary returned to the device (raw key only at issuance)."""

    status: str
    issuedAt: datetime
    expiresAt: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeviceOut(BaseModel):
    """Public device record returned to the owning admin."""

    id: UUID
    deviceId: str
    deviceName: str
    platform: str
    appVersion: Optional[str] = None
    osVersion: Optional[str] = None
    status: DeviceStatus
    activatedAt: datetime
    lastSeenAt: Optional[datetime] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class DeviceRegisterResponse(BaseModel):
    """Successful device registration payload."""

    device: DeviceOut
    license: LicenseOut
    licenseKey: str


class DeviceHeartbeatResponse(BaseModel):
    """Heartbeat ack."""

    status: DeviceStatus
    serverTime: datetime


class DeviceStatusOut(BaseModel):
    """Control-plane status for a device."""

    id: UUID
    deviceId: str
    deviceName: str
    platform: str
    status: DeviceStatus
    activatedAt: datetime
    lastSeenAt: Optional[datetime] = None
    licenseStatus: str


class DeviceListOut(BaseModel):
    """Paginated-ish list of a user's devices."""

    items: list[DeviceOut]
    total: int
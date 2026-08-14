"""Business logic for device registration, license issuance and heartbeats."""
from __future__ import annotations

import hashlib
import logging
import secrets
from typing import Optional

from app.core.exceptions import (
    AppError,
    NotFoundError,
    ValidationBusinessError,
)
from app.models.device import Device
from app.models.license import License
from app.models.enums import DeviceStatus, LicenseStatus
from app.repositories.device_repository import DeviceRepository, LicenseRepository

logger = logging.getLogger(__name__)

# A device sends a heartbeat every HEARTBEAT_INTERVAL_SECONDS; anything older
# than this is considered stale by the admin UI (not enforced on the device).
STALE_AFTER_SECONDS = 60 * 10


class DeviceNotActiveError(AppError):
    status_code = 403
    code = "device_not_active"
    default_message = "This device is not active. Please contact support."


class DeviceLimitReachedError(AppError):
    status_code = 409
    code = "device_limit_reached"
    default_message = "This account has reached its device limit."


class DeviceService:
    """Manages device registration, license issuance and status checks."""

    def __init__(
        self,
        device_repo: DeviceRepository,
        license_repo: LicenseRepository,
        max_devices_per_user: int = 5,
    ) -> None:
        self.device_repo = device_repo
        self.license_repo = license_repo
        self.max_devices_per_user = max_devices_per_user

    def _hash_key(self, key: str) -> str:
        return hashlib.sha256(key.encode("utf-8")).hexdigest()

    def _generate_license_key(self) -> str:
        return f"DH-{secrets.token_hex(8).upper()}-{secrets.token_hex(4).upper()}"

    async def register_device(
        self,
        user_id: str,
        device_id: str,
        device_name: str,
        platform: str = "android",
        app_version: Optional[str] = None,
        os_version: Optional[str] = None,
        push_token: Optional[str] = None,
    ) -> tuple[Device, License, str]:
        """Register a device, issuing an active license.

        Returns ``(device, license, raw_license_key)``. The raw license key is
        returned exactly once so the client can persist it locally; Neon only
        ever stores the SHA-256 digest.
        """
        if not device_id or not device_id.strip():
            raise ValidationBusinessError("deviceId is required")

        existing = await self.device_repo.find_by_device_id(device_id.strip())
        if existing is not None:
            # Device already registered — reactivate if it was revoked/expired
            # and (re)issue an active license. Idempotent from the client's
            # perspective: calling register again is safe.
            device = existing
            if device.status != DeviceStatus.ACTIVE:
                device = await self.device_repo.set_status(device, DeviceStatus.ACTIVE)

            license = await self.license_repo.find_active_for_device(device)
            if license is None:
                raw_key = self._generate_license_key()
                license = await self._issue_license(user_id, device, raw_key)
            else:
                raw_key = ""

            return device, license, raw_key

        # Count active devices owned by this user to enforce the limit.
        active = await self.device_repo.list_for_user(user_id, DeviceStatus.ACTIVE)
        if len(active) >= self.max_devices_per_user:
            raise DeviceLimitReachedError(
                message=f"Maximum of {self.max_devices_per_user} active devices per account."
            )

        device = Device(
            userId=user_id,
            deviceId=device_id.strip(),
            deviceName=device_name or device_id.strip(),
            platform=platform,
            appVersion=app_version,
            osVersion=os_version,
            pushToken=push_token,
            status=DeviceStatus.ACTIVE,
        )
        device = await self.device_repo.save(device)

        raw_key = self._generate_license_key()
        license = await self._issue_license(user_id, device, raw_key)
        return device, license, raw_key

    async def _issue_license(
        self, user_id: str, device: Device, raw_key: str
    ) -> License:
        license = License(
            userId=user_id,
            deviceId=device.id,
            licenseKeyHash=self._hash_key(raw_key),
            status=LicenseStatus.ACTIVE,
        )
        return await self.license_repo.save(license)

    async def heartbeat(self, device_id: str) -> Device:
        """Record a heartbeat for an active device."""
        device = await self.device_repo.find_active_by_device_id(device_id)
        if device is None:
            raise DeviceNotActiveError()
        await self.device_repo.touch_heartbeat(device)
        return device

    async def get_status(self, device_id: str) -> dict:
        """Return the control-plane status for a device."""
        device = await self.device_repo.find_by_device_id(device_id)
        if device is None:
            raise NotFoundError("No device found with this id.")

        license = await self.license_repo.find_active_for_device(device)
        return {
            "id": str(device.id),
            "deviceId": device.deviceId,
            "deviceName": device.deviceName,
            "platform": device.platform.value,
            "status": device.status.value,
            "activatedAt": device.activatedAt.isoformat(),
            "lastSeenAt": device.lastSeenAt.isoformat() if device.lastSeenAt else None,
            "licenseStatus": license.status.value if license else LicenseStatus.EXPIRED.value,
        }

    async def revoke_device(self, device_id: str) -> Device:
        """Revoke a device (admin action) so it can no longer sync."""
        device = await self.device_repo.find_by_device_id(device_id)
        if device is None:
            raise NotFoundError("No device found with this id.")

        device = await self.device_repo.set_status(device, DeviceStatus.REVOKED)
        active_license = await self.license_repo.find_active_for_device(device)
        if active_license is not None:
            await self.license_repo.set_status(active_license, LicenseStatus.REVOKED)
        return device


device_service = DeviceService(DeviceRepository(), LicenseRepository())
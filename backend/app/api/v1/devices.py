"""Device registration, heartbeat and status endpoints (control plane).

These live on Neon (the centralized control layer). The mobile app calls them
after account activation/login to bind the physical device and receive its
license key. This is the device/license control plane only — all business
data flows through the other API routers into Neon.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, get_user_agent
from app.models.enums import DeviceStatus
from app.models.user import User
from app.schemas.device import (
    DeviceHeartbeatResponse,
    DeviceListOut,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    DeviceStatusOut,
    DeviceOut,
    LicenseOut,
)
from app.services.device_service import device_service
from app.utils.responses import success

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/register")
async def register_device(
    payload: DeviceRegisterRequest,
    user: CurrentUser,
    user_agent: str | None = Depends(get_user_agent),
) -> dict:
    """Register the current physical device and receive a license key.

    The returned ``licenseKey`` is sent once at issuance; the app persists it
    in secure storage so it can present it back on later heartbeats. Neon only
    stores the SHA-256 digest of the key.
    """
    device, license, raw_key = await device_service.register_device(
        user_id=str(user.id),
        device_id=payload.deviceId,
        device_name=payload.deviceName,
        platform=payload.platform,
        app_version=payload.appVersion,
        os_version=payload.osVersion,
        push_token=payload.pushToken,
    )
    response = DeviceRegisterResponse(
        device=DeviceOut.model_validate(device),
        license=LicenseOut.model_validate(license),
        licenseKey=raw_key,
    )
    return success(
        response.model_dump(mode="json"),
        message="Device registered successfully.",
    )


@router.post("/heartbeat")
async def device_heartbeat(
    user: CurrentUser,
    device_id: str = Query(..., min_length=1, max_length=128),
) -> dict:
    """Acknowledge a device heartbeat (keeps ``lastSeenAt`` fresh)."""
    device = await device_service.heartbeat(device_id)
    response = DeviceHeartbeatResponse(
        status=device.status,
        serverTime=device.updatedAt,
    )
    return success(response.model_dump(mode="json"), message="Heartbeat acknowledged.")


@router.get("/status")
async def device_status(
    user: CurrentUser,
    device_id: str = Query(..., min_length=1, max_length=128),
) -> dict:
    """Return the control-plane status for a device."""
    status = await device_service.get_status(device_id)
    return success(status, message="Device status retrieved.")


@router.get("/")
async def list_devices(
    user: CurrentUser,
    status: DeviceStatus | None = Query(default=None),
) -> dict:
    """List the current admin's registered devices."""
    devices = await device_service.device_repo.list_for_user(user.id, status)
    items = [DeviceOut.model_validate(d) for d in devices]
    response = DeviceListOut(items=items, total=len(items))
    return success(response.model_dump(mode="json"), message="Devices retrieved.")


@router.post("/revoke")
async def revoke_device(
    user: CurrentUser,
    device_id: str = Query(..., min_length=1, max_length=128),
) -> dict:
    """Revoke a device so it can no longer sync business data."""
    device = await device_service.revoke_device(device_id)
    return success(
        {"id": str(device.id), "status": device.status.value},
        message="Device revoked successfully.",
    )
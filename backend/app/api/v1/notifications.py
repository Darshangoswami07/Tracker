"""In-app notification inbox endpoints.

Backed by the existing ``notifications`` table. Exposes the list, unread count
and read-state mutations the mobile app needs. The mobile notification bell
and drawer screen consume these.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser
from app.models.enums import NotificationType
from app.repositories.notification_repository import NotificationRepository
from app.utils.pagination import clamp_page, pages_count
from app.utils.responses import success

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _notification_dict(notification) -> dict:
    """Serialises a notification row for the mobile app."""
    notif_type = notification.type
    type_value = notif_type.value if isinstance(notif_type, NotificationType) else str(notif_type)
    return {
        "id": str(notification.id),
        "type": type_value,
        "title": notification.title,
        "message": notification.message,
        "read": bool(notification.isRead),
        "createdAt": notification.createdAt.isoformat() if notification.createdAt else None,
    }


@router.get("")
async def list_notifications(
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    read: Annotated[Optional[bool], Query()] = None,
) -> dict:
    """Lists the authenticated user's notifications (newest first)."""
    n_page, n_size = clamp_page(page, page_size)
    repo = NotificationRepository()
    notifications, total = await repo.list_for_user(str(user.id), n_page, n_size, read)
    return success(
        {
            "items": [_notification_dict(n) for n in notifications],
            "total": total,
            "page": n_page,
            "pageSize": n_size,
            "pages": pages_count(total, n_size),
        }
    )


@router.get("/unread-count")
async def unread_notification_count(user: CurrentUser) -> dict:
    """Returns the number of unread notifications for the authenticated user."""
    repo = NotificationRepository()
    count = await repo.unread_count(str(user.id))
    return success({"unread": count})


@router.post("/{notification_id}/read")
async def mark_notification_read(user: CurrentUser, notification_id: str) -> dict:
    """Marks a single notification as read (only for its owner)."""
    repo = NotificationRepository()
    notification = await repo.mark_read(notification_id, str(user.id))
    return success({"read": bool(notification)})


@router.post("/read-all")
async def mark_all_notifications_read(user: CurrentUser) -> dict:
    """Marks every notification of the authenticated user as read."""
    repo = NotificationRepository()
    updated = await repo.mark_all_read(str(user.id))
    return success({"updated": updated})
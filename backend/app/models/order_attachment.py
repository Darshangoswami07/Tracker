"""Uploaded slip/photo documents attached to an order (GR)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import FileKind
from app.models.mixins import UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OrderAttachment(Base, UUIDPrimaryKeyMixin):
    """A single uploaded file (slip or photo) for an order/GR.

    Multiple attachments per order are kept (not overwritten) so "Replace
    Slip" never destroys the prior upload's audit trail — the most recent
    row of a given `fileKind` is treated as "current" by the API layer.
    """

    __tablename__ = "order_attachments"

    orderId: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    fileKind: Mapped[FileKind] = mapped_column(
        enum_column(FileKind, "order_attachment_kind"),
        default=FileKind.GENERIC,
    )
    storagePath: Mapped[str] = mapped_column(String(500))
    originalFilename: Mapped[str] = mapped_column(String(255))
    mimeType: Mapped[str] = mapped_column(String(100))
    fileSizeBytes: Mapped[int] = mapped_column(default=0)
    uploadedBy: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped["Order"] = relationship(back_populates="attachments", lazy="selectin")  # noqa: F821

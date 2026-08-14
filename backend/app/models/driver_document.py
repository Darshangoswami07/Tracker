"""Driver document model."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import DriverDocumentKind, DriverDocumentStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sql_enum import enum_column


class DriverDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "driver_documents"

    driverId: Mapped[uuid.UUID] = mapped_column(ForeignKey("drivers.id"), index=True)
    kind: Mapped[DriverDocumentKind] = mapped_column(
        enum_column(DriverDocumentKind, "driver_document_kind")
    )
    status: Mapped[DriverDocumentStatus] = mapped_column(
        enum_column(DriverDocumentStatus, "driver_document_status"),
        default=DriverDocumentStatus.PENDING,
    )
    fileUrl: Mapped[str] = mapped_column(String(500))
    fileName: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fileSize: Mapped[int | None] = mapped_column(nullable=True)
    mimeType: Mapped[str | None] = mapped_column(String(100), nullable=True)
    isVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    verifiedAt: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verifiedBy: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rejectionReason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    driver: Mapped["Driver"] = relationship(back_populates="documents", lazy="selectin")
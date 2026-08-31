"""Excel bulk-import run log.

One row per Excel GR import batch, summarising how many rows were imported,
skipped as duplicates, or failed. Previously stored on-device in mobile
SQLite (``import_history``); moved here alongside the GR data it describes.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ImportHistory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "import_history"

    fileName: Mapped[str] = mapped_column(String(255))
    # kept distinct from createdAt so a backfilled/migrated row can carry its
    # original device timestamp.
    importedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    importedByName: Mapped[str | None] = mapped_column(String(160), nullable=True)
    importedBy: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    companyId: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True
    )
    area: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    totalRows: Mapped[int] = mapped_column(default=0)
    importedRows: Mapped[int] = mapped_column(default=0)
    duplicateRows: Mapped[int] = mapped_column(default=0)
    failedRows: Mapped[int] = mapped_column(default=0)

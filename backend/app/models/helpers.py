"""Small shared helpers for the ORM models."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp used for column defaults."""
    return datetime.now(timezone.utc)


def enum_values(enum_class: type[Enum]) -> list[str]:
    """Returns the string values of a ``str`` enum for SQLAlchemy ``Enum``."""
    return [member.value for member in enum_class]

"""Helpers for mapping Python enums onto PostgreSQL VARCHAR columns."""
from __future__ import annotations

from enum import Enum

from sqlalchemy import Enum as SqlEnum


def _values(enum_class: type[Enum]) -> list[str]:
    return [member.value for member in enum_class]


def enum_column(enum_class: type[Enum], name: str) -> SqlEnum:
    """Builds a portable (non-native) enum column storing the member values."""
    return SqlEnum(enum_class, values_callable=_values, native_enum=False, name=name)

"""Shared helpers for paginated, filtered list queries."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.schemas.common import Paginated

T = TypeVar("T")


@dataclass(frozen=True)
class PageParams:
    """Normalised pagination + sorting parameters extracted from the request."""

    page: int = 1
    page_size: int = 20
    sort: str = "createdAt"
    sort_desc: bool = True

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def clamp_page(page: int, page_size: int) -> tuple[int, int]:
    """Bounds page/page_size into sane ranges."""
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    return page, page_size


def pages_count(total: int, page_size: int) -> int:
    return max(1, -(-total // page_size))


def build_page(items: list[T], total: int, page: int, page_size: int) -> Paginated[Any]:
    """Wraps a query result into the shared paginated envelope."""
    return Paginated(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        pages=pages_count(total, page_size),
    )


def parse_sort(value: str | None, allowed: set[str], default: str = "createdAt") -> str:
    """Validates a sort column against an allow-list, falling back to default."""
    if value and value in allowed:
        return value
    return default


def parse_sort_desc(value: bool | None, default: bool = True) -> bool:
    return default if value is None else value


def model_from_dict(model_cls: type[BaseModel], data: dict[str, Any]) -> BaseModel:
    """Coerces a plain dict into a pydantic output model."""
    return model_cls.model_validate(data)


def page_from_params(page: int | None, page_size: int | None) -> PageParams:
    """Builds a bounded PageParams from optional request values."""
    norm_page, norm_size = clamp_page(page or 1, page_size or 20)
    return PageParams(page=norm_page, page_size=norm_size)


def matches_query(fields: dict[str, str | None], query: str | None) -> bool:
    """Case-insensitive substring search across the given fields."""
    if not query:
        return True
    lowered = query.lower()
    return any(lowered in (value or "").lower() for value in fields.values())

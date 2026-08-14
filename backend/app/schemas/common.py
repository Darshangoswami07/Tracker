"""Shared schema building blocks for the API."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class MessageOut(BaseModel):
    """Generic success message payload."""

    message: str


class StandardResponse(BaseModel, Generic[T]):
    """The consistent envelope every endpoint returns."""

    success: bool = True
    message: str = "Success"
    data: T | None = None


class StandardErrorResponse(BaseModel):
    """The consistent envelope every error returns."""

    success: bool = False
    error: dict[str, object]


class Paginated(BaseModel, Generic[T]):
    """Standard page wrapper used by every list endpoint."""

    items: list[T]
    total: int
    page: int
    pageSize: int
    pages: int
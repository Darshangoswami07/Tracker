"""Helpers to build consistent API responses."""
from __future__ import annotations

from typing import Any, TypeVar

T = TypeVar("T")


def success(data: T | None = None, message: str = "Success") -> dict[str, Any]:
    """Builds a successful response envelope."""
    return {"success": True, "message": message, "data": data}


def error(
    code: str,
    message: str,
    status: int,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Builds an error response payload."""
    return {
        "success": False,
        "error": {"code": code, "message": message, "status": status, **({"details": details} if details else {})},
    }
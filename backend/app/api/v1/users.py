"""User endpoints (authenticated)."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.user import UserOut
from app.utils.responses import success

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me(user: CurrentUser) -> dict:
    return success(UserOut.model_validate(user).model_dump(mode="json"), message="Current user.")
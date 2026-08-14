"""API router aggregator.

``main.py`` mounts this router under ``settings.API_V1_PREFIX`` (``/api/v1``).
"""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.router import api_router as v1_router

api_router = APIRouter()
api_router.include_router(v1_router)
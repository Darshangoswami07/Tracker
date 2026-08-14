"""Test bootstrap. Environment must be configured before the app is imported."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# psycopg (async) cannot run on Windows' ProactorEventLoop; use the selector loop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-0123456789abcdef-9876543210")
os.environ.setdefault("EXPOSE_RESET_TOKEN_IN_RESPONSE", "true")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

# Load .env without overriding the values set above (override=False is default).
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

# Allow a dedicated scratch database for tests (otherwise the configured
# DATABASE_URL is used — tables are dropped and recreated between tests).
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

# Tests must never send real email: with SMTP_HOST blank, the email service
# falls back to logging, keeping the suite fast and side-effect free.
if os.environ.get("ENV") == "test":
    os.environ["SMTP_HOST"] = ""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database.db import close_database, drop_database, init_database

app = None


def _import_app():
    global app
    if app is None:
        from main import app as _app

        app = _app
    return app


@pytest_asyncio.fixture(autouse=True)
async def database():
    """Recreates a clean schema before each test and tears it down after."""
    await drop_database()
    await init_database()
    yield
    await drop_database()
    await close_database()


@pytest_asyncio.fixture
async def client():
    """HTTP client against the ASGI application (lifespan managed manually)."""
    application = _import_app()
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client

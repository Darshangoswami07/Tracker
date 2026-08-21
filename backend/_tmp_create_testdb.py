"""Attempt to create a scratch test database on the app's Neon project."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import create_engine, text

from app.core.config import settings

target = "deliveryhub_test_scratch"

try:
    eng = create_engine(
        settings.DATABASE_URL, connect_args={"connect_timeout": 15}, isolation_level="AUTOCOMMIT"
    )
    with eng.connect() as c:
        exists = c.execute(
            text("SELECT 1 FROM pg_database WHERE datname=:d"), {"d": target}
        ).scalar()
        if exists:
            print(f"{target}: already exists")
        else:
            c.execute(text(f'CREATE DATABASE "{target}"'))
            print(f"{target}: created")
        # Confirm connectivity to the new DB
        ok = c.execute(text(f"SELECT current_database()")).scalar()
        print("connected as:", ok)
    eng.dispose()
except Exception as exc:
    print(f"ERROR: {type(exc).__name__}: {exc}")
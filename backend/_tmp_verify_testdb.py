"""Verify connectivity to the scratch test DB using the app's credentials."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import create_engine, text

from app.core.config import settings

url = settings.DATABASE_URL.replace("/neondb?", "/deliveryhub_test_scratch?")
eng = create_engine(url, connect_args={"connect_timeout": 15})
with eng.connect() as c:
    print("db:", c.execute(text("SELECT current_database()")).scalar())
    print("user:", c.execute(text("SELECT current_user")).scalar())
    n = c.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).scalar()
    print("public tables:", n)
eng.dispose()
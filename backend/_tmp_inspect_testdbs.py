"""Inspect candidate test databases (read-only) via the app's connection."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import create_engine, text

from app.core.config import settings

url = settings.DATABASE_URL.replace("/neondb?", "/{db}?")
targets = ["deliveryhub_test", "deliveryhub_test_scratch"]

for db in targets:
    u = url.format(db=db)
    try:
        eng = create_engine(u, connect_args={"connect_timeout": 15})
        with eng.connect() as c:
            ver = c.execute(text("SELECT version_num FROM alembic_version")).scalar()
            users = c.execute(text("SELECT count(*) FROM users")).scalar()
            reqs = c.execute(text("SELECT count(*) FROM registration_requests")).scalar()
            tables = c.execute(
                text("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
            ).scalar()
            print(f"{db}: alembic={ver} users={users} reg_reqs={reqs} tables={tables}")
        eng.dispose()
    except Exception as exc:
        print(f"{db}: ERROR {type(exc).__name__}: {exc}")
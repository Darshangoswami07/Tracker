import asyncio
import sys
from sqlalchemy import text
from app.database.db import get_session_maker

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def main():
    async with get_session_maker()() as s:
        res = await s.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
        print("TABLES:", [r[0] for r in res.all()])
        res = await s.execute(text("SELECT version_num FROM alembic_version"))
        print("ALEMBIC_VERSION:", res.all())

asyncio.run(main())
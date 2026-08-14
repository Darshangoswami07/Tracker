import asyncio
import sys
from sqlalchemy import text

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def main():
    from app.database.db import get_session_maker
    async with get_session_maker()() as s:
        print("== emails/phones containing bisht / darshan / jobpilot ==")
        res = await s.execute(text(
            "SELECT id, email, phone, status FROM registration_requests "
            "WHERE email ILIKE '%bisht%' OR email ILIKE '%darshan%' OR email ILIKE '%jobpilot%' "
            "OR phone ILIKE '%bis%'"
        ))
        for r in res.all():
            print(r)

        print("== users containing bisht/darshan/jobpilot ==")
        res = await s.execute(text(
            "SELECT id, email, phone, role, status FROM users WHERE email ILIKE '%bisht%' OR email ILIKE '%darshan%' OR email ILIKE '%jobpilot%'"
        ))
        for r in res.all():
            print(r)

asyncio.run(main())
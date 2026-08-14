import asyncio
import sys
from sqlalchemy import text

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def main():
    from app.database.db import get_session_maker
    async with get_session_maker()() as s:
        print("== REGISTRATION REQUESTS ==")
        res = await s.execute(text(
            "SELECT id, email, phone, \"requestedRole\", status, \"isApproved\", \"isActive\", \"otpVerified\", \"createdAt\" "
            "FROM registration_requests ORDER BY \"createdAt\" DESC LIMIT 20"
        ))
        for r in res.all():
            print(r)

        print("== USERS (role/status) ==")
        res = await s.execute(text(
            "SELECT id, email, role, status, \"isActive\", \"isApproved\" FROM users ORDER BY \"createdAt\" DESC LIMIT 20"
        ))
        for r in res.all():
            print(r)

        print("== EMAIL OTPS (approval intent, recent) ==")
        res = await s.execute(text(
            "SELECT id, email, intent, used, attempts, \"expiresAt\", \"createdAt\" FROM email_otps ORDER BY \"createdAt\" DESC LIMIT 20"
        ))
        for r in res.all():
            print(r)

asyncio.run(main())

"""TEMP read-only: inspect email audit logs and OTP records in Neon."""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import text

from app.database.db import close_database, get_session_maker


async def main() -> None:
    s = get_session_maker()
    async with s() as x:
        print("=== audit_logs (email actions, most recent 15) ===")
        r = await x.execute(
            text(
                "SELECT \"createdAt\", action, \"entityType\", \"newValues\" "
                "FROM audit_logs WHERE \"entityType\"='email' ORDER BY \"createdAt\" DESC LIMIT 15"
            )
        )
        for row in r:
            print(row)

        print()
        print("=== email_otps (most recent 15) ===")
        r = await x.execute(
            text(
                'SELECT "createdAt", email, intent, used, attempts, "maxAttempts", "expiresAt" '
                "FROM email_otps ORDER BY \"createdAt\" DESC LIMIT 15"
            )
        )
        for row in r:
            print(row)

        print()
        print("=== registration_requests (recent) ===")
        r = await x.execute(
            text(
                'SELECT id, email, status, "isApproved", "requestedRole", "createdAt" '
                "FROM registration_requests ORDER BY \"createdAt\" DESC LIMIT 10"
            )
        )
        for row in r:
            print(row)
    await close_database()


if __name__ == "__main__":
    asyncio.run(main())
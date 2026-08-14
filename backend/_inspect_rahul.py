"""Temporary diagnostic: dump state for rahul@gmail.com across the DB."""
import asyncio
import sys
from sqlalchemy import text
from app.database.db import get_session_maker

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

EMAIL = "rahul@gmail.com"
PHONE = "7456849590"


async def q(session, sql, params=None):
    res = await session.execute(text(sql), params or {})
    rows = res.all()
    cols = list(res.keys())
    return cols, rows


async def main():
    async with get_session_maker()() as s:
        cols, tables = await q(s, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
        print("TABLES:", [r[0] for r in tables])

        # users
        cols, rows = await q(
            s,
            "SELECT id, \"firstName\", \"lastName\", email, phone, role, status, \"isActive\", \"createdAt\", \"updatedAt\" "
            "FROM users WHERE email = :e OR phone = :p ORDER BY \"createdAt\"",
            {"e": EMAIL, "p": PHONE},
        )
        print("\n== USERS ==")
        for c in cols:
            print(" ", c, end="")
        print()
        for r in rows:
            print(" ", r)

        # registration_requests
        cols, rows = await q(
            s,
            "SELECT id, \"firstName\", \"lastName\", email, phone, status, \"requestedRole\", \"createdAt\", \"updatedAt\" "
            "FROM registration_requests WHERE email = :e OR phone = :p ORDER BY \"createdAt\"",
            {"e": EMAIL, "p": PHONE},
        )
        print("\n== REGISTRATION_REQUESTS ==")
        for c in cols:
            print(" ", c, end="")
        print()
        for r in rows:
            print(" ", r)

        # email_otps
        cols, rows = await q(
            s,
            "SELECT id, \"userId\", email, intent, attempts, used, \"expiresAt\", \"createdAt\", \"usedAt\" "
            "FROM email_otps WHERE email = :e ORDER BY \"createdAt\"",
            {"e": EMAIL},
        )
        print("\n== EMAIL_OTPS (rahul@gmail.com) ==")
        for c in cols:
            print(" ", c, end="")
        print()
        for r in rows:
            print(" ", r)

        # counts by status (registration requests) for email
        cols, rows = await q(
            s,
            "SELECT status, count(*) as cnt FROM registration_requests WHERE email = :e GROUP BY status",
            {"e": EMAIL},
        )
        print("\n== REQUEST STATUS COUNTS ==", rows)

        # any rows where registration_requests.phone matches but email differs
        cols, rows = await q(
            s,
            "SELECT id, email, phone, status FROM registration_requests WHERE phone = :p AND email <> :e",
            {"p": PHONE, "e": EMAIL},
        )
        print("\n== OTHER REQUESTS WITH SAME PHONE ==", rows)

        # any user with same phone different email
        cols, rows = await q(
            s,
            "SELECT id, email, phone, status FROM users WHERE phone = :p AND email <> :e",
            {"p": PHONE, "e": EMAIL},
        )
        print("\n== OTHER USERS WITH SAME PHONE ==", rows)


asyncio.run(main())
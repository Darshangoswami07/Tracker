"""Repair users left in PENDING status by the pre-fix approval flow.

Before the fix in the user repository, accounts created from an OTP-verified
registration request were persisted as ``status='pending'`` because the active
flags were assigned to a detached ORM instance and never written back. Those
users could never sign in (the login endpoint returns 403 "waiting for admin
approval"). In the current flow no ``users`` row is ever created before admin
approval + OTP verification, so every PENDING row is a stuck account and is
promoted to ACTIVE.

    .venv\\Scripts\\python.exe -m scripts.fix_pending_users
"""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.database.db import session_scope  # noqa: E402
from app.models.user import User  # noqa: E402


async def main() -> None:
    from sqlalchemy import select

    async with session_scope() as session:
        rows = (
            await session.execute(select(User).where(User.status == "pending"))
        ).scalars().all()
        for user in rows:
            user.status = "active"
            user.isActive = True
            user.isApproved = True
            user.isVerified = True
            user.otpVerified = True
        if rows:
            print(
                f"Activated {len(rows)} stuck account(s): "
                + ", ".join(u.email for u in rows)
            )
        else:
            print("No pending users to fix.")


if __name__ == "__main__":
    asyncio.run(main())
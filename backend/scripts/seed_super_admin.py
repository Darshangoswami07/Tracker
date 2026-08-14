"""Seed the DeliveryHub super admin account.

Credentials are read from environment variables — never hardcode them in
source. Provide them at runtime, e.g.:

    set SUPER_ADMIN_EMAIL=...        (PowerShell)
    set SUPER_ADMIN_PASSWORD=...
    .venv\\Scripts\\python.exe -m scripts.seed_super_admin
"""
from __future__ import annotations

import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.security import hash_password  # noqa: E402
from app.database.db import session_scope  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.models.user import User  # noqa: E402

SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "").strip().lower()
SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "")

if not SUPER_ADMIN_EMAIL or not SUPER_ADMIN_PASSWORD:
    raise SystemExit(
        "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables are required."
    )


async def main() -> None:
    async with session_scope() as session:
        from sqlalchemy import select

        existing = await session.scalar(select(User).where(User.email == SUPER_ADMIN_EMAIL))
        if existing is not None:
            print(f"Super admin already exists ({SUPER_ADMIN_EMAIL}). Updating password/role to match.")
            existing.passwordHash = hash_password(SUPER_ADMIN_PASSWORD)
            existing.role = UserRole.SUPER_ADMIN
            existing.status = "active"
            existing.isActive = True
            existing.isApproved = True
            existing.isVerified = True
            existing.otpVerified = True
            print("Super admin updated.")
            return

        super_admin = User(
            firstName="Super",
            lastName="Admin",
            email=SUPER_ADMIN_EMAIL,
            phone="0000000000",
            passwordHash=hash_password(SUPER_ADMIN_PASSWORD),
            role=UserRole.SUPER_ADMIN,
            status="active",
            isVerified=True,
            isApproved=True,
            isActive=True,
            otpVerified=True,
        )
        session.add(super_admin)
        print("Super admin created successfully.")


if __name__ == "__main__":
    asyncio.run(main())
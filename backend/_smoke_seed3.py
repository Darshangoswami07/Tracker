from __future__ import annotations
import asyncio, sys
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def main() -> None:
    from app.core.security import hash_password
    from app.database.db import close_database, init_database, session_scope
    from app.models.company import Company
    from app.models.enums import UserRole
    from app.repositories.user_repository import UserRepository

    await init_database()
    async with session_scope() as s:
        c = Company(name="Matrix Co")
        s.add(c)
        await s.flush()
        company_id = c.id

    repo = UserRepository()
    for email, pw, role, area in [
        ("matrix-admin@example.com", "MatrixAdmin123!", UserRole.ADMIN, None),
        ("matrix-staff@example.com", "MatrixStaff123!", UserRole.STAFF, "TestArea"),
        ("matrix-driver@example.com", "MatrixDriver123!", UserRole.DRIVER, None),
    ]:
        u = await repo.create(
            full_name="Matrix User", email=email, phone="+919850001111",
            password_hash=hash_password(pw), role=role, status="active",
            company_id=company_id, area=area,
        )
        async with session_scope() as s:
            db = await s.get(type(u), u.id)
            db.isActive = db.isApproved = db.isVerified = db.otpVerified = True
            await s.flush()
        print(f"SEEDED {role.value}: {email} / {pw} (id={u.id})")
    print(f"COMPANY_ID={company_id}")
    await close_database()

if __name__ == "__main__":
    asyncio.run(main())

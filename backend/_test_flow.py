"""Temporary end-to-end flow test.

Safety policy:
  * rahul@gmail.com -> its request is PENDING (resumed/kept).
  * The full approve->OTP->activate chain is exercised on a throwaway
    identity (owner@flowtest.local) which is deleted afterwards.
"""
import asyncio
import sys
from uuid import UUID

from sqlalchemy import delete, select

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.database.db import get_session_maker
from app.models.email_otp import EmailOTP
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.services.registration_service import registration_service
from app.services.approval_service import approval_service
from app.services.otp_service import otp_service

RAHUL_EMAIL = "rahul@gmail.com"
RAHUL_PHONE = "7456849590"
FLOW_EMAIL = "flowtest.temp@deliveryhub.local"

rahul_request_id = None


async def get_admin_id():
    async with get_session_maker()() as s:
        res = await s.execute(
            select(User.id).where(User.role.in_(["admin", "super_admin"])).limit(1)
        )
        return res.scalar()


async def cleanup_flowtest():
    async with get_session_maker()() as s:
        await s.execute(delete(EmailOTP).where(EmailOTP.email == FLOW_EMAIL))
        await s.execute(delete(User).where(User.email == FLOW_EMAIL))
        await s.execute(delete(RegistrationRequest).where(RegistrationRequest.email == FLOW_EMAIL))
        await s.commit()


async def dump(label, request_id):
    async with get_session_maker()() as s:
        row = (
            await s.execute(
                select(RegistrationRequest).where(RegistrationRequest.id == UUID(str(request_id)))
            )
        ).scalar_one()
        print(f"  [{label}] id={row.id} email={row.email} phone={row.phone} status={row.status}")


async def main():
    global rahul_request_id
    admin_id = await get_admin_id()
    print("Admin id for test approval:", admin_id)

    try:
        # 1. Rahul: resume existing / ensure PENDING (email identity, shared phone)
        print("\n== STEP 1: register rahul@gmail.com (phone shared with darshan) ==")
        r = await registration_service.create_registration_request(
            first_name="Rahul", last_name="Bisht", company_name="Rahul",
            email=RAHUL_EMAIL, phone=RAHUL_PHONE, password="Rahulpass1!",
        )
        rahul_request_id = r.registration_id
        print("  flow:", r.flow, "| message:", r.message)
        await dump("rahul", r.registration_id)

        async with get_session_maker()() as s:
            res = await s.execute(
                select(RegistrationRequest.email, RegistrationRequest.status)
                .where(RegistrationRequest.phone == RAHUL_PHONE)
                .order_by(RegistrationRequest.createdAt)
            )
            print("\n== All requests with phone", RAHUL_PHONE, "==")
            for row in res.all():
                print("   ", row)

        # 2. Re-submit same pending email -> same request, no duplicate
        print("\n== STEP 2: re-submit rahul@gmail.com (pending resume) ==")
        r2 = await registration_service.create_registration_request(
            first_name="Rahul", last_name="Bisht", company_name="Rahul",
            email=RAHUL_EMAIL, phone=RAHUL_PHONE, password="Rahulpass1!",
        )
        print("  message:", r2.message, "| same_id:", r2.registration_id == rahul_request_id)

        # 3. Full chain on the throwaway identity (shared phone too)
        print("\n== STEP 3: full approve -> OTP -> activate (throwaway) ==")
        f_req = await registration_service.create_registration_request(
            first_name="Flow", last_name="Owner", company_name="FlowTest",
            email=FLOW_EMAIL, phone=RAHUL_PHONE, password="FlowTest1!",
        )
        print("  flow:", f_req.flow, "| message:", f_req.message)

        ok, msg, _otp = await approval_service.approve_request(f_req.registration_id, str(admin_id))
        print("  approve:", ok, msg)

        otp, otp_rec = await otp_service.create_user_otp(f_req.registration_id)
        print("  OTP (dev):", otp, "| bound request_id:", otp_rec.userId == UUID(f_req.registration_id),
              "| bound email:", otp_rec.email)

        verified, user = await otp_service.verify_approval_otp(f_req.registration_id, otp)
        print("  verify:", verified)
        async with get_session_maker()() as s:
            req = (
                await s.execute(
                    select(RegistrationRequest).where(RegistrationRequest.id == UUID(f_req.registration_id))
                )
            ).scalar_one()
            u = (await s.execute(select(User).where(User.id == user.id))).scalar_one()
            print("  request.status now:", req.status)
            print("  user row:", u.email, "| status=", u.status, "| active=", u.isActive)

        # 4. Completed/active email must fail gracefully with the sign-in message
        print("\n== STEP 5: re-register the activated email ==")
        try:
            await registration_service.create_registration_request(
                first_name="Flow", last_name="Owner", company_name="FlowTest",
                email=FLOW_EMAIL, phone=RAHUL_PHONE, password="FlowTest1!",
            )
            print("  FAIL: completed email accepted")
        except Exception as e:
            print("  raised:", type(e).__name__, "| status:", getattr(e, "status_code", None),
                  "| message:", getattr(e, "message", str(e)))
    finally:
        await cleanup_flowtest()
        print("\n== Cleanup done: throwaway identity removed ==")
        if rahul_request_id:
            await dump("final rahul", rahul_request_id)


asyncio.run(main())
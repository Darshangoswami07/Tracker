"""Celery tasks for out-of-band side effects (email sends).

Task arguments are JSON-serializable primitives only (request ids, OTP values,
reasons, addresses) — never ORM objects — so tasks can cross the broker. The
relevant entity is re-fetched inside the task body via its repository.
"""
from __future__ import annotations

import asyncio
import sys
from typing import Any

from app.workers.celery_app import celery_app


def _run(coro: Any) -> Any:
    """Run an async coroutine to completion in the current thread/process."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(coro)


@celery_app.task(name="emails.notify_admin_of_registration", ignore_result=True)
def notify_admin_of_registration(request_id: str) -> None:
    """Notify the admin mailbox of a new/changed registration request."""
    from app.repositories.registration_request_repository import (
        RegistrationRequestRepository,
    )
    from app.services.registration_service import registration_service

    async def _body() -> None:
        request = await RegistrationRequestRepository().find_by_id(request_id)
        if request is not None:
            await registration_service.notify_admin_of_registration(request)

    _run(_body())


@celery_app.task(name="emails.send_user_otp_email", ignore_result=True)
def send_user_otp_email(request_id: str, otp: str) -> None:
    """Email the applicant's approval OTP."""
    from app.repositories.registration_request_repository import (
        RegistrationRequestRepository,
    )
    from app.services.registration_service import registration_service

    async def _body() -> None:
        request = await RegistrationRequestRepository().find_by_id(request_id)
        if request is not None:
            await registration_service.send_user_otp_email(request, otp)

    _run(_body())


@celery_app.task(name="emails.send_approval_otp_email", ignore_result=True)
def send_approval_otp_email(request_id: str, otp: str) -> None:
    """Email the approval OTP for an approved registration request."""
    from app.services.approval_service import approval_service

    async def _body() -> None:
        await approval_service.send_approval_otp_email(request_id, otp)

    _run(_body())


@celery_app.task(name="emails.send_rejection_email", ignore_result=True)
def send_rejection_email(request_id: str, reason: str) -> None:
    """Email the applicant about a rejected registration request."""
    from app.services.approval_service import approval_service

    async def _body() -> None:
        await approval_service.send_rejection_email(request_id, reason)

    _run(_body())


@celery_app.task(name="emails.send_welcome_email", ignore_result=True)
def send_welcome_email(email: str, first_name: str, role: str) -> None:
    """Send the account-activated welcome email."""
    from app.services.email_service import email_service

    async def _body() -> None:
        await email_service.send_welcome_email(email, first_name, role)

    _run(_body())
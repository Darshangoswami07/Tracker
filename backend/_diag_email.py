"""TEMP diagnostic: send a test email through the configured provider.

Usage: python _diag_email.py <recipient-email>
Sends a harmless DeliveryHub test email and prints the outcome.
Never logs the API key or SMTP password.
"""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.config import settings  # noqa: E402
from app.services.email_providers import build_email_provider  # noqa: E402

RECIPIENT = sys.argv[1] if len(sys.argv) > 1 else settings.ADMIN_NOTIFICATION_EMAIL


async def main() -> None:
    provider = build_email_provider()
    print(f"provider={provider.name} configured={provider.is_configured()}")
    print(f"from={settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_EMAIL}>")
    print(f"to={RECIPIENT}")
    html = "<h2>DeliveryHub Test Email</h2><p>If you received this email, the email provider configuration is working.</p>"
    plain = "DeliveryHub Test Email\n\nIf you received this email, the email provider configuration is working."
    try:
        await provider.send(
            recipient=RECIPIENT,
            subject="DeliveryHub Test Email",
            html=html,
            plain=plain,
        )
        print("RESULT: SEND_OK")
    except Exception as exc:  # noqa: BLE001
        print(f"RESULT: SEND_FAILED -> {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
"""Send a real test email through the configured transactional provider.

Verifies that the provider configured in ``.env`` (EMAIL_PROVIDER /
EMAIL_API_KEY) can actually deliver mail to a recipient's inbox — the first
acceptance step before testing the OTP flow. Uses the exact same provider
abstraction (``app.services.email_providers``) the application uses.

Usage:

    .venv\\Scripts\\python.exe -m scripts.send_test_email abhiyanshbisht@gmail.com

Exits non-zero if the provider is not configured or delivery is rejected, so
the check can be scripted. The sender identity comes from
``EMAIL_FROM_NAME <EMAIL_FROM_EMAIL>`` in ``.env``.
"""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.config import settings  # noqa: E402
from app.services.email_providers import build_email_provider  # noqa: E402

SUBJECT = "DeliveryHub Email Test"


async def main() -> int:
    recipient = sys.argv[1] if len(sys.argv) > 1 else ""
    if not recipient:
        print("Usage: python -m scripts.send_test_email <recipient>")
        return 2

    provider = build_email_provider()
    if not provider.is_configured():
        print(
            f"[FAIL] Provider '{settings.EMAIL_PROVIDER}' is not configured. "
            "Set EMAIL_API_KEY in backend/.env (Brevo) or SMTP_* (smtp)."
        )
        return 1

    print(f"[INFO] Provider: {provider.name} ({type(provider).__name__})")
    print(f"[INFO] From: {settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_EMAIL}>")
    print(f"[INFO] To: {recipient}")
    print(f"[INFO] Subject: {SUBJECT}")

    html = (
        "<div style='font-family:Arial,sans-serif;'>"
        "<h2>DeliveryHub Email Test</h2>"
        "<p>If you are reading this, the DeliveryHub transactional email "
        "provider is working.</p>"
        "<p>Sent at test time from the configured provider.</p>"
        "</div>"
    )
    plain = "DeliveryHub Email Test\n\nIf you are reading this, the DeliveryHub transactional email provider is working."

    try:
        await provider.send(
            recipient=recipient,
            subject=SUBJECT,
            html=html,
            plain=plain,
        )
    except Exception as exc:  # noqa: BLE001 - report the real provider error
        print(f"[FAIL] Delivery rejected by provider: {exc}")
        return 1

    print("[OK] Provider accepted the message for delivery.")
    print("[OK] Check the recipient's inbox (and spam folder) for 'DeliveryHub Email Test'.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
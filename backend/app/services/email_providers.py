"""Pluggable outbound email providers.

``EmailService`` builds the branded HTML content and delegates delivery to the
provider configured via ``settings.EMAIL_PROVIDER``:

* ``smtp``  -> :class:`SmtpEmailProvider` (SMTP transport, Gmail-compatible)
* ``brevo`` -> :class:`BrevoEmailProvider` (Brevo transactional REST API)

Both providers implement :meth:`EmailProvider.send`, which either delivers the
message or raises. Permanent rejections are never retried:

* SMTP ``5xx`` codes — the most common being Gmail's
  ``550 5.4.5 Daily user sending limit exceeded`` quota error.
* Brevo ``4xx`` codes (``429`` when the daily free quota is exhausted,
  ``401``/``403`` for invalid API keys).

Only transient failures (transport errors, ``5xx``) are retried a bounded
number of times, so a broken provider can never hold up the caller.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
import time
from abc import ABC, abstractmethod
from email.message import EmailMessage

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def smtp_failure_is_permanent(exc: Exception) -> bool:
    """Classify an SMTP failure as permanent (do NOT retry) vs transient.

    A server ``5xx`` code is a permanent rejection — the most common one here
    being Gmail's quota error ``550 5.4.5 Daily user sending limit exceeded``.
    Retrying a permanent quota error only wastes time (and blocks the caller),
    so it is logged once and never retried. ``4xx`` codes and transport errors
    (timeouts, refused connections) remain retryable.
    """
    smtp_code = getattr(exc, "smtp_code", None)
    if smtp_code and str(smtp_code).startswith("5"):
        return True
    recipients = getattr(exc, "recipients", None)
    if isinstance(recipients, dict):
        for code, _message in recipients.values():
            if str(code).startswith("5"):
                return True
    text = str(exc)
    if "5.4.5" in text or "daily user sending limit exceeded" in text.lower():
        return True
    return False


class EmailProvider(ABC):
    """Transport for a single outbound email."""

    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """True when the provider has usable credentials in ``settings``."""

    @abstractmethod
    async def send(
        self,
        *,
        recipient: str,
        subject: str,
        html: str,
        plain: str,
    ) -> None:
        """Deliver an email. Raises on failure (never retries permanent errors)."""


class SmtpEmailProvider(EmailProvider):
    """SMTP transport. Reads all credentials from ``settings``."""

    name = "smtp"

    def is_configured(self) -> bool:
        return bool(settings.SMTP_HOST)

    def _build_message(self, recipient: str, subject: str, html: str, plain: str) -> EmailMessage:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_from
        message["To"] = recipient
        message.set_content(plain, subtype="plain")
        message.add_alternative(html, subtype="html")
        return message

    def _authenticate(self, client: smtplib.SMTP) -> None:
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

    def _smtp_send(self, message: EmailMessage) -> None:
        """Send a message over SMTP with retries. Runs in a worker thread.

        Only transient failures are retried. Permanent rejections (any ``5xx``,
        including Gmail's ``550 5.4.5`` daily sending-limit error) are logged
        and given up immediately so a broken sender account can never hold up
        the caller for the full retry window.
        """
        attempts = max(1, settings.EMAIL_MAX_RETRIES)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                if settings.SMTP_USE_SSL:
                    with smtplib.SMTP_SSL(
                        settings.SMTP_HOST,
                        settings.SMTP_PORT,
                        timeout=settings.SMTP_TIMEOUT_SECONDS,
                    ) as client:
                        self._authenticate(client)
                        client.send_message(message)
                else:
                    with smtplib.SMTP(
                        settings.SMTP_HOST,
                        settings.SMTP_PORT,
                        timeout=settings.SMTP_TIMEOUT_SECONDS,
                    ) as client:
                        if settings.SMTP_USE_TLS:
                            client.starttls()
                        self._authenticate(client)
                        client.send_message(message)
                logger.info("[Email] Sent '%s' to %s (attempt %d)", message["Subject"], message["To"], attempt)
                return
            except Exception as exc:  # noqa: BLE001 - retry transient transport errors only
                last_error = exc
                permanent = smtp_failure_is_permanent(exc)
                logger.warning(
                    "[Email] Attempt %d/%d to send '%s' to %s failed (permanent=%s): %s",
                    attempt,
                    attempts,
                    message["Subject"],
                    message["To"],
                    permanent,
                    exc,
                )
                if permanent:
                    # Permanent rejection (e.g. Gmail 550 5.4.5 quota). Retrying
                    # would only waste time; log the failure and move on.
                    break
                if attempt < attempts:
                    time.sleep(settings.EMAIL_RETRY_BACKOFF_SECONDS * attempt)
        raise last_error  # type: ignore[misc]

    async def send(
        self,
        *,
        recipient: str,
        subject: str,
        html: str,
        plain: str,
    ) -> None:
        message = self._build_message(recipient, subject, html, plain)
        await asyncio.to_thread(self._smtp_send, message)


class BrevoEmailProvider(EmailProvider):
    """Brevo transactional email REST API.

    Free tier: 300 emails/day (no credit card required). Individual sender
    addresses (e.g. ``jobpilotdesk@gmail.com``) can be verified in the Brevo
    dashboard so the visible FROM address can stay the brand's Gmail address.
    """

    name = "brevo"

    def is_configured(self) -> bool:
        return bool(settings.EMAIL_API_KEY)

    async def send(
        self,
        *,
        recipient: str,
        subject: str,
        html: str,
        plain: str,
    ) -> None:
        payload = {
            "sender": {
                "name": settings.EMAIL_FROM_NAME,
                "email": settings.EMAIL_FROM_EMAIL,
            },
            "to": [{"email": recipient}],
            "subject": subject,
            "htmlContent": html,
            "textContent": plain,
        }
        headers = {
            "api-key": settings.EMAIL_API_KEY,
            "accept": "application/json",
            "content-type": "application/json",
        }
        attempts = max(1, settings.EMAIL_MAX_RETRIES)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=settings.SMTP_TIMEOUT_SECONDS) as client:
                    response = await client.post(BREVO_API_URL, json=payload, headers=headers)
                if response.status_code == 201:
                    message_id = ""
                    try:
                        message_id = str(response.json().get("messageId", ""))
                    except Exception:  # noqa: BLE001 - body may not be JSON
                        message_id = ""
                    logger.info(
                        "[Email][brevo] Sent '%s' to %s (attempt %d, message_id=%s)",
                        subject,
                        recipient,
                        attempt,
                        message_id or "-",
                    )
                    return
                message_id = ""
                try:
                    message_id = str(response.json().get("messageId", ""))
                except Exception:  # noqa: BLE001 - body may not be JSON
                    message_id = ""
                last_error = RuntimeError(
                    f"Brevo HTTP {response.status_code}: {response.text[:300]}"
                )
                permanent = response.status_code < 500
                logger.warning(
                    "[Email][brevo] Attempt %d/%d to send '%s' to %s failed (permanent=%s): %s",
                    attempt,
                    attempts,
                    subject,
                    recipient,
                    permanent,
                    last_error,
                )
                if permanent:
                    # 4xx (bad/expired API key, sender not verified, daily free
                    # quota 429, validation) — retrying will not help.
                    break
                if attempt < attempts:
                    await asyncio.sleep(settings.EMAIL_RETRY_BACKOFF_SECONDS * attempt)
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning(
                    "[Email][brevo] Attempt %d/%d to send '%s' to %s failed (transient): %s",
                    attempt,
                    attempts,
                    subject,
                    recipient,
                    exc,
                )
                if attempt < attempts:
                    await asyncio.sleep(settings.EMAIL_RETRY_BACKOFF_SECONDS * attempt)
        raise last_error  # type: ignore[misc]


def build_email_provider() -> EmailProvider:
    """Return the provider selected by ``settings.EMAIL_PROVIDER``."""
    provider = settings.EMAIL_PROVIDER.strip().lower()
    if provider == "brevo":
        return BrevoEmailProvider()
    return SmtpEmailProvider()

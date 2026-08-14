"""Outgoing email service.

Builds branded, responsive HTML emails and delegates delivery to the
transactional email provider selected in ``settings.EMAIL_PROVIDER`` (SMTP or
Brevo — see ``app.services.email_providers``). Every outbound email is recorded
in the ``audit_logs`` table. When the configured provider has no credentials
(e.g. ``SMTP_HOST`` empty or ``EMAIL_API_KEY`` empty) the service logs the
message instead, so the registration flow can still be exercised in
development without a mail server.
"""
from __future__ import annotations

import base64
import logging

from app.core.config import settings
from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.services.email_providers import build_email_provider

logger = logging.getLogger(__name__)


BRAND_NAME = "DeliveryHub"
BRAND_PRIMARY = "#F97316"
BRAND_DARK = "#0F172A"
BRAND_LIGHT = "#F8FAFC"

ROLE_LABELS = {
    "admin": "Admin",
    "super_admin": "Admin",
    "employee": "Staff",
    "driver": "Driver",
    "business": "Business",
    "business_owner": "Business Owner",
    "dispatcher": "Dispatcher",
    "customer": "Customer",
}

LOGO_SVG = """
<svg xmlns="http://www.w3.org/2000/svg" width="176" height="44" viewBox="0 0 176 44">
  <g fill="none" fill-rule="evenodd">
    <rect x="0" y="0" width="44" height="44" rx="10" fill="#F97316"/>
    <path d="M10 30V17h4l2-3h6l2 3h4v13H10z" fill="#FFFFFF"/>
    <path d="M12 30h8v-4h-8v4zm8-9h-8v5h8v-5zm4 9h-2v-9h2v9z" fill="#0F172A"/>
    <text x="52" y="20" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#0F172A">DeliveryHub</text>
    <text x="52" y="34" font-family="Arial, Helvetica, sans-serif" font-size="10" letter-spacing="3" fill="#F97316">DELIVERY MANAGEMENT</text>
  </g>
</svg>
"""

LOGO_DATA_URI = "data:image/svg+xml;base64," + base64.b64encode(LOGO_SVG.encode("utf-8")).decode("ascii")


def _esc(value: object) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _email_shell(title: str, heading: str, body_html: str) -> str:
    """Responsive table-based HTML shell with DeliveryHub branding."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;">
  <center role="article" aria-roledescription="email" lang="en" style="width:100%;background-color:#EEF1F5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#EEF1F5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
                 style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;
                        font-family:Arial,Helvetica,sans-serif;color:{BRAND_DARK};">
            <tr>
              <td style="background-color:{BRAND_DARK};padding:24px 32px;" align="center">
                <img src="{LOGO_DATA_URI}" alt="{BRAND_NAME}" width="176" height="44"
                     style="display:block;border:0;max-width:176px;height:auto;">
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:{BRAND_DARK};">{_esc(heading)}</h1>
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="background-color:{BRAND_LIGHT};padding:20px 32px;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B;">
                  {BRAND_NAME} &middot; Fast, reliable delivery management.<br>
                  This is an automated message. Please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>"""


def _body_paragraph(text: str) -> str:
    return f'<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">{_esc(text)}</p>'


def _otp_box(otp: str) -> str:
    chars = "".join(
        f'<td style="width:44px;height:56px;background-color:{BRAND_LIGHT};border:2px solid {BRAND_PRIMARY};'
        f'border-radius:8px;font-size:28px;font-weight:bold;color:{BRAND_DARK};text-align:center;">{c}</td>'
        for c in otp
    )
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">'
        f"<tr>{chars}</tr></table>"
    )


def _details_rows(rows: list[tuple[str, str]]) -> str:
    items = "".join(
        f'<tr>'
        f'<td style="padding:8px 12px;font-size:13px;color:#64748B;white-space:nowrap;vertical-align:top;">{_esc(label)}</td>'
        f'<td style="padding:8px 12px;font-size:14px;color:{BRAND_DARK};word-break:break-word;">{_esc(value)}</td>'
        f"</tr>"
        for label, value in rows
    )
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;max-width:480px;background-color:#F8FAFC;border:1px solid #E2E8F0;'
        'border-radius:8px;margin:0 0 20px 0;">'
        f"{items}</table>"
    )


def _button(label: str, href: str | None = None) -> str:
    """Large branded CTA button. Links to ``href`` when provided."""
    padded = (
        f'<td style="background-color:{BRAND_PRIMARY};border-radius:8px;padding:0;">'
        f'<a href="{_esc(href)}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;'
        f'color:#FFFFFF;text-decoration:none;border-radius:8px;background-color:{BRAND_PRIMARY};">'
        f"{_esc(label)}</a></td>"
        if href
        else (
            f'<td style="background-color:{BRAND_PRIMARY};border-radius:8px;">'
            f'<span style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#FFFFFF;">'
            f"{_esc(label)}</span></td>"
        )
    )
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">'
        f"<tr>{padded}</tr></table>"
    )


def _text_from_html(html: str) -> str:
    """Terse plain-text fallback derived from an HTML body."""
    import re

    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"</td>", "  ", text)
    text = re.sub(r"</tr>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


class EmailService:
    def __init__(self) -> None:
        self._provider = build_email_provider()

    def _is_configured(self) -> bool:
        return self._provider.is_configured()

    async def _dispatch(
        self,
        recipient: str,
        subject: str,
        heading: str,
        body_html: str,
        audit_action: str,
        admin_id: str | None = None,
        entity_id: str | None = None,
    ) -> bool:
        """Send an email through the configured provider and record an audit
        log entry for every attempt."""
        html = _email_shell(subject, heading, body_html)
        plain = f"{heading}\n\n{_text_from_html(body_html)}"
        sent = False
        error: str | None = None
        if self._provider.is_configured():
            try:
                await self._provider.send(
                    recipient=recipient,
                    subject=subject,
                    html=html,
                    plain=plain,
                )
                sent = True
            except Exception as exc:  # noqa: BLE001
                error = str(exc)
                logger.error("[Email] Delivery failed for '%s' to %s: %s", subject, recipient, exc)
        else:
            logger.info("[Email][dev] Would send '%s' to %s\n%s", subject, recipient, plain)

        await self._record_audit(
            action=audit_action,
            recipient=recipient,
            subject=subject,
            sent=sent,
            error=error,
            admin_id=admin_id,
            entity_id=entity_id,
        )
        return sent

    async def _record_audit(
        self,
        action: str,
        recipient: str,
        subject: str,
        sent: bool,
        error: str | None,
        admin_id: str | None = None,
        entity_id: str | None = None,
    ) -> None:
        """Persist an audit log entry for every outbound email."""
        try:
            from app.repositories.audit_log_repository import AuditLogRepository

            new_values = f"recipient={recipient};subject={subject};sent={sent}"
            if error:
                new_values += f";error={error}"
            await AuditLogRepository().create_log(
                action=action,
                admin_id=admin_id,
                entity_type="email",
                entity_id=entity_id,
                new_values=new_values,
            )
        except Exception as exc:  # noqa: BLE001 - audit failure must not break the flow
            logger.error("[Email] Failed to write audit log for '%s' -> %s: %s", subject, recipient, exc)

    async def send_admin_registration_notification(self, request: RegistrationRequest) -> bool:
        """Notify the admin mailbox about a new registration request."""
        admin_email = settings.ADMIN_NOTIFICATION_EMAIL or ""
        if not admin_email:
            logger.warning("[Email] ADMIN_NOTIFICATION_EMAIL not configured; skipping admin notification")
            return False

        rows = [
            ("Request ID", str(request.id)),
            ("Name", f"{request.firstName} {request.lastName}"),
            ("Company", request.companyName),
            ("Email", request.email),
            ("Phone", request.phone),
            ("Requested Role", request.requestedRole.value if hasattr(request.requestedRole, "value") else str(request.requestedRole)),
            ("Time", request.createdAt.strftime("%Y-%m-%d %H:%M:%S UTC")),
        ]
        body = (
            _body_paragraph("A new user registration request has been received and is awaiting review.")
            + _details_rows(rows)
            + _button("Open Admin Dashboard", settings.ADMIN_DASHBOARD_URL)
            + _body_paragraph("Log in to the Admin Portal to approve or reject this request.")
        )
        return await self._dispatch(
            admin_email,
            "New DeliveryHub Registration Request",
            "New Registration Request",
            body,
            audit_action="email.admin_registration_notification",
        )

    async def send_admin_otp_notification(self, request: RegistrationRequest, otp: str) -> bool:
        """Notify the admin mailbox with OTP for a pending registration request."""
        admin_email = settings.ADMIN_NOTIFICATION_EMAIL or ""
        if not admin_email:
            logger.warning("[Email] ADMIN_NOTIFICATION_EMAIL not configured; skipping admin OTP notification")
            return False

        rows = [
            ("Request ID", str(request.id)),
            ("Name", f"{request.firstName} {request.lastName}"),
            ("Company", request.companyName),
            ("Email", request.email),
            ("Phone", request.phone),
            ("Requested Role", request.requestedRole.value if hasattr(request.requestedRole, "value") else str(request.requestedRole)),
            ("Time", request.createdAt.strftime("%Y-%m-%d %H:%M:%S UTC")),
        ]
        body = (
            _body_paragraph("A registration request has been updated. Use the OTP below to approve this request in the admin portal.")
            + _details_rows(rows)
            + _body_paragraph(f"Approval OTP (expires in {settings.OTP_EXPIRE_MINUTES} minutes):")
            + _otp_box(otp)
            + _button("Open Admin Dashboard", settings.ADMIN_DASHBOARD_URL)
            + _body_paragraph("Log in to the Admin Portal to approve or reject this request.")
        )
        return await self._dispatch(
            admin_email,
            "DeliveryHub Registration Request - Approval OTP",
            "Registration Request Approval OTP",
            body,
            audit_action="email.admin_otp_notification",
        )

    async def send_registration_notification_to_admin(self, request: RegistrationRequest) -> bool:
        """Notify the admin mailbox about a new registration request.

        Canonical entry point shared by the registration flow. Delegates to the
        same implementation as ``send_admin_registration_notification`` so every
        module sends through this single service.
        """
        return await self.send_admin_registration_notification(request)

    async def send_approval_otp(self, request: RegistrationRequest, otp: str) -> bool:
        """Send the account-activation OTP after an admin approves a request.

        Recipient is the applicant's registered email (``request.email``), never
        the admin notification mailbox. The body shows the company and sign-in
        email plus the activation OTP. The password (or any credential) is
        never included.
        """
        role = (
            request.requestedRole.value
            if hasattr(request.requestedRole, "value")
            else str(request.requestedRole)
        )
        role_label = ROLE_LABELS.get(role, role.replace("_", " ").title())
        body = (
            _body_paragraph(f"Hello {request.firstName},")
            + _body_paragraph(
                f"Your DeliveryHub {role_label} registration has been approved."
            )
            + _details_rows(
                [
                    ("Company", request.companyName or "-"),
                    ("Email", request.email),
                ]
            )
            + _body_paragraph("Your verification OTP:")
            + _otp_box(otp)
            + _body_paragraph(f"This OTP is valid for {settings.OTP_EXPIRE_MINUTES} minutes.")
            + _body_paragraph("Do not share this code with anyone.")
            + _body_paragraph("DeliveryHub Team")
        )
        return await self._dispatch(
            request.email,
            f"DeliveryHub {role_label} Account Verification",
            "Your Account Has Been Approved",
            body,
            audit_action="email.approval_otp",
        )

    async def send_approval_email(self, request: RegistrationRequest, otp: str) -> bool:
        """Send the account-approval email containing the activation OTP.

        Application-level entry point for the approve flow (SuperAdmin approves
        -> OTP generated/stored -> this email delivered). Delivers through the
        configured transactional provider (never Gmail SMTP directly).
        """
        return await self.send_approval_otp(request, otp)

    async def send_otp_email(self, request: RegistrationRequest, otp: str) -> bool:
        """Send the activation OTP email for an approved registration.

        Application-level entry point for the initial OTP delivery. Delivers
        through the configured transactional provider.
        """
        return await self.send_approval_otp(request, otp)

    async def send_resend_otp_email(self, request: RegistrationRequest, otp: str) -> bool:
        """Send a NEW activation OTP email after a resend request.

        Application-level entry point for the resend-approval flow. The old OTP
        is invalidated before this is called; this method only delivers the new
        code through the configured transactional provider.
        """
        role = (
            request.requestedRole.value
            if hasattr(request.requestedRole, "value")
            else str(request.requestedRole)
        )
        role_label = ROLE_LABELS.get(role, role.replace("_", " ").title())
        body = (
            _body_paragraph(f"Hello {request.firstName},")
            + _body_paragraph(
                f"Here is your new DeliveryHub {role_label} account verification code."
            )
            + _details_rows(
                [
                    ("Company", request.companyName or "-"),
                    ("Email", request.email),
                ]
            )
            + _body_paragraph("Your new verification OTP:")
            + _otp_box(otp)
            + _body_paragraph(f"This OTP is valid for {settings.OTP_EXPIRE_MINUTES} minutes.")
            + _body_paragraph("Do not share this code with anyone.")
            + _body_paragraph("DeliveryHub Team")
        )
        return await self._dispatch(
            request.email,
            f"DeliveryHub {role_label} New Verification Code",
            "Your New Verification Code",
            body,
            audit_action="email.approval_otp_resend",
        )

    async def send_password_reset_otp(self, email: str, first_name: str, otp: str) -> bool:
        """Send a password-reset OTP."""
        body = (
            _body_paragraph(f"Hello {first_name},")
            + _body_paragraph("You requested a password reset. Use the OTP below to set a new password.")
            + _otp_box(otp)
            + _body_paragraph(f"This OTP expires in {settings.OTP_EXPIRE_MINUTES} minutes.")
            + _body_paragraph("If you did not request this, please ignore this email.")
        )
        return await self._dispatch(
            email,
            "DeliveryHub Password Reset OTP",
            "Reset Your Password",
            body,
            audit_action="email.password_reset_otp",
        )

    async def send_rejection_email(self, email: str, first_name: str, reason: str) -> bool:
        """Send a rejection notification when an admin rejects a request."""
        body = (
            _body_paragraph(f"Dear {first_name},")
            + _body_paragraph("We have reviewed your registration request and it has been rejected.")
            + _body_paragraph(f"Reason: {reason}")
            + _body_paragraph("If you have any questions, please contact our support team.")
        )
        return await self._dispatch(
            email,
            "DeliveryHub Registration Update",
            "Registration Update",
            body,
            audit_action="email.registration_rejected",
        )

    async def send_welcome_email(self, email: str, first_name: str, role: str = "") -> bool:
        """Send a welcome email after the account is activated."""
        role_line = f"<strong>Assigned Role:</strong> {_esc(role)}<br>" if role else ""
        body = (
            _body_paragraph(f"Welcome {first_name}!")
            + _body_paragraph(
                f"Your DeliveryHub account has been successfully activated and you are now ready to log in.{role_line}"
            )
            + _button("Open DeliveryHub", settings.ADMIN_DASHBOARD_URL.rstrip("/admin/dashboard"))
            + _body_paragraph("If you have any questions, please contact our support team.")
        )
        return await self._dispatch(
            email,
            "Welcome to DeliveryHub!",
            "Welcome Aboard",
            body,
            audit_action="email.welcome",
        )

    async def send_account_disabled_email(self, email: str, first_name: str, reason: str = "") -> bool:
        """Notify a user that their account has been disabled by an administrator."""
        reason_html = f"<br>Reason: {_esc(reason)}" if reason else ""
        body = (
            _body_paragraph(f"Dear {first_name},")
            + _body_paragraph(
                f"Your DeliveryHub account has been disabled by an administrator.{reason_html}"
            )
            + _body_paragraph("If you believe this is a mistake, please contact our support team.")
        )
        return await self._dispatch(
            email,
            "DeliveryHub Account Disabled",
            "Account Disabled",
            body,
            audit_action="email.account_disabled",
        )

    def send_password_reset(self, user: User, reset_token: str) -> str | None:
        """Legacy link-based reset used by the auth flow. Returns the token in
        non-production environments (never in production)."""
        if settings.EXPOSE_RESET_TOKEN_IN_RESPONSE and settings.ENV != "production":
            logger.info("[Email][dev] Password reset requested for %s", user.email)
            return reset_token
        logger.info("[Email][stub] Sending password reset notification to %s", user.email)
        return None


email_service = EmailService()

"""Application configuration loaded from environment variables."""
from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Literal

from pydantic import ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvName = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Typed application settings. Secrets must come from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Application -------------------------------------------------------
    APP_NAME: str = "DeliveryHub API"
    ENV: EnvName = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"

    # --- Database ----------------------------------------------------------
    # PostgreSQL (async) connection string, e.g. a Neon pooled URL:
    # postgresql+psycopg://user:pass@host/db?sslmode=require&channel_binding=require
    DATABASE_URL: str = "postgresql+psycopg://deliveryhub:deliveryhub@localhost:5432/deliveryhub"

    # --- File uploads ------------------------------------------------------
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    UPLOAD_DIR: str = "uploads"
    # Public base URL used to build absolute links to stored files.
    APP_PUBLIC_URL: str = "http://localhost:8000"
    # Max upload size in bytes (default 10 MB).
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    # Comma-separated allowed upload MIME types; "*" allows any image/document.
    ALLOWED_UPLOAD_TYPES: str = "*"
    # S3 (cloud) storage credentials — only used when STORAGE_BACKEND=s3.
    S3_BUCKET: str = ""
    S3_REGION: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # --- Security ----------------------------------------------------------
    # Must be set explicitly in production (>= 32 chars): leaving the dev
    # default generates a per-process random key, which invalidates tokens on
    # restart and rejects tokens signed by other API instances (see the
    # SECRET_KEY validator below).
    SECRET_KEY: str = "insecure-development-secret-change-me"
    ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "deliveryhub"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    BCRYPT_ROUNDS: int = 12

    # --- OTP ---------------------------------------------------------------
    # Lifetime of a verification OTP in minutes (the mobile UI counts down
    # from 05:00 and the email templates state the same window).
    OTP_EXPIRE_MINUTES: int = 5
    # Minimum seconds between OTP re-sends for the same registration request.
    # Served back to clients as HTTP 429 otp_resend_cooldown.
    OTP_RESEND_COOLDOWN_SECONDS: int = 60

    # --- CORS --------------------------------------------------------------
    # Comma-separated list of allowed origins, e.g. "http://localhost:8081,https://app.example.com"
    CORS_ALLOWED_ORIGINS: str = "*"
    CORS_ALLOW_CREDENTIALS: bool = True

    # --- Rate limiting ------------------------------------------------------
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_MAX_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    # Requests with these path prefixes bypass the limiter (e.g. docs/health).
    RATE_LIMIT_WHITELIST: str = "/health,/docs,/redoc,/openapi.json"

    # --- Redis / Celery ----------------------------------------------------
    # Canonical Redis connection string. Celery's broker and result backend
    # default to it when not set explicitly (see _redis_defaults), so the
    # managed Redis endpoint is configured in one place. Managed hosts require
    # TLS, hence the rediss:// scheme (e.g.
    # `rediss://default:<UPSTASH_TOKEN>@<host>.upstash.io:6379`). A local
    # `redis://localhost:6379/0` is the default for development.
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""
    CELERY_TASK_ALWAYS_EAGER: bool = False
    CELERY_TASK_DEFAULT_QUEUE: str = "deliveryhub"
    # When the Celery broker is unreachable, may the API process fall back to
    # running email side effects in-process instead of dropping them?
    # * None (default) — development/test: fall back (Redis is optional locally,
    #   flows must keep working); production: fail closed (expensive async work
    #   must never silently run inside the API process because Redis is down).
    # * True/False — explicit override for any environment.
    CELERY_FALLBACK_IN_PROCESS: bool | None = None

    # --- WebSockets ---------------------------------------------------------
    # Backlog size for the per-user WebSocket notification queues before the
    # manager drops the oldest undelivered message.
    WS_MAX_QUEUE_SIZE: int = 100

    # --- Feature flags -----------------------------------------------------
    # When true (development/test), the forgot-password response includes the
    # reset token so flows can be exercised without a mail server.
    EXPOSE_RESET_TOKEN_IN_RESPONSE: bool = True

    # --- OCR (GR slip extraction) -------------------------------------------
    # OCR.Space API key used by the admin OCR endpoint
    # (`POST /admin/orders/ocr-extract`). When unset, the endpoint returns
    # 503 ocr_service_unavailable so the app degrades gracefully (manual GR
    # entry keeps working regardless).
    OCR_SPACE_API_KEY: str = ""
    OCR_SPACE_API_URL: str = "https://api.ocr.space/parse/image"

    # --- Email / SMTP ------------------------------------------------------
    # Transactional email provider: "brevo" (Brevo REST API, production
    # transport — 300 emails/day free, no credit card) or "smtp" (SMTP, only
    # for self-hosted mailboxes; Gmail SMTP is quota-limited and NOT a
    # production transport). All credentials come exclusively from the
    # environment — never hardcode them. When the selected provider has no
    # credentials configured, the EmailService falls back to logging so flows
    # keep working locally (no fake success is returned for a configured
    # provider that failed to deliver).
    EMAIL_PROVIDER: str = "brevo"
    # Canonical sender identity shared by every provider. The brand's Gmail
    # address stays the visible FROM; it must be verified on the provider side
    # (e.g. Brevo sender verification) before production delivery.
    EMAIL_FROM_NAME: str = "DeliveryHub"
    EMAIL_FROM_EMAIL: str = "jobpilotdesk@gmail.com"
    # Brevo API key (v3) — required when EMAIL_PROVIDER=brevo.
    EMAIL_API_KEY: str = ""
    # SMTP credentials — used when EMAIL_PROVIDER=smtp.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 30
    # Recipient of every new-registration notification.
    ADMIN_NOTIFICATION_EMAIL: str = "jobpilotdesk@gmail.com"
    # How many times to retry a failed outbound email before giving up.
    EMAIL_MAX_RETRIES: int = 3
    EMAIL_RETRY_BACKOFF_SECONDS: int = 3
    # Base URL used to build the "Open Admin Dashboard" action in email.
    ADMIN_DASHBOARD_URL: str = "http://localhost:8000/admin/dashboard"

    @property
    def smtp_from(self) -> str:
        """Compose the RFC-5322 From header from the brand and address."""
        return f"{self.EMAIL_FROM_NAME} <{self.EMAIL_FROM_EMAIL}>"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str, info: ValidationInfo) -> str:
        if value in {"insecure-development-secret-change-me", "change-me"}:
            if info.data.get("ENV") == "production":
                raise ValueError(
                    "SECRET_KEY must be set explicitly in production. "
                    "A per-process random key is only safe for local "
                    "development: it would invalidate every token on restart "
                    "and reject tokens signed by other API instances."
                )
            return secrets.token_urlsafe(48)
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

    @model_validator(mode="after")
    def _redis_defaults(self) -> "Settings":
        # Celery broker/result backend default to the canonical REDIS_URL so a
        # single variable configures Redis everywhere. Explicit overrides are
        # still honoured when set.
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.REDIS_URL
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.REDIS_URL
        # Celery requires an explicit ssl_cert_reqs on rediss:// URLs (its Redis
        # backend raises otherwise). Upstash presents a valid certificate, so
        # require verification rather than silently disabling it.
        for attr in ("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND"):
            url = getattr(self, attr)
            if "rediss://" in url and "ssl_cert_reqs=" not in url:
                sep = "&" if "?" in url else "?"
                setattr(self, attr, f"{url}{sep}ssl_cert_reqs=CERT_REQUIRED")
        return self

    @property
    def cors_origins(self) -> list[str]:
        if self.CORS_ALLOWED_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_allow_credentials(self) -> bool:
        """`Access-Control-Allow-Credentials: true` combined with a wildcard
        origin is an invalid combination per the CORS spec (and Starlette's
        CORSMiddleware sends a literal "*" for allow_origins=["*"] regardless
        of this flag, which browsers reject when credentials are involved).
        Neither the mobile app nor the admin web app use cookie-based auth
        (both send a Bearer token instead, which isn't subject to the
        `credentials` fetch mode), so it's safe to disable this whenever the
        origin list is still the open wildcard.
        """
        if self.CORS_ALLOWED_ORIGINS.strip() == "*":
            return False
        return self.CORS_ALLOW_CREDENTIALS

    @property
    def rate_limit_whitelist(self) -> list[str]:
        return [
            path.strip()
            for path in self.RATE_LIMIT_WHITELIST.split(",")
            if path.strip()
        ]

    @property
    def celery_fallback_in_process(self) -> bool:
        """Whether email side effects may fall back to in-process execution.

        Explicit ``CELERY_FALLBACK_IN_PROCESS`` wins; otherwise the default is
        derived from the environment: local development/test may fall back so a
        missing Redis never breaks a flow, while production fails closed so a
        broker outage surfaces instead of quietly running async work inside the
        API process.
        """
        if self.CELERY_FALLBACK_IN_PROCESS is not None:
            return self.CELERY_FALLBACK_IN_PROCESS
        return self.ENV != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

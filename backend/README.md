# DeliveryHub Backend — FastAPI + PostgreSQL

Production-structured FastAPI service for the DeliveryHub Transport Management
System. Phase 1 implements the complete authentication module.

## Stack

- Python 3.13+ · FastAPI · Pydantic v2 · Uvicorn
- PostgreSQL (Neon) · SQLAlchemy 2.0 (async) · psycopg 3
- PyJWT (access + refresh tokens) · bcrypt (password hashing)

## Project structure

```
backend/
├── main.py                 # App entrypoint: middleware, error handlers, routes
├── requirements.txt
├── .env.example
├── pytest.ini
├── tests/                  # End-to-end auth tests (httpx + real PostgreSQL)
└── app/
    ├── api/                # Route handlers + dependencies
    │   ├── deps.py         # CurrentUser dependency, user-agent helper
    │   └── v1/             # Versioned routes (auth, users)
    ├── core/               # Settings, security (JWT/bcrypt), exceptions
    ├── database/           # SQLAlchemy engine/session + declarative base
    ├── middlewares/        # Security headers, sliding-window rate limiter
    ├── models/             # ORM models (user, refresh_token, password_reset)
    ├── repositories/       # Data access layer
    ├── schemas/            # Pydantic request/response models + validation
    ├── services/           # Business logic (auth, user, token, email)
    └── utils/              # Response envelope, timezone helpers
```

## Setup

Requires a PostgreSQL database (a Neon project works out of the box). Set
`DATABASE_URL` in `.env` — the tables are created automatically on startup.

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

copy .env.example .env      # then edit values (or paste your Neon URL)
python run.py               # dev server (handles the Windows event-loop policy)
# or: uvicorn main:app --reload
```

`run.py` sets `WindowsSelectorEventLoopPolicy` before uvicorn starts — psycopg
(async) cannot run on Windows' default Proactor loop, and uvicorn creates the
loop before it imports the app, so the policy must be applied in the entrypoint
(plain `uvicorn main:app` without `--reload` needs this wrapper on Windows).

Interactive docs: http://localhost:8000/docs

## Configuration

All settings are environment variables (see `.env.example`). The important
ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (async `postgresql+psycopg://`). |
| `SECRET_KEY` | JWT signing secret (min 32 chars). Auto-generated if the dev default is left in place. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default 15 min). |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default 7 days). |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins. |
| `RATE_LIMIT_ENABLED` | Toggle the in-process rate limiter. |
| `EXPOSE_RESET_TOKEN_IN_RESPONSE` | Dev/test only — returns the reset token so flows can be exercised without a mail server. |

**Never commit `.env`.** Only `.env.example` is tracked.

> Neon: paste the pooled connection string from the Neon console directly into
> `DATABASE_URL` — e.g.
> `postgresql+psycopg://user:pass@host-pooler...neon.tech/neondb?sslmode=require&channel_binding=require`.
> The `sslmode` / `channel_binding` parameters are passed through by psycopg.

## API

All endpoints live under `/api/v1` and return the envelope:

```json
{ "success": true, "message": "...", "data": { } }
```

Errors use the same shape with `success: false` and an `error` object carrying
`code`, `message`, `status` and optional `details`.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create account (returns session) |
| POST | `/auth/login` | — | Sign in |
| POST | `/auth/logout` | — | Revoke the refresh token |
| POST | `/auth/refresh` | — | Rotate refresh token → new token pair |
| POST | `/auth/forgot-password` | — | Request a reset token |
| POST | `/auth/reset-password` | — | Set a new password with a reset token |
| GET | `/users/me` | Bearer | Current user profile |

### Users table

Row shape (password hashes are bcrypt, never stored as plain text):

```json
{
  "id": "uuid",
  "fullName": "Jane Cooper",
  "email": "jane@example.com",
  "phone": "+15550001234",
  "passwordHash": "$2b$12$...",
  "role": "employee",
  "profileImage": null,
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Roles: `employee` (default) · `admin` · `driver` · `dispatcher`.

## Security

- bcrypt password hashing (12 rounds).
- Access tokens are short-lived JWT (HS256). Refresh tokens are rotated on
  every use and their sessions are persisted server-side, enabling revocation
  (logout, password reset) and reuse detection.
- Password reset tokens are stored only as SHA-256 digests, are single-use,
  expire quickly, and resetting a password revokes every other session.
- Forgot-password responses are identical whether or not the email exists
  (no account enumeration).
- Security response headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Content-Security-Policy`, `Referrer-Policy`, etc.) on every response.
- Sliding-window rate limiter (in-memory — swap the store for Redis when
  scaling to multiple workers).
- CORS allow-list, centralised validation and exception handling.

## Testing

Tests run against a real PostgreSQL database. They drop and recreate the
tracked tables before each test, so point them at a scratch database:

```bash
cd backend
# optional: use a dedicated test database instead of the one in .env
$env:TEST_DATABASE_URL="postgresql+psycopg://...testdb..."
.\.venv\Scripts\python.exe -m pytest
```

Note: running the suite against the same `DATABASE_URL` as development will
wipe those tables — set `TEST_DATABASE_URL` to a throwaway database to avoid
that.

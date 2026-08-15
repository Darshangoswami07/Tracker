# DeliveryHub — Transport Management System

An enterprise-grade transport/logistics platform (in the spirit of Delhivery,
Xpressbees and DTDC). DeliveryHub is a full-stack monorepo with three
applications:

```
┌────────────┐   ┌────────────┐   ┌──────────────────────────────────────────┐
│   Mobile   │   │   Admin    │   │               Backend                    │
│ React Native│  │ Next.js    │──▶│  FastAPI ──▶ PostgreSQL (Neon)            │
│  (Expo SDK │  │ (web)      │   │  JWT auth · roles · GR tracking · reports │
│   57)      │──┘            │   └──────────────────────────────────────────┘
└────────────┘
```

No Firebase, Supabase, Appwrite, or any third-party auth. Authentication and all
business logic are handled entirely by the FastAPI service.

## Repo layout

| Path        | Description                                        |
| ----------- | -------------------------------------------------- |
| `mobile/`   | React Native app for customers, businesses, employees, drivers & admins (see [`mobile/README.md`](mobile/README.md)) |
| `backend/`  | FastAPI REST API + PostgreSQL (see [`backend/README.md`](backend/README.md)) |
| `admin/`    | Next.js web dashboard for staff/super-admin management |
| `docs/`     | Screenshots & design artifacts |

## What's implemented

### Authentication & accounts
- **Flows**: register, login, logout, refresh, forgot password, reset password,
  current user, change password.
- **Registration workflow**: businesses, employees and drivers register and must
  be **approved by an admin** before they can sign in (approval + OTP
  verification). Customers can self-sign-up and get a session immediately.
- **JWT security**: short-lived access tokens + rotating refresh tokens (server
  persisted, revocable, reuse-detection), bcrypt password hashing, hashed &
  single-use password-reset tokens, no account enumeration.
- **Role-based access control** enforced on every protected endpoint.

### Roles & dashboards
- `customer` · `employee` · `driver` · `dispatcher` · `business` ·
  `business_owner` · `admin` · `super_admin`.
- Each role gets its own mobile navigation stack and dashboard:
  - **Customer** — dashboard, track shipment by GR number, my shipments,
    saved addresses.
  - **Business** — dashboard, orders (create/assign drivers & vehicles),
    customers, drivers, vehicles, reports & analytics.
  - **Employee/Dispatcher** — dashboard, orders, customers, drivers, vehicles,
    reports, GR panel.
  - **Driver** — dashboard, today's deliveries, pickup/drop flows, proof of
    delivery, earnings, vehicle status.
  - **Admin/Super Admin** — system-wide management via the mobile stack and the
    `admin/` web dashboard.

### Shipments & tracking
- Orders with types (document/parcel/food/other), priorities, payment status and
  a full status lifecycle (pending → assigned → pickup → in_transit →
  delivered/failed/returned/cancelled).
- **Public GR tracking**: any authenticated user can track a shipment by its GR
  number and see the status timeline, consignor/consignee, route and packages.
- Attachments (photos, proofs of delivery, documents) with download endpoints.
- QR/barcode generation, vehicles, drivers, driver locations & vehicle
  assignments.

### Platform
- **Consistent API envelope** (`{ success, message, data }`) for every response
  with proper HTTP status codes.
- Security headers, sliding-window rate limiter, CORS allow-list, centralised
  validation & exception handling.
- Notifications (per-user inbox with unread counts).
- Reports (CSV/XLSX) for business & employee roles.
- Alembic migrations, Redis + Celery ready, comprehensive pytest suite against a
  real PostgreSQL database.

## Getting started

See the per-project READMEs:

- [`mobile/README.md`](mobile/README.md)
- [`backend/README.md`](backend/README.md)
- [`admin/README.md`](admin/README.md)

```bash
# Backend (requires PostgreSQL — a Neon project works out of the box)
cd backend
python -m venv .venv
.\.venv\Scripts\activate        # (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # then edit values / paste your DATABASE_URL
python run.py                   # http://localhost:8000/docs

# Mobile
cd mobile
npm install
npx expo start --web --clear

# Admin web dashboard
cd admin
npm install
npm run dev
```

## Testing

```bash
cd backend
# point at a throwaway database — the suite drops/recreates tables
$env:TEST_DATABASE_URL="postgresql+psycopg://...testdb..."
.\.venv\Scripts\python.exe -m pytest
```

```bash
cd mobile
npm run typecheck   # tsc --noEmit
npm run lint        # Expo lint
```

## Roadmap

Real-time GPS tracking (WebSockets) · push notifications · route optimization ·
offline support · payment gateway integration · public status page ·
multi-region deployments.

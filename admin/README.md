# DeliveryHub Admin — Next.js Web Dashboard

Web management console for DeliveryHub staff, admins and super-admins. It talks
to the same FastAPI backend as the mobile app.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS · Framer Motion · Recharts
- TanStack Query (data fetching/caching) · Axios
- React Hook Form + Zod (forms/validation)

## Pages

- `/login` — admin sign-in
- `/dashboard` — overview & KPIs
- `/dashboard/approvals` — approve/reject registration requests (businesses,
  employees, drivers)
- `/dashboard/staff` — staff management
- `/dashboard/staff-approvals` — staff role approvals
- `/dashboard/companies` — company management
- `/dashboard/users` — user management
- `/dashboard/drivers` — driver management
- `/dashboard/orders` — order management
- `/dashboard/tracking` — shipment tracking
- `/tracker` — standalone role-gated GR tracking (customer view, plus staff/
  driver/admin panel with GR creation & editing)

## Setup

```bash
cd admin
npm install
npm run dev          # http://localhost:3000
```

The admin app expects the FastAPI backend running at `http://localhost:8000`
(default). Configure the base URL in `src/lib/api/client.ts` if your backend
runs elsewhere.

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start dev server         |
| `npm run build` | Production build         |
| `npm run start` | Serve production build   |
| `npm run lint`  | Next.js lint             |
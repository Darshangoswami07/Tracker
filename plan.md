# Delivery Management System Plan

Inspection date: 2026-08-11. Based on direct reading of `backend/app`, `mobile/src`, and `admin/src` source files (no code was modified to produce this plan). This supersedes the previous `plan.md` (dated 2026-08-10), which covered only the initial Staff/Driver approval-UI slice; a large amount of work has shipped since then (GR/tracking system, per-role dashboards, the `admin/` Next.js web app). This plan re-inspects the whole system against the current brief rather than assuming the old plan is still accurate.

**Headline finding: almost everything this brief asks for already exists.** The Superadmin/Admin approval system, GR tracking, and three distinct role-specific dashboards (Customer, Staff, Admin) are built and working today across backend + `admin/` web + `mobile/`. The remaining gaps are narrow and are called out precisely in §3–4, not invented.

---

## 1. Existing Features `[EXISTS]`

- **Single authentication system with server-side role detection** — one `POST /api/v1/auth/login` (`backend/app/api/v1/auth.py:60`) accepts email+password for every role; the server determines `role` from the `users` row, and the client routes purely off `useUserStore().user.role` (`mobile/src/navigation/AppDrawer.tsx:getStackForRole`). There are no separate `customer/login`, `staff/login` route trees — the brief's "single auth system with role detection + redirect" option is what's built, and it's solid. `AccountTypeScreen.tsx` (Customer / Driver-Staff / Admin cards) is a pure UI convenience for pre-filling a heading — it does not create separate auth backends.
- **Superadmin/Admin approval engine** (`backend/app/services/approval_service.py`) — `RegistrationRequest` → pending → Admin/SuperAdmin approve/reject → OTP → `User` row created with `role = requestedRole`. `ADMIN_APPROVABLE_ROLES = (EMPLOYEE, DRIVER, BUSINESS, BUSINESS_OWNER, DISPATCHER)` (`approval_service.py:28-34`); SUPER_ADMIN is unrestricted (`is_super_admin()` bypass). This **is** the "Staff approval logic" and "Driver approval" flows the brief asks for — they are not new, they are the same mechanism, already role-scoped exactly as specified (Admin can approve Staff/Driver, cannot touch Admin/SuperAdmin-tier requests).
- **Login gating by approval status** — no `User` row exists until OTP-verified post-approval, so pending/rejected applicants cannot authenticate at all (`user_service.authenticate` has nothing to find). Suspended (`RegistrationStatus.SUSPENDED`) users are blocked at login by status check. This satisfies "rejected/disabled staff cannot login" without any new code.
- **Disable / reactivate / remove for Staff and Driver** — generic, role-agnostic, already built: `PATCH /admin/users/{id}/status` (activate/suspend, `admin.py:189-217`) and `DELETE /admin/users/{id}` (hard delete, `admin.py:220-240`), both gated by `can_manage(admin.role, target.role)` from `core/rbac.py` (a role may only manage strictly-lower roles; ADMIN cannot touch SUPER_ADMIN). Works identically for Staff and Driver — no separate endpoint set needed.
- **Admin web app (`admin/`, Next.js)** — a full, already-built, previously-undocumented-until-last-session operational surface:
  - `/dashboard/approvals` — pending-request review, approve/reject with reason, wired to the same backend as above.
  - `/dashboard/users` — list/filter by role+status, activate/suspend (delete endpoint exists in `useUsers.ts` but **is not wired to a button** — see §4).
  - `/dashboard/drivers`, `/dashboard/companies` — real driver/company listings.
  - `/dashboard/orders` ("GR / Shipments") — full GR table: GR No, Consignor→Consignee, route, status, slip upload/download, create-GR modal. This already matches the brief's "Staff GR management" reference image.
  - `/dashboard/tracking` — Customer-tracking-by-GR-number view (search + timeline + consignor/consignee + particulars + photos), added last session, calls `GET /orders/track/{gr_number}`.
- **GR (Goods Receipt) / shipment tracking system** — the `Order` model doubles as the GR entity (`consignorName`, `consigneeName`, `particulars`, `packageCount`, `assignedStaffId`, human-readable `orderNumber` as GR number). Full CRUD at `/admin/orders/*` (`backend/app/api/v1/gr.py`), plus shared cross-role endpoints in `dashboards.py`: `GET /orders/{id}`, `GET /orders/track/{gr_number}`, `PATCH /orders/{id}/status`, attachment upload/download. Role-scoped access via `_assert_order_access()` (Admin/Staff see all, Driver sees only assigned, Customer sees only their own and is read-only).
- **Three genuinely distinct, role-specific mobile dashboards** (not one shared screen with a swapped title):
  - **Customer** (`CustomerDashboardScreen.tsx` + `CustomerStack.tsx`): Dashboard, Track GR (`CustomerTrackingScreen.tsx` — navy/amber, GR search, timeline, read-only), My Orders, Order Details (read-only slip view), Addresses, Payment Methods, Notifications, Profile, Settings, Change Password, Help. **No** Staff/Driver/Admin management screens on this stack at all.
  - **Staff/Employee** (`EmployeeDashboardScreen.tsx` + `EmployeeStack.tsx`): Dashboard (stats, quick actions), GR Panel (`StaffGRPanelScreen.tsx` — GR table, status update, slip upload/replace), Orders, Drivers, Vehicles, Customers, Reports (`EmployeeReportsScreen.tsx` — real CSV generation), Notifications, Profile, Settings, Help. **No** Staff-approval or system-settings screens on this stack.
  - **Admin** (`AdminDashboardScreen.tsx` + `AdminStack.tsx` + the full `admin/` web app): Pending Approvals (real), User Management (real, listing works — see §4 for the action-button gap), plus placeholders for Driver/Order/Vehicle Management, Analytics, System Health, Audit Logs on the **mobile** side specifically (the equivalent functionality is fully built and real on the **admin web app**, which is this project's actual primary Admin surface per the last several sessions' work).
- **RBAC** (`backend/app/core/rbac.py`) — strict rank hierarchy `SUPER_ADMIN(100) > ADMIN(50) > BUSINESS/BUSINESS_OWNER(40) > DISPATCHER(30) > DRIVER(20) > EMPLOYEE(10) > CUSTOMER(0)`, `can_manage()` enforces "only manage strictly lower," enforced server-side via FastAPI dependencies (`AdminUser`, `require_roles`, `require_exact_roles`) — not just UI hiding. Every management/approval endpoint checked in this inspection uses a real dependency, not a frontend-only guard.
- **Database fields the brief explicitly asks to check for** — all present on `RegistrationRequest` (`backend/app/models/registration_request.py`): `status`, `isApproved`, `isActive`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `rejectionReason`. `User` carries `status`/`isActive`. No duplicate tables exist for this.
- **Audit trail** — `ApprovalLog` (who/what/when/reason per registration action) and `AuditLog` (email sends, admin actions), both populated automatically by `approval_service.py`/`email_service.py`. Reused, not duplicated.
- **Notifications** — `Notification` model + `NotificationRepository` + `/api/v1/notifications` endpoints + `NotificationsScreen.tsx` (shared component, present on Customer/Staff/Admin stacks). In-app rows created on account activation; email sent on approval/rejection/registration.
- **File storage for slip/photo uploads** — `storage_service.py` (local-disk, `aiofiles`), path-traversal-guarded, JPG/PNG/PDF validated, wired into both the mobile upload flow (`orderAttachments.ts`) and the admin web upload flow (`useUploadSlip`).

---

## 2. Partial Features `[PARTIAL]`

- **Mobile `UserManagementScreen.tsx` approve/suspend/reject buttons call a nonexistent endpoint.** `handleAction()` POSTs to `` `${ENDPOINTS.admin}/users/${userId}/${action}` `` (`mobile/src/screens/admin/UserManagementScreen.tsx:106-116`); the real backend route is `PATCH /admin/users/{user_id}/status` with a `{status, reason}` body. These buttons 404 today on mobile. **The admin web app's equivalent page does this correctly** (`/dashboard/users` calls the real `PATCH .../status` route via `useUsers.ts`), so Admin is not actually blocked from doing this work — just not from the mobile app.
- **Admin web `DELETE /admin/users/{id}` exists end-to-end in the API layer (`useUsers.ts:deleteUser`) but has no UI trigger** — no delete/remove button on `/dashboard/users/page.tsx`. "Remove staff/driver access" today, in practice, means suspend (fully wired), not hard-delete (backend+hook ready, UI missing).
- **Mobile Admin surface (`DriverManagementScreen`, `OrderManagementScreen`, `VehicleManagementScreen`, `AdminAnalyticsScreen`, `SystemHealthScreen`, `AuditLogsScreen`) are all `AdminPlaceholderScreen` stubs.** Functionally this doesn't block the brief, because the equivalent operations are fully real on the `admin/` web app (drivers, orders/GR, companies, approvals, audit is queryable via `GET /admin/audit-logs`) — but it means "Admin" as a *mobile app experience* is thinner than Staff's.
- **Customer stack includes `CreateOrder`/`Addresses`/`PaymentMethods`/`LiveTracking`**, which sit slightly outside the brief's minimal Customer feature list (Profile, Edit Profile, Change Password, Track Shipment, Shipment History, Delivery Status, Notifications, Support). These are pre-existing, working screens from earlier in the project (a customer creating their own delivery request), not something added for the GR-tracking feature — flagged as a scope question for §5, not a defect.

---

## 3. Missing Features `[MISSING]`

- **No delete/remove-access button on the admin web Users page**, despite the backend + hook already supporting it (§2). This is the one genuinely missing *wire-up* against an existing capability.
- **No client-side route-guarding on the Next.js admin web app** beyond what pages exist/are linked in the sidebar — i.e., there's no explicit "if role isn't admin, redirect" middleware inspected in `admin/src/middleware.ts` equivalent (needs a decision-time check in §15, not confirmed missing vs. present without a targeted read — flagged for verification, not claimed as a hard gap here since backend enforcement is the real boundary).

Nothing else in the brief is missing outright — the rest of what looks superficially "not there" is really the mobile-Admin-placeholder situation in §2, which is a thinness/duplication question, not an absence of the underlying capability.

---

## 4. Improvements `[IMPROVEMENT]`

1. Fix `UserManagementScreen.tsx`'s `handleAction()` to call `PATCH ${ENDPOINTS.admin}/users/{id}/status` with `{status: 'active'|'suspended', reason}` instead of the nonexistent `POST .../{action}` route — brings mobile Admin to parity with the already-correct admin web behavior. *(Small, isolated fix.)*
2. Wire a "Remove" button on `admin/dashboard/users/page.tsx` to the already-existing `useDeleteUser`-style hook (`deleteUser` in `useUsers.ts`), with a `ConfirmDialog` (destructive) — the backend and data hook are done, only the button + confirm flow is missing.
3. Decide whether the six mobile Admin placeholder screens (§2) should be built out to mirror the `admin/` web app, or explicitly documented as "Admin operations happen on the web app; mobile Admin is approvals + user status only" — currently ambiguous by omission, not by design note anywhere in the code.
4. Confirm/verify Next.js route protection exists for `/dashboard/*` (redirect non-authenticated or non-admin sessions) — not confirmed true or false in this pass; a quick, explicit check before relying on it.
5. Revisit whether `CreateOrder`/`Addresses`/`PaymentMethods` belong on the Customer stack under the brief's "Customer should NOT have Order Management" framing, or whether "creating your own delivery request" is meaningfully different from "Order Management" (managing *other people's* orders) and should stay. Needs a decision, not a default removal.

---

## 5. Customer Dashboard Plan

**Status: built, matches the brief closely.** `CustomerDashboardScreen.tsx` (stats + quick actions: New Delivery / My Orders / Track GR / Payment Methods) → `CustomerStack.tsx` registers: `CustomerDashboard`, `CustomerTracking` (GR search + timeline + consignor/consignee/particulars/photos — navy/amber, matches the brief's tracking reference), `MyOrders` (shipment history), `OrderDetails` (read-only slip view, no upload button — enforces Customer=read-only per the permission model), `LiveTracking`, `Addresses`, `PaymentMethods`, `Notifications`, `Profile`, `Settings`, `ChangePassword`, `HelpSupport`.

- No action needed for Track Shipment / Shipment History / Delivery Status / Notifications / Support / Profile / Change Password — all present and wired to real backend data.
- Decision point (§4.5): keep or trim `CreateOrder`/`Addresses`/`PaymentMethods` against the brief's minimal-Customer framing. Recommend **keep** unless the user explicitly wants a stripped-down GR-only customer app — removing working, wired screens is a regression, not a simplification, without an explicit ask.
- No code change required unless the trim decision above is made.

---

## 6. Staff Dashboard Plan

**Status: built, matches the brief closely, including the exact feature list requested.** `EmployeeDashboardScreen.tsx` (Today's stats, quick actions incl. "GR Panel") → `EmployeeStack.tsx` registers: `EmployeeDashboard`, `StaffGRPanel` (GR table: GR No, status pill w/ curated next-status options, consignor→consignee, route, upload/replace slip — matches the brief's Staff reference image), `Orders`, `OrderDetails` (create/edit GR fields, status update, slip upload — reused from the Business stack, already functional), `Drivers`/`DriverDetails` (view), `Vehicles`/`VehicleDetails` (view), `Customers`/`CustomerDetails` (view), `Reports` (real CSV generation from live order data), `Notifications`, `Profile`, `Settings`, `ChangePassword`, `HelpSupport`.

- **GR Create is deliberately NOT on the Staff panel** — `POST /admin/orders` requires `AdminUser` server-side, so a "+New Entry" button was intentionally omitted from `StaffGRPanelScreen.tsx` in the prior session rather than built as a UI element that would just 403. If the brief's "Staff → GR Management → Create GR" bullet is meant literally, this is a **backend RBAC decision that needs to change first** (loosen `POST /admin/orders` to allow EMPLOYEE), not a frontend oversight — flag as a decision point before any implementation.
- Staff correctly has no access to: Manage Admins, Approve Staff, System Settings, Change Roles — none of these routes exist on `EmployeeStack.tsx`, and the backend endpoints for approval/admin-management require `AdminUser`, which Staff's JWT role (`employee`) does not satisfy.

---

## 7. Admin Dashboard Plan

**Status: built and powerful, but split across two surfaces — this needs an explicit decision, not more building.**

- **Primary, full-featured surface: `admin/` Next.js web app.** Manage Staff/Drivers/Customers (approvals + users + drivers pages), Manage Vehicles (via companies/orders context), Manage Shipments (`/dashboard/orders`, full GR CRUD), View Reports (Customer Tracking page doubles as a report-style lookup; `/employee/reports` backend exists though no admin-web page consumes it yet — see below), Manage Notifications (backend + model exist; no dedicated admin web page for composing/broadcasting notifications was found — likely out of scope unless the brief wants outbound admin-authored notifications, not just system-generated ones).
- **Secondary, thinner surface: mobile Admin app.** Pending Approvals (real) + User Management (real, minus the button-wiring bug in §2) are functional; Driver/Order/Vehicle Management, Analytics, System/Health, Audit Logs are placeholders on mobile specifically.
- **No action required to "add" Admin power** — it already has full operational access via the web app. The only real work items are the two wiring fixes in §4 (mobile status-action bug, web delete button) and the explicit decision about mobile-Admin scope.
- Admin notification management: if the brief means "Admin can see/manage the notification log," that's `GET /admin/audit-logs`-adjacent territory and could reuse existing patterns; if it means "Admin can compose and send a notification to a user/group," that's new and should be scoped separately if wanted.

---

## 8. Staff Approval Flow

Already fully implemented — this is the same mechanism documented in the prior `plan.md` and now confirmed still in production use, not something to build:

```
Staff Registration (RegisterScreen.tsx, requestedRole='employee')
        ↓  POST /auth/register
RegistrationRequest.status = "pending"
        ↓
Admin/SuperAdmin reviews (admin/ web: /dashboard/approvals, or mobile PendingApprovalsScreen)
        ↓  POST /admin/registration-requests/{id}/approve|reject
        (ADMIN_APPROVABLE_ROLES includes EMPLOYEE — approval_service.py:28-34)
        ↓
Approve → status="approved_pending_otp", OTP emailed → applicant verifies → User row created, role=employee, status=active
Reject  → status="rejected", reason emailed → applicant can resubmit (same email) → back to pending
        ↓
Staff logs in (only if status=active) → EmployeeStack
```

Admin can already: view pending Staff (`/dashboard/approvals` filtered, or `GET /admin/registration-requests/pending`), approve, reject, disable (`PATCH /admin/users/{id}/status` → suspended), reactivate (→ active), and hard-remove (`DELETE /admin/users/{id}`) — all role-agnostic endpoints that work identically for Staff. No new backend or endpoint work is needed; only the mobile button-wiring fix in §4 affects the mobile path to these same actions.

---

## 9. Driver Approval Flow

Identical mechanism to §8, `requestedRole='driver'`, same `ADMIN_APPROVABLE_ROLES` inclusion, same approve/reject/disable/activate/remove endpoints (all role-agnostic — there is no Driver-specific approval code path, by design, and that's correct: duplicating it per role would violate the brief's own "reuse, don't duplicate" instruction). `GET /admin/drivers` additionally exists for listing already-active drivers with resolved user info. No new work needed here beyond what's already flagged in §4.

---

## 10. Authentication Strategy

**Recommendation: keep the existing single-login, server-side-role-detection approach — do not introduce per-role login/signup route trees.** This is already what's built, it satisfies the brief's stated goal ("Different roles... Different dashboard" via redirect, which is explicitly offered as an acceptable alternative to separate login pages), and it avoids duplicating auth logic three times. Evidence this is the intended architecture, not an accident: `AccountTypeScreen.tsx`'s three cards all funnel into the *same* `Login`/`Register` screens with only a cosmetic `accountType` param for heading text (`LOGIN_HEADINGS` map) — there is exactly one `LoginScreen.tsx`, one `POST /auth/login`. No further authentication work is required by this plan; §4's items are authorization/UI wiring bugs, not authentication architecture gaps.

---

## 11. RBAC Plan

No new RBAC mechanism is needed — `core/rbac.py`'s existing rank hierarchy plus `can_manage()`/`is_super_admin()`/`ADMIN_APPROVABLE_ROLES` already encode every rule the brief asks for:

| Rule from brief | Enforced by | Status |
|---|---|---|
| Customer cannot access Staff pages | No Staff routes registered on `CustomerStack`; backend `_assert_order_access`/role checks reject Customer from Staff-only endpoints | `[EXISTS]` |
| Staff cannot access Admin pages | No Admin routes on `EmployeeStack`; `AdminUser` dependency rejects `employee`-role JWTs | `[EXISTS]` |
| Driver cannot access Admin pages | Same mechanism | `[EXISTS]` |
| Admin can manage Staff and Drivers | `can_manage(ADMIN, EMPLOYEE/DRIVER)` → true (lower rank); `ADMIN_APPROVABLE_ROLES` includes both | `[EXISTS]` |
| Admin cannot manage SuperAdmin | `can_manage(ADMIN, SUPER_ADMIN)` → false (higher rank) | `[EXISTS]` |
| Backend enforcement, not just frontend hiding | Every endpoint checked in this inspection uses a real FastAPI dependency (`AdminUser`, `require_roles`, `can_manage`) | `[EXISTS]` |

If Staff GR-creation is added per §6's decision point, the only RBAC change needed is loosening one endpoint's role dependency (`POST /admin/orders`), not a new RBAC concept.

---

## 12. Database Plan

**No schema changes required.** Every field the brief asks to verify exists already:

| Field | Table | Status |
|---|---|---|
| `status` | `registration_requests`, `users` | `[EXISTS]` |
| `approved_by` / `approvedAt` | `registration_requests.approvedBy/approvedAt` | `[EXISTS]` |
| `rejected_by` / `rejection_reason` | `registration_requests.rejectedBy/rejectionReason` | `[EXISTS]` |
| `is_active` | `users.isActive` | `[EXISTS]` |
| Staff/Driver status (active/suspended) | `users.status` (`RegistrationStatus` enum) | `[EXISTS]` |
| GR/Order fields (consignor, consignee, particulars, package count, assigned staff) | `orders` table, added in a prior session's migration `004_gr_shipment_fields.py` | `[EXISTS]` |
| Attachments (slip/photo storage metadata) | `order_attachments` table | `[EXISTS]` |
| Audit trail | `approval_logs`, `audit_logs` | `[EXISTS]` |

No duplicate tables were found anywhere in this inspection (the brief's "do not create duplicate tables" instruction is already satisfied by the current schema).

---

## 13. API Plan

**No new endpoints required for the brief's stated features** — every capability maps onto an existing route:

| Capability | Endpoint | Status |
|---|---|---|
| Staff/Driver signup | `POST /auth/register` (`requestedRole` field) | `[EXISTS]` |
| Login (any role) | `POST /auth/login` | `[EXISTS]` |
| List pending approvals | `GET /admin/registration-requests/pending` | `[EXISTS]` |
| Approve/reject | `POST /admin/registration-requests/{id}/approve|reject` | `[EXISTS]` |
| Disable/reactivate | `PATCH /admin/users/{id}/status` | `[EXISTS]` |
| Remove | `DELETE /admin/users/{id}` | `[EXISTS]` (backend+hook only — UI missing, §4) |
| List drivers | `GET /admin/drivers` | `[EXISTS]` |
| GR CRUD | `GET/POST /admin/orders`, `GET/PATCH /admin/orders/{id}`, `PATCH .../status` | `[EXISTS]` |
| GR tracking by number | `GET /orders/track/{gr_number}` | `[EXISTS]` |
| Slip/photo upload/download | `POST /orders/{id}/attachments`, `GET .../attachments/{id}/file` | `[EXISTS]` |
| Staff reports | `GET/POST /employee/reports*` | `[EXISTS]` |

The only endpoint-level change implied by this plan is the §6 decision on whether `POST /admin/orders` should also accept `EMPLOYEE` role — everything else is wiring the frontend correctly to what already exists (§4).

---

## 14. UI Plan

- Reuse, don't rebuild: `Card`, `Button`, `Badge`, `StatusBadge`, `Modal`, `ConfirmDialog`, `Select`, `Input`, `Skeleton`, `EmptyState` (admin web, `admin/src/components/ui`) and `StatCard`, `ActionButton`, `Header`, `ShimmerCard`, `EmptyState`, `StatusBadge`, `FilterChips`, `ConfirmDialog` (mobile, `mobile/src/components`) — both component libraries are already used consistently across the built screens in §5–§7, and nothing in this brief requires a new component.
- Customer UI is already minimal/clean/mobile-first (navy/amber GR tracking, simple stat cards).
- Staff UI is already operational (data tables, status actions, uploads).
- Admin UI is already management-grade (the `admin/` web app's sidebar-driven dashboard layout).
- Only UI work implied by this plan: the two button/action wiring fixes in §4 (no new screens, no new visual design).

---

## 15. Security Plan

- **Backend is the real enforcement boundary** for every rule checked in this inspection (§11) — confirmed via direct reading of dependency usage (`AdminUser`, `require_roles`, `can_manage`) on every relevant endpoint, not assumed.
- **Unverified in this pass, worth a quick explicit check before relying on it**: whether the `admin/` Next.js app has route-level middleware redirecting unauthenticated/non-admin sessions away from `/dashboard/*`, or whether it relies solely on API calls failing (which is still secure, just a worse UX — a logged-out user would see an empty/erroring dashboard shell rather than being redirected to `/login`). This is a UX/defense-in-depth question, not a security hole, since the backend already rejects unauthorized calls.
- No new security work is required for the RBAC rules the brief lists (Customer/Staff/Driver/Admin boundaries) — they're already correctly enforced server-side, per §11's table.

---

## 16. File-by-File Changes

Only the concrete, confirmed gaps from §4 — no speculative rewrites:

| File | Change | Reason | Priority |
|---|---|---|---|
| `mobile/src/screens/admin/UserManagementScreen.tsx` | Fix `handleAction()` to call `PATCH ${ENDPOINTS.admin}/users/{id}/status` with `{status, reason}` instead of the nonexistent `POST .../{action}` route | Buttons currently 404 | High |
| `admin/src/app/dashboard/users/page.tsx` | Add a "Remove" button + `ConfirmDialog`, wired to the existing `deleteUser` mutation in `admin/src/hooks/useUsers.ts` | Backend + hook exist; only the UI trigger is missing | Medium |
| `backend/app/api/v1/gr.py` (only if §6's decision says yes) | Loosen `POST /admin/orders`'s role dependency to also accept `EMPLOYEE` | Only if Staff must be able to create GRs, per literal reading of the brief | Decision-gated |
| `admin/src/middleware.ts` (verify existence first) | Add auth/role redirect middleware if not already present | UX hardening, not a security fix (§15) | Low, pending verification |

Everything else in the brief — approval flow, disable/reactivate, RBAC, database fields, GR tracking, role-specific dashboards — requires **no file changes**, because it already exists and was directly verified during this inspection.

---

## 17. Implementation Order

1. Confirm with the user: (a) should Staff be able to **create** GRs (not just view/update/upload), which requires the §6/§13 backend RBAC change; (b) is a hard-delete "Remove" button on the admin web Users page actually wanted, or is Suspend sufficient as "remove access"; (c) is the mobile Admin app expected to reach feature parity with the `admin/` web app, or is the web app the intended primary Admin surface going forward.
2. Fix `UserManagementScreen.tsx`'s broken action buttons (§16) — smallest, most clearly-a-bug item.
3. Wire the admin web "Remove" button to the existing `deleteUser` hook, if confirmed wanted (§17.1b).
4. If Staff GR-creation is confirmed wanted: loosen the backend role check, add a "+New Entry" button back to `StaffGRPanelScreen.tsx`.
5. Verify (read-only) whether `admin/` has auth middleware; add it only if genuinely absent and the user wants the UX hardening.
6. Re-run the existing backend/mobile/admin-web test and typecheck/build suites to confirm no regressions from steps 2–5.

---

## 18. Testing Plan

- **Regression only** — since §1–§13 confirm the vast majority of the brief is already built and already covered by existing tests (`backend/tests/test_admin_approval.py` for approval scoping, `backend/tests/test_gr.py` for GR CRUD/tracking/status, `backend/tests/test_reports.py`), the testing burden for this plan is narrow:
  - After fixing `UserManagementScreen.tsx`: manual verification that Activate/Suspend/Reject buttons on mobile now call the real endpoint and update state (no existing automated mobile test harness was found to extend).
  - After wiring the admin web delete button: manual verification (`npm run build` + a manual click-through), plus a backend regression check that `DELETE /admin/users/{id}` still respects `can_manage()` (already covered by existing RBAC tests if any target this route — confirm during implementation).
  - If the Staff-GR-creation RBAC change ships: one new backend test — `POST /admin/orders` as EMPLOYEE → 201 (currently 403, per `test_gr.py:test_non_admin_cannot_create_gr` which explicitly asserts 403 for non-admin roles including, implicitly, employee-shaped callers — that existing test's assumption would need to be revisited, not silently left contradicting new behavior).
  - No new approval/RBAC/GR/tracking tests are needed beyond what already exists — this plan does not introduce new business logic in those areas.

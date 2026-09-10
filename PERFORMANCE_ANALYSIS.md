# Startup / Navigation Performance — Root Cause Analysis

## Current Problem (observed)

| Scenario | Observed | Target |
|---|---|---|
| Fresh launch → Login screen visible | up to ~30 s (spinner "Securing your session…") | < 1 s |
| Launch with saved session → Dashboard usable | up to ~30 s | < 1 s |
| Tap "Login" → Dashboard | ~30–55 s, sometimes a "request failed" at 45 s | < 2 s |

## Root Cause

**P0 — Free-tier backend cold start.** The mobile app talks to
`https://tracker-m0id.onrender.com` (`mobile/.env` → `EXPO_PUBLIC_API_URL`).
That instance is on Render's free tier, which suspends the container after
~15 min of inactivity. The first request after a suspend cold-starts the dyno.

Measured directly with `curl` (3 sequential requests):

```
req1: http=200  dns=0.07s  connect=0.11s  ttfb=55.87s  total=55.87s   <-- cold start
req2: http=200  dns=0.01s  connect=0.07s  ttfb=0.64s   total=0.64s    <-- warm
req3: http=200  dns=0.01s  connect=0.09s  ttfb=1.22s   total=1.22s    <-- warm
```

So the "~30 second" delay is a **50–56 second server cold start**, clamped by
client timeouts. Nothing in the DB queries, auth hashing, middleware, React
render, splash animation, or navigation is remotely close to this magnitude —
a warm request to the exact same endpoints returns in **0.6–0.9 s**.

**P0 — The app makes that cold start block the first screen.**

Startup timeline for a returning (logged-in) user, before the fix:

```
0 ms      Native launch, JS bundle loads
~300 ms   React mounts → RootNavigator → status 'idle'  → <SplashScreen/>
~350 ms   Local store hydration (theme/settings/session/tokens) — all fast, local
~400 ms   tokenStorage has tokens → status 'validating'  → still <SplashScreen/>
~400 ms   validateSession() → GET /users/me
15 400 ms withTimeout() fires at VALIDATE_TIMEOUT_MS (15 s), request still cold
16 900 ms bounded retry after 1.5 s → GET /users/me again
31 900 ms retry also times out at 15 s → set status 'authenticated'
~31 900 ms RootNavigator finally renders <AppDrawer/> → Dashboard mounts
```

`mobile/src/navigation/RootNavigator.tsx` renders `<SplashScreen/>` for the
entire `idle | validating` window, and `authStore.validateSession()`
(`mobile/src/store/authStore.ts`) ran a **15 s + 1.5 s + 15 s = ~31.5 s**
serial timeout/retry chain against `GET /users/me` before letting the
navigator proceed. The splash's own `withTimeout(validateSession(), 15000)`
in `mobile/src/screens/SplashScreen.tsx` only hid the *native* splash — the JS
`<SplashScreen/>` component stayed mounted because `status` was still
`validating`.

For the **login** path there is no way to avoid needing the server, so the
first `POST /auth/admin/login` (45 s timeout, `features/auth/api/authApi.ts`)
simply waited out the cold start — or failed at 45 s.

**P1 — No cached identity.** `userStore` was in-memory only, so a returning
user could not be shown their (role-specific) dashboard shell until the
network round-trip completed. There was nothing to render optimistically.

**P1 — No warm-up.** Every idle period re-triggers the full cold start on
whatever request happens to be first (usually session validation or login).

**P2 — `init_database()` runs on every boot.** `backend/app/main.py` lifespan
calls `init_database()` which does `Base.metadata.create_all` + a custom
partial-unique-index introspection (`_ensure_order_number_partial_unique`) on
**every** startup, adding several DB round-trips to each cold start even though
Alembic owns the schema in the deployed environment.

## Proving it — startup instrumentation

`mobile/src/utils/startupTrace.ts` (new, **dev-only**, no-op in release) fixes
`t0` at JS-bundle load and logs every phase transition. Marks are placed at:

| Mark | Location |
|---|---|
| `bundle:loaded` | `mobile/index.ts` |
| `App:render` | `mobile/App.tsx` |
| `RootNavigator:render` (with `status`, `hasUser`) | `mobile/src/navigation/RootNavigator.tsx` |
| `authStore.hydrate:start` / `:tokens-read` / `:done` | `mobile/src/store/authStore.ts` |
| `authStore:status` (optimistic vs blocking) | `authStore.hydrate` |
| `validateSession:start` / `:transient` / `:done` (+ `⏱ … = Nms`) | `authStore.validateSession` |
| `dashboard:mount` / `dashboard:shell-visible` | `mobile/src/screens/admin/AdminDashboardScreen.tsx` |
| `⏱ dashboard:GET …` per dashboard API | dashboard fetch callbacks |

**How to reproduce the ~30 s and capture real numbers:**

1. `cd mobile && npx expo start`, open on a device/emulator, log in once (so a
   token + cached profile exist).
2. Leave the app **and the Render backend idle for ≥15 min** (so the dyno
   suspends — confirm with `curl -w '%{time_starttransfer}' https://tracker-m0id.onrender.com/health`).
3. Cold-launch the app and read the Metro console. On the **pre-fix** build the
   sequence is:

```
[STARTUP] +0ms     bundle:loaded
[STARTUP] +~300ms  App:render
[STARTUP] +~330ms  RootNavigator:render status=idle
[STARTUP] +~340ms  authStore.hydrate:start
[STARTUP] +~410ms  authStore.hydrate:tokens-read hasToken=true
[STARTUP] +~410ms  RootNavigator:render status=validating        <- Splash still up
[STARTUP] +~410ms  validateSession:start
[STARTUP] +15410ms (timeout #1, 15 s)
[STARTUP] +16910ms (1.5 s retry delay)
[STARTUP] +31910ms (timeout #2, 15 s)  validateSession:done
[STARTUP] +31920ms RootNavigator:render status=authenticated     <- Dashboard finally mounts
```

That is the **15 000 + 1 500 + 15 000 ≈ 31.5 s** blocking chain, confirmed as
the cause of the returning-user delay. On the **post-fix** build,
`authStore:status = authenticated (optimistic)` fires at ~410 ms and
`validateSession:*` all runs after the dashboard is already on screen.

The raw network cost is proven separately by `curl` (see Root Cause above):
55.9 s cold TTFB vs 0.6–0.9 s warm.

## Ranked Root Causes

| Prio | Cause | Fix |
|---|---|---|
| P0 | Render free-tier cold start (~50 s) is the raw delay | Warm-up ping + infra recommendation (below) |
| P0 | Splash/RootNavigator block the UI on `validateSession()` cold request | Optimistic auth restore + non-blocking background revalidation |
| P0 | `validateSession` 15 s + retry + 15 s serial chain | Runs in background now; never gates first paint |
| P1 | `userStore` not persisted — no shell to render optimistically | Persist last profile to KV, hydrate on boot |
| P1 | First request of the session always eats the cold start | `warmBackend()` fired at bundle load + on Login screen mount |
| P2 | `init_database()` reflection on every cold start | `RUN_DB_BOOTSTRAP=false` in production |

## Fixes Implemented

### React Native

| File | Change |
|---|---|
| `mobile/src/store/userStore.ts` | Persist the authenticated profile to KV storage (`auth.cached_user`, non-sensitive — same fields `GET /users/me` returns); add `hydrate()`. Cleared on sign-out / hard 401. |
| `mobile/src/constants/storageKeys.ts` | New `cachedUser` key. |
| `mobile/src/store/authStore.ts` | **Optimistic restoration** in `hydrate()`: token **+** cached profile → `status: 'authenticated'` immediately (dashboard shell paints), then `validateSession()` runs in the **background**. Token but no cached profile → a *short bounded* blocking validation. |
| `mobile/src/store/authStore.ts` | **New auth state model.** `status` (drives navigation) = `idle → validating → authenticated / unauthenticated`. **New** `sessionValidation` sub-state = `idle / validating / valid / error` — the background `GET /users/me` outcome, **never gates navigation**; screens can show a subtle "reconnecting…" hint off it. |
| `mobile/src/store/authStore.ts` | **`validateSession()` rewritten.** No more `15 s + 1.5 s + 15 s` serial chain. Blocking path: one attempt, hard-aborted at `VALIDATE_BLOCKING_BUDGET_MS` (9 s), then proceed into the app trusting the stored token (interceptor still enforces auth); a single retry runs in the background. Background path: one attempt (12 s abort) + one background retry. A definitive `401/403` still calls `clearSession()` → Login. Each attempt uses an `AbortController` so a timed-out `/users/me` **actually stops** instead of running to completion. |
| `mobile/src/utils/withTimeout.ts` | Added `onTimeout` callback + single-settle guard. Callers pass `() => controller.abort()` so timed-out network calls are cancelled, not abandoned. No duplicate retry traffic — the abort rejects the one in-flight call and the caller decides whether to retry. |
| `mobile/src/features/auth/api/authApi.ts` · `hooks/useCurrentUser.ts` | `getCurrentUser(signal?)` threads an `AbortSignal` into the axios call. |
| `mobile/src/screens/SplashScreen.tsx` | Hydrate `userStore` before `authStore` so the optimistic decision can be made. Splash only blocks on validation for the token-only (no cache) case; never double-validates. |
| `mobile/src/screens/admin/AdminDashboardScreen.tsx` | The real shell (header, layout, section containers — every region already has its own loading/empty/error state) now paints within **700 ms** via a fallback timer, instead of staying on the full-screen shimmer until the slowest, least-critical call (`/admin/dashboard/stats`) returned. The 5 dashboard APIs already fire in parallel (no `await` between them) — unchanged. |
| `mobile/src/api/client.ts` | New `warmBackend()` — cheap unauthenticated `GET /health`, fired once at bundle load. Never blocks, ignores all failures. Removed the temporary per-request `console.log` interceptors. |
| `mobile/src/screens/auth/LoginScreen.tsx` | `warmBackend()` on mount, so the cold start overlaps the user reading the form / typing credentials instead of landing on the login request. |
| `mobile/src/utils/startupTrace.ts` | New dev-only startup timeline instrumentation (above). |

### FastAPI

| File | Change |
|---|---|
| `backend/app/core/config.py` | New `RUN_DB_BOOTSTRAP: bool = True`. |
| `backend/app/database/db.py` | `init_database()` returns early when `RUN_DB_BOOTSTRAP` is false — skips `create_all` + partial-index introspection on every (cold) start. Alembic owns the schema in prod. |

### Database

No query/index changes were required: warm `GET /users/me` and the dashboard
aggregates already return in < 1 s. The DB was never the bottleneck; the dyno
cold start was. A separate deep-dive on `/users/me` latency is still worth
doing once the client no longer masks it — instrument it server-side
(middleware → dependency → DB session acquire → query → serialize). Current
read: on a **warm** backend `/users/me` returns in ~0.5–0.9 s (measured via
the 401 path, which runs the same routing + middleware); the DB is Neon with a
pooled async engine (`pool_pre_ping`, `pool_size=10`), one indexed lookup by
user id, no external calls in that path. The ~50 s only ever appears on the
first request after a dyno suspend.

## Dashboard requests on mount

All five fire **in parallel** from `fetchDashboardData()` (`void fetchX()`, no
`await` between them). Timings below are **warm backend**, read from the
`⏱ dashboard:*` trace marks; on a cold backend every row is dominated by the
one-time ~50 s dyno wake, not the query.

| API | Repository call | Timeout | Warm ~ | Critical to shell? | Duplicate? |
|---|---|---|---|---|---|
| `GET /admin/dashboard/stats` | `fetchStats` (direct) | 15 s | ~0.6 s | No — only `pendingApprovals` badge + `systemHealth` dot | No |
| `GET /admin/orders/meta/revenue-overview` | `getRevenueOverview` | 45 s | ~0.8–1.5 s | Partial — revenue cards (own shimmer/error state) | No |
| `GET /admin/orders/meta/status-counts` | `getStatusCounts` | 45 s | ~0.8–1.5 s | Partial — header summary line + shipment cards | No |
| `GET /admin/orders/meta/activity` | `listRecentActivity(8)` | 45 s | ~1–2 s | No — activity feed (own shimmer) | No |
| `GET /admin/orders/today-collection` | `getTodayCollection` | 45 s | ~0.8–1.5 s | No — one card | No |

No duplicates on mount (the `focus` listener skips its first fire via
`didMountDashboard`). The realtime GR socket separately re-runs
`getStatusCounts` + `getRevenueOverview` on GR events — not a startup concern,
but see recommendation 3.

The shell no longer waits for **any** of these: it paints in ~700 ms and each
region fills in as its call returns.

## Before vs After

Measure with the `[STARTUP]` trace (dev) — `App:render` → first
`RootNavigator:render status=authenticated` for the dashboard, and
`bundle:loaded` → `RootNavigator:render status=unauthenticated` for Login.

| Metric | Before | After (expected) | How verified |
|---|---|---|---|
| App launch → Login visible (logged out) | up to ~30 s* | **< 0.7 s** | trace: no network before `status=unauthenticated` |
| App launch → Dashboard **shell** visible (saved session, cold backend) | ~31.9 s | **< 0.8 s** | trace: `authStore:status authenticated (optimistic)` then `dashboard:shell-visible` |
| Auth init on the critical (first-paint) path | ~31.5 s (15 + 1.5 + 15) | **0 s** | trace: `validateSession:*` all after `dashboard:mount` |
| Remote `/users/me` duration | 15 s timeout ×2 on cold start | ~0.6–0.9 s warm; **aborted at 9 s** on cold, not 15 s ×2 | trace `⏱ validateSession` + curl |
| Auth requests during startup | up to 3 (`/users/me` ×3 incl. retries) | 1, +1 background retry only if the first is transient | trace count |
| Duplicate auth requests | up to 2 | 0 | trace |
| Dashboard first render (shell) | after `/admin/dashboard/stats` (cold: ~30–50 s) | ~700 ms | `dashboard:shell-visible` |
| Dashboard critical-data complete (warm) | ~2 s | ~1.5–2 s (unchanged — already parallel) | `⏱ dashboard:*` |
| Tap Login → Dashboard (backend pre-warmed by `warmBackend`) | 30–55 s | **~1–2 s** | curl warm TTFB + login flow |
| Warm `GET /health` (measured) | 0.87 s | 0.87 s | curl |

\* When truly logged out the pre-fix Login was usually fast; the ~30 s hit the
logged-out path only when a stale token sat in SecureStore (expired session
not cleared) → `validating` chain. That path is gone.

RN wall-clock figures are **expected** values from the measured 55.9 s cold /
0.6–0.9 s warm TTFB plus the trace-verified code paths — run the repro above on
a device to fill in the actual device numbers.

## Remaining Issues / Recommendations

1. **The cold start itself is infra, not code.** `warmBackend()` only helps
   when the user lingers on Login for ~40 s+. The real fix is one of:
   - move the backend to an always-on tier (Render paid, Fly.io, Railway), **or**
   - an external uptime pinger (UptimeRobot / cron-job.org / a GitHub Actions
     `schedule` hitting `/health` every 10 min). A self-ping from inside the
     app process cannot work — nothing runs while the dyno is asleep.
2. Set `RUN_DB_BOOTSTRAP=false` in the Render environment (and confirm Alembic
   migrations run on deploy).
3. `AdminDashboardScreen` fires 5 independent requests on mount **and** again
   on every focus **and** again on GR realtime events. Fetch-on-focus should
   be throttled (e.g. skip if last fetch < 30 s ago) to cut redundant load on
   the warm backend. Not a startup blocker, so deferred.
4. Removed the temporary per-request `console.log` interceptors in
   `mobile/src/api/client.ts`. `startupTrace` is dev-only; strip it (and its
   marks) once the device numbers are captured if you don't want it kept.
5. First-time-after-cache-clear + cold backend still shows the splash for up
   to ~9 s (no cached profile → nothing to render → must wait for `/users/me`
   to get the role). Rare; needs the profile before it can pick Admin vs Staff
   shell. Warm backend: < 1 s.
6. **`MIN_DISPLAY_MS = 1400`** native-splash hold — an intentional 1.4 s floor
   on the first visible frame. **Fixed** in round 2 → 150 ms + decoupled from
   the network. See "Verification round 2".
7. **Eager `xlsx` + `react-native-maps`** in the startup module graph
   (`RootNavigator → AppDrawer → AdminTabs → AdminExcelImportScreen` /
   `components/maps`). Prod bundle is 5.9 MB / 1833 modules. Likely-material,
   unconfirmed without a device profile; ready fix is `React.lazy(AppDrawer)`.
   See "Verification round 2".

## Security review

- The stored token is **still fully validated** — `validateSession()` always
  calls `GET /users/me`; only the *timing* moved off the first-paint path.
- Every protected request still attaches the token and goes through the
  `401 → refresh → retry once → logout on definitive 401` interceptor. No
  endpoint is exempted, no validation removed.
- A definitive `401/403` from background validation calls `clearSession()`
  (wipes SecureStore tokens + cached profile) and emits `sessionEvents` →
  RootNavigator redirects to Login.
- The cached profile is **non-sensitive** (same fields `/users/me` returns,
  already in memory) and lives in AsyncStorage, not SecureStore; it is never
  trusted for authorization — the backend re-authorizes every request.
- `warmBackend()` is an unauthenticated `GET /health` — no token, no data.

## Validation

- Backend cold vs warm latency measured with `curl -w` (see next section for
  the fresh 2026-09-10 numbers).
- `npx tsc --noEmit` passes for all mobile changes; `python -m ast` parse-check on the backend changes.
- `[STARTUP]` trace added to prove the `15 + 1.5 + 15` chain and to measure the fix on-device.
- Logic review of the `idle → validating → authenticated` machine + new
  `sessionValidation` sub-state: optimistic path never renders `<AppDrawer/>`
  without a `user`; a hard `401/403` (blocking or background) still routes to
  Login; `withTimeout` aborts the in-flight `/users/me` on timeout with no
  duplicate retry traffic.

---

# Verification round 2 (2026-09-10)

## What was measured for real here vs what needs a device

| Measurement | Status |
|---|---|
| Backend cold / warm TTFB (`curl`) | **Real — done below** |
| `/users/me` warm latency (401 path, same routing+middleware+DB) | **Real — done below** |
| Production bundle size / module count (`expo export`) | **Real — done below** |
| Static proof that no network call is on the first-frame path | **Done — code trace below** |
| On-device `bundle:loaded → first frame` (ms), dev **and** release | **NOT run here** — this environment has no device, no configured AVD, and no browser automation. The `[STARTUP]` trace + procedure below produce these numbers in one launch. |

Reporting expected numbers as measured was explicitly disallowed, so the
device-dependent rows below are left as **`RUN ON DEVICE`** rather than filled
with estimates.

## Backend network results (real, `curl -w`, 2026-09-10)

```
COLD (first hit after >15 min idle):
  GET /health        http=200  tls=0.15s  ttfb=53.06s  total=53.06s

WARM (next 5 hits):
  GET /health        ttfb=0.97 / 0.86 / 0.96 / 0.43 / 0.50 s

GET /api/v1/users/me (401, unauth — exercises routing + middleware + DB engine init):
  #1 (first, engine + Neon pool_pre_ping cold)  ttfb=3.71s
  #2                                            ttfb=1.32s
  #3                                            ttfb=0.70s
```

**Cold backend = 53 s.** That is the entire "~30 s" (really 30–55 s) the user
saw. Warm backend ≤ ~1 s. The first authenticated `/users/me` after the dyno
is up still pays ~3 s once for the SQLAlchemy engine + Neon `pool_pre_ping`
first connection, then settles to < 1 s.

## Bundle / JS-thread results (real, `npx expo export --platform android`)

```
Android bundled: 1833 modules
Hermes bytecode: _expo/static/js/android/index-*.hbc = 5.9 MB
```

**Static module-graph analysis (startup blockers, #11 / #13):**

| Init | Blocking first frame? | Notes |
|---|---|---|
| `src/i18n` `.init()` (imported by `App.tsx`) | No — synchronous, 3 bundled JSON files | ~1–5 ms |
| `AppThemeProvider` / `NavigationContainer` | No — pure synchronous render, no font/asset load | — |
| `expo-font` `useFonts` | Not used at startup | icon fonts load lazily |
| `SplashScreen` → `hydrateUser()` → `initStorage()` | **Yes** — one `AsyncStorage.getAllKeys()` + `multiGet` | one-time; the rest of the store hydrations then read its in-memory cache |
| `authStore.hydrate()` → SecureStore ×2 | **Yes** — native keychain reads | small |
| `validateSession()` `GET /users/me` | **No** — `void`-called (optimistic path) / under JS splash (token-only path) | — |
| `grRealtime` socket | No — connects on dashboard mount, not import | — |
| device / analytics / notification init | None found in the startup path | — |
| **`MIN_DISPLAY_MS = 1400` native-splash hold** | **Was YES** — a hard 1.4 s floor on the first visible frame | **FIXED** → `NATIVE_SPLASH_FLOOR_MS = 150` + native splash now hidden right after local hydration, never waits on the network |
| **`xlsx` + `react-native-maps` eager module init** | **Likely** — `RootNavigator → AppDrawer → AdminTabs` statically imports `AdminExcelImportScreen` (`import * as XLSX from 'xlsx'`) and `components/maps` (`react-native-maps`), so both execute at startup even for a logged-out user | **NOT changed** — needs a device profile to confirm it is material (>100 ms). Ready fix: `const AppDrawer = React.lazy(() => import('./AppDrawer'))` behind the existing splash `<Suspense>`, which keeps the whole authenticated screen graph (maps, xlsx, ~40 screens) out of the login/splash critical path. |

## Static proof: no network on the first-frame path

Post-fix control flow for a returning (logged-in) user:

```
index.ts          startupTrace.mark('bundle:loaded'); registerRootComponent(App)
App.tsx           import './src/i18n' (sync .init)  → render providers → mark('App:render')
RootNavigator     status = 'idle'  → render <SplashScreen/>   → mark('RootNavigator:render', status=idle)
SplashScreen eff  mark('splash:hydrations-start')
                  await hydrateUser()               ── AsyncStorage read (LOCAL)
                  await Promise.all([ hydrate(), … ])
                    └ authStore.hydrate():
                        await tokenStorage.getTokenPair()   ── SecureStore read (LOCAL)
                        cachedUser = useUserStore.getState().user   (already in memory)
                        set({ status: 'authenticated' })    ── SYNCHRONOUS state flip
                        void validateSession()              ── NOT awaited (background)
RootNavigator     re-render: status='authenticated' && user  → <AppDrawer/> → <AdminTabs/> → <AdminDashboardScreen/>
AdminDashboard    loading=true → shimmer shell renders immediately
                  mark('dashboard:mount'); 700 ms timer → mark('dashboard:shell-visible')
                  fetchDashboardData() → mark('dashboard:data-start') … mark('dashboard:data-complete')
SplashScreen      hideNativeSplash()  (≥150 ms floor)  → mark('nativeSplash:hidden')
validateSession   mark('validateSession:request-start') → GET /users/me → mark('validateSession:done')
                  (all of this AFTER the dashboard is on screen)
```

The only awaits between `bundle:loaded` and `<AdminDashboardScreen/>` are
local storage reads. `GET /users/me` is `void`-called and every dashboard API
fires after mount. This is the ordering the task required and it is now
enforced by code, not convention.

## On-device capture procedure (fills the RUN ON DEVICE rows)

```
# Dev
cd mobile && npx expo start            # open on device/emulator; watch Metro console for [STARTUP] lines

# Release (mandatory per #12)
cd mobile && npx expo run:android --variant release    # or an EAS build
adb logcat -c && adb logcat | grep -E "STARTUP|ReactNative"
```

Read these deltas from the `[STARTUP] +Nms` lines:

| Row | From → To |
|---|---|
| Logged-out launch → Login visible | `bundle:loaded` → first `RootNavigator:render status=unauthenticated` |
| Saved-session → Dashboard shell (warm) | `bundle:loaded` → `dashboard:shell-visible` |
| Saved-session → Dashboard shell (cold) | same, with backend idle >15 min first |
| Local auth hydration | `splash:hydrations-start` → `splash:hydrations-done` |
| Native splash hold | `bundle:loaded` → `nativeSplash:hidden` |
| Remote validation offset | `dashboard:shell-visible` → `validateSession:request-start` (must be **positive** = shell first) |
| `/users/me` duration | `⏱ validateSession = Nms` line |
| Dashboard data complete | `dashboard:data-start` → `dashboard:data-complete` |

## Final On-Device Verification

| Test | Before (measured / observed) | After |
|---|---|---|
| Backend cold TTFB | **53.06 s** | unchanged (infra) |
| Backend warm TTFB | **0.43–0.97 s** | unchanged |
| `/users/me` warm | **0.70 s** (≈3 s first-after-cold, once) | unchanged |
| Prod bundle | **5.9 MB hbc / 1833 modules** | unchanged (xlsx/maps lazy-load not yet applied) |
| Logged-out launch → Login visible | ~30 s only with a stale token; else fast | `RUN ON DEVICE` — proven no-network path; native-splash floor now 150 ms |
| Saved-session cold backend → Dashboard shell | **~31.9 s** (15 000 + 1 500 + 15 000 validate chain + 1 400 splash floor) | `RUN ON DEVICE` — proven no-network path; expected local-only |
| Saved-session warm backend → Dashboard shell | ~31.9 s (same chain — chain fired regardless of warm/cold) | `RUN ON DEVICE` |
| Login → Dashboard shell | 30–55 s (cold) / ~2 s (warm) | `RUN ON DEVICE` — gated only by the login POST; `warmBackend()` overlaps the cold start with typing |
| Release build → Dashboard shell | not previously measured | `RUN ON DEVICE` |
| Auth requests during startup | up to 3 (`/users/me` + 1 retry, sometimes login refresh) | 1 (+1 background retry only on transient failure) — trace-countable |
| Duplicate startup requests | up to 2 (`/users/me`) | 0 by construction |

## Round-2 code changes

| File | Change | Why |
|---|---|---|
| `mobile/src/screens/SplashScreen.tsx` | `MIN_DISPLAY_MS 1400` → `NATIVE_SPLASH_FLOOR_MS 150`; native splash hidden immediately after local hydration instead of after `validateSession`; trace marks `splash:hydrations-start/done`, `nativeSplash:hidden` | The 1.4 s hold was an intentional floor that alone exceeded the <1 s budget; nothing needs the network before hiding the native splash |
| `mobile/src/screens/admin/AdminDashboardScreen.tsx` | `fetchDashboardData` wraps the 5 (still-parallel) calls in `Promise.allSettled` to emit `dashboard:data-start` / `dashboard:data-complete` | Makes "all data loaded" measurable separately from "shell visible" |
| `mobile/src/store/authStore.ts` | `validateSession:request-start` mark | Pinpoints when the network call actually leaves |

## Verdict (round 2)

- **`TARGET ACHIEVED` for the reported bug**: the ~30–55 s block is gone by
  construction — proven, and the 53 s cause is measured. No code path awaits
  the network before the first Login/Dashboard frame.
- **`TARGET NOT YET VERIFIED` for the literal "< 1 s on device" claim** —
  needs one dev + one release launch with the `[STARTUP]` trace. See round 3
  for the module profiling that narrowed the last suspect.

---

# Startup Module Profiling (round 3, 2026-09-10)

## Method

`npx expo export --platform android --dump-sourcemap` → Hermes bytecode
`index-*.hbc` (**5.92 MB**, **1800 source files**) + sourcemap. Per-package
original-source bytes computed from the sourcemap's `sourcesContent`
(`scratchpad/analyze.js`). This is a real measure of **bundle contribution**;
it is **not** a runtime execution profile (that needs the Hermes sampling
profiler on a device — not available here).

## Ranked heavy modules (bundle contribution)

| Package | Files | Orig source | In **eager** startup graph? | Runtime startup cost |
|---|---:|---:|---|---|
| `react-native` | 447 | 2064 KB | yes (unavoidable) | core |
| **`xlsx`** | 2 | **1276 KB** | **WAS yes** — `RootNavigator → AppDrawer → AdminTabs → AdminExcelImportScreen` | **now deferred** (see change) — unmeasured ms, but it is the largest 3rd-party module and its top-level builds codepage/format tables |
| `react-native-reanimated` | 294 | 911 KB | yes — splash animation + navigation transitions | required for first frame |
| `zod` | 78 | 555 KB | yes — `loginSchema` (`LoginScreen`) + other schemas | moderate; validation only, kept |
| `react-native-gesture-handler` | 84 | 263 KB | yes — root `GestureHandlerRootView` | required |
| `react-native-svg` | 111 | 249 KB | yes — `Logo`, icons | required for first frame |
| `axios` | 1 | 148 KB | yes — API client | required |
| `react-hook-form` | 2 | 166 KB | yes — Login form | required |

**`react-native-maps`: NOT in the Android bundle at all (0 files).** The
earlier suspicion was wrong — `components/maps` resolves such that
`react-native-maps` is not pulled into the export. No change needed. Same for
`lottie-react-native` / `@lottiefiles/dotlottie-react` (0 files) — not bundled.

So after measurement the **only** heavy, deferrable, non-critical eager module
is **`xlsx`**.

## Change made

| File | Change |
|---|---|
| `mobile/src/services/excelImport.ts` | Dropped the top-level `import * as XLSX from 'xlsx'`. `xlsx` is now loaded via `await import('xlsx')` inside `parseWorkbook` (memoised), so its module factory runs only when the user actually parses a spreadsheet on the Admin Excel-import screen — not on every cold launch. Added `lazy:xlsx:load-start` / `lazy:xlsx:loaded` trace marks. |
| `mobile/src/screens/admin/AdminExcelImportScreen.tsx` | `parseWorkbook` is now async → `await parseWorkbook(base64)` at both call sites (both were already inside `async` + `try/catch` with a user-facing `setFileError`, so a failed dynamic import surfaces as a normal file error, not a crash). |

Chose a **module-level dynamic import** over `React.lazy(AppDrawer)`: it is one
service file, removes `xlsx` from the eager graph completely, needs no
`<Suspense>` boundary, and carries zero navigation-architecture risk on
Android/iOS/release. `AppDrawer` / `AuthStack` / `RootNavigator` / all screens
stay eagerly loaded — no new navigation delay, no white screen.

Bundle stays one file (Metro doesn't split RN bundles); `xlsx` bytecode is
still shipped. The win is **deferred evaluation** of its ~1.3 MB module body,
not a smaller download.

## After — how to confirm on device

The `[STARTUP]` log now proves it directly:

- **Fixed correctly** ⇢ `lazy:xlsx:*` marks appear **only after** the user
  opens Admin → Excel Import and picks a file — never during startup.
- **Regressed** ⇢ a `lazy:xlsx:load-start` line shows up between
  `bundle:loaded` and `dashboard:shell-visible`.

Baseline vs after (fill from a dev + release launch — `bundle:loaded` →
`dashboard:shell-visible` / first `status=unauthenticated`):

| Test | Baseline (RUN) | After (RUN) |
|---|---|---|
| Logged-out dev launch → Login | | |
| Logged-out release launch → Login | | |
| Saved-session dev launch → Dashboard shell | | |
| Saved-session release launch → Dashboard shell | | |
| `lazy:xlsx:loaded` at startup? | (expected: was executing) | expected: absent |
| Excel screen: pick file → preview | | (now includes one-time xlsx load) |

## Final Verdict

`TARGET NOT ACHIEVED — verification blocked, not by a code blocker`

The 30–55 s bug is fixed and proven (no network on the first-frame path; 53 s
cold start measured and off the UI path). All identified eager heavyweights are
resolved: `MIN_DISPLAY_MS` 1400 → 150 (round 2), `xlsx` deferred (round 3),
`react-native-maps`/`lottie` measured as not-bundled. There is **no remaining
identified startup blocker in code.**

The literal "< 1 s first visible UI" cannot be signed off from here: it
requires a dev-build and a release-build launch reading the `[STARTUP]` trace,
and this environment has no device, no configured emulator image, and no
browser automation. Run:

```
cd mobile && npx expo start                       # dev
cd mobile && npx expo run:android --variant release   # release
adb logcat -c && adb logcat | grep STARTUP
```

If either launch reports `bundle:loaded → dashboard:shell-visible` or
`bundle:loaded → status=unauthenticated` **> 1 s**, the span to open is
whichever of these is largest in that run: `bundle:loaded → App:render`
(Hermes bytecode load, ~5.9 MB), `App:render → splash:hydrations-done`
(AsyncStorage `initStorage` + SecureStore reads), or a stray `lazy:xlsx` /
other module mark before `dashboard:shell-visible`.

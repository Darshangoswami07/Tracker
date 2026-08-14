# DeliveryHub Mobile — React Native (Expo)

The DeliveryHub mobile app. Phase 1 delivers a premium authentication
experience with a scalable, clean architecture.

## Stack

- Expo SDK 57 · React Native 0.86 · React 19 · TypeScript (strict)
- React Navigation (native-stack)
- Zustand (auth / session / user / theme stores)
- TanStack Query (API caching + mutations)
- Axios (interceptors + automatic token refresh)
- React Hook Form + Zod (validation)
- React Native Reanimated + Gesture Handler (subtle, professional animations)
- AsyncStorage (non-sensitive app state) + Expo SecureStore (JWT tokens and
  sensitive values)

## Project structure

```
mobile/
├── App.tsx                   # Root: providers + navigation container
├── app.json                  # Expo config (splash, icons, secure-store)
├── .env.example
└── src/
    ├── api/                  # Axios client, interceptors, envelope, endpoints
    ├── components/           # Reusable UI (Logo, Button, TextBox, Checkbox, …)
    │   └── form/             # React Hook Form–aware field wrappers
    ├── config/               # Runtime configuration (env)
    ├── constants/            # Copy, storage keys, roles, error codes
    ├── features/auth/        # Auth domain: API calls, schemas, types
    ├── hooks/                # useAuth, useCurrentUser, bootstrap
    ├── navigation/           # Root/Auth/App stacks + typed routes
    ├── screens/              # Splash, Login, Register, Forgot Password, Dashboard
    ├── services/             # Storage (AsyncStorage + SecureStore), tokens, errors, events
    ├── store/                # Zustand stores
    ├── theme/                # Light/dark theme system (colors, typography…)
    ├── types/                # Shared API/user/token types
    └── utils/                # Logging, formatting, date helpers
```

## Setup

```bash
cd mobile
npm install
npx expo start
```

The default API base URL targets `http://localhost:8000` (or
`http://10.0.2.2:8000` on the Android emulator). Point the app at your backend
with a `.env` file (see `.env.example`):

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```

> JWT tokens are kept in Expo SecureStore (Keychain/Keystore on native, an
> in-memory fallback on web); non-sensitive app state uses AsyncStorage. All of
> this works in Expo Go on Android and in the browser without a custom build.

## Auth flow

```
Splash
  └─ hydrate stores from local storage
       └─ stored JWT? → GET /users/me (auto-refresh on 401)
            ├─ valid    → Dashboard
            └─ invalid  → Login
```

- **Login**: email, password (show/hide), remember me, forgot password,
  register link. Full client validation.
- **Register**: full name, email, phone, strong password, confirm, terms.
  Returns a session on success.
- **Forgot Password**: sends a reset link; in dev the backend returns the
  token so the reset can be completed.
- **Dashboard**: authenticated placeholder previewing future modules.

### Session handling

- Access tokens are attached by a request interceptor.
- A response interceptor transparently refreshes the token once on a `401`
  (single in-flight refresh, queued retries) before failing.
- When the refresh token can no longer be used, the session is cleared and
  the user is routed back to Login.
- Logout revokes the refresh token server-side and wipes local storage.

## Theming

A single `AppTheme` object (colors, spacing, radii, fonts, shadows) is built
per mode and consumed via `useAppTheme()`. The app follows the system scheme
by default and is ready for an in-app toggle. React Navigation's theme is
derived from the same tokens so screens transition seamlessly.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start Expo dev server |
| `npm run android` / `ios` | Run on a device/emulator |
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`) |
| `npm run lint` | Expo lint |
| `npx expo export --platform android` | Validate the production JS bundle |

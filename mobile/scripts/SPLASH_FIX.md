# Startup image fix — the black grid / concentric circles

## Root cause

This is a **managed Expo (SDK 57) React Native app** — not Flutter, and there
are **no `android/` or `ios/` folders**, so the native launch screen is
generated at build time entirely from `app.json`.

`app.json` → `plugins` → `expo-splash-screen` pointed at:

```
"image": "./assets/splash-icon.png"
```

**`assets/splash-icon.png` was the unmodified Expo scaffold placeholder** — a
light-grey graph-paper grid with three concentric circles on a transparent
background. It had never been replaced with real branding. With the splash
`backgroundColor` set to the dark brand colour (`#0B1220`), that placeholder
renders exactly as you described: a black screen with a white grid and
concentric circles.

Nothing else was involved — no Android 12 theme override, no launch theme, no
debug/test widget, no second splash, no cached native resource. There is one
native splash config and one asset, and that asset was the placeholder.

(For reference, the intended startup UI already existed and was fine:
`src/screens/SplashScreen.tsx` draws the real `<Logo>` — purple DeliveryHub
truck badge — over a matching gradient while the app hydrates and validates the
session. The native splash just needed to match it.)

## What changed (2 files + 1 generator)

| File | Change |
|---|---|
| `mobile/assets/splash-icon.png` | **Replaced** the placeholder with the real brand mark: the white rounded badge + purple cargo-truck glyph — pixel-identical to the in-app `<Logo>` (same `TruckGlyph` geometry and palette from `src/components/AnimatedTruck.tsx`). Not a new/invented graphic. |
| `mobile/app.json` (`expo-splash-screen` plugin) | `dark.backgroundColor` `#0B1220` → **`#0B0B12`** so it exactly matches the in-app splash gradient (`palette.ts` dark `backgroundGradient*`) — removes the last hair of colour shift at hand-off. `imageWidth` 120 → 140, explicit `resizeMode: "contain"`. Light `backgroundColor` stays `#FFFFFF` (already matches the in-app light gradient). |
| `mobile/scripts/gen_splash_icon.py` | New. Regenerates `splash-icon.png` from the canonical truck glyph so the asset never drifts from the in-app logo. |

No code, navigation, auth, account, or database changes.

## Resulting startup flow

```
APP LAUNCH
  → native splash  : purple truck badge, centred, on #FFFFFF (light) / #0B0B12 (dark)
  → App.tsx holds the native splash (SplashScreen.preventAutoHideAsync)
  → src/screens/SplashScreen.tsx : SAME <Logo>, SAME background colour
      · hydrates persisted stores
      · validateSession() against the backend  (unchanged)
  → ExpoSplashScreen.hideAsync()
  → RootNavigator (unchanged):
      · status idle/validating → in-app SplashScreen
      · unauthenticated       → AuthStack (login)
      · authenticated + user  → AppDrawer (role dashboard/home)
```

Native image == in-app logo and native bg == in-app bg, so the native → JS
hand-off is visually seamless — it reads as one splash, not two.

## Verification done here

- **Root cause**: opened `assets/splash-icon.png` — confirmed it is the grey
  grid + concentric-circles placeholder.
- **No other source**: no `android/`/`ios/` dirs; no `splashscreen.xml` /
  `*.storyboard` / splash drawable anywhere; `splash-icon.png` is referenced
  **only** at `app.json:40` and `app.json:43`; no top-level / `android.splash`
  / `ios.splash` keys.
- **New asset**: rendered it and simulated Expo's `imageWidth: 140` downscale
  on both `#FFFFFF` and `#0B0B12` — clean, centred, professional, legible in
  both themes.
- **Config resolves**: `npx expo config --type public` returns the expected
  `expo-splash-screen` props with no warnings.
- `npx tsc --noEmit` — clean.
- Auth path untouched: `RootNavigator`, `authStore`, `validateSession`,
  `AuthStack`, `AppDrawer` — not modified.

## Verification you need to do (needs a build — the splash is native)

The configured splash only appears in a **built** app, not in Expo Go. On your
next dev/preview/production build:

1. `npx expo prebuild --clean` (or `eas build`) so the new asset is baked in.
2. Cold start → you see the truck badge, **no grid/circles**.
3. Force-quit, relaunch → same.
4. Light mode and dark mode both → truck badge on white / near-black.
5. Log in → still works (unchanged).
6. Already-logged-in user → lands on their role dashboard.
7. Logged-out user → lands on the login screen.
8. No flicker: native badge → identical in-app badge → login/home.

## Note (out of scope, flagging it)

`assets/icon.png` (the launcher icon, iOS) is also still an Expo template image
(a blue chevron with construction guides) and doesn't match the purple
DeliveryHub truck brand. The Android launcher already uses the correct
`android-icon-foreground.png`. If you want the iOS/store icon brought in line,
that's a separate small asset swap — say the word.

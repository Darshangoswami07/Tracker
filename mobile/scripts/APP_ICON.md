# App launcher icon — now the DeliveryHub truck brand

## Which configuration controls the app icon

`mobile/app.json` only — there is **no** `app.config.js` / `app.config.ts`.
This is a **managed Expo (SDK 57)** project (no `android/` or `ios/` folders),
so Expo generates every platform icon (iOS `AppIcon` set, Android
`mipmap`/adaptive XML, web) from `app.json` at build / `expo prebuild` time.
There are no committed native icon resources to edit or clear.

## Settings changed

| `app.json` key | before | after |
|---|---|---|
| `expo.icon` | `./assets/icon.png` *(Expo template: chevron + guide lines)* | `./assets/icon.png` *(regenerated: truck)* |
| `expo.android.adaptiveIcon.foregroundImage` | `./assets/android-icon-foreground.png` *(blue chevron)* | same path *(regenerated: truck, transparent)* |
| `expo.android.adaptiveIcon.backgroundColor` | `#0B1220` (dark) | **`#FFFFFF`** (white — matches the badge) |
| `expo.android.adaptiveIcon.backgroundImage` | `./assets/android-icon-background.png` *(template guide-lines image)* | **removed** — flat white is a colour, not an image |
| `expo.android.adaptiveIcon.monochromeImage` | `./assets/android-icon-monochrome.png` *(chevron silhouette)* | same path *(regenerated: truck silhouette)* |
| `expo.web.favicon` | `./assets/favicon.png` | same path *(regenerated: truck)* |

Assets regenerated from the **exact same vector source as the splash mark and
the in-app `<Logo>`** (`src/components/AnimatedTruck.tsx`, `TruckGlyph`), by
`mobile/scripts/gen_app_icons.py`:

| file | size | alpha | role |
|---|---|---|---|
| `assets/icon.png` | 1024² | opaque (RGB) | iOS app icon + web + fallback |
| `assets/android-icon-foreground.png` | 1024² | transparent | Android adaptive foreground |
| `assets/android-icon-monochrome.png` | 1024² | transparent | Android 13+ themed icon |
| `assets/favicon.png` | 256² | transparent | web favicon |
| `assets/android-icon-background.png` | — | — | **deleted** (unused) |
| `app.json.backup` | — | — | **deleted** (stale copy with the old broken icon + splash config) |

## Was Android adaptive icon configuration needed? Yes.

- **`foregroundImage`** is the truck only, drawn at **55 % of the canvas** —
  well inside Android's 66 % "always visible" safe circle, so no launcher
  mask (circle / squircle / rounded-square / teardrop) ever clips the truck.
  Verified by compositing against each mask shape.
- **`backgroundColor` = `#FFFFFF`** gives the white field of the brand badge.
  The purple border is not in the adaptive layers (no border can survive every
  Android mask) — it is carried by the iOS icon, the favicon and the splash,
  which are not mask-constrained.
- **`monochromeImage`** redrawn as a flat truck silhouette (box + gapped cab +
  two protruding wheels) so the Android 13 themed-icon option still reads as a
  truck.

## Splash vs icon — kept separate

- **Splash** (`expo-splash-screen` plugin → `assets/splash-icon.png`): unchanged
  by this task. Still the branded truck badge on `#FFFFFF` / `#0B0B12`.
- **Launcher icon** (`expo.icon` + `expo.android.adaptiveIcon`): now the same
  truck brand.

Same artwork, two independent config paths — neither was swapped for the other.

## How it was verified

- `npx expo config --type public --json` → resolves with the new `icon` and
  `adaptiveIcon` (`backgroundColor #FFFFFF`, no `backgroundImage`), no warnings.
- `icon.png` confirmed **opaque** (mode `RGB`) — required for iOS; no black or
  transparent fringe.
- Rendered every delivery form and checked for clipping / centring:
  - iOS super-ellipse mask → white rounded badge, **full purple border intact**,
    truck centred.
  - Android circle **and** squircle masks → truck centred, nothing clipped.
  - Android 13 themed tint → truck silhouette legible.
  - favicon and splash → consistent.
  - Foreground bounding box = `x 246–778, y 305–718` on 1024 → horizontally
    centred, inside the safe zone.
- `npx tsc --noEmit` → clean. No code, navigation, auth, or DB changes.
- Preview sheet: `mobile/scripts/app_icon_preview.png`.

## You must rebuild to see it (icons are native)

Icons are baked at build time and are **not** visible in Expo Go. On the next
build:

1. `npx expo prebuild --clean` (or `eas build -p android` / `-p ios`) so the
   regenerated assets are compiled in and any cached old icon is dropped.
2. Install → home screen / launcher / app list shows the truck, **not** the
   Expo chevron or the grid image.
3. Long-press → recent apps → settings app-list: same icon.
4. Android: try a circular-icon launcher and a squircle one — truck never
   clipped.
5. Android 13: Settings → Wallpaper & style → Themed icons on → truck
   silhouette.
6. Splash still shows the truck badge; login, navigation, dashboards unchanged.

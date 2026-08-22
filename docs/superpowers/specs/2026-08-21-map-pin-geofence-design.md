# Map / Pin / Geofence Notification — Design Spec

**Date:** 2026-08-21
**Status:** Approved by user, pending implementation plan

## Context

Naymly's Build Log has an "Up next" order (verify onboarding on-device → real Capture screen → contact list → Supabase) that queues Map/pin work behind Capture and contact-list. The user explicitly chose to build this now instead, ahead of that order — see `project_home_and_map_screens.md` memory for the earlier (2026-08-21) decision to queue it, which this request supersedes for build order but not for the underlying product decisions already made there (CLCircularRegion geofencing, capped at 20 places, no Bluetooth/continuous-GPS).

Because Capture doesn't exist yet, "add a profile" from the map is a deliberate **minimal stand-in** — not the final capture UX — that will be superseded once the real Capture screen is built.

## Scope for this build

- Map tab (replaces the placeholder `explore.tsx` in the tab bar; `index.tsx` stays a placeholder until contact-list work replaces it later).
- Tap anywhere on the map to drop a pin (no search/geocoding-based place picker).
- Minimal stand-in "add profile" form: name + optional photo + optional note, saved through the existing `Contact` repository/encryption path unchanged.
- One contact per place for this pass — no notification bundling, no per-person cooldown. Both are explicitly deferred (see Product Function #4 in the project CLAUDE.md), noted as follow-up work.
- Local (on-device) notification only, fired via a background geofencing task — no push/server involvement.
- 20-place cap enforced at creation time.

## Architecture & data flow

New dependencies (native modules, installed via `npx expo install`): `react-native-maps`, `expo-location`, `expo-task-manager`, `expo-notifications`. Requires an `expo run:ios` rebuild (Metro reload alone won't pick up new native modules), same pattern as the `expo-blur` addition.

1. Map tab opens → requests foreground location permission, then background ("always") location permission, then notification permission, if not already granted. Any denial shows an inline empty-state explaining why the permission is needed, with a button that opens Settings (`Linking.openSettings()`) — never a silent no-op map.
2. Map centers on the user's current location (`Location.getCurrentPositionAsync`) and renders existing pins as markers, loaded from the `places` repository.
3. Tapping an empty map spot opens a bottom sheet (the stand-in add-profile form). On submit: creates a `Contact` (existing path, unchanged) → creates a `Place` row (lat/lng/radius) → creates a `ContactPlace` join row → registers the region with `Location.startGeofencingAsync`.
4. Tapping an existing pin shows an info card (contact name/photo, optional reverse-geocoded caption, a confirmed "Remove" action that unregisters the geofence and deletes the `Place`/`ContactPlace` rows — the underlying `Contact` is left intact).
5. On arrival, the OS wakes the geofencing background task (via `expo-task-manager`, works even if the app isn't running) → the task handler looks up the contact(s) tied to that region → fires a local notification via `expo-notifications` (e.g. "Say hi to Marcus — he's at [place]").
6. The 20-place cap is enforced at creation time; pin-drop is disabled with an inline message once 20 places exist.
7. On app cold start (`src/app/_layout.tsx`), all saved places' geofences are re-registered with the OS — geofence registration doesn't survive things like a reinstall, so this keeps saved places and active OS-level monitoring in sync.

## Data model

WatermelonDB schema bumps to version 2 (migration required — `contacts` already exists at v1).

**`places`**
| column | type | notes |
|---|---|---|
| `latitude` | number | |
| `longitude` | number | |
| `radius` | number | meters; fixed default of 150, not user-adjustable in this pass |
| `created_at` | number | |

**`contact_places`** (join table)
| column | type | notes |
|---|---|---|
| `contact_id` | string | indexed, references `contacts.id` |
| `place_id` | string | indexed, references `places.id` |
| `created_at` | number | |

No separate place "name"/label field — a place is displayed via its one attached contact's name for this basic (non-bundled) build. `expo-location`'s `reverseGeocodeAsync` may optionally back a small "near {street}" caption on the info card (no extra dependency, since `expo-location` is already required) — a nice-to-have, not load-bearing.

No encryption on `places`/`contact_places` — lat/lng and foreign keys are not the PII the existing encryption requirement targets (`contacts.name_cipher`/`photo_uri_cipher`/`context_tags_cipher` are unchanged).

**Repository:** new `src/db/repositories/places.ts`, mirroring `contacts.ts`'s pattern:
- `createPlace(contact, coords)` — wraps contact creation + place row + join row + geofence registration in one call.
- `deletePlace(placeId)` — unregisters the geofence, then deletes the place + join row. Wrapped so a failure partway through doesn't leave an orphaned DB row with no corresponding OS geofence, or vice versa.
- `getAllPlaces()` — used both for rendering pins and for re-registering geofences on cold start.

## Components

- **`src/app/(tabs)/map.tsx`** — screen shell: permission gating, `MapView`, marker rendering, tap handlers, hosts the two sheets below. Logic lives in a `useMapPlaces()` hook (loading, creating, deleting places, cold-start geofence re-sync), keeping the screen itself a pure component per the project's component rules.
- **`src/components/map/add-place-sheet.tsx`** — the stand-in add-profile form (name, optional photo via `expo-image-picker` — new dependency, first photo-picking use case in the app — optional note), styled consistently with existing onboarding forms.
- **`src/components/map/place-info-card.tsx`** — info card for an existing pin: photo/name, optional reverse-geocoded caption, confirmed "Remove" action.
- **`src/lib/geofencing.ts`** — wraps `Location.startGeofencingAsync`/`stopGeofencingAsync`, the `TaskManager.defineTask` background handler, and notification-firing logic. Kept separate from screen/components since it also runs at app-launch time from `src/app/_layout.tsx`, not just from the Map screen.

## Permissions

`app.json` needs `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, and the background `location` UIBackgroundMode added via Expo config plugins — never hand-edited native project files, per the Hard Rules.

## Error handling

- Any permission denial → inline empty-state + Settings deep link, not a silently broken map.
- 21st pin attempt → blocked with an inline message, no partial write.
- Geofence registration failure → surfaced (toast/alert), not swallowed — a silently-failed registration means a notification that will simply never fire.
- Cold start with saved places but no active OS-level geofence (e.g. after reinstall) → re-synced from `_layout.tsx` before the user would notice anything missing.
- Place deletion (unregister + DB delete) is wrapped to avoid orphaned state in either direction.

## Testing & verification

Not verifiable via `tsc`/`expo export` alone (native modules, OS-driven callback) — same limitation noted throughout the Build Log for on-device-only features.

- `npx tsc --noEmit` and `npx expo export --platform web` as baseline sanity checks.
- `npx expo run:ios` rebuild (required for the new native modules).
- On-device: grant permissions, drop a pin, use Simulator **Features → Location → Custom Location** to simulate moving into/out of the pin's radius, confirm the local notification fires.
- Confirm the 20-place cap, permission-denied empty state, and pin removal (geofence unregister) via manual on-device taps.
- Confirm cold-start re-sync: force-quit after adding a pin, relaunch, verify the geofence still fires — proves the re-registration path works, not just the happy path within one session.
- No automated test suite for the geofencing callback itself — OS-driven, not practically unit-testable; stays manual/on-device, consistent with how the rest of onboarding has been verified.

## Explicit non-goals (deferred)

- Notification bundling (multiple contacts at one place → one notification).
- Per-person notification cooldown.
- Place search/geocoding-based pin placement.
- User-adjustable geofence radius.
- Place name/label distinct from the attached contact's name.
- Any of this superseding or wiring into the not-yet-built real Capture screen — the stand-in form here is intentionally throwaway-adjacent scope, reusable data, disposable UI.

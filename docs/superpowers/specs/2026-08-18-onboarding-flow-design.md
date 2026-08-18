# Onboarding Flow — Design Spec

**Date:** 2026-08-18
**Status:** Approved by user, pending implementation plan

## Context

Reference screenshots (TikTok, Slack, Spotify, WhatsApp, Duolingo, LinkedIn, Notion) were reviewed for onboarding best practices and distilled into 8 principles: show value before asking for anything, personalize early, create quick wins, ask permissions at the right moment, set expectations with progress indicators, and end with a clear next step rather than a blank screen.

This spec adapts those principles to Naymly specifically. Naymly's onboarding was not on the original Build Log roadmap (Capture screen was next); the user decided onboarding becomes the new first screen, inserted ahead of Capture.

**Key constraint carried over from the rest of the project:** Supabase is deliberately deferred (see Build Log). This onboarding flow has **no auth step** — it works entirely local-first, consistent with the Capture screen's existing "local save only" scope. Auth gets wired in later, per the Build Log's existing ordering.

## Goals

- A first-time user reaches genuine product value (their first saved contact) with no signup wall, in as few screens as possible.
- Permission requests are contextual and primed, not front-loaded.
- Onboarding doesn't feel like a tutorial — the last step is real product use, not a demo.
- The flow is skippable at the one point where forcing it would be bad UX (no card/person to capture right now).

## Non-goals (explicitly out of scope for this spec)

- **The Capture screen's internal implementation** (photo picker, OCR, WatermelonDB write) is a separate, already-scoped roadmap item. This spec defines only the integration contract onboarding needs: a route it can push, and a way to pass the role-based context-tag suggestion into it. Building `CaptureScreen` itself happens as its own task immediately after this one.
- **Real branding assets** (logo mark, app icon) — none exist yet. The splash/value screens use a plain serif wordmark ("Naymly") as a placeholder until real assets are supplied. This is a noted dependency, not a blocker for this spec.
- Auth (magic link / Google OAuth / Sign in with Apple) — deferred with Supabase, per existing Build Log decision.
- Notification, Location, Calendar, Contacts permissions — requested later, contextually, at first real use of each feature (e.g., Notifications when the first brief is scheduled). Only Camera is requested during onboarding.

## Flow

```
Native splash (existing, expo-splash-screen — asset swap only, no new logic)
  → Value screen
  → Role picker
  → Camera primer
  → [native OS camera permission dialog]
  → Capture (reused screen, "skip for now" available)
  → Success state
  → routes into the app
```

Six screens/states total; single linear path, no branching logic beyond the one skip affordance.

## Screens

### 1. Value screen (`src/app/onboarding/value.tsx`)
One serif headline + one line of body copy, matching naymly.com's existing voice (e.g. "Forgetting a name is not a character flaw"). No carousel, no multi-screen narrative — principle #08 warns that a long explainer sequence itself starts to feel like a tutorial. Single "Continue" CTA. 2-dot progress indicator (dot 1 of 2) at the top, styled per the Design System's neutral/ink tokens.

### 2. Role picker (`src/app/onboarding/role.tsx`)
"What brings you to Naymly?" — single-select chips: Sales & networking / Events & conferences / School / Other. Selection is held in an in-memory Zustand store for the duration of the flow (see State Management below) and used to pre-fill suggested context-tag chips on the Capture screen. Progress indicator dot 2 of 2. "Continue" CTA (no back-skip needed — this is a preference, not a permission gate).

### 3. Camera primer (`src/app/onboarding/camera-primer.tsx`)
Explains, in Naymly's voice, why camera access is being requested ("To save a name and face in one shot"). A single "Allow Camera Access" CTA triggers the native OS permission dialog (via whatever picker API the Capture screen implementation settles on — this screen only owns the *priming* copy and the trigger, not the picker itself). No progress dots — this and everything after is "the real app," not onboarding chrome.

**Permission denial handling:** if the user denies the native dialog, do not dead-end. Route forward into Capture anyway; Capture's own empty/no-permission state (owned by that screen's implementation) handles it — e.g. offering a manual-entry fallback with no photo. Onboarding's job ends at "asked and moved on."

### 4. Capture (reused screen — separate roadmap item)
Onboarding pushes to whatever route the Capture screen ultimately lives at, passing the role-selected context-tag suggestion (via the shared Zustand store, not route params, so Capture doesn't need onboarding-specific props). Includes a "Skip for now" text link for the case where the user has no one to capture yet — skipping still marks onboarding complete and proceeds to a variant of the success state acknowledging zero contacts saved yet.

### 5. Success state (`src/app/onboarding/success.tsx`)
Small celebratory confirmation — "Saved. That's your first contact." (or, if skipped: "You're all set — add your first contact anytime.") One CTA ("Let's go") that marks onboarding complete and routes into the app.

## Navigation & gating architecture

- New route group `src/app/onboarding/` (a stack, not tabs) holding the four new screens (value, role, camera-primer, success) plus the routed-to Capture screen.
- Root layout (`src/app/_layout.tsx`) reads a durable `hasOnboarded` flag on mount (see State Management) and redirects to `/onboarding/value` if false, or the app's normal entry if true. This uses Expo Router's `<Redirect>` / conditional initial route, not a manual navigation call, to avoid a flash of the wrong screen.
- "The app's normal entry" currently just means the existing default tab layout carried over from the `create-expo-app` scaffold (`index`/`explore`) — there's no real home/dashboard yet. This is a placeholder destination until the contact list screen (already on the Build Log) becomes the real entry; swapping it later is a one-line change, not a re-architecture.

## State management

Two different kinds of state, deliberately not conflated:

1. **In-flow, ephemeral state** (current role selection while the flow is active) — a Zustand store (`src/state/onboarding.ts`), matching the stack's existing use of Zustand for flow/session state. Not persisted; if the app is killed mid-onboarding, it restarts from the top next launch (acceptable — onboarding is short).
2. **Durable completion state** (`hasOnboarded: boolean`, `role: string | null`) — written once, when onboarding finishes. This is **not** sensitive data, so it does **not** belong in the iOS Keychain (`expo-secure-store`) alongside the PII encryption key from the WatermelonDB work — that would conflate "secret" storage with ordinary app preferences. It uses `@react-native-async-storage/async-storage` instead, the standard tool for this and not yet a project dependency — needs to be added.

  *Correction from the design presented in chat: that version suggested `expo-secure-store` for the `hasOnboarded` flag. On reflection that's the wrong tool — Keychain-backed storage is for secrets, and a completion flag isn't one. AsyncStorage is the correct, simpler fit.*

## Testing

- Type-check (`tsc --noEmit`) and `expo export --platform web` as a smoke test, matching how the scaffold and WatermelonDB work were verified.
- Real verification (does the flow actually run, does the camera permission dialog actually fire, does routing/gating actually work) requires `expo run:ios` in the Simulator — **currently blocked**, same as the WatermelonDB verification: Xcode isn't installed on this machine. This is the same open item already tracked in the Build Log; this spec doesn't introduce a new blocker, it's constrained by the existing one.
- Once Xcode is available: manually verify the redirect-gating logic doesn't flash the main app before redirecting to onboarding, and that killing the app mid-flow and relaunching correctly resumes at onboarding (since completion is only written at the very end).

## Open dependency

Real logo/icon assets are needed before the splash and value screens can move past a placeholder wordmark. Not a blocker for building the flow's logic and layout now, but noted so it isn't forgotten.

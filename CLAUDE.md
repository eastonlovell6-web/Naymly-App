# Naymly — iOS App

## Build Log — READ THIS FIRST EVERY SESSION
*Update this section before ending every session. This is the only source of truth for what's built vs. not — don't infer progress from git history alone, keep this current.*

**Last updated:** 2026-08-18
**Current phase:** Phase 1 — Core Loop (in progress)
**Currently building:** Real Capture screen (name + photo + context tags, local save only) — replaces the stub at `src/app/onboarding/capture.tsx`. WatermelonDB and the onboarding flow are both code-complete but UNVERIFIED at runtime (see blockers). Supabase project still deliberately on hold.
**Completed screens/features:**
- Project scaffold: `create-expo-app` default template (Expo SDK 57, TypeScript strict, Expo Router, `src/` layout) with NativeWind 4 (Tailwind config carries the brand color tokens from Design System) and Zustand installed. Verified via `npx tsc --noEmit` (clean) and `npx expo export --platform web` (bundles successfully, Tailwind CSS compiles). Not yet booted in the iOS simulator.
- WatermelonDB schema/model/repository (`src/db/`) — scoped to just what the Capture screen needs: a `contacts` table (name, photo, context tags). Full domain schema (Place, ContactPlace, Brief) intentionally deferred to the phases that need them.
- PII encryption (`src/lib/encryption.ts`) — resolves the Hard Rules' Day-1 "encrypted at rest" bar. Uses `expo-crypto`'s native AES-256-GCM module (hardware-backed via CryptoKit on iOS) with a key generated once and stored in the iOS Keychain via `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). `Contact` model exposes only ciphertext as raw WatermelonDB fields (`name_cipher`, `photo_uri_cipher`, `context_tags_cipher`); decryption happens through async `getName()`/`getPhotoUri()`/`getContextTags()` methods. `src/db/repositories/contacts.ts#createContact` encrypts before every write. Considered and rejected `crypto-js` (flagged itself as unmaintained mid-install) and a third-party native AES library (`react-native-aes-gcm-crypto`, last published 2022) in favor of the first-party Expo module.
- Onboarding flow (`src/app/onboarding/`, spec: `docs/superpowers/specs/2026-08-18-onboarding-flow-design.md`) — value screen, role picker, camera-permission primer, a stubbed capture step, success state, gated in front of the app via Expo Router `Stack.Protected` on a `hasOnboarded` flag (Zustand + AsyncStorage, `src/state/onboarding.ts`). No auth step, matching the Supabase deferral. Existing tab screens moved to a `(tabs)` route group as part of this work. Verified via `npx tsc --noEmit` and `npx expo export --platform web`; not yet run in the iOS Simulator.

**Up next (in order):**
1. **Verify WatermelonDB and the onboarding flow actually work** — first real `expo prebuild && expo run:ios`. Not yet possible: Xcode.app isn't installed on this machine (only Command Line Tools — no `simctl`/`xcodebuild`). Install Xcode, then run this; do not assume either works until this has actually run. In particular, verify the onboarding redirect-gating logic doesn't flash the main app before redirecting, that killing the app mid-flow and relaunching correctly resumes at onboarding, and that onboarding actually starts on the value screen (not the role picker) — this exact class of bug (wrong entry screen due to route sort order) was caught by a final review and fixed in this same change, so it's worth checking for again once real device testing is possible.
2. Real Capture screen (name + photo + context tags, local save only) — replaces the `src/app/onboarding/capture.tsx` stub file-for-file; first real exercise of the DB/encryption code
3. Basic contact list / review screen (manual, no AI yet) — also becomes the real destination onboarding's success screen and the `(tabs)` index route should eventually route to, replacing today's placeholder Expo starter screens
4. Supabase project + auth wiring (resume when ready — was deliberately held off during scaffold)

**Blockers / open questions:**
- **Xcode.app not installed** on this machine — blocks all native builds (`expo run:ios`, simulator testing, and eventually the Live Activity/widget extensions). Needs to be installed from the App Store before task 1 above can happen.
- **WatermelonDB New Architecture compatibility is unverified.** `expo-doctor` flags it as "Untested on New Architecture" (RN 0.86 / Expo 57 default). No official Expo support exists (open feature request since 2018); the community plugin (`@morrowdigital/watermelondb-expo-plugin`) was only verified against Expo SDK 47/48, years before the New Architecture. A Nov 2025 community comment suggested favoring alternatives (op-sqlite, InstantDB) instead. Schema/model code is written and type-checks, but treat it as **unproven** until the first real simulator build. If it breaks, the fallback options already identified are `op-sqlite` or `expo-sqlite` + a thin reactive layer.
- **No real brand assets yet** — logo/icon and the actual brand serif font. Onboarding uses no logo/wordmark yet, and `Georgia` as a placeholder serif face (see the onboarding spec's Open Dependency note).
- Native Swift widget/Live Activity extension setup not yet scaffolded — needs Expo prebuild + config plugin research before Phase 3 work starts
- 30+ response validation survey still outstanding (see [[Projects/namelock]])
- One pre-existing lint error in the Expo template's own boilerplate (`src/hooks/use-color-scheme.web.ts:11`, `react-hooks/set-state-in-effect`) — not introduced by us, left as-is

---

## Project Overview
Naymly helps people stop forgetting names by fixing the encoding problem, not the recall problem. Users capture a new contact via business-card OCR or a post-conversation voice whisper (never mid-handshake), and Naymly pushes a context-triggered brief — photo, role, last note — 15 minutes before their next meeting with that person, or on arrival at a pinned place. Primary users are sales professionals, networkers, and (Year 2) enterprise sales orgs on iPhone and iPad; students/social-anxiety users are a secondary segment. Core value: passive, professional-context recall utility — explicitly not a flashcard/quiz app.

**Stack — Hybrid: React Native/Expo main app + native Swift extensions**

*Decision rationale: the app's screens (Capture, Encode, Contact list) are mostly CRUD, where RN/Expo ships faster. The retention loop (Live Activity brief, Contact World widget, geofence trigger) is OS-integration-heavy and needs native Swift regardless — WidgetKit requires a native extension even inside an RN app. Splitting this way keeps the existing 12-week phase plan and Android optionality, while getting native-quality Live Activities. Revisit only if Android is dropped permanently.*

| Layer | Tool | Notes |
|---|---|---|
| Mobile app | React Native + Expo (dev client, not Expo Go — needs custom native modules) | TypeScript strict mode throughout |
| Styling | NativeWind | Tailwind for RN |
| State | Zustand | Capture flow, review queue, session |
| Navigation | Expo Router | Typed routes |
| Local DB | WatermelonDB | Offline-first SQLite; all contacts/briefs work without internet |
| Widget extension | Swift + SwiftUI + WidgetKit | Contact World (Phase 3), built as a native Xcode target inside the Expo prebuild |
| Live Activity extension | Swift + SwiftUI + ActivityKit | Pre-meeting brief on Dynamic Island / Lock Screen; bridged to RN via a small native module that starts/updates/ends the Activity |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) | Magic link + Google OAuth + row-level security |
| AI (fast) | Claude haiku-4.5 via Supabase Edge Function | Real-time hook generation, voice parsing |
| AI (rich) | Claude sonnet-4.6 via Supabase Edge Function | Pre-meeting briefings |
| OCR | Apple VisionKit (native module, on-device) | Business card parsing; on-device is a stated privacy/compliance requirement |
| Voice | Whisper | Transcribes post-conversation spoken intro |
| Calendar | EventKit (native module) → Google Calendar API | Calendar-triggered pre-meeting briefs |
| Geofencing | `CLCircularRegion` (native module), capped at 20 monitored places | No continuous GPS polling — battery drain is a validated dealbreaker |
| Payments | RevenueCat | iOS + Android subscription billing |
| Analytics | PostHog | 5 core events instrumented from Day 1 |
| Errors | Sentry | Non-negotiable for fast iteration |
| CI/CD | GitHub Actions + EAS Build | Automated testing + App Store builds |

**Minimum deployment:** iOS 17+ (iOS 18+/26+ for Live Activities, interactive widgets)
**Build SDK:** Xcode 26+ for the native extension targets

## Design System

*Colors pulled directly from naymly.com's CSS (not just visual guess). Layout/interaction patterns are from the reference screenshots — a chat-first place-recommendation app ("Places"), used here as a UI pattern reference, not literal content, since Naymly's actual domain is contacts/names, not restaurants.*

**Color tokens (from naymly.com):**
| Token | Hex | Use |
|---|---|---|
| `background` | `#F6F5F2` | Primary app background — warm off-white, not pure white |
| `background-alt` | `#F7EED4` | Secondary/parchment surface — cards, sheets |
| `accent-mint` | `#D6F0E4` | Soft accent — tags, success states, secondary highlights |
| `accent-gold` | `#E7D397` | Warm accent — badges, highlights |
| `neutral` | `#C0BDB7` | Muted taupe — secondary text, dividers, disabled states |
| `ink` | `#000000` | Primary text, icons, buttons |
| `surface` | `#FFFFFF` | Cards/sheets that need to pop off the cream background |

This replaces the earlier navy/gold token set (`#0F1B3C` / `#D4A853`) from the old Figma Make prototype referenced in [[Projects/namelock]] — that was pre-rename; the cream/mint/gold palette above is the current brand and is what to build against.

**Typography:** the site and both reference screenshots pair a serif display face for headlines (large editorial serif — see "Brunch around Menlo Park," "Theodora," the "PLACES" wordmark) with a clean sans-serif for body/UI/labels. Exact font files on naymly.com are hashed by Next.js's font optimizer, so the specific family isn't confirmable from the CSS alone — inspect visually or ask for the brand font before locking this in code.

**Layout patterns from the reference screenshots, mapped to Naymly's screens:**

| Reference pattern | Naymly equivalent |
|---|---|
| Chat-first query → prose answer with inline links → structured results below | Naymly's capture/query flow — e.g. "who am I meeting today" or voice capture confirmation, flowing into a structured brief |
| Place card: rounded thumbnail, name, one-line description, expand chevron | Contact card: photo, name, role, one-line context note |
| Inline rounded map preview, tappable to expand | Not just a nice-to-have here — Naymly already has a `Place`/`ContactPlace` entity for geofencing (see [[Projects/namelock]]); this pattern is a direct fit for showing pinned places tied to a contact |
| Detail sheet: full-bleed photo carousel, floating circular back/share buttons, badge, serif title, status pill, scrollable tag chips, dark floating action bar, paginated Notes | Contact detail sheet: photo, serif name, "last met" status, context tags (role, personal detail), floating action bar (Brief, Message, Directions, Save), Notes section |
| Full-screen map, avatar-style pins, filter pill chips, bottom sliding info card | Naymly's Contact World / Places map view — pins as contact avatars instead of restaurant photos, same bottom-card-on-tap interaction |
| Bottom tab bar: 5 items, icon + label, active state underlined | Naymly tabs: likely Search/Capture, Map (Places), Contacts, Briefs, Profile — same minimal 5-tab pattern |
| Splash: centered crest/icon + serif wordmark on cream background | Naymly splash: logo mark + "NAYMLY" wordmark, same treatment |

**Tone:** warm, editorial, understated — matches naymly.com's copy ("Never blank on a name again," "Forgetting a name is not a character flaw"). Generous whitespace, numbered sections, two-column layouts on marketing surfaces. In-app, this translates to uncluttered screens, serif headlines carrying the personality rather than color or ornamentation, and calm neutral-first UI with color used sparingly as accent.

## Hard Rules (Never Violate)

**Build discipline:**
- **Build one screen/feature at a time, never the whole app or multiple screens in parallel.** Finish, run, and verify a single screen in the simulator before starting the next one. Follow the "Up next" order in the Build Log above — don't jump ahead to a later phase because it seems easier or more interesting.
- **Update the Build Log at the end of every session** — move finished items into "Completed," update "Currently building," and refresh "Up next." A session that writes code without updating this section isn't done.
- **At the start of every session, read the Build Log before writing any code.** Don't re-ask what's built — it's documented there.

**Main app (TypeScript / React Native):**
- Strict TypeScript (`strict: true`), no `any` without an explicit comment justifying it.
- No `useEffect` for data fetching — use a query layer (TanStack Query or equivalent) against Supabase/WatermelonDB.
- All screens are pure components; side effects and business logic live in hooks or services, not component bodies.
- Errors are typed, never raw thrown strings.
- Contact PII (photos, notes about third parties) is encrypted at rest on-device from Day 1 — zero-tolerance bar from validated user research, not an optional hardening pass, and the real gate for the enterprise segment.
- **No "quiz," "flashcard," "spaced repetition," or "train your memory" language anywhere** — UI copy, notification text, analytics event names, code comments. Validated research shows this framing kills adoption.
- Region monitoring stays capped at 20 places; never fall back to continuous GPS polling.

**Native extensions (Swift):**
- Swift 6 strict concurrency; all UI on `@MainActor`.
- No force unwraps (`!`), no `try!`, no force casts.
- SwiftUI only for widget/Live Activity views — keep them thin, no business logic (data comes from the shared App Group / native bridge).
- Live Activity updates go through ActivityKit's push-to-update path where possible, not just local scheduling — verify this before Phase 3 starts.

**Both:**
- Accessibility: Dynamic Type, VoiceOver, sufficient contrast, Reduce Motion. WCAG 2.2 AA minimum. Touch targets ≥ 44×44 pt.
- Privacy Manifest (`PrivacyInfo.xcprivacy`) must be complete and correct — especially load-bearing here given third-party PII storage.
- Never edit `.pbxproj` / native project files directly — use Expo config plugins / prebuild.

## Must-Ship Native Features (2026 Priority)
1. **App Intents** — "Add contact to Naymly" via Siri/Shortcuts right after a handshake
2. **Live Activities + Dynamic Island** — the pre-meeting brief; this is the core retention mechanic
3. **Interactive widgets** — Contact World (Phase 3), no-tap-required ambient view
4. **Passkeys + Sign in with Apple** — alongside Supabase magic-link/Google OAuth
5. **Privacy Manifest** (required to ship)
6. Spotlight / Universal Links — surface contacts and briefs in system search
7. Adaptive layouts (iPhone, iPad) — needs its own layout pass, not a scaled-up iPhone view

## Performance & Reliability Targets
- Cold start (p90) < 2–2.5 s on mid-range devices
- Tap response < 100 ms
- Crash-free sessions ≥ 99.5%
- Battery impact from region monitoring/notifications tracked explicitly — named dealbreaker in user research
- Sentry + PostHog wired from Day 1, not bolted on later

## Analytics Events (instrument before building)
`contact_added`, `hook_created`, `brief_viewed`, `app_opened_day_N`, `notification_opened` — PostHog.

## Commands
```bash
npx expo prebuild
npx expo run:ios
eas build --platform ios --profile development
```

# Naymly — iOS App

## Build Log — READ THIS FIRST EVERY SESSION
*Update this section before ending every session. This is the only source of truth for what's built vs. not — don't infer progress from git history alone, keep this current.*

**Last updated:** 2026-08-22
**Current phase:** Phase 1 — Core Loop (in progress)
**Currently building:** Voice-driven Capture screen (`src/app/capture.tsx`) just landed a full rewrite as voice-first with manual fallback — see the completed bullet below. It's code-complete, natively rebuilt with 0 errors/0 warnings, and TypeScript-clean, but gated on the user finishing the Supabase setup checklist (see Blockers) before real voice-to-structured-data extraction works end-to-end; until then it gracefully degrades to the manual form with a "YOU SAID" transcript banner, which is itself the intended behavior, not a bug. **The idle voice state is now confirmed on-device via screenshot** (mic button, "Tap and say who you just met," "Enter manually instead," "New Contact" header with close button — all render correctly), after fixing two unrelated pre-existing environment gaps (a missing hook, then a Babel decorator config issue — both below). **The interactive half of on-device verification (tap mic → grant permission → speak → confirm pre-fill; deny permission → "Open Settings"; "Enter manually instead" → empty form) is still outstanding** — this session never had touch-injection tooling, only deep-link + screenshot, so only the static idle-state render has actually been confirmed. Next real work is that interactive pass once a human can tap through the simulator, then Supabase.
**Completed screens/features:**
- Project scaffold: `create-expo-app` default template (Expo SDK 57, TypeScript strict, Expo Router, `src/` layout) with NativeWind 4 (Tailwind config carries the brand color tokens from Design System) and Zustand installed. Verified via `npx tsc --noEmit` (clean) and `npx expo export --platform web` (bundles successfully, Tailwind CSS compiles). Not yet booted in the iOS simulator.
- WatermelonDB schema/model/repository (`src/db/`) — scoped to just what the Capture screen needs: a `contacts` table (name, photo, context tags). Full domain schema (Place, ContactPlace, Brief) intentionally deferred to the phases that need them.
- PII encryption (`src/lib/encryption.ts`) — resolves the Hard Rules' Day-1 "encrypted at rest" bar. Uses `expo-crypto`'s native AES-256-GCM module (hardware-backed via CryptoKit on iOS) with a key generated once and stored in the iOS Keychain via `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). `Contact` model exposes only ciphertext as raw WatermelonDB fields (`name_cipher`, `photo_uri_cipher`, `context_tags_cipher`); decryption happens through async `getName()`/`getPhotoUri()`/`getContextTags()` methods. `src/db/repositories/contacts.ts#createContact` encrypts before every write. Considered and rejected `crypto-js` (flagged itself as unmaintained mid-install) and a third-party native AES library (`react-native-aes-gcm-crypto`, last published 2022) in favor of the first-party Expo module.
- Onboarding flow (`src/app/onboarding/`, spec: `docs/superpowers/specs/2026-08-18-onboarding-flow-design.md`) — value screen, role picker, camera-permission primer, a stubbed capture step, success state, gated in front of the app via Expo Router `Stack.Protected` on a `hasOnboarded` flag (Zustand + AsyncStorage, `src/state/onboarding.ts`). No auth step, matching the Supabase deferral. Existing tab screens moved to a `(tabs)` route group as part of this work. Verified via `npx tsc --noEmit` and `npx expo export --platform web`; not yet run in the iOS Simulator.
- **Voice-driven Capture screen, 2026-08-22, natively rebuilt twice but STILL not visually confirmed on-device**: `src/app/capture.tsx` rewritten as voice-first with manual fallback (design spec + plan: `.superpowers/sdd/2026-08-22-voice-capture/`). Tapping the mic starts on-device speech recognition (`expo-speech-recognition`, native module — chosen over the stack table's planned Whisper API specifically because **no OpenAI key exists yet**; this is a deliberate, worth-remembering deviation from the documented stack, revisit once/if Whisper is wired up later), now requesting `requiresOnDeviceRecognition: true` explicitly — though on iOS this only holds when the recognizer's active locale actually supports on-device recognition (`recognizer.supportsOnDeviceRecognition`); for an unsupported locale `expo-speech-recognition` silently falls back to network recognition instead of failing, shows a live partial transcript, and on "Done" sends the transcript to a new Supabase Edge Function (`extract-contact`, via `src/lib/supabase.ts` + `src/lib/extract-contact.ts`) that uses Claude to pull out a name and context tags, pre-filling the existing manual form. If no Supabase project is linked (`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` unset — see `.env.example`), `extractContact()` short-circuits to an empty extraction and the form opens empty with a dismissible "YOU SAID" banner showing the raw transcript instead — deliberate graceful degradation, not a bug, and the currently-expected state until Supabase setup (below) is done. "Enter manually instead" skips straight to the empty form; permission-denied state renders an "Open Settings" fallback. New native dependency `expo-speech-recognition` (56.0.1, pinned exact) required a full native rebuild, not just a Metro reload. **Rebuilt via `npx expo run:ios` twice (different attempts, see below): both times 0 errors, 0 warnings** (Xcode build succeeded cleanly both times, confirming the new native module linked correctly). **`npx tsc --noEmit`: exactly one error at first, and it's pre-existing/unrelated** — nothing in the voice-capture code path (`capture.tsx`, `use-voice-capture.ts`, `extract-contact.ts`, `supabase.ts`) has ever produced a type error, across two verification attempts. **On-device screenshot verification of the idle voice state failed twice for two different pre-existing, unrelated reasons before succeeding on the third attempt** (see Blockers, both now marked resolved): attempt 1 hit a missing-hook Metro bundling failure; attempt 2, after that patch, hit a fatal Babel/TypeScript decorator parse error in `src/db/models/ContactPlace.ts`, confirmed via an on-device red error screen; attempt 3, after patching `babel.config.js` too (synced in uncommitted from the main checkout's own in-progress fix for the same issue), **succeeded** — a real screenshot (`xcrun simctl openurl ... naymlyapp://capture` + `simctl io screenshot`, on a dedicated spare simulator to avoid disturbing another concurrent session's shared-simulator state) confirms the idle voice UI renders exactly as designed. The full interactive checklist (tap mic → grant permission → speak → confirm pre-fill; deny permission → confirm "Open Settings"; "Enter manually instead" → confirm empty form) remains outstanding — no touch-injection tooling exists in this environment, only deep-link + screenshot.

**Up next (in order):**
1. **Complete the interactive on-device pass for the voice Capture screen** — the idle-state screenshot now succeeds (see completed bullet), but everything past that first tap is still outstanding and needs a human (or touch-injection tooling): tap the mic and verify the permission dialog / grant it; speak a test phrase and watch the live partial transcript; tap "Done" and confirm it lands on the pre-filled form (or the empty form + "YOU SAID" banner if Supabase isn't linked yet); tap "Enter manually instead" from idle and confirm it skips to the empty form; deny the permission dialog (reinstall to reset it first) and confirm "Open Settings" renders.
2. **Finish the Supabase setup checklist** so voice extraction actually produces structured data end-to-end instead of degrading to the transcript banner: create the Supabase project, link it (`supabase link`), set the `ANTHROPIC_API_KEY` Edge Function secret, deploy `extract-contact` (`supabase functions deploy extract-contact`), and populate `.env.local` from `.env.example`.
3. Basic contact list / review screen (manual, no AI yet) — also becomes the real destination onboarding's success screen and the `(tabs)` index route should eventually route to, replacing today's placeholder Expo starter screens
4. Broader Supabase auth wiring (magic link / Google OAuth) — resume when ready, separate from the narrower Edge Function setup in item 2 above

**Blockers / open questions:**
- **RESOLVED, 2026-08-22 — fatal Babel/TypeScript decorator parse error that blocked anything touching the database.** `src/db/models/ContactPlace.ts` declares `@field('contact_id') contactId!: string;` (and two similar fields) — a WatermelonDB `@field` decorator on a TypeScript definite-assignment-asserted (`!`) class property, which Metro's bundler couldn't parse under the old `babel.config.js` (`@babel/plugin-proposal-decorators` with `{ legacy: true }`, no class-properties transform configured) — fatal `SyntaxError`, full-screen red error on launch, confirmed via a real device screenshot. `ContactPlace` is registered in `src/db/index.ts`'s `modelClasses`, the same `database` singleton `src/app/capture.tsx` imports directly, so this blocked the voice Capture screen specifically. Fixed by syncing in the main checkout's own uncommitted `babel.config.js` fix (a `watermelonModelsPreset` scoping `@babel/plugin-transform-class-properties` to just `src/db/models/*`, with a comment explaining why it's scoped that narrowly rather than applied bundle-wide) rather than re-deriving one from scratch. Confirmed fixed: rebuilt on a spare simulator, app bundled and launched cleanly, and the voice Capture screen's idle state was successfully screenshotted for the first time.
- **RESOLVED, 2026-08-22 — the previous "Metro cannot bundle any route" blocker.** `src/components/map/place-info-card.tsx` was importing `@/hooks/use-decrypted-contact`, which didn't exist anywhere in this worktree. Fixed by copying `src/hooks/use-decrypted-contact.ts` in from the main checkout (uncommitted, same treatment as the other pre-placed baseline-sync files below).
- **Note on baseline-sync files:** three files exist in this worktree only as uncommitted copies from the main checkout's own in-progress work (`src/components/onboarding/primary-button.tsx`'s liquid-glass redesign, `src/components/onboarding/voice-listening-visual.tsx`, `src/hooks/use-decrypted-contact.ts`), plus `babel.config.js`'s decorator fix above — none of these are voice-capture deliverables, they're dependencies this feature needed that happened to only exist as work-in-progress elsewhere. Whoever merges this branch back to main should expect these to already exist there (possibly committed by then) and reconcile rather than double-apply.
- **Voice capture's real extraction is gated on Supabase setup.** Until the project is created/linked, the `ANTHROPIC_API_KEY` secret is set, and `extract-contact` is deployed, `extractContact()` always short-circuits to an empty result (no network call is even attempted without `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set) and the Capture screen falls back to the empty-form-plus-transcript-banner path. This is working as designed, not broken, but worth remembering so it isn't mistaken for a bug during the next on-device pass.
- **Deliberate stack deviation: on-device speech recognition instead of Whisper.** The Design System's stack table names Whisper for voice transcription; the voice-capture spec used `expo-speech-recognition` (Apple's on-device/Siri speech APIs under the hood) instead, purely because there's no OpenAI API key configured in this project yet. Revisit if/when an OpenAI key is added and a Whisper-quality-vs-on-device tradeoff becomes worth making deliberately rather than by default.
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

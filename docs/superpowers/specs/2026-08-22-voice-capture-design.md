# Voice Capture (Auto-Fill from Speech) — Design Spec

**Date:** 2026-08-22
**Status:** Approved by user, pending implementation plan

## Context

This is Product Function #1 ("Capture") from the project CLAUDE.md — the primary, voice-driven path for adding a new contact, described there as "under 30 seconds, hands-free where possible" and called out by the user as the app's key differentiating feature ("this is kind of the key to the app... this needs to be really good").

`src/app/capture.tsx` currently exists as a fully manual, local-only screen: photo picker, name field, comma-separated context-tags field, saved via `createContact()` with no network calls anywhere in the app. There is no Supabase project, no audio/speech dependency, and no `.env`/secrets setup in the repo yet — this is greenfield for all three.

The project's stack table names Whisper (transcription) + Claude haiku-4.5 via a Supabase Edge Function (structured extraction) for this feature. Two things push this build off that literal path:

1. **Supabase itself is on hold** (Build Log Up Next #4) — pulling forward a Supabase project is a real, if minimal, jump ahead of the stated order. The user explicitly approved doing this now, scoped to one Edge Function, rather than waiting.
2. **No OpenAI API key exists yet** (user confirmed only an Anthropic key is on hand). Rather than blocking on creating another external account, the user approved substituting on-device speech recognition for the Whisper API call. This is a deliberate deviation from the stack table, to be reflected there once built.

## Scope for this build

- Voice becomes the primary capture path on `capture.tsx`; today's manual fields become the fallback/edit surface, not a separate screen.
- On-device transcription only (no audio ever leaves the device) — a new native dependency, `expo-speech-recognition` (wraps `SFSpeechRecognizer` on iOS).
- One new Supabase Edge Function, `extract-contact`, whose only job is: transcript text in → `{ name, contextTags }` JSON out, via a Claude haiku-4.5 call using the user's existing Anthropic key (stored as a Supabase secret, never shipped client-side).
- No DB schema changes — extraction maps directly onto the two fields `createContact()` already accepts.
- No business-card OCR in this pass (Function 1's secondary path) — out of scope, not requested.
- No standalone "review card" screen — extracted fields land directly in the existing editable form fields on `capture.tsx`.

## Architecture & data flow

```
capture.tsx (voice mode, default)
  → expo-speech-recognition starts listening, live partial transcript shown
  → user taps stop → final transcript string
  → POST { transcript } to Supabase Edge Function `extract-contact`
  → Edge Function calls Claude haiku-4.5 with a fixed extraction prompt,
    returns strict JSON: { name: string, contextTags: string[] }
  → client pre-fills existing `name` / `contextTagsInput` state
  → user reviews/edits pre-filled fields exactly as today, taps Save Contact
  → existing createContact() path, unchanged
```

New dependency: `expo-speech-recognition`, installed via `npx expo install` and requiring an `npx expo run:ios` rebuild (native module — Metro reload alone won't pick it up), same pattern as the earlier `expo-blur` addition.

New infra: one Supabase project (to be created by the user — account creation isn't something Claude Code can do), linked via the Supabase CLI, hosting exactly one Edge Function. `ANTHROPIC_API_KEY` set as a Supabase Edge Function secret via `supabase secrets set`, never present in the Expo client bundle or `.env` committed to git.

## Edge Function: `extract-contact`

- **Input:** `{ transcript: string }`
- **Output:** `{ name: string, contextTags: string[] }` — empty string / empty array if extraction finds nothing usable, never an error for "no clear name" (that's a normal, expected case — post-meeting whispers can be mumbled or incomplete).
- **Model:** `claude-haiku-4.5`, matching the "AI (fast)" row in the stack table.
- **Prompt contract:** fixed system prompt instructing the model to extract only a name and short freeform descriptive tags (role, company, physical/context details) from a casual spoken transcript, and to return *only* the JSON object, no prose. Response is parsed and validated (shape-checked) server-side before returning to the client — if the model's output doesn't parse as the expected shape, the function returns the empty-fields shape rather than forwarding malformed JSON to the client.
- **No auth gate on this pass** — matches the rest of the app's current no-auth state (Supabase Auth is still Up Next #4). Revisit when auth lands, since an unauthenticated public Edge Function calling a paid API is a cost-abuse surface worth locking down before wider release.

## Components

- **`src/app/capture.tsx`** (modified) — restructured into two top-level states: `'voice'` (default — shows the idle mic button; tapping it moves to actively listening with a live partial transcript, all within this same state) and `'form'` (today's existing UI, entered either after a successful transcript+extraction round-trip or via a manual "Enter manually instead" link shown in the voice state). Recording never starts automatically on screen open — it's tap-to-start. The existing `handleSave`/`createContact` path is untouched once in `'form'` state.
- **`src/components/onboarding/voice-listening-visual.tsx`** (reused, not duplicated) — the pulse-ring + waveform component already built for onboarding's `capture-preview.tsx` becomes the recording-state visual here too, styled the same way for visual consistency between the "preview" and the real thing.
- **`src/hooks/use-voice-capture.ts`** (new) — wraps `expo-speech-recognition`'s start/stop/partial-results lifecycle and the `extract-contact` POST call, exposing `{ state, partialTranscript, start, stop }` to keep `capture.tsx` a pure component per the project's component rules (no raw effect/lifecycle logic in the screen body).
- **`supabase/functions/extract-contact/index.ts`** (new) — the Edge Function itself.

## Error handling

- Microphone/speech-recognition permission denied → inline message + a button that opens Settings, matching the existing pattern used for location permission on the Map screen.
- No speech detected / recognition failure → drops straight into the manual `'form'` state, empty fields, no crash, no dead end.
- Edge Function network failure or non-200 response → the raw transcript stays visible in a dismissible banner above the (now-empty) form fields, so nothing captured by the user's voice is silently lost even if auto-fill fails.
- Edge Function returns the "nothing extracted" empty shape → same as above, treated as a normal outcome, not an error state.
- Save Contact is never blocked by anything in this flow — manual typing always works as the escape hatch, identical to today.

## Testing & verification

- `npx tsc --noEmit` and `npx expo export --platform web` as baseline sanity checks (note: `expo-speech-recognition` has no web implementation, so the recording state itself won't render meaningfully in the web export — expected, same class of limitation as `react-native-webview`/`expo-blur` earlier in this project).
- Edge Function tested standalone first, via `supabase functions serve` + `curl` with a handful of sample transcripts (clear, mumbled, silent/empty), before wiring the client to it.
- `npx expo run:ios` rebuild required for the new native module.
- On-device pass: mic/speech permission flow (grant + deny paths), live partial transcript rendering, pre-fill accuracy on real spoken test phrases, the "Enter manually instead" bypass, and the network-failure fallback (airplane mode test with a real transcript already captured).
- No automated test suite for the on-device recognition or the live Edge Function call — consistent with how the rest of this project's on-device-only features (onboarding animations, map geofencing) have been verified: manual, on-device, screenshot/behavior-confirmed rather than unit-tested.

## Explicit non-goals (deferred)

- Business-card OCR (Function 1's secondary capture path).
- Any use of the OpenAI Whisper API — on-device recognition is the implementation until/unless the user later provides an OpenAI key and asks to switch.
- Auth/rate-limiting on the Edge Function (revisit once Supabase Auth work starts).
- Function 2 (Encode — name/feature association + hook sentence generation) — this spec only covers getting structured fields into the existing form, not the downstream mnemonic-generation feature.
- Any change to the WatermelonDB schema.

## Setup checklist for the user (before this can run on-device)

1. Create a Supabase project at supabase.com (free tier is sufficient for this).
2. `supabase link` the project to this repo via the Supabase CLI.
3. `supabase secrets set ANTHROPIC_API_KEY=<key>` on that project.
4. `supabase functions deploy extract-contact` once the function code exists.
5. Add the project's URL/anon key to the Expo app's env config (client needs these to call the function, but never the Anthropic key itself).

# Voice Capture (Auto-Fill from Speech) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user tap a mic on the Capture screen, speak a natural description of someone they just met, and have name + context tags auto-fill into the existing (editable) contact form.

**Architecture:** On-device speech recognition (`expo-speech-recognition`, wrapping iOS's `SFSpeechRecognizer`) produces a transcript entirely on-device. The transcript is POSTed to one new Supabase Edge Function (`extract-contact`), which calls Claude haiku-4.5 to turn it into `{ name, contextTags }` JSON. The client pre-fills `capture.tsx`'s existing form fields with that result — no DB schema changes, no new fields.

**Tech Stack:** `expo-speech-recognition` (native STT), `@supabase/supabase-js` (client), a Deno-based Supabase Edge Function calling the Anthropic Messages API directly via `fetch` (no SDK import, to avoid Deno import friction).

**Spec:** `docs/superpowers/specs/2026-08-22-voice-capture-design.md`

## Global Constraints

- No DB schema changes — extraction output maps onto `createContact()`'s existing `{ name, contextTags }` shape.
- Transcription never leaves the device; only the final transcript text (not audio) is sent to the Edge Function.
- The Anthropic API key lives only as a Supabase Edge Function secret — never in the Expo client bundle, never committed to git.
- Save Contact must never be blocked by anything voice-related — manual entry is always available as a fallback (via "Enter manually instead" or automatically on any failure).
- This project has no automated test framework (confirmed: no `jest`/`vitest` in `package.json`, no `*.test.*` files anywhere). Every existing feature is verified via `npx tsc --noEmit`, `npx expo export --platform web`, and on-device/simulator checks (see Build Log). Follow that exact pattern here — do not introduce a new test framework as part of this feature.
- New native module (`expo-speech-recognition`) requires an `npx expo run:ios` rebuild — a Metro reload alone will not pick it up (same as the earlier `expo-blur` addition).
- Match existing code conventions exactly: NativeWind className styling, `SymbolView` for icons, `PrimaryButton` for the CTA, `Linking` from `'react-native'` (not `expo-linking`) for the Settings deep link — this is what `src/app/(tabs)/map.tsx` already uses for its permission-denied state.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (modify) | Add `expo-speech-recognition`, `@supabase/supabase-js` |
| `app.json` (modify) | Add `expo-speech-recognition` config plugin |
| `tsconfig.json` (modify) | Exclude `supabase/**` (Deno runtime, not part of the app's TS project) |
| `.env.example` (create) | Documents the two `EXPO_PUBLIC_*` vars the client needs |
| `src/lib/supabase.ts` (create) | Supabase client singleton — `null` when env vars aren't configured yet |
| `src/lib/extract-contact.ts` (create) | `extractContact(transcript)` — calls the Edge Function, validates the response, always resolves (never throws) |
| `supabase/functions/extract-contact/index.ts` (create) | The Edge Function: transcript → Claude haiku-4.5 → validated `{ name, contextTags }` JSON |
| `src/hooks/use-voice-capture.ts` (create) | Wraps `expo-speech-recognition`'s lifecycle + calls `extractContact`, exposes a small state machine to the screen |
| `src/app/capture.tsx` (modify) | Restructured into `'voice'` (default) and `'form'` states |

---

### Task 1: Dependencies & config plumbing

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Modify: `tsconfig.json`
- Create: `.env.example`

**Interfaces:**
- Produces: `expo-speech-recognition` and `@supabase/supabase-js` available as imports for later tasks. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as the two env var names every later task must use verbatim.

- [ ] **Step 1: Install the two dependencies**

```bash
npx expo install @supabase/supabase-js
npm install expo-speech-recognition@56.0.1
```

(`expo-speech-recognition` is a community package with no SDK-57-tagged release yet — pin it exactly, matching how this repo already pins other community native modules like `"react-native-webview": "13.16.1"` rather than using a `~` range.)

- [ ] **Step 2: Add the config plugin to `app.json`**

Add `"expo-speech-recognition"` with its permission strings to the `plugins` array, right after the existing `"expo-notifications"` entry:

```json
      "expo-notifications",
      [
        "expo-speech-recognition",
        {
          "microphonePermission": "Naymly uses your microphone to capture a contact by voice.",
          "speechRecognitionPermission": "Naymly uses speech recognition to turn what you say into a contact."
        }
      ]
```

- [ ] **Step 3: Exclude the Supabase Edge Function from the app's TypeScript project**

`tsconfig.json`'s `include` is `["**/*.ts", ...]`, which would otherwise pull the Deno-only Edge Function (Task 3) into `tsc --noEmit` and fail on the unresolvable `Deno` global. Add an `exclude`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "experimentalDecorators": true,
    "paths": {
      "@/*": [
        "./src/*"
      ],
      "@/assets/*": [
        "./assets/*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ],
  "exclude": [
    "supabase/**"
  ]
}
```

- [ ] **Step 4: Create `.env.example`**

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

(The real values go in `.env.local`, which `.gitignore` already excludes via its `.env*.local` pattern — nothing further to change there.)

- [ ] **Step 5: Verify nothing broke**

```bash
npx tsc --noEmit
npx expo export --platform web
```

Expected: both clean — same as every prior Build Log entry's baseline check. `tsc` should no longer attempt to check anything under `supabase/` (it doesn't exist yet, but the exclusion is now in place for Task 3).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json tsconfig.json .env.example
git commit -m "Add voice-capture dependencies and config plumbing"
```

---

### Task 2: Supabase client + extraction request wrapper

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/extract-contact.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`'s `createClient`.
- Produces: `export const supabase: SupabaseClient | null` from `src/lib/supabase.ts`. `export type VoiceExtraction = { name: string; contextTags: string[] }`, `export async function extractContact(transcript: string): Promise<VoiceExtraction>` from `src/lib/extract-contact.ts` — Task 4's hook imports both of these names.

- [ ] **Step 1: Write `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// `null` until EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are set in .env.local —
// callers must treat a null client as "feature unavailable," never throw at import time.
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
```

- [ ] **Step 2: Write `src/lib/extract-contact.ts`**

```ts
import { supabase } from '@/lib/supabase';

export type VoiceExtraction = {
  name: string;
  contextTags: string[];
};

const EMPTY_EXTRACTION: VoiceExtraction = { name: '', contextTags: [] };

function isValidExtraction(value: unknown): value is VoiceExtraction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.contextTags) &&
    candidate.contextTags.every((tag) => typeof tag === 'string')
  );
}

export async function extractContact(transcript: string): Promise<VoiceExtraction> {
  if (!transcript.trim() || !supabase) return EMPTY_EXTRACTION;

  try {
    const { data, error } = await supabase.functions.invoke('extract-contact', {
      body: { transcript },
    });
    if (error || !isValidExtraction(data)) return EMPTY_EXTRACTION;
    return data;
  } catch {
    return EMPTY_EXTRACTION;
  }
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: clean. This is the closest available check given the project has no test runner — confirms both files type-check and the `@/lib/supabase` import path resolves.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/lib/extract-contact.ts
git commit -m "Add Supabase client and extract-contact request wrapper"
```

---

### Task 3: Supabase Edge Function (`extract-contact`)

**Files:**
- Create: `supabase/functions/extract-contact/index.ts`

**Interfaces:**
- Consumes: `{ transcript: string }` request body (this is exactly what Task 2's `extractContact` sends).
- Produces: JSON response body matching Task 2's `VoiceExtraction` shape (`{ name: string, contextTags: string[] }`) on every code path, including all failure cases.

- [ ] **Step 1: Write the Edge Function**

```ts
const EXTRACTION_SYSTEM_PROMPT = `You extract contact details from a short, casual spoken transcript recorded right after someone met a new person for the first time.

Extract only what is clearly and explicitly stated. Never invent or guess details that were not said.

Respond with ONLY a JSON object in exactly this shape, no prose, no markdown, no code fences:
{"name": string, "contextTags": string[]}

- "name": the person's full name if clearly stated, otherwise an empty string.
- "contextTags": an array of short (2-5 word) freeform phrases capturing role, company, physical description, or any other notable detail that was mentioned. Omit anything not explicitly said. Return an empty array if nothing notable was mentioned besides the name.`;

type Extraction = {
  name: string;
  contextTags: string[];
};

const EMPTY_EXTRACTION: Extraction = { name: '', contextTags: [] };

function isValidExtraction(value: unknown): value is Extraction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.contextTags) &&
    candidate.contextTags.every((tag) => typeof tag === 'string')
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let transcript: string;
  try {
    const body = await req.json();
    if (typeof body.transcript !== 'string' || body.transcript.trim().length === 0) {
      return Response.json(EMPTY_EXTRACTION);
    }
    transcript = body.transcript;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('extract-contact: ANTHROPIC_API_KEY is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      }),
    });
  } catch (err) {
    console.error('extract-contact: Anthropic request failed', err);
    return Response.json(EMPTY_EXTRACTION);
  }

  if (!anthropicResponse.ok) {
    console.error('extract-contact: Anthropic returned', anthropicResponse.status);
    return Response.json(EMPTY_EXTRACTION);
  }

  const anthropicBody = await anthropicResponse.json();
  const text = anthropicBody?.content?.[0]?.text;
  if (typeof text !== 'string') {
    return Response.json(EMPTY_EXTRACTION);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json(EMPTY_EXTRACTION);
  }

  if (!isValidExtraction(parsed)) {
    return Response.json(EMPTY_EXTRACTION);
  }

  return Response.json(parsed);
});
```

- [ ] **Step 2: Verify as far as this environment allows**

This machine has neither the Supabase CLI's local runtime prerequisites (Docker) nor a linked Supabase project, so `supabase functions serve` can't be exercised here. Do a careful manual read-through instead: confirm every `return` path produces the `{ name, contextTags }` shape (method-not-allowed and bad-JSON-body are the only two exceptions, and those are client-error paths that `extractContact`'s `error` check in Task 2 already treats as an empty extraction). Real verification happens once the user completes the setup checklist in the spec (`supabase functions serve --env-file supabase/.env.local`, then `curl -X POST http://localhost:54321/functions/v1/extract-contact -d '{"transcript":"..."}'` with a few sample transcripts) — flag this to the user rather than silently skipping it.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/extract-contact/index.ts
git commit -m "Add extract-contact Supabase Edge Function"
```

---

### Task 4: `useVoiceCapture` hook

**Files:**
- Create: `src/hooks/use-voice-capture.ts`

**Interfaces:**
- Consumes: `ExpoSpeechRecognitionModule` / `useSpeechRecognitionEvent` from `expo-speech-recognition`; `extractContact`, `VoiceExtraction` from `@/lib/extract-contact` (Task 2).
- Produces:
  ```ts
  export type VoiceCaptureStatus = 'idle' | 'listening' | 'processing' | 'permission-denied';
  export type VoiceCaptureOutcome = { transcript: string; extraction: VoiceExtraction };
  export function useVoiceCapture(onFinished: (outcome: VoiceCaptureOutcome) => void): {
    status: VoiceCaptureStatus;
    partialTranscript: string;
    start: () => Promise<void>;
    stop: () => void;
  };
  ```
  Task 5's `capture.tsx` consumes exactly this return shape.

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

import { extractContact, type VoiceExtraction } from '@/lib/extract-contact';

export type VoiceCaptureStatus = 'idle' | 'listening' | 'processing' | 'permission-denied';

export type VoiceCaptureOutcome = {
  transcript: string;
  extraction: VoiceExtraction;
};

export function useVoiceCapture(onFinished: (outcome: VoiceCaptureOutcome) => void) {
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const statusRef = useRef<VoiceCaptureStatus>('idle');
  const transcriptRef = useRef('');

  const setStatusBoth = useCallback((next: VoiceCaptureStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    transcriptRef.current = transcript;
    setPartialTranscript(transcript);
  });

  const finish = useCallback(() => {
    setStatusBoth('processing');
    const transcript = transcriptRef.current.trim();
    void extractContact(transcript).then((extraction) => {
      onFinished({ transcript, extraction });
      transcriptRef.current = '';
      setPartialTranscript('');
      setStatusBoth('idle');
    });
  }, [onFinished, setStatusBoth]);

  useSpeechRecognitionEvent('end', () => {
    if (statusRef.current !== 'listening') return;
    finish();
  });

  useSpeechRecognitionEvent('error', () => {
    if (statusRef.current !== 'listening') return;
    finish();
  });

  const start = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatusBoth('permission-denied');
      return;
    }
    transcriptRef.current = '';
    setPartialTranscript('');
    setStatusBoth('listening');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
  }, [setStatusBoth]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { status, partialTranscript, start, stop };
}
```

Notes for the implementer: `statusRef`/`transcriptRef` exist because `useSpeechRecognitionEvent`'s listener closures must always read the *current* status, not whatever `status` was when the listener was first registered — a plain `status` closure read would be stale. `'end'` and `'error'` both route through the same `finish()` — per the spec, a recognition failure must still land the user on the manual form with whatever transcript was captured (possibly none), never silently reset back to the idle mic button. The `statusRef.current !== 'listening'` guard in both handlers also protects against the two events double-firing for the same stop (only the first call actually runs `finish()`, since it synchronously flips status away from `'listening'` before either handler could re-enter).

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-voice-capture.ts
git commit -m "Add useVoiceCapture hook"
```

---

### Task 5: Rewrite `capture.tsx` with voice-first UI

**Files:**
- Modify: `src/app/capture.tsx` (full replacement of `src/app/capture.tsx:1-169`)

**Interfaces:**
- Consumes: `useVoiceCapture` (Task 4), `VoiceListeningVisual` (existing, `src/components/onboarding/voice-listening-visual.tsx`), `PrimaryButton` (existing).
- Produces: no new exports — this is the leaf screen.

- [ ] **Step 1: Replace the file**

```tsx
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { VoiceListeningVisual } from '@/components/onboarding/voice-listening-visual';
import { database } from '@/db';
import { createContact } from '@/db/repositories/contacts';
import { createPlace } from '@/db/repositories/places';
import { useVoiceCapture } from '@/hooks/use-voice-capture';

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

type ScreenState = 'voice' | 'form';

export default function CaptureScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('voice');
  const [name, setName] = useState('');
  const [contextTagsInput, setContextTagsInput] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptBanner, setTranscriptBanner] = useState<string | null>(null);

  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();

  const tags = parseTags(contextTagsInput);

  const voice = useVoiceCapture(({ transcript, extraction }) => {
    setName(extraction.name);
    setContextTagsInput(extraction.contextTags.join(', '));
    setTranscriptBanner(
      extraction.name.length === 0 && extraction.contextTags.length === 0 ? transcript : null
    );
    setScreenState('form');
  });

  function handleEnterManually() {
    setScreenState('form');
  }

  async function handleTakePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleChooseFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const contact = await createContact(database, {
        name: name.trim(),
        photoUri,
        contextTags: tags,
      });

      if (lat && lng) {
        try {
          await createPlace(database, contact.id, {
            latitude: Number(lat),
            longitude: Number(lng),
          });
        } catch {
          Alert.alert(
            'Contact saved',
            "We couldn't pin this place — you can try again from the map."
          );
        }
      }

      router.back();
    } catch {
      setError("Couldn't save this contact. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 py-4">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-11 w-11 items-center justify-center">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={20}
              weight="semibold"
              tintColor="#000000"
            />
          </Pressable>
          <Text className="flex-1 text-center font-serif text-2xl text-ink">New Contact</Text>
          <View className="h-11 w-11" />
        </View>

        {screenState === 'voice' ? (
          <View className="flex-1 items-center justify-center gap-8 px-4">
            {voice.status === 'permission-denied' ? (
              <>
                <Text className="text-center font-serif text-2xl text-ink">Microphone access needed</Text>
                <Text className="text-center text-base text-ink/60">
                  Naymly needs microphone and speech-recognition access to capture a contact by voice.
                </Text>
                <PrimaryButton label="Open Settings" onPress={() => Linking.openSettings()} />
              </>
            ) : voice.status === 'listening' ? (
              <>
                <VoiceListeningVisual />
                <Text className="min-h-[56px] text-center text-lg text-ink" accessibilityLiveRegion="polite">
                  {voice.partialTranscript || 'Listening…'}
                </Text>
                <PrimaryButton label="Done" onPress={voice.stop} />
              </>
            ) : voice.status === 'processing' ? (
              <>
                <VoiceListeningVisual />
                <Text className="text-center text-lg text-ink/60">One sec…</Text>
              </>
            ) : (
              <>
                <Pressable
                  onPress={voice.start}
                  accessibilityRole="button"
                  accessibilityLabel="Start voice capture"
                  className="h-24 w-24 items-center justify-center rounded-full bg-ink">
                  <SymbolView
                    name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }}
                    size={32}
                    weight="medium"
                    tintColor="#FFFFFF"
                  />
                </Pressable>
                <Text className="text-center text-lg text-ink/60">Tap and say who you just met</Text>
              </>
            )}

            {(voice.status === 'idle' || voice.status === 'permission-denied') && (
              <Pressable onPress={handleEnterManually} accessibilityRole="button">
                <Text className="text-sm font-semibold text-accent-terracotta">Enter manually instead</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-6 py-6"
              keyboardShouldPersistTaps="handled">
              {transcriptBanner && (
                <View className="flex-row items-start justify-between gap-3 rounded-xl bg-background-alt px-4 py-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-xs font-semibold text-ink/50">YOU SAID</Text>
                    <Text className="text-sm text-ink/70">{transcriptBanner}</Text>
                  </View>
                  <Pressable
                    onPress={() => setTranscriptBanner(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss">
                    <SymbolView
                      name={{ ios: 'xmark', android: 'close', web: 'close' }}
                      size={14}
                      tintColor="rgba(0,0,0,0.4)"
                    />
                  </Pressable>
                </View>
              )}

              <View className="items-center gap-3">
                <Pressable
                  onPress={handleTakePhoto}
                  accessibilityRole="button"
                  accessibilityLabel={photoUri ? 'Retake photo' : 'Take photo'}
                  className="h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-background-alt">
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} className="h-28 w-28" />
                  ) : (
                    <SymbolView
                      name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
                      size={28}
                      tintColor="#000000"
                    />
                  )}
                </Pressable>
                <Pressable onPress={handleChooseFromLibrary} accessibilityRole="button">
                  <Text className="text-sm font-semibold text-accent-terracotta">Choose from library</Text>
                </Pressable>
              </View>

              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-ink/60">Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Marcus Reynolds"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  accessibilityLabel="Name"
                  className="h-14 rounded-xl bg-background-alt px-5 text-lg text-ink"
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-ink/60">Context tags</Text>
                <TextInput
                  value={contextTagsInput}
                  onChangeText={setContextTagsInput}
                  placeholder="red tie, sales director, Boston terrier"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  accessibilityLabel="Context tags, separated by commas"
                  className="h-14 rounded-xl bg-background-alt px-5 text-base text-ink"
                />
                {tags.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 pt-1">
                    {tags.map((tag, index) => (
                      <View key={`${tag}-${index}`} className="rounded-full bg-accent-mint px-3 py-1.5">
                        <Text className="text-sm text-ink">{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {error && <Text className="text-sm text-accent-terracotta">{error}</Text>}
            </ScrollView>

            <PrimaryButton
              label={saving ? 'Saving…' : 'Save Contact'}
              disabled={name.trim().length === 0 || saving}
              onPress={handleSave}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
```

Note: the `autoFocus` prop on the Name `TextInput` was dropped — it no longer makes sense to autofocus a field that isn't the first thing on screen (voice is now the entry point, and the form can be reached with either empty or pre-filled fields).

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
npx expo export --platform web
```

Expected: both clean. Note `expo-speech-recognition` has no web implementation, so the `'voice'` state's mic button will render on web but tapping it won't do anything there — expected and consistent with how `react-native-webview`/`expo-blur` behave in the web export elsewhere in this project.

- [ ] **Step 3: Commit**

```bash
git add src/app/capture.tsx
git commit -m "Rebuild capture screen as voice-first with manual fallback"
```

---

### Task 6: Native rebuild and on-device verification

**Files:** none (build + manual verification only)

- [ ] **Step 1: Rebuild the native app**

```bash
npx expo run:ios
```

Expected: 0 errors/warnings, same as the `expo-blur` addition earlier in this project. This is required because `expo-speech-recognition` is a native module — a Metro-only reload will not pick it up.

- [ ] **Step 2: Deep-link to the capture screen and screenshot the default state**

```bash
xcrun simctl openurl booted "naymlyapp://capture"
xcrun simctl io booted screenshot /tmp/capture-voice-idle.png
```

Expected: the idle voice state renders — mic button, "Tap and say who you just met" copy, "Enter manually instead" link, header with close button. This is the check that catches the highest-risk regression (a broken import or crash on mount).

- [ ] **Step 3: Flag the interaction-level verification gap to the user**

This environment has no touch-injection tooling (no `idb`, no `simctl` UI automation — consistent with every prior on-device verification note in this project's Build Log). Tapping the mic, speaking, tapping "Done," granting/denying the permission dialog, and confirming the pre-filled form all require the user's own taps on the simulator (or a physical device). Tell the user exactly what to check:
1. Tap the mic — verify the permission dialog appears (first launch only), grant it.
2. Say a short test phrase (e.g. "Marcus Reynolds, sales director, red tie").
3. Watch the partial transcript update live, then tap "Done."
4. Confirm it lands on the form with Name/Context tags pre-filled (or, if no Supabase project is linked yet per the spec's setup checklist, confirm it lands on the *empty* form with a "YOU SAID" banner showing the transcript — this is the expected graceful-degradation path, not a bug).
5. Tap "Enter manually instead" from the idle state and confirm it skips straight to the empty form.
6. Deny the permission dialog (reinstall to reset it first) and confirm the "Open Settings" fallback renders.

- [ ] **Step 4: Update the Build Log**

Per this project's Hard Rules ("Update the Build Log at the end of every session"), add a completed-bullet to `CLAUDE.md`'s Build Log describing what was built, and update "Currently building"/"Up next"/"Blockers" — including the still-open setup checklist (create Supabase project, link it, set the `ANTHROPIC_API_KEY` secret, deploy the function) as a blocker until the user completes it, and noting the Whisper→on-device-recognition deviation from the stack table.

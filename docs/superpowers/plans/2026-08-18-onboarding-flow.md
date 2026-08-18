# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Naymly's first-run onboarding flow — value screen, role picker, camera-permission primer, a stubbed capture step, and a success state — gated in front of the rest of the app via Expo Router's Protected Routes, with no auth step.

**Architecture:** Restructure routing so the existing tab screens move under a `(tabs)` route group and a new `onboarding` route group sits alongside it; the root layout uses `Stack.Protected` to show one or the other based on a `hasOnboarded` flag. A single Zustand store holds both the durable flag (backed by AsyncStorage) and the ephemeral in-flow role selection, so completing onboarding reactively flips which route group is protected — no manual navigation-timing workarounds.

**Tech Stack:** Expo Router (Stack, Stack.Protected), Zustand, `@react-native-async-storage/async-storage` (new dependency), NativeWind, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-18-onboarding-flow-design.md`

## Global Constraints

- No auth step anywhere in this flow — Supabase is deliberately deferred (spec Context section).
- Only Camera permission is primed/requested during onboarding; Notifications/Location/Calendar/Contacts are deferred to first real use elsewhere (spec Non-goals).
- The real Capture screen (photo picker, OCR, WatermelonDB write) is a separate, already-scoped roadmap item — this plan builds only a stub at `src/app/onboarding/capture.tsx` that satisfies the integration contract (reads role, marks completion), clearly marked as temporary (spec Non-goals).
- No real brand font or logo assets exist yet — use `Georgia` (iOS system serif) as a placeholder `font-serif` token, not a hardcoded one-off (spec Open dependency).
- Onboarding screens use the light brand palette (cream/mint/gold from `tailwind.config.js`) regardless of system color scheme — locked to light appearance, matching how the reference apps' onboarding screens behave. This wasn't explicitly asked in the spec; it's an implementation-level call, noted here rather than silently made.
- Touch targets ≥ 44×44pt; screens use plain `Text`/`View`/`Pressable` with NativeWind `className`, not the `ThemedText`/`ThemedView` boilerplate components (those are Expo-template leftovers using a generic light/dark theme unrelated to Naymly's brand palette).
- There is no test runner in this project yet, and the approved spec's Testing section scoped verification to `tsc --noEmit` + `expo export --platform web`, not unit tests — each task's verification follows that, not generic TDD.
- Typed routes (`experiments.typedRoutes` in `app.json`) means `tsc --noEmit` needs `.expo/types/router.d.ts` regenerated after new route files are added. That file is gitignored and regenerates from a brief dev-server run — see the snippet in each task's verification step.

---

## Task 1: Onboarding status storage + state store

**Files:**
- Modify: `package.json` (add `@react-native-async-storage/async-storage`)
- Create: `src/lib/onboarding-status.ts`
- Create: `src/state/onboarding.ts`

**Interfaces:**
- Produces: `OnboardingRole` type (`'sales' | 'events' | 'school' | 'other'`), `getHasOnboarded(): Promise<boolean>`, `getStoredRole(): Promise<OnboardingRole | null>`, `setOnboarded(role: OnboardingRole | null): Promise<void>` from `src/lib/onboarding-status.ts`.
- Produces: `useOnboardingStore` (Zustand hook) from `src/state/onboarding.ts`, with state shape `{ hasOnboarded: boolean | null; role: OnboardingRole | null; loadFromStorage: () => Promise<void>; setRole: (role: OnboardingRole) => void; complete: () => Promise<void>; }`. `hasOnboarded: null` means "not yet loaded from storage."

- [ ] **Step 1: Add the AsyncStorage dependency**

Run: `npx expo install @react-native-async-storage/async-storage`

- [ ] **Step 2: Write `src/lib/onboarding-status.ts`**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OnboardingRole = 'sales' | 'events' | 'school' | 'other';

const HAS_ONBOARDED_KEY = 'naymly.has-onboarded';
const ROLE_KEY = 'naymly.onboarding-role';

export async function getHasOnboarded(): Promise<boolean> {
  const value = await AsyncStorage.getItem(HAS_ONBOARDED_KEY);
  return value === 'true';
}

export async function getStoredRole(): Promise<OnboardingRole | null> {
  const value = await AsyncStorage.getItem(ROLE_KEY);
  return (value as OnboardingRole | null) ?? null;
}

export async function setOnboarded(role: OnboardingRole | null): Promise<void> {
  await AsyncStorage.setItem(HAS_ONBOARDED_KEY, 'true');
  if (role) {
    await AsyncStorage.setItem(ROLE_KEY, role);
  }
}
```

- [ ] **Step 3: Write `src/state/onboarding.ts`**

```typescript
import { create } from 'zustand';

import {
  getHasOnboarded,
  getStoredRole,
  setOnboarded,
  type OnboardingRole,
} from '@/lib/onboarding-status';

type OnboardingState = {
  hasOnboarded: boolean | null;
  role: OnboardingRole | null;
  loadFromStorage: () => Promise<void>;
  setRole: (role: OnboardingRole) => void;
  complete: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hasOnboarded: null,
  role: null,
  loadFromStorage: async () => {
    const [hasOnboarded, role] = await Promise.all([getHasOnboarded(), getStoredRole()]);
    set({ hasOnboarded, role });
  },
  setRole: (role) => set({ role }),
  complete: async () => {
    const { role } = get();
    await setOnboarded(role);
    set({ hasOnboarded: true });
  },
}));
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/onboarding-status.ts src/state/onboarding.ts
git commit -m "Add onboarding status storage and Zustand store"
```

---

## Task 2: Shared onboarding UI components

**Files:**
- Modify: `tailwind.config.js` (add `theme.extend.fontFamily.serif`)
- Create: `src/components/onboarding/primary-button.tsx`
- Create: `src/components/onboarding/progress-dots.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PrimaryButton({ label: string; onPress: () => void })` and `ProgressDots({ current: number; total: number })`, both default-export-free named exports from `src/components/onboarding/`. Every later onboarding screen imports these.

- [ ] **Step 1: Add the serif font token**

In `tailwind.config.js`, add a `fontFamily` block inside `theme.extend` (alongside the existing `colors` block):

```javascript
theme: {
  extend: {
    colors: {
      background: '#F6F5F2',
      'background-alt': '#F7EED4',
      'accent-mint': '#D6F0E4',
      'accent-gold': '#E7D397',
      neutral: '#C0BDB7',
      ink: '#000000',
      surface: '#FFFFFF',
    },
    fontFamily: {
      serif: ['Georgia'],
    },
  },
},
```

- [ ] **Step 2: Write `src/components/onboarding/primary-button.tsx`**

```typescript
import { Pressable, Text } from 'react-native';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function PrimaryButton({ label, onPress }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[44px] items-center justify-center rounded-full bg-ink px-6 py-4">
      <Text className="text-base font-semibold text-surface">{label}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 3: Write `src/components/onboarding/progress-dots.tsx`**

```typescript
import { View } from 'react-native';

type ProgressDotsProps = {
  current: number;
  total: number;
};

export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={
            index < current ? 'h-2 w-2 rounded-full bg-ink' : 'h-2 w-2 rounded-full bg-neutral'
          }
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js src/components/onboarding/primary-button.tsx src/components/onboarding/progress-dots.tsx
git commit -m "Add shared onboarding UI components and serif font token"
```

---

## Task 3: Routing restructure — (tabs) group, onboarding group, Protected Routes gating

**Files:**
- Create: `src/app/(tabs)/_layout.tsx`
- Move: `src/app/index.tsx` → `src/app/(tabs)/index.tsx`
- Move: `src/app/explore.tsx` → `src/app/(tabs)/explore.tsx`
- Create: `src/app/onboarding/_layout.tsx`
- Create: `src/app/onboarding/value.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `useOnboardingStore` (Task 1), `PrimaryButton`, `ProgressDots` (Task 2).
- Produces: routes `/onboarding/value` and the `(tabs)` group's routes now living under that group (paths themselves — `/`, `/explore` — are unchanged, since `(tabs)` is a non-matching group segment). Later tasks add more screens as siblings of `value.tsx` inside `src/app/onboarding/`.

- [ ] **Step 1: Move the existing tab screens into a `(tabs)` group**

```bash
mkdir -p "src/app/(tabs)"
git mv src/app/index.tsx "src/app/(tabs)/index.tsx"
git mv src/app/explore.tsx "src/app/(tabs)/explore.tsx"
```

No content changes needed — both files only import via the `@/` alias, which is depth-independent.

- [ ] **Step 2: Write `src/app/(tabs)/_layout.tsx`**

```typescript
export { default } from '@/components/app-tabs';
```

- [ ] **Step 3: Write `src/app/onboarding/_layout.tsx`**

```typescript
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Write `src/app/onboarding/value.tsx`**

```typescript
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { ProgressDots } from '@/components/onboarding/progress-dots';

export default function ValueScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <ProgressDots current={1} total={2} />
        <View className="gap-4">
          <Text className="font-serif text-4xl text-ink">
            Forgetting a name is not a character flaw.
          </Text>
          <Text className="text-base text-ink/70">
            Naymly helps you remember who you meet, so you never blank on a name again.
          </Text>
        </View>
        <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/role')} />
      </View>
    </SafeAreaView>
  );
}
```

Note: this links to `/onboarding/role`, which doesn't exist until Task 4. That's expected — the type-check step below regenerates route types from whatever route files exist at the time, so this specific file will show a route-typing error until Task 4 lands. This task's verification step accounts for that.

- [ ] **Step 5: Rewrite `src/app/_layout.tsx`**

```typescript
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import '@/global.css';
import { useOnboardingStore } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasOnboarded = useOnboardingStore((state) => state.hasOnboarded);
  const loadFromStorage = useOnboardingStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {hasOnboarded !== null && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={hasOnboarded}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!hasOnboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
```

This intentionally renders neither group while `hasOnboarded === null` (storage not read yet) — the `AnimatedSplashOverlay` covers the screen during that brief window, so nothing flashes.

- [ ] **Step 6: Regenerate typed routes and type-check**

Because Task 4 hasn't run yet, `value.tsx`'s link to `/onboarding/role` is expected to fail type-checking at this point — that's fine, it's the next task. Instead, verify the parts this task is actually responsible for: the file moves resolved correctly and the root layout compiles.

Run:
```bash
(CI=1 npx expo start --web --port 8099 > /tmp/expo-start.log 2>&1 &)
sleep 12
pkill -f "expo start --web --port 8099"
npx tsc --noEmit
```
Expected: the only error is the unresolved `/onboarding/role` literal in `value.tsx` (from `router.push`). No errors about `(tabs)/index.tsx`, `(tabs)/explore.tsx`, `app-tabs.tsx`, or `_layout.tsx`. If there are other errors, stop and fix them before continuing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Restructure routing: (tabs) group, onboarding group, Protected Routes gating"
```

---

## Task 4: Role picker screen

**Files:**
- Create: `src/app/onboarding/role.tsx`

**Interfaces:**
- Consumes: `useOnboardingStore` (`role`, `setRole` from Task 1), `PrimaryButton`, `ProgressDots` (Task 2), `OnboardingRole` type (Task 1).
- Produces: route `/onboarding/role`, resolving the dangling link from Task 3's `value.tsx`.

- [ ] **Step 1: Write `src/app/onboarding/role.tsx`**

```typescript
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { ProgressDots } from '@/components/onboarding/progress-dots';
import type { OnboardingRole } from '@/lib/onboarding-status';
import { useOnboardingStore } from '@/state/onboarding';

const ROLE_OPTIONS: { value: OnboardingRole; label: string }[] = [
  { value: 'sales', label: 'Sales & networking' },
  { value: 'events', label: 'Events & conferences' },
  { value: 'school', label: 'School' },
  { value: 'other', label: 'Other' },
];

export default function RoleScreen() {
  const role = useOnboardingStore((state) => state.role);
  const setRole = useOnboardingStore((state) => state.setRole);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <ProgressDots current={2} total={2} />
        <View className="gap-4">
          <Text className="font-serif text-3xl text-ink">What brings you to Naymly?</Text>
          <View className="gap-3" accessibilityRole="radiogroup">
            {ROLE_OPTIONS.map((option) => {
              const selected = role === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? 'min-h-[44px] justify-center rounded-2xl border-2 border-ink bg-accent-mint px-4 py-3'
                      : 'min-h-[44px] justify-center rounded-2xl border-2 border-neutral bg-surface px-4 py-3'
                  }>
                  <Text className="text-base text-ink">{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/camera-primer')} />
      </View>
    </SafeAreaView>
  );
}
```

Note: `Continue` is enabled regardless of whether a role is selected — the spec treats this as a personalization nicety, not a gate.

Note: this links to `/onboarding/camera-primer`, which doesn't exist until Task 5 — same pattern as Task 3, expected to fail typed-route checking until then.

- [ ] **Step 2: Regenerate typed routes and type-check**

Run:
```bash
(CI=1 npx expo start --web --port 8099 > /tmp/expo-start.log 2>&1 &)
sleep 12
pkill -f "expo start --web --port 8099"
npx tsc --noEmit
```
Expected: the only error is the unresolved `/onboarding/camera-primer` literal (in `role.tsx`). The previous `/onboarding/role` error from Task 3 should now be gone.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/role.tsx
git commit -m "Add onboarding role picker screen"
```

---

## Task 5: Camera primer + stubbed capture screen

**Files:**
- Create: `src/app/onboarding/camera-primer.tsx`
- Create: `src/app/onboarding/capture.tsx`

**Interfaces:**
- Consumes: `PrimaryButton` (Task 2).
- Produces: routes `/onboarding/camera-primer` and `/onboarding/capture`, resolving the dangling link from Task 4's `role.tsx`. `capture.tsx` is an explicit stub — see the code comment inside it — to be replaced file-for-file by the real Capture screen in its own future task.

- [ ] **Step 1: Write `src/app/onboarding/camera-primer.tsx`**

```typescript
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';

export default function CameraPrimerScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-3xl text-ink">
            To save a name and face in one shot
          </Text>
          <Text className="text-center text-base text-ink/70">
            Naymly needs camera access to snap a quick photo or scan a business card. You can
            change this anytime in Settings.
          </Text>
        </View>
        {/*
          The actual permission request call belongs to the Capture screen's real
          implementation (a separate task) — it depends on which picker API that
          screen settles on. This button only primes and moves forward.
        */}
        <PrimaryButton
          label="Allow Camera Access"
          onPress={() => router.push('/onboarding/capture')}
        />
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Write `src/app/onboarding/capture.tsx`**

```typescript
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';

// STUB: replaced file-for-file by the real Capture screen (name + photo,
// WatermelonDB write) in its own roadmap task. This satisfies onboarding's
// integration contract — route in, route to success with a `captured` flag —
// without implementing real capture logic here.
export default function CaptureScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-2xl text-ink">
            Capture screen coming next
          </Text>
          <Text className="text-center text-base text-ink/70">
            This placeholder stands in for the real name + photo capture flow.
          </Text>
        </View>
        <View className="gap-3">
          <PrimaryButton
            label="Simulate save"
            onPress={() =>
              router.push({ pathname: '/onboarding/success', params: { captured: 'true' } })
            }
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: '/onboarding/success', params: { captured: 'false' } })
            }
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center py-3">
            <Text className="text-base text-ink/70">Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Regenerate typed routes and type-check**

Run:
```bash
(CI=1 npx expo start --web --port 8099 > /tmp/expo-start.log 2>&1 &)
sleep 12
pkill -f "expo start --web --port 8099"
npx tsc --noEmit
```
Expected: the only error is the unresolved `/onboarding/success` literal (used twice in `capture.tsx`). The previous `/onboarding/camera-primer` error from Task 4 should now be gone.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/camera-primer.tsx src/app/onboarding/capture.tsx
git commit -m "Add camera-primer screen and stubbed capture screen"
```

---

## Task 6: Success screen and completion wiring

**Files:**
- Create: `src/app/onboarding/success.tsx`

**Interfaces:**
- Consumes: `useOnboardingStore` (`complete` from Task 1), `PrimaryButton` (Task 2), `useLocalSearchParams` (expo-router).
- Produces: route `/onboarding/success`, resolving the dangling links from Task 5's `capture.tsx`. Calling `complete()` here is what flips `hasOnboarded` in the shared store, which the root layout (Task 3) reactively responds to.

- [ ] **Step 1: Write `src/app/onboarding/success.tsx`**

```typescript
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { useOnboardingStore } from '@/state/onboarding';

export default function SuccessScreen() {
  const { captured } = useLocalSearchParams<{ captured?: string }>();
  const complete = useOnboardingStore((state) => state.complete);
  const didCapture = captured === 'true';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-3xl text-ink">
            {didCapture ? "Saved. That's your first contact." : "You're all set."}
          </Text>
          <Text className="text-center text-base text-ink/70">
            {didCapture
              ? "You'll get a quiet reminder before you see them again."
              : 'Add your first contact anytime.'}
          </Text>
        </View>
        <PrimaryButton
          label="Let's go"
          onPress={async () => {
            await complete();
            router.replace('/');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
```

`router.replace('/')` targets the `(tabs)` group's index route — group segments like `(tabs)` don't appear in the URL, so `/` is correct here, not `/(tabs)`.

- [ ] **Step 2: Regenerate typed routes and type-check**

Run:
```bash
(CI=1 npx expo start --web --port 8099 > /tmp/expo-start.log 2>&1 &)
sleep 12
pkill -f "expo start --web --port 8099"
npx tsc --noEmit
```
Expected: no errors. Every route referenced anywhere in the onboarding flow now exists.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/success.tsx
git commit -m "Add onboarding success screen and wire completion flow"
```

---

## Task 7: Full verification and Build Log update

**Files:**
- Modify: `CLAUDE.md` (Build Log section)

**Interfaces:**
- Consumes: nothing new — this task only verifies and documents the finished flow from Tasks 1–6.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors (routes were already fully resolved as of Task 6).

- [ ] **Step 2: Web export smoke test**

Run: `npx expo export --platform web`
Expected: succeeds, produces bundles for `/`, `/explore`, `/onboarding/value`, `/onboarding/role`, `/onboarding/camera-primer`, `/onboarding/capture`, `/onboarding/success` among the static routes listed in the output.

Then remove the export artifact: `rm -rf dist`

- [ ] **Step 3: expo-doctor check**

Run: `npx expo-doctor`
Expected: no new warnings introduced by this work (the pre-existing WatermelonDB New Architecture warning from earlier work is expected and not addressed by this plan).

- [ ] **Step 4: Update the Build Log in `CLAUDE.md`**

Read `CLAUDE.md` first to confirm the Build Log section still matches the text below (it may have changed since this plan was written — if so, adapt the edit to the current wording rather than blindly applying it). If it matches, make this edit:

Replace:
```
**Last updated:** 2026-08-18
**Current phase:** Phase 1 — Core Loop (in progress)
**Currently building:** WatermelonDB schema — code written but UNVERIFIED at runtime (see blockers). Supabase project still deliberately on hold.
**Completed screens/features:**
- Project scaffold: `create-expo-app` default template (Expo SDK 57, TypeScript strict, Expo Router, `src/` layout) with NativeWind 4 (Tailwind config carries the brand color tokens from Design System) and Zustand installed. Verified via `npx tsc --noEmit` (clean) and `npx expo export --platform web` (bundles successfully, Tailwind CSS compiles). Not yet booted in the iOS simulator.
- WatermelonDB schema/model/repository (`src/db/`) — scoped to just what the Capture screen needs: a `contacts` table (name, photo, context tags). Full domain schema (Place, ContactPlace, Brief) intentionally deferred to the phases that need them.
- PII encryption (`src/lib/encryption.ts`) — resolves the Hard Rules' Day-1 "encrypted at rest" bar. Uses `expo-crypto`'s native AES-256-GCM module (hardware-backed via CryptoKit on iOS) with a key generated once and stored in the iOS Keychain via `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). `Contact` model exposes only ciphertext as raw WatermelonDB fields (`name_cipher`, `photo_uri_cipher`, `context_tags_cipher`); decryption happens through async `getName()`/`getPhotoUri()`/`getContextTags()` methods. `src/db/repositories/contacts.ts#createContact` encrypts before every write. Considered and rejected `crypto-js` (flagged itself as unmaintained mid-install) and a third-party native AES library (`react-native-aes-gcm-crypto`, last published 2022) in favor of the first-party Expo module.

**Up next (in order):**
1. **Verify WatermelonDB actually works** — first real `expo prebuild && expo run:ios`. Not yet possible: Xcode.app isn't installed on this machine (only Command Line Tools — no `simctl`/`xcodebuild`). Install Xcode, then run this before or alongside the Capture screen; do not assume WatermelonDB works until this has actually run.
2. Capture screen (name + photo + context tags, local save only) — first real exercise of the DB/encryption code above
3. Basic contact list / review screen (manual, no AI yet)
4. Supabase project + auth wiring (resume when ready — was deliberately held off during scaffold)

**Blockers / open questions:**
- **Xcode.app not installed** on this machine — blocks all native builds (`expo run:ios`, simulator testing, and eventually the Live Activity/widget extensions). Needs to be installed from the App Store before task 1 above can happen.
- **WatermelonDB New Architecture compatibility is unverified.** `expo-doctor` flags it as "Untested on New Architecture" (RN 0.86 / Expo 57 default). No official Expo support exists (open feature request since 2018); the community plugin (`@morrowdigital/watermelondb-expo-plugin`) was only verified against Expo SDK 47/48, years before the New Architecture. A Nov 2025 community comment suggested favoring alternatives (op-sqlite, InstantDB) instead. Schema/model code is written and type-checks, but treat it as **unproven** until the first real simulator build. If it breaks, the fallback options already identified are `op-sqlite` or `expo-sqlite` + a thin reactive layer.
- Native Swift widget/Live Activity extension setup not yet scaffolded — needs Expo prebuild + config plugin research before Phase 3 work starts
- 30+ response validation survey still outstanding (see [[Projects/namelock]])
- One pre-existing lint error in the Expo template's own boilerplate (`src/hooks/use-color-scheme.web.ts:11`, `react-hooks/set-state-in-effect`) — not introduced by us, left as-is
```

With:
```
**Last updated:** 2026-08-18
**Current phase:** Phase 1 — Core Loop (in progress)
**Currently building:** Real Capture screen (name + photo + context tags, local save only) — replaces the stub at `src/app/onboarding/capture.tsx`. WatermelonDB and the onboarding flow are both code-complete but UNVERIFIED at runtime (see blockers). Supabase project still deliberately on hold.
**Completed screens/features:**
- Project scaffold: `create-expo-app` default template (Expo SDK 57, TypeScript strict, Expo Router, `src/` layout) with NativeWind 4 (Tailwind config carries the brand color tokens from Design System) and Zustand installed. Verified via `npx tsc --noEmit` (clean) and `npx expo export --platform web` (bundles successfully, Tailwind CSS compiles). Not yet booted in the iOS simulator.
- WatermelonDB schema/model/repository (`src/db/`) — scoped to just what the Capture screen needs: a `contacts` table (name, photo, context tags). Full domain schema (Place, ContactPlace, Brief) intentionally deferred to the phases that need them.
- PII encryption (`src/lib/encryption.ts`) — resolves the Hard Rules' Day-1 "encrypted at rest" bar. Uses `expo-crypto`'s native AES-256-GCM module (hardware-backed via CryptoKit on iOS) with a key generated once and stored in the iOS Keychain via `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). `Contact` model exposes only ciphertext as raw WatermelonDB fields (`name_cipher`, `photo_uri_cipher`, `context_tags_cipher`); decryption happens through async `getName()`/`getPhotoUri()`/`getContextTags()` methods. `src/db/repositories/contacts.ts#createContact` encrypts before every write. Considered and rejected `crypto-js` (flagged itself as unmaintained mid-install) and a third-party native AES library (`react-native-aes-gcm-crypto`, last published 2022) in favor of the first-party Expo module.
- Onboarding flow (`src/app/onboarding/`, spec: `docs/superpowers/specs/2026-08-18-onboarding-flow-design.md`) — value screen, role picker, camera-permission primer, a stubbed capture step, success state, gated in front of the app via Expo Router `Stack.Protected` on a `hasOnboarded` flag (Zustand + AsyncStorage, `src/state/onboarding.ts`). No auth step, matching the Supabase deferral. Existing tab screens moved to a `(tabs)` route group as part of this work. Verified via `npx tsc --noEmit` and `npx expo export --platform web`; not yet run in the iOS Simulator.

**Up next (in order):**
1. **Verify WatermelonDB and the onboarding flow actually work** — first real `expo prebuild && expo run:ios`. Not yet possible: Xcode.app isn't installed on this machine (only Command Line Tools — no `simctl`/`xcodebuild`). Install Xcode, then run this; do not assume either works until this has actually run. In particular, verify the onboarding redirect-gating logic doesn't flash the main app before redirecting, and that killing the app mid-flow and relaunching correctly resumes at onboarding.
2. Real Capture screen (name + photo + context tags, local save only) — replaces the `src/app/onboarding/capture.tsx` stub file-for-file; first real exercise of the DB/encryption code
3. Basic contact list / review screen (manual, no AI yet) — also becomes the real destination onboarding's success screen and the `(tabs)` index route should eventually route to, replacing today's placeholder Expo starter screens
4. Supabase project + auth wiring (resume when ready — was deliberately held off during scaffold)

**Blockers / open questions:**
- **Xcode.app not installed** on this machine — blocks all native builds (`expo run:ios`, simulator testing, and eventually the Live Activity/widget extensions). Needs to be installed from the App Store before task 1 above can happen.
- **WatermelonDB New Architecture compatibility is unverified.** `expo-doctor` flags it as "Untested on New Architecture" (RN 0.86 / Expo 57 default). No official Expo support exists (open feature request since 2018); the community plugin (`@morrowdigital/watermelondb-expo-plugin`) was only verified against Expo SDK 47/48, years before the New Architecture. A Nov 2025 community comment suggested favoring alternatives (op-sqlite, InstantDB) instead. Schema/model code is written and type-checks, but treat it as **unproven** until the first real simulator build. If it breaks, the fallback options already identified are `op-sqlite` or `expo-sqlite` + a thin reactive layer.
- **No real brand assets yet** — logo/icon and the actual brand serif font. Onboarding currently uses a plain wordmark and `Georgia` as placeholders (see the onboarding spec's Open Dependency note).
- Native Swift widget/Live Activity extension setup not yet scaffolded — needs Expo prebuild + config plugin research before Phase 3 work starts
- 30+ response validation survey still outstanding (see [[Projects/namelock]])
- One pre-existing lint error in the Expo template's own boilerplate (`src/hooks/use-color-scheme.web.ts:11`, `react-hooks/set-state-in-effect`) — not introduced by us, left as-is
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Update Build Log: onboarding flow complete, pending Simulator verification"
git push
```

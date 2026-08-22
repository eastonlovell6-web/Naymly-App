# Map / Pin / Geofence Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Map tab where the user sees their location, taps anywhere to pin a contact to that place, and gets a local notification when they later arrive there.

**Architecture:** A new WatermelonDB `places`/`contact_places` data layer backs a `react-native-maps` screen. Tapping an empty map spot navigates to the existing `capture.tsx` screen (passing the tapped coordinates as route params); its existing contact-save path is extended to also create the place and register an `expo-location` geofence. A background task (via `expo-task-manager`) fires a local notification (`expo-notifications`) on arrival, and all saved places are re-registered with the OS on every cold start.

**Tech Stack:** `react-native-maps`, `expo-location`, `expo-task-manager`, `expo-notifications` (new); existing WatermelonDB, `expo-router`, NativeWind, `expo-symbols`.

**Spec:** `docs/superpowers/specs/2026-08-21-map-pin-geofence-design.md` — read it alongside this plan; this plan implements it verbatim except where noted (the `capture.tsx` reuse update is already folded into both).

## Global Constraints

- No test runner (Jest, etc.) is configured anywhere in this project — every existing feature is verified via `npx tsc --noEmit`, `npx expo export --platform web` (a bundle/route sanity check only — Naymly has no real web target), and manual on-device checks via the iOS Simulator. Follow that exact pattern here; do not introduce a test framework as part of this plan.
- New native modules require an `npx expo run:ios` rebuild — a Metro/JS reload alone will not pick them up (same as the earlier `expo-blur` addition).
- Never hand-edit `.pbxproj` or other native project files — all permission/background-mode config goes through `app.json`'s declarative fields and Expo config plugins.
- Geofencing: `expo-location`'s `startGeofencingAsync`/background task API only — this is backed by `CLCircularRegion` on iOS, satisfying the project's "no continuous GPS polling" rule without a hand-written native Swift module. Cap monitored places at 20 (`PLACE_CAP`).
- No notification bundling and no per-person cooldown in this pass — one place, one contact, one notification per arrival. Explicitly deferred, per the spec.
- No search/geocoding-based place picker — tap-anywhere placement only.
- Contact PII encryption (`src/lib/encryption.ts`, `Contact` model's cipher fields) is untouched by this work — `places`/`contact_places` hold no PII (lat/lng, foreign keys, radius) and are not encrypted.
- Color tokens (NativeWind, from `tailwind.config.js`): `background` `#F6F5F2`, `background-alt` `#F7EED4`, `accent-terracotta` `#C1502E`, `ink` `#000000`, `surface` `#FFFFFF`. Match existing screens' use of `font-serif` for headings and `PrimaryButton` for primary actions.
- Follow existing repository patterns exactly: `src/db/repositories/contacts.ts` (`createContact`, `observeContacts`) is the template for the new `places.ts` repository.

---

### Task 1: Native dependencies & permissions config

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install`, not hand-edited)
- Modify: `app.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `react-native-maps`, `expo-location`, `expo-task-manager`, `expo-notifications` installed and linked; `app.json` grants location (foreground + background) and notification capability so later tasks' permission-request calls actually work on-device.

- [ ] **Step 1: Install the new native dependencies**

Run: `npx expo install react-native-maps expo-location expo-task-manager expo-notifications`

Expected: all four packages added to `package.json` at Expo-SDK-57-aligned versions (matches the existing `expo-blur`/`expo-image-picker` install pattern in this repo).

- [ ] **Step 2: Add permission/background-mode config to `app.json`**

Modify the `ios` object to add `infoPlist.UIBackgroundModes`:

```json
"ios": {
  "icon": "./assets/expo.icon",
  "bundleIdentifier": "com.eastonlovell.naymly-app",
  "infoPlist": {
    "UIBackgroundModes": ["location"]
  }
},
```

Modify the `plugins` array — append two new entries after the existing `expo-image-picker` entry (keep `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-image-picker` exactly as they are):

```json
"plugins": [
  "expo-router",
  [
    "expo-splash-screen",
    {
      "backgroundColor": "#208AEF",
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 76
    }
  ],
  "expo-secure-store",
  [
    "expo-image-picker",
    {
      "cameraPermission": "Naymly uses your camera to capture a photo of someone you just met.",
      "photosPermission": "Naymly uses your photo library so you can attach an existing photo to a contact."
    }
  ],
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "Naymly uses your location to show pinned places on the map.",
      "locationAlwaysAndWhenInUsePermission": "Naymly uses your location, including in the background, to notify you when you arrive somewhere you've pinned a contact.",
      "isAndroidBackgroundLocationEnabled": true
    }
  ],
  "expo-notifications"
]
```

- [ ] **Step 3: Verify baseline sanity checks**

Run: `npx tsc --noEmit`
Expected: clean (no code changed yet, this just confirms the install didn't break anything).

Run: `npx expo export --platform web`
Expected: bundles cleanly, same route set as before (no new routes yet).

- [ ] **Step 4: Rebuild the native app**

Run: `npx expo run:ios`
Expected: build succeeds with 0 errors. App launches to the existing tab bar (still Home/Explore — no screens changed yet). This confirms the four new native modules link correctly before any code depends on them.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "Add map/location/notification native dependencies and permissions"
```

---

### Task 2: Places data layer & geofencing library

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations.ts`
- Create: `src/db/models/Place.ts`
- Create: `src/db/models/ContactPlace.ts`
- Modify: `src/db/index.ts`
- Create: `src/db/repositories/places.ts`
- Create: `src/lib/geofencing.ts`

**Interfaces:**
- Consumes: `Contact` model (`src/db/models/Contact.ts`, unchanged), `database` singleton export from `src/db/index.ts`.
- Produces (used by later tasks):
  - `Place` model: `{ id, latitude: number, longitude: number, radius: number, createdAt: Date }`
  - `PLACE_CAP: number` (20), `DEFAULT_PLACE_RADIUS_METERS: number` (150), `PlaceCapExceededError` — from `src/db/repositories/places.ts`
  - `createPlace(database: Database, contactId: string, coords: { latitude: number; longitude: number }): Promise<Place>`
  - `deletePlace(database: Database, placeId: string): Promise<void>`
  - `getAllPlaces(database: Database): Promise<Place[]>`
  - `observePlaces(database: Database)` — WatermelonDB observable of `Place[]`
  - `getContactForPlace(database: Database, placeId: string): Promise<Contact | null>`
  - `requestLocationAndNotificationPermissions(): Promise<{ foreground: boolean; background: boolean; notifications: boolean }>` — from `src/lib/geofencing.ts`
  - `syncGeofences(database: Database): Promise<void>` — from `src/lib/geofencing.ts`
  - `GEOFENCE_TASK_NAME: string` — from `src/lib/geofencing.ts`

- [ ] **Step 1: Bump the schema to version 2**

Replace the full contents of `src/db/schema.ts`:

```ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'contacts',
      columns: [
        // name_cipher/photo_uri_cipher/context_tags_cipher hold AES-256-GCM
        // sealed data (see src/lib/encryption.ts) — never plaintext PII.
        { name: 'name_cipher', type: 'string' },
        { name: 'photo_uri_cipher', type: 'string', isOptional: true },
        { name: 'context_tags_cipher', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'places',
      columns: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'radius', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'contact_places',
      columns: [
        { name: 'contact_id', type: 'string', isIndexed: true },
        { name: 'place_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
```

- [ ] **Step 2: Write the v1→v2 migration**

Create `src/db/migrations.ts`:

```ts
import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'places',
          columns: [
            { name: 'latitude', type: 'number' },
            { name: 'longitude', type: 'number' },
            { name: 'radius', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'contact_places',
          columns: [
            { name: 'contact_id', type: 'string', isIndexed: true },
            { name: 'place_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
```

- [ ] **Step 3: Add the `Place` and `ContactPlace` models**

Create `src/db/models/Place.ts`:

```ts
import { Model } from '@nozbe/watermelondb';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export class Place extends Model {
  static table = 'places';

  @field('latitude') latitude!: number;
  @field('longitude') longitude!: number;
  @field('radius') radius!: number;
  @readonly @date('created_at') createdAt!: Date;
}
```

Create `src/db/models/ContactPlace.ts`:

```ts
import { Model, Relation } from '@nozbe/watermelondb';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';

import { Contact } from '@/db/models/Contact';
import { Place } from '@/db/models/Place';

export class ContactPlace extends Model {
  static table = 'contact_places';
  static associations = {
    contacts: { type: 'belongs_to' as const, key: 'contact_id' },
    places: { type: 'belongs_to' as const, key: 'place_id' },
  };

  @field('contact_id') contactId!: string;
  @field('place_id') placeId!: string;
  @readonly @date('created_at') createdAt!: Date;

  @relation('contacts', 'contact_id') contact!: Relation<Contact>;
  @relation('places', 'place_id') place!: Relation<Place>;
}
```

- [ ] **Step 4: Register the migration and new models**

Replace the full contents of `src/db/index.ts`:

```ts
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { Contact } from '@/db/models/Contact';
import { ContactPlace } from '@/db/models/ContactPlace';
import { Place } from '@/db/models/Place';
import { migrations } from '@/db/migrations';
import { schema } from '@/db/schema';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
});

export const database = new Database({
  adapter,
  modelClasses: [Contact, Place, ContactPlace],
});
```

- [ ] **Step 5: Write the geofencing library**

Create `src/lib/geofencing.ts`:

```ts
import { Database } from '@nozbe/watermelondb';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { database } from '@/db';
import { getAllPlaces, getContactForPlace } from '@/db/repositories/places';

export const GEOFENCE_TASK_NAME = 'naymly-geofence-task';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type GeofenceTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

// This module and src/db/repositories/places.ts import each other (syncGeofences
// here, getAllPlaces/getContactForPlace there). Safe: neither import is used at
// module-evaluation time, only inside function bodies below.
TaskManager.defineTask(
  GEOFENCE_TASK_NAME,
  async ({
    data,
    error,
  }: {
    data: GeofenceTaskData;
    error: TaskManager.TaskManagerError | null;
  }) => {
    if (error) {
      console.error('Geofencing task error:', error);
      return;
    }
    if (data.eventType !== Location.GeofencingEventType.Enter) {
      return;
    }

    const placeId = data.region.identifier;
    if (!placeId) {
      return;
    }

    const contact = await getContactForPlace(database, placeId);
    if (!contact) {
      return;
    }

    const name = await contact.getName();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Say hi to ${name}`,
        body: "They're nearby.",
      },
      trigger: null,
    });
  }
);

export type PermissionResult = {
  foreground: boolean;
  background: boolean;
  notifications: boolean;
};

export async function requestLocationAndNotificationPermissions(): Promise<PermissionResult> {
  const foregroundResult = await Location.requestForegroundPermissionsAsync();
  const backgroundResult =
    foregroundResult.status === 'granted'
      ? await Location.requestBackgroundPermissionsAsync()
      : { status: 'denied' as Location.PermissionStatus };
  const notificationsResult = await Notifications.requestPermissionsAsync();

  return {
    foreground: foregroundResult.status === 'granted',
    background: backgroundResult.status === 'granted',
    notifications: notificationsResult.status === 'granted',
  };
}

export async function syncGeofences(db: Database): Promise<void> {
  const places = await getAllPlaces(db);

  if (places.length === 0) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => undefined);
    return;
  }

  const regions: Location.LocationRegion[] = places.map((place) => ({
    identifier: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    radius: place.radius,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}
```

- [ ] **Step 6: Write the places repository**

Create `src/db/repositories/places.ts`:

```ts
import { Database, Q } from '@nozbe/watermelondb';

import { Contact } from '@/db/models/Contact';
import { ContactPlace } from '@/db/models/ContactPlace';
import { Place } from '@/db/models/Place';
import { syncGeofences } from '@/lib/geofencing';

export const PLACE_CAP = 20;
export const DEFAULT_PLACE_RADIUS_METERS = 150;

export class PlaceCapExceededError extends Error {}

export async function createPlace(
  database: Database,
  contactId: string,
  coords: { latitude: number; longitude: number }
): Promise<Place> {
  const existingCount = await database.get<Place>('places').query().fetchCount();
  if (existingCount >= PLACE_CAP) {
    throw new PlaceCapExceededError(`Cannot pin more than ${PLACE_CAP} places.`);
  }

  const place = await database.write(async () => {
    const newPlace = await database.get<Place>('places').create((record) => {
      record.latitude = coords.latitude;
      record.longitude = coords.longitude;
      record.radius = DEFAULT_PLACE_RADIUS_METERS;
    });

    await database.get<ContactPlace>('contact_places').create((record) => {
      record.contactId = contactId;
      record.placeId = newPlace.id;
    });

    return newPlace;
  });

  await syncGeofences(database);
  return place;
}

export async function deletePlace(database: Database, placeId: string): Promise<void> {
  await database.write(async () => {
    const joins = await database
      .get<ContactPlace>('contact_places')
      .query(Q.where('place_id', placeId))
      .fetch();
    await Promise.all(joins.map((join) => join.destroyPermanently()));

    const place = await database.get<Place>('places').find(placeId);
    await place.destroyPermanently();
  });

  await syncGeofences(database);
}

export function getAllPlaces(database: Database): Promise<Place[]> {
  return database.get<Place>('places').query().fetch();
}

export function observePlaces(database: Database) {
  return database.get<Place>('places').query().observe();
}

export async function getContactForPlace(
  database: Database,
  placeId: string
): Promise<Contact | null> {
  const joins = await database
    .get<ContactPlace>('contact_places')
    .query(Q.where('place_id', placeId))
    .fetch();

  if (joins.length === 0) {
    return null;
  }

  return joins[0].contact.fetch();
}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx expo export --platform web`
Expected: bundles cleanly (this is a bundle-only sanity check, matching how `react-native-webview` and other native-only libraries have bundled fine for web in this project despite having no functional web implementation — see the Build Log's interactive-globe history).

Run: `npx expo run:ios`
Expected: 0 errors. **Important:** run this against the existing simulator install (do not uninstall/wipe first) — this is the one path in this task that exercises the v1→v2 migration against a real, already-existing v1 database from prior sessions. Confirm via `xcrun simctl` logs or the app simply launching without a crash that the migration ran cleanly, not just that a fresh install would have worked.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrations.ts src/db/models/Place.ts src/db/models/ContactPlace.ts src/db/index.ts src/db/repositories/places.ts src/lib/geofencing.ts
git commit -m "Add places/contact_places data layer and geofencing sync library"
```

---

### Task 3: PlaceInfoCard component

**Files:**
- Create: `src/components/map/place-info-card.tsx`

**Interfaces:**
- Consumes: `Contact` model, `useDecryptedContact(contact: Contact)` hook (`src/hooks/use-decrypted-contact.ts`, unchanged, returns `{ name, photoUri?, contextTags } | null`) — both already exist in the codebase.
- Produces: `PlaceInfoCard` component with props `{ contact: Contact; onRemove: () => void; onClose: () => void }`. Presentational only — the caller (Task 4's Map screen) owns any confirmation dialog before calling `onRemove`.

- [ ] **Step 1: Write the component**

Create `src/components/map/place-info-card.tsx`:

```tsx
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, Text, View } from 'react-native';

import { Contact } from '@/db/models/Contact';
import { useDecryptedContact } from '@/hooks/use-decrypted-contact';

type PlaceInfoCardProps = {
  contact: Contact;
  onRemove: () => void;
  onClose: () => void;
};

export function PlaceInfoCard({ contact, onRemove, onClose }: PlaceInfoCardProps) {
  const decrypted = useDecryptedContact(contact);

  if (!decrypted) {
    return null;
  }

  return (
    <View className="absolute bottom-6 left-4 right-4 flex-row items-center gap-4 rounded-2xl bg-surface p-4 shadow-lg">
      <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-background-alt">
        {decrypted.photoUri ? (
          <Image source={{ uri: decrypted.photoUri }} className="h-14 w-14" />
        ) : (
          <SymbolView
            name={{ ios: 'person.fill', android: 'person', web: 'person' }}
            size={22}
            tintColor="#000000"
          />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-serif text-lg text-ink">{decrypted.name}</Text>
        {decrypted.contextTags.length > 0 && (
          <Text className="text-sm text-ink/60" numberOfLines={1}>
            {decrypted.contextTags.join(', ')}
          </Text>
        )}
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove this pin"
        className="h-11 w-11 items-center justify-center">
        <SymbolView
          name={{ ios: 'trash', android: 'delete', web: 'delete' }}
          size={20}
          tintColor="#C1502E"
        />
      </Pressable>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="h-11 w-11 items-center justify-center">
        <SymbolView
          name={{ ios: 'xmark', android: 'close', web: 'close' }}
          size={18}
          tintColor="#000000"
        />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/map/place-info-card.tsx
git commit -m "Add PlaceInfoCard component for map pin details"
```

---

### Task 4: useMapPlaces hook & Map screen

**Files:**
- Create: `src/hooks/use-map-places.ts`
- Create: `src/app/(tabs)/map.tsx`

**Interfaces:**
- Consumes: `Place` model, `PLACE_CAP`, `getContactForPlace`, `observePlaces`, `deletePlace` (Task 2's `src/db/repositories/places.ts`); `requestLocationAndNotificationPermissions` (Task 2's `src/lib/geofencing.ts`); `PlaceInfoCard` (Task 3); existing `PrimaryButton` (`src/components/onboarding/primary-button.tsx`) and `database` singleton (`src/db/index.ts`).
- Produces: the `/map` route (rendered once Task 6 points the tab bar at it), and `useMapPlaces()` returning `{ places: Place[]; removePlace: (placeId: string) => Promise<void> }`.

- [ ] **Step 1: Write the places-list hook**

Create `src/hooks/use-map-places.ts`:

```ts
import { useEffect, useState } from 'react';

import { database } from '@/db';
import { Place } from '@/db/models/Place';
import { deletePlace, observePlaces } from '@/db/repositories/places';

export function useMapPlaces() {
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    const subscription = observePlaces(database).subscribe(setPlaces);
    return () => subscription.unsubscribe();
  }, []);

  async function removePlace(placeId: string) {
    await deletePlace(database, placeId);
  }

  return { places, removePlace };
}
```

- [ ] **Step 2: Write the Map screen**

Create `src/app/(tabs)/map.tsx`:

```tsx
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceInfoCard } from '@/components/map/place-info-card';
import { PrimaryButton } from '@/components/onboarding/primary-button';
import { database } from '@/db';
import { Contact } from '@/db/models/Contact';
import { Place } from '@/db/models/Place';
import { PLACE_CAP, getContactForPlace } from '@/db/repositories/places';
import { useMapPlaces } from '@/hooks/use-map-places';
import { requestLocationAndNotificationPermissions } from '@/lib/geofencing';

export default function MapScreen() {
  const { places, removePlace } = useMapPlaces();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [selected, setSelected] = useState<{ place: Place; contact: Contact } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await requestLocationAndNotificationPermissions();
      if (!result.foreground || !result.background) {
        if (!cancelled) setPermissionDenied(true);
        return;
      }

      const position = await Location.getCurrentPositionAsync();
      if (!cancelled) {
        setInitialRegion({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleMapPress(event: MapPressEvent) {
    if (places.length >= PLACE_CAP) {
      Alert.alert('Pin limit reached', `You can pin up to ${PLACE_CAP} places.`);
      return;
    }

    const { latitude, longitude } = event.nativeEvent.coordinate;
    router.push({
      pathname: '/capture',
      params: { lat: String(latitude), lng: String(longitude) },
    });
  }

  async function handleMarkerPress(place: Place) {
    const contact = await getContactForPlace(database, place.id);
    if (contact) {
      setSelected({ place, contact });
    }
  }

  function handleRemove() {
    if (!selected) return;
    const placeId = selected.place.id;
    Alert.alert('Remove this pin?', 'This removes the place but keeps the contact.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removePlace(placeId);
          setSelected(null);
        },
      },
    ]);
  }

  if (permissionDenied) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Text className="text-center font-serif text-2xl text-ink">Location access needed</Text>
        <Text className="text-center text-base text-ink/60">
          Naymly needs location access, including while the app is closed, to notify you when you
          arrive at a place you&apos;ve pinned.
        </Text>
        <PrimaryButton label="Open Settings" onPress={() => Linking.openSettings()} />
      </SafeAreaView>
    );
  }

  if (!initialRegion) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-base text-ink/60">Finding your location…</Text>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        onPress={handleMapPress}>
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            onPress={() => handleMarkerPress(place)}
          />
        ))}
      </MapView>
      {selected && (
        <PlaceInfoCard
          contact={selected.contact}
          onRemove={handleRemove}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx expo export --platform web`
Expected: bundles cleanly. `/map` does not yet appear as a reachable tab (that's Task 6), but the route file itself should resolve without error.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-map-places.ts "src/app/(tabs)/map.tsx"
git commit -m "Add Map screen with permission gating, pins, and pin removal"
```

---

### Task 5: Wire capture.tsx to create a place from map-originated saves

**Files:**
- Modify: `src/app/capture.tsx`

**Interfaces:**
- Consumes: `createPlace(database, contactId, coords)` (Task 2's `src/db/repositories/places.ts`).
- Produces: `capture.tsx` now creates a `Place` + `ContactPlace` + registers its geofence whenever it was opened with `lat`/`lng` route params (i.e., from the Map screen's empty-spot tap in Task 4). Opening `capture.tsx` without those params (any future non-map entry point) behaves exactly as before — contact-only save, no place created.

- [ ] **Step 1: Read the current file to confirm line numbers**

Read `src/app/capture.tsx` before editing — it was last touched outside this plan, so confirm the `handleSave` function and import block still match what's assumed below before making the edit.

- [ ] **Step 2: Add the new imports**

In `src/app/capture.tsx`, change:

```ts
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { database } from '@/db';
import { createContact } from '@/db/repositories/contacts';
```

to:

```ts
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { database } from '@/db';
import { createContact } from '@/db/repositories/contacts';
import { createPlace } from '@/db/repositories/places';
```

- [ ] **Step 3: Read the map-origin params**

Inside `export default function CaptureScreen() {`, right after the existing `useState` declarations (after the `error`/`setError` line, before `const tags = parseTags(...)`), add:

```ts
const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
```

- [ ] **Step 4: Extend `handleSave` to create the place**

Change:

```ts
  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await createContact(database, { name: name.trim(), photoUri, contextTags: tags });
      router.back();
    } catch {
      setError("Couldn't save this contact. Please try again.");
    } finally {
      setSaving(false);
    }
  }
```

to:

```ts
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
```

Note the nested try/catch: if `createPlace` fails after `createContact` already succeeded, the contact is not lost and the outer catch's "couldn't save this contact" message (which would be misleading at that point) is not shown — instead a distinct alert fires and the screen still closes normally.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx expo export --platform web`
Expected: bundles cleanly, same route set.

- [ ] **Step 6: Commit**

```bash
git add src/app/capture.tsx
git commit -m "Create a place and register its geofence when capture.tsx opens from the map"
```

---

### Task 6: Tab bar swap & cold-start geofence sync

**Files:**
- Modify: `src/components/app-tabs.tsx`
- Delete: `src/app/(tabs)/explore.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: the `/map` route (Task 4), `syncGeofences(database)` (Task 2's `src/lib/geofencing.ts`), `database` singleton.
- Produces: the Map tab becomes reachable in the running app; every cold start re-registers all saved places' geofences with the OS.

- [ ] **Step 1: Swap the Explore tab for the Map tab**

In `src/components/app-tabs.tsx`, change:

```tsx
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
```

to:

```tsx
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" />
      </NativeTabs.Trigger>
```

(`sf` takes an SF Symbol name directly, avoiding the need for a new PNG tab-icon asset — `mappin.and.ellipse` is a valid `SFSymbol` per `node_modules/sf-symbols-typescript`.)

- [ ] **Step 2: Delete the now-unreferenced Explore route**

```bash
git rm "src/app/(tabs)/explore.tsx"
```

- [ ] **Step 3: Re-sync geofences on every cold start**

In `src/app/_layout.tsx`, change:

```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
```

to:

```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import '@/global.css';
import { database } from '@/db';
import { syncGeofences } from '@/lib/geofencing';
import { useOnboardingStore } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasOnboarded = useOnboardingStore((state) => state.hasOnboarded);
  const loadFromStorage = useOnboardingStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    syncGeofences(database).catch((error) => {
      console.error('Failed to sync geofences on launch:', error);
    });
  }, []);
```

(The rest of the file — the `GestureHandlerRootView`/`ThemeProvider`/`Stack` JSX — is unchanged.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx expo export --platform web`
Expected: bundles cleanly. Route list should show `/map` in place of `/explore`.

Run: `npx expo run:ios`
Expected: 0 errors. On-device, walk the full new flow:
1. Open the app, tap the Map tab — confirm it's now labeled "Map" with a pin icon, and the old Explore tab is gone.
2. Grant location + notification permissions when prompted; confirm the map centers on the simulator's current location.
3. Tap an empty spot on the map — confirm it navigates to the existing Capture screen.
4. Fill in a name and save — confirm it returns to the map and a new pin appears at the tapped spot.
5. Tap the new pin — confirm `PlaceInfoCard` shows the contact's name/photo.
6. In the Simulator, go to **Features → Location → Custom Location**, set coordinates matching the pinned spot (or a route that passes through it) — confirm a local notification fires ("Say hi to [name] — They're nearby.").
7. Tap "Remove" on the pin's info card, confirm the removal dialog, confirm — verify the pin disappears from the map.
8. Force-quit the app and relaunch (with at least one pin still saved) — confirm no crash, and that re-triggering the simulated arrival still fires a notification (proves the cold-start `syncGeofences` re-registration path, not just the same-session happy path).
9. Deny location permission (via a fresh install or Settings) and reopen the Map tab — confirm the "Location access needed" empty state appears with a working "Open Settings" button, not a broken/blank map.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-tabs.tsx src/app/_layout.tsx
git commit -m "Wire the Map tab into the tab bar and sync geofences on cold start"
```

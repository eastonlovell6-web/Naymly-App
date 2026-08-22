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

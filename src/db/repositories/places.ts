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

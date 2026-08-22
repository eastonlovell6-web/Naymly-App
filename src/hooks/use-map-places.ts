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

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

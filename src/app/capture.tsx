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

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function CaptureScreen() {
  const [name, setName] = useState('');
  const [contextTagsInput, setContextTagsInput] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();

  const tags = parseTags(contextTagsInput);

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

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 py-6"
          keyboardShouldPersistTaps="handled">
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
              autoFocus
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
      </View>
    </SafeAreaView>
  );
}

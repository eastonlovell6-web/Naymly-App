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

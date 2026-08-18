import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEYCHAIN_KEY = 'naymly.pii-encryption-key';
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let cachedKey: Crypto.AESEncryptionKey | null = null;

async function getOrCreateKey(): Promise<Crypto.AESEncryptionKey> {
  if (cachedKey) return cachedKey;

  const stored = await SecureStore.getItemAsync(KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
  if (stored) {
    cachedKey = await Crypto.AESEncryptionKey.import(stored, 'base64');
    return cachedKey;
  }

  const key = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
  const encoded = await key.encoded('base64');
  await SecureStore.setItemAsync(KEYCHAIN_KEY, encoded, KEYCHAIN_OPTIONS);
  cachedKey = key;
  return key;
}

// Fields encrypted with this are only ever readable on the device that wrote them —
// the key is Keychain-scoped to this device, matching the app's on-device-only PII bar.
export async function encryptField(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const bytes = new TextEncoder().encode(plaintext);
  const sealed = await Crypto.aesEncryptAsync(bytes, key);
  return sealed.combined('base64');
}

export async function decryptField(ciphertext: string): Promise<string> {
  const key = await getOrCreateKey();
  const sealed = Crypto.AESSealedData.fromCombined(ciphertext);
  const bytes = await Crypto.aesDecryptAsync(sealed, key);
  return new TextDecoder().decode(bytes as Uint8Array);
}

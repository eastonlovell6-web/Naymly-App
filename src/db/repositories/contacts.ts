import { Database } from '@nozbe/watermelondb';

import { Contact } from '@/db/models/Contact';
import { encryptField } from '@/lib/encryption';

export type NewContact = {
  name: string;
  photoUri?: string;
  contextTags: string[];
};

export async function createContact(database: Database, input: NewContact): Promise<Contact> {
  const [nameCipher, contextTagsCipher, photoUriCipher] = await Promise.all([
    encryptField(input.name),
    encryptField(JSON.stringify(input.contextTags)),
    input.photoUri ? encryptField(input.photoUri) : Promise.resolve(undefined),
  ]);

  return database.write(async () => {
    return database.get<Contact>('contacts').create((contact) => {
      contact.nameCipher = nameCipher;
      contact.contextTagsCipher = contextTagsCipher;
      contact.photoUriCipher = photoUriCipher;
    });
  });
}

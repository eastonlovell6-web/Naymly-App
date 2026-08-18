import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

import { decryptField } from '@/lib/encryption';

export class Contact extends Model {
  static table = 'contacts';

  @field('name_cipher') nameCipher!: string;
  @field('photo_uri_cipher') photoUriCipher?: string;
  @field('context_tags_cipher') contextTagsCipher!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  async getName(): Promise<string> {
    return decryptField(this.nameCipher);
  }

  async getPhotoUri(): Promise<string | undefined> {
    return this.photoUriCipher ? decryptField(this.photoUriCipher) : undefined;
  }

  async getContextTags(): Promise<string[]> {
    const raw = await decryptField(this.contextTagsCipher);
    return JSON.parse(raw) as string[];
  }
}

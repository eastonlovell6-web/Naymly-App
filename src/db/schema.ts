import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
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
  ],
});

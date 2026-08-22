import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
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
    tableSchema({
      name: 'places',
      columns: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'radius', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'contact_places',
      columns: [
        { name: 'contact_id', type: 'string', isIndexed: true },
        { name: 'place_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

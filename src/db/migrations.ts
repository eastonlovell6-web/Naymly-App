import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'places',
          columns: [
            { name: 'latitude', type: 'number' },
            { name: 'longitude', type: 'number' },
            { name: 'radius', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'contact_places',
          columns: [
            { name: 'contact_id', type: 'string', isIndexed: true },
            { name: 'place_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});

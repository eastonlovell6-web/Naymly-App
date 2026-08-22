import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { Contact } from '@/db/models/Contact';
import { ContactPlace } from '@/db/models/ContactPlace';
import { Place } from '@/db/models/Place';
import { migrations } from '@/db/migrations';
import { schema } from '@/db/schema';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
});

export const database = new Database({
  adapter,
  modelClasses: [Contact, Place, ContactPlace],
});

import { Model, Relation } from '@nozbe/watermelondb';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';

import { Contact } from '@/db/models/Contact';
import { Place } from '@/db/models/Place';

export class ContactPlace extends Model {
  static table = 'contact_places';
  static associations = {
    contacts: { type: 'belongs_to' as const, key: 'contact_id' },
    places: { type: 'belongs_to' as const, key: 'place_id' },
  };

  @field('contact_id') contactId!: string;
  @field('place_id') placeId!: string;
  @readonly @date('created_at') createdAt!: Date;

  @relation('contacts', 'contact_id') contact!: Relation<Contact>;
  @relation('places', 'place_id') place!: Relation<Place>;
}

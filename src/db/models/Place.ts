import { Model } from '@nozbe/watermelondb';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export class Place extends Model {
  static table = 'places';

  @field('latitude') latitude!: number;
  @field('longitude') longitude!: number;
  @field('radius') radius!: number;
  @readonly @date('created_at') createdAt!: Date;
}

import { itemDescriptionFields, normalizeSlugSource } from "../fields.js";

const fields = foundry.data.fields;

export default class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      rating: new fields.NumberField({
        required: true,
        initial: 2,
        integer: true,
      }),
      modifier: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      specialties: new fields.ArrayField(new fields.ObjectField()),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

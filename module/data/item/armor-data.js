import {
  itemDescriptionFields,
  physicalItemFields,
  normalizeSlugSource,
} from "../fields.js";

const fields = foundry.data.fields;

export default class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...physicalItemFields(),
      rating: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      penalty: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      bulk: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      qualities: new fields.ArrayField(new fields.ObjectField()),
      equipped: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

import {
  itemDescriptionFields,
  equipmentItemFields,
  normalizeSlugSource,
} from "../fields.js";

const fields = foundry.data.fields;

export default class PoisonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...equipmentItemFields(),
      delivery: new fields.StringField({ required: true, initial: "" }),
      virulence: new fields.StringField({ required: true, initial: "" }),
      frequency: new fields.StringField({ required: true, initial: "" }),
      toxicity: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      diagnosis: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      effects: new fields.StringField({ required: true, initial: "" }),
      recovery: new fields.StringField({ required: true, initial: "" }),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

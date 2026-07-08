import { identityField, normalizeSlugSource } from "../fields.js";

const fields = foundry.data.fields;

export default class HoldingData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...identityField(),
      description: new fields.StringField({ required: true, initial: "" }),
      investment: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      buildTime: new fields.StringField({ required: true, initial: "" }),
      resource: new fields.StringField({ required: true, initial: "" }),
      features: new fields.ArrayField(new fields.ObjectField()),
      fortuneDice: new fields.StringField({ required: true, initial: "" }),
      fortuneModifier: new fields.NumberField({
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

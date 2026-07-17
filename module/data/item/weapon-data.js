import {
  itemDescriptionFields,
  physicalItemFields,
  equipmentItemFields,
  normalizeSlugSource,
  qualityRefField,
  migrateQualityRefs,
} from "../fields.js";

const fields = foundry.data.fields;

export default class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...physicalItemFields(),
      ...equipmentItemFields(),
      specialty: new fields.StringField({ required: true, initial: "" }),
      training: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      damage: new fields.StringField({ required: true, initial: "" }),
      ...qualityRefField(), // spec 020 — {slug, parameter} references (was ObjectField)
      reach: new fields.StringField({ required: true, initial: "" }),
      equipped: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    migrateQualityRefs(source); // spec 020 — legacy {name}→{slug}, non-destructive
    return super.migrateData(source);
  }
}

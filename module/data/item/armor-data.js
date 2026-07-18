import {
  itemDescriptionFields,
  physicalItemFields,
  normalizeSlugSource,
  qualityRefField,
  migrateQualityRefs,
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
      ...qualityRefField(), // spec 020 — {slug, parameter} references (was ObjectField)
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

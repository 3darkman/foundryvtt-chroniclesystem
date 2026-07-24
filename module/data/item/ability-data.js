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
      /**
       * @deprecated spec 024 (FR-008a) — a specialty is its own item type now.
       * This field is RETAINED for exactly one release and **removed in 0.18.0**.
       *
       * It is never rendered, never written, and read by exactly one caller: the
       * `0.17.0` conversion (`module/migrations/task140-specialty-items.js`).
       * Documents are cleaned and validated at construction, BEFORE any migration
       * runs — dropping the field in the same release that has to read it would
       * make the legacy ranks unreachable before the conversion could convert them.
       *
       * Do NOT "improve" it into a SchemaField: the bare `ArrayField(ObjectField())`
       * is what makes it self-healing for dirty legacy data — that opacity is the
       * tolerance.
       */
      specialties: new fields.ArrayField(new fields.ObjectField()),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

import { itemDescriptionFields, normalizeSlugSource } from "../fields.js";

const fields = foundry.data.fields;

/**
 * Clamp a specialty rating to an integer >= 0 (spec 024, FR-013).
 *
 * The schema deliberately carries NO `min: 0` — a `min` constraint makes a
 * negative submission *throw and reject the update*, while FR-013 requires the
 * value to be **clamped**. This one coercion is therefore applied at every write
 * path: `migrateData` (load), the inline sheet handler, and the
 * provisioning/conversion builders.
 *
 * `null` / `""` / `"abc"` / `NaN` -> 0 ; `-3` -> 0 ; `2.7` -> 2.
 * @param {*} value
 * @returns {number} an integer >= 0
 */
export function clampRating(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

/**
 * Specialty item (spec 024). A specialty stops being a free-form row inside
 * `ability.system.specialties` and becomes its own item type, linked to exactly
 * one Ability by that ability's stable slug (FR-005).
 *
 * `abilitySlug` has no `choices`: `choices` disables `blank` and would reject a
 * homebrew ability (FR-007) — the list is enforced in the UI only, exactly as
 * `identityField()` documents for `slug`.
 */
export default class SpecialtyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      abilitySlug: new fields.StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      rating: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      modifier: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    if (source && "rating" in source)
      source.rating = clampRating(source.rating);
    return super.migrateData(source);
  }
}

import { slugify } from "../effects/cs-effect-vocabulary.js";

const fields = foundry.data.fields;

/**
 * Stable identity field (spec 008). Every item type carries a `system.slug` — a
 * language-independent identity, derived from the name when blank and editable
 * (FR-011/FR-012). `blank:true + initial:""` models "not yet derived" so the key
 * is always present (never null/NaN — avoids the v13 validation traps). No
 * `choices`: the canonical vocabulary is enforced only in the UI; `choices`
 * would disable `blank` and reject custom homebrew slugs.
 */
export function identityField() {
  return {
    slug: new fields.StringField({
      required: false,
      blank: true,
      initial: "",
    }),
  };
}

/**
 * Normalise an already-present slug on a raw `system` source, for `migrateData`
 * (which receives ONLY `system`, without the document `name`, so it can sanitise
 * a stored slug but NEVER derive one from the name — that lives in the lifecycle
 * + world migration). Mutates and returns `source`. No-op when slug is blank.
 * @param {object} source the item's `system` source object
 * @returns {object} the same source
 */
export function normalizeSlugSource(source) {
  if (source && typeof source.slug === "string" && source.slug.trim() !== "") {
    source.slug = slugify(source.slug);
  }
  return source;
}

/**
 * Physical item fields from template.json "physicalItem" template.
 * Used by: WeaponData, ArmorData
 */
export function physicalItemFields() {
  return {
    weight: new fields.NumberField({
      required: true,
      initial: 0,
      integer: true,
    }),
  };
}

/**
 * Equipment item fields from template.json "equipmentItem" template.
 * Used by: WeaponData, EquipmentData, PoisonData
 */
export function equipmentItemFields() {
  return {
    quantity: new fields.NumberField({
      required: true,
      initial: 1,
      integer: true,
    }),
    cost: new fields.StringField({ required: true, initial: "" }),
  };
}

/**
 * Item description fields from template.json "itemDescription" template.
 * Used by: WeaponData, ArmorData, AbilityData, BenefitData, DrawbackData, EquipmentData, PoisonData
 */
export function itemDescriptionFields() {
  return {
    ...identityField(),
    description: new fields.StringField({ required: true, initial: "" }),
    type: new fields.StringField({ required: true, initial: "" }),
  };
}

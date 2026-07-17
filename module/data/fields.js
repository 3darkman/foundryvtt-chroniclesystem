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
 * Physical item fields (the former "physicalItem" field group).
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
 * Equipment item fields (the former "equipmentItem" field group).
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
 * Item description fields (the former "itemDescription" field group).
 * Used by: WeaponData, ArmorData, AbilityData, BenefitData, DrawbackData, EquipmentData, PoisonData
 */
export function itemDescriptionFields() {
  return {
    ...identityField(),
    description: new fields.StringField({ required: true, initial: "" }),
    type: new fields.StringField({ required: true, initial: "" }),
  };
}

/**
 * Quality reference list (spec 020, Decision 4) — a weapon/armour references a
 * Quality item by stable slug (spec 008) with a per-instance `parameter` (this
 * sword's Piercing 2 vs that dagger's Piercing 1). A **SchemaField** (not the old
 * `ObjectField`) fails LOUD on a non-object row (fixing the `ObjectField._cast`
 * silent-swallow gotcha). `parameter` is a StringField (number OR discrete choice;
 * avoids the v13 NumberField-NaN trap); coerced at read time in the collector.
 * Shared by WeaponData and ArmorData (DRY, constitution §III).
 */
export function qualityRefField() {
  return {
    qualities: new fields.ArrayField(
      new fields.SchemaField({
        // `blank:true + initial:""` (NOT blank:false) — same lesson as identityField:
        // a required non-blank StringField is a v13/v14 validation trap. The world
        // load is STRICT (`fromSource({strict:true})`, foundry.mjs:26790) and an
        // ArrayField element does NOT drop on failure — a single `{slug:""}` row
        // (a stray blank quality, or legacy free-text with an empty name) would
        // throw and VANISH the whole weapon/armour from `game.items`. Tolerating a
        // blank slug keeps every row (never discarded — an unresolved slug renders
        // as a "missing item" chip and stays removable by the GM).
        slug: new fields.StringField({
          required: false,
          blank: true,
          initial: "",
        }),
        parameter: new fields.StringField({
          required: true,
          blank: true,
          initial: "",
        }),
      })
    ),
  };
}

/**
 * Non-destructive migration of a weapon/armour `qualities` source (spec 020,
 * FR-011 / SC-005). Maps each legacy free-text `{name, parameter}` row to a typed
 * `{slug: slugify(name), parameter}` reference; already-`{slug}` rows are
 * normalised (idempotent). Runs in `migrateData` (before clean+validate).
 *
 * NEVER discards a row. A row whose name/slug is blank yields `{slug:""}` — which
 * is tolerated by the schema (`slug` is `blank:true`) and renders at read time as a
 * "<slug> missing item" chip that the GM can remove. Dropping references silently
 * would be data loss; instead the reference is kept and resolved against the world
 * + the quality compendium (found → real name, else → missing). Never throws
 * (a thrown migrateData is swallowed by migrateDataSafe → un-migrated source →
 * would re-fail; foundry.mjs:14318). Mutates and returns `source`.
 * @param {object} source the item's `system` source object
 * @returns {object} the same source
 */
export function migrateQualityRefs(source) {
  if (!source || !Array.isArray(source.qualities)) return source;
  source.qualities = source.qualities.map((q) => {
    if (!q || typeof q !== "object") return q; // leave (schema coerces; never drop)
    // Legacy free-text {name} with no slug yet → derive it (keep even if blank).
    if (q.slug == null || q.slug === "") {
      const raw = typeof q.name === "string" ? q.name : "";
      return { slug: slugify(raw), parameter: q.parameter ?? "" };
    }
    // Already a {slug} reference → normalise the slug (idempotent).
    return { slug: slugify(String(q.slug)), parameter: q.parameter ?? "" };
  });
  return source;
}

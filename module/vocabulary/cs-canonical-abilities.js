// Canonical ability/specialty vocabulary — the single source of truth (SSOT,
// constitution §II) for the CLOSED set of core abilities and specialties
// (spec 008, FR-004/FR-006). Grounded in `canonical-vocabulary.md` (validated
// against the Chronicle System rulebooks via NotebookLM, 2026-07-06).
//
// PURE module (no Foundry runtime) → testable in Vitest. Reuses the existing
// `slugify` (separator `_`) from cs-effect-vocabulary.js — NEVER the Foundry
// `String.prototype.slugify` (separator `-`), which would break the `cs.*`
// effect grammar in production.
//
// A `slug` is the stable, language-independent identity; a `nameKey` is the i18n
// key for its display label. The array is `Object.freeze`d so no consumer can
// mutate the shared vocabulary (improves on the foundry-fe2 mutable-array
// anti-pattern; identity is a persisted slug, not a Foundry `_id`).

import { slugify } from "../effects/cs-slugify.js";

/**
 * Scoped specialty slug: `<abilitySlug>_<slugify(name)>` (Decision 4). Specialty
 * names are NOT globally unique ("Charm" is both an Animal Handling and a
 * Persuasion specialty), so identity is scoped by the parent ability. Reuses the
 * shared slugify. Returns the bare ability slug when the name yields no slug.
 * @param {string} abilitySlug
 * @param {string} specialtyName
 * @returns {string}
 */
export function scopedSpecialtySlug(abilitySlug, specialtyName) {
  const name = slugify(specialtyName);
  return name ? `${abilitySlug}_${name}` : String(abilitySlug ?? "");
}

/**
 * Compact source table: the OFFICIAL English names (canonical-vocabulary.md).
 * The frozen `CANONICAL_ABILITIES` below is derived from this — slug = slugify,
 * nameKey = `CS.abilities.<slug>` / `CS.specialties.<abilitySlug>.<specSlug>` —
 * so the slugs and i18n keys stay DRY and can never drift from the names.
 */
const CANONICAL_SOURCE = [
  {
    name: "Agility",
    specialties: ["Acrobatics", "Balance", "Contortions", "Dodge", "Quickness"],
  },
  { name: "Animal Handling", specialties: ["Charm", "Drive", "Ride", "Train"] },
  {
    name: "Athletics",
    specialties: ["Climb", "Jump", "Run", "Strength", "Swim", "Throw"],
  },
  { name: "Awareness", specialties: ["Empathy", "Notice"] },
  { name: "Cunning", specialties: ["Decipher", "Logic", "Memory"] },
  { name: "Deception", specialties: ["Act", "Bluff", "Cheat", "Disguise"] },
  { name: "Endurance", specialties: ["Resilience", "Stamina"] },
  {
    name: "Fighting",
    specialties: [
      "Axes",
      "Bludgeons",
      "Brawling",
      "Fencing",
      "Long Blades",
      "Pole-Arms",
      "Shields",
      "Short Blades",
      "Spears",
    ],
  },
  {
    name: "Healing",
    specialties: ["Diagnose", "Treat Ailment", "Treat Injury"],
  },
  { name: "Knowledge", specialties: ["Education", "Research", "Streetwise"] },
  {
    name: "Language",
    parameterized: true,
    specialties: ["Eloquence", "Literacy"],
  },
  {
    name: "Marksmanship",
    specialties: ["Bows", "Crossbows", "Longarms", "Siege", "Thrown"],
  },
  {
    name: "Persuasion",
    specialties: [
      "Bargain",
      "Charm",
      "Convince",
      "Incite",
      "Intimidate",
      "Seduce",
      "Taunt",
    ],
  },
  {
    name: "Status",
    specialties: ["Breeding", "Reputation", "Stewardship", "Tournaments"],
  },
  { name: "Stealth", specialties: ["Blend In", "Sneak"] },
  { name: "Survival", specialties: ["Forage", "Hunt", "Orientation", "Track"] },
  { name: "Thievery", specialties: ["Pick Lock", "Sleight of Hand", "Steal"] },
  {
    name: "Warfare",
    specialties: ["Cannon", "Command", "Strategy", "Tactics"],
  },
  {
    name: "Will",
    specialties: ["Concentrate", "Coordinate", "Courage", "Dedication"],
  },
];

/**
 * The frozen canonical vocabulary (SSOT). Each entry:
 * `{ slug, nameKey, parameterized?, specialties: [{ slug, nameKey }] }`.
 * @type {ReadonlyArray<{slug: string, nameKey: string, parameterized?: boolean,
 *   specialties: ReadonlyArray<{slug: string, nameKey: string}>}>}
 */
export const CANONICAL_ABILITIES = Object.freeze(
  CANONICAL_SOURCE.map((ability) => {
    const abilitySlug = slugify(ability.name);
    const entry = {
      slug: abilitySlug,
      // English display name (spec 021, D21) — the dropdown option VALUE downstream
      // matching keys by (`Ability:Specialty`); the localized LABEL is built in the
      // sheet from `nameKey`, so this stays language-independent identity data.
      name: ability.name,
      nameKey: `CS.abilities.${abilitySlug}`,
      specialties: Object.freeze(
        ability.specialties.map((name) => {
          const slug = scopedSpecialtySlug(abilitySlug, name);
          // nameKey uses the specialty's OWN slug suffix, scoped under its ability.
          const suffix = slugify(name);
          return Object.freeze({
            slug,
            name, // English specialty name (D21)
            nameKey: `CS.specialties.${abilitySlug}.${suffix}`,
          });
        })
      ),
    };
    if (ability.parameterized) entry.parameterized = true;
    return Object.freeze(entry);
  })
);

/**
 * Pure choice-map source for the item-sheet dropdowns (spec 021, D21). Returns the
 * canonical option VALUES (English display names — the format downstream logic
 * matches by: bare ability, or `Ability:Specialty`) plus the i18n keys the sheet
 * localizes the LABELS with. NO `game.i18n` here — the file stays Foundry-runtime-
 * free (Vitest). Specialties are EVERY `Ability:Specialty` combo, no bare abilities.
 * @returns {{abilities: Array<{value: string, nameKey: string}>,
 *   specialties: Array<{value: string, abilityNameKey: string, specialtyNameKey: string}>}}
 */
export function abilitySpecialtyChoiceMaps() {
  const abilities = [];
  const specialties = [];
  for (const ability of CANONICAL_ABILITIES) {
    abilities.push({ value: ability.name, nameKey: ability.nameKey });
    for (const spec of ability.specialties) {
      specialties.push({
        value: `${ability.name}:${spec.name}`,
        abilityNameKey: ability.nameKey,
        specialtyNameKey: spec.nameKey,
      });
    }
  }
  return { abilities, specialties };
}

/** Set of every canonical ability slug. */
export const ABILITY_SLUGS = Object.freeze(
  new Set(CANONICAL_ABILITIES.map((a) => a.slug))
);

/** Set of every canonical (scoped) specialty slug. */
export const SPECIALTY_SLUGS = Object.freeze(
  new Set(CANONICAL_ABILITIES.flatMap((a) => a.specialties.map((s) => s.slug)))
);

/** Ability slugs marked `parameterized` (Language) — accept `<slug>_*` variants. */
const PARAMETERIZED_SLUGS = CANONICAL_ABILITIES.filter(
  (a) => a.parameterized
).map((a) => a.slug);

/**
 * True when `slug` belongs to the canonical ability vocabulary. Parameterized
 * abilities (Language) also accept any `<slug>_*` variant so a legitimate
 * "Language (High Valyrian)" (`language_high_valyrian`) is NOT falsely flagged
 * (Decision 5). Never throws (FR-005/FR-014).
 * @param {string} slug
 * @returns {boolean}
 */
export function isCanonicalAbilitySlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  if (ABILITY_SLUGS.has(slug)) return true;
  return PARAMETERIZED_SLUGS.some((p) => slug.startsWith(`${p}_`));
}

/**
 * The canonical ability slug a given slug COVERS, or `null` if none. A plain
 * canonical slug covers itself; a parameterized variant (`language_high_valyrian`)
 * covers its base (`language`). Used to tell whether every canonical ability is
 * represented in a world (FR-014 — flag renames, not homebrew). Never throws.
 * @param {string} slug
 * @returns {string|null}
 */
export function canonicalAbilityBase(slug) {
  if (!slug || typeof slug !== "string") return null;
  if (ABILITY_SLUGS.has(slug)) return slug;
  return PARAMETERIZED_SLUGS.find((p) => slug.startsWith(`${p}_`)) ?? null;
}

/**
 * True when `slug` belongs to the canonical (scoped) specialty vocabulary.
 * Never throws.
 * @param {string} slug
 * @returns {boolean}
 */
export function isCanonicalSpecialtySlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  return SPECIALTY_SLUGS.has(slug);
}

/* --------------------------- pure derivation ---------------------------- */

/** True when a slug value is blank (unset — "derive from name" state). */
function isBlankSlug(slug) {
  return !slug || String(slug).trim() === "";
}

/**
 * "Derive when empty, keep editable" (FR-012): returns `slugify(name)` when
 * `currentSlug` is blank, else `null` (do NOT overwrite a slug the GM set).
 * Pure & testable — called from the item lifecycle AND the world migration
 * (SSOT: one rule, two triggers).
 * @param {string} name        the document display name (current or new on rename)
 * @param {string} currentSlug the item's current `system.slug`
 * @returns {string|null}
 */
export function deriveSlugUpdate(name, currentSlug) {
  return isBlankSlug(currentSlug) ? slugify(name) : null;
}

/**
 * Fill the scoped slug of each specialty whose slug is blank; preserve set ones.
 * Idempotent (a 2nd pass is a no-op). Returns a NEW array of NEW objects (never
 * mutates the input). Accepts an array or a `{key: specialty}` map.
 * @param {string} abilitySlug the parent ability's slug
 * @param {object[]|object} specialties
 * @returns {object[]}
 */
export function deriveSpecialtySlugs(abilitySlug, specialties) {
  const list = Array.isArray(specialties)
    ? specialties
    : Object.values(specialties ?? {});
  return list.map((specialty) => {
    if (!specialty || typeof specialty !== "object") return specialty;
    if (!isBlankSlug(specialty.slug)) return { ...specialty };
    return {
      ...specialty,
      slug: scopedSpecialtySlug(abilitySlug, specialty.name),
    };
  });
}

/**
 * Pure collision check (FR-013, testable base): true when `slug` already exists
 * among `existingSlugs` (an Array or Set of slugs in the SAME scope). The caller
 * (lifecycle) supplies the scope and decides on the non-blocking `warn` — this
 * function never notifies. A blank slug never collides.
 * @param {string} slug
 * @param {Iterable<string>|Set<string>} existingSlugs
 * @returns {boolean}
 */
export function findSlugCollision(slug, existingSlugs) {
  if (isBlankSlug(slug) || !existingSlugs) return false;
  if (existingSlugs instanceof Set) return existingSlugs.has(slug);
  for (const existing of existingSlugs) {
    if (existing === slug) return true;
  }
  return false;
}

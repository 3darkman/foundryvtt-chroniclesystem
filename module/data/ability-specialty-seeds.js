// Deterministic Ability/Specialty seeds (spec 024, D1/D11 — contract
// specialty-catalog.md C2). Mirrors `quality-seeds.js`'s role, but DERIVES its
// catalogue from `CANONICAL_ABILITIES` instead of hand-authoring it: the
// canonical vocabulary stays the single source of truth (SSOT, constitution §II)
// and the counts (19 abilities / 76 specialties) can never drift.
//
// PURE module — no Foundry global, no import from the runtime layer — so Vitest
// can import it directly.

import { CANONICAL_ABILITIES } from "../vocabulary/cs-canonical-abilities.js";

const ABILITY_IMG = "systems/chroniclesystem/assets/icons/ability.png";
const SPECIALTY_IMG = "systems/chroniclesystem/assets/icons/specialty.png";

/**
 * Item-creation data for a canonical Ability (C2.2). `rating: 2` matches
 * `AbilityData`'s own `initial`, so a dragged catalogue ability is
 * indistinguishable from a hand-created one; `specialties: []` explicitly empties
 * the deprecated legacy field — a seeded ability never carries legacy rows.
 * @param {object} ability a CANONICAL_ABILITIES entry
 * @returns {object} Item creation data
 */
export function buildAbilitySeedItemData(ability) {
  return {
    name: ability.name,
    type: "ability",
    img: ABILITY_IMG,
    system: {
      slug: ability.slug,
      description: "",
      type: "",
      rating: 2,
      modifier: 0,
      specialties: [],
    },
  };
}

/**
 * Item-creation data for a canonical Specialty (C2.3). The specialty's slug is
 * already scoped (`<abilitySlug>_<name>`) by the vocabulary.
 * @param {object} ability   the owning CANONICAL_ABILITIES entry
 * @param {object} specialty one of its `specialties` entries
 * @returns {object} Item creation data
 */
export function buildSpecialtySeedItemData(ability, specialty) {
  return {
    name: specialty.name,
    type: "specialty",
    img: SPECIALTY_IMG,
    system: {
      slug: specialty.slug,
      description: "",
      type: "",
      abilitySlug: ability.slug,
      rating: 0,
      modifier: 0,
    },
  };
}

/** The 19 canonical abilities, as Item creation data. */
export const SEED_ABILITIES = Object.freeze(
  CANONICAL_ABILITIES.map((ability) => buildAbilitySeedItemData(ability))
);

/** The 76 canonical specialties, as Item creation data. */
export const SEED_SPECIALTIES = Object.freeze(
  CANONICAL_ABILITIES.flatMap((ability) =>
    ability.specialties.map((specialty) =>
      buildSpecialtySeedItemData(ability, specialty)
    )
  )
);

/** slug → specialty seed (SSOT lookup, mirroring `SEED_BY_SLUG`). */
export const SEED_SPECIALTY_BY_SLUG = Object.freeze(
  Object.fromEntries(SEED_SPECIALTIES.map((seed) => [seed.system.slug, seed]))
);

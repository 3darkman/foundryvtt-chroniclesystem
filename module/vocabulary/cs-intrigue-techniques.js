// Intrigue technique canonical source — the single source of truth (SSOT,
// constitution §II) for the 7 intrigue techniques (US4, FR-021/SC-006). Mirrors
// `cs-canonical-abilities.js`: a stable `slug` identity + ONE localized `nameKey`
// per technique, replacing the duplicated CS.constants.specialties.* /
// CS.specialties.persuasion.* name usage for technique display.
//
// PURE module (no Foundry runtime) → testable in Vitest. Frozen so no consumer
// can mutate the shared source.
//
// IMPORT-CYCLE INVARIANT (spec 008/009, MEMORY slug-identity-and-slugify-cycle;
// contract effect-vocabulary-additions §Ciclo de import): this module MUST NOT
// import `cs-effect-vocabulary.js` NOR `ChronicleSystem.js`. It is consumed by the
// character sheet AND the effect collector (which reaches the vocabulary), so an
// import back to the vocabulary/ChronicleSystem would close the eval-time cycle.
// Use `cs-slugify.js` for slugs (dependency-free).

import { slugify } from "../effects/cs-slugify.js";

/**
 * The 7 intrigue techniques (data-model §3). `specialtySlug` is the scoped
 * persuasion specialty (spec 008) — every technique IS a persuasion specialty, so
 * `persuasion_<slug>`. `influenceAbilitySlug` is the ability whose rating seeds
 * the Influence column (from csCharacterActorSheet.js).
 * @type {ReadonlyArray<{slug: string, specialtySlug: string, nameKey: string,
 *   influenceAbilitySlug: string}>}
 */
export const INTRIGUE_TECHNIQUES = Object.freeze(
  [
    ["bargain", "cunning"],
    ["charm", "persuasion"],
    ["convince", "will"],
    ["incite", "cunning"],
    ["intimidate", "will"],
    ["seduce", "persuasion"],
    ["taunt", "awareness"],
  ].map(([slug, influenceAbilitySlug]) =>
    Object.freeze({
      slug,
      specialtySlug: `persuasion_${slugify(slug)}`,
      nameKey: `CS.intrigue.techniques.${slug}`,
      influenceAbilitySlug,
    })
  )
);

/**
 * Resolve a technique by its stable slug.
 * @param {string} slug
 * @returns {{slug: string, specialtySlug: string, nameKey: string,
 *   influenceAbilitySlug: string}|undefined}
 */
export function techniqueBySlug(slug) {
  return INTRIGUE_TECHNIQUES.find((t) => t.slug === slug);
}

/**
 * The `{value, labelKey}` pairs for the "one technique" authoring dropdown of the
 * influence effect — localized names from this same SSOT.
 * @returns {Array<{value: string, labelKey: string}>}
 */
export function techniqueChoices() {
  return INTRIGUE_TECHNIQUES.map((t) => ({
    value: t.slug,
    labelKey: t.nameKey,
  }));
}

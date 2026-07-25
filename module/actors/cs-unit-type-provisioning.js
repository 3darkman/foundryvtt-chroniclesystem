import { slugify } from "../effects/cs-slugify.js";
import { abilityOptions } from "../vocabulary/cs-specialty-catalog.js";

const GRANTED_BY_FLAG = "grantedBy";
const FLAG_SCOPE = "chroniclesystem";

function abilityNameForSlug(slug) {
  const option = abilityOptions().find((entry) => entry.slug === slug);
  if (!option) return slug;
  return option.nameKey ? game.i18n.localize(option.nameKey) : option.name;
}

function grantedAbilityIndex(grantedAbilities, wildcardSlugs) {
  const bySlug = new Map();
  for (const entry of grantedAbilities ?? []) {
    const slug = entry?.slug || slugify(entry?.name ?? "");
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, entry?.name || abilityNameForSlug(slug));
  }
  for (const slug of wildcardSlugs ?? []) {
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, abilityNameForSlug(slug));
  }
  return bySlug;
}

/**
 * spec 025 (contract unit-type-assignment.md C3a, FR-003b/FR-004b) — materialise
 * the abilities a Unit Type grants onto the Unit, tagging their provenance.
 *
 * An ability the Unit already owns is NOT recreated and NOT reset: the type's
 * slug is unioned into its `grantedBy` flag, so XP already invested in the rank
 * survives and removing one of two granting types keeps the ability.
 * A new ability is minted at the schema's own initial rank (2) — no rank is
 * written here, so the base rank has exactly one home (`AbilityData`).
 *
 * @param {object} actor the Unit
 * @param {string} typeSlug the assigned Unit Type's stable slug
 * @param {Array<{slug: string, name: string}>} grantedAbilities the type's fixed grants
 * @param {string[]} wildcardSlugs the slugs chosen in the wildcard dialog
 * @returns {Promise<object[]>} the abilities created by this call
 */
export async function grantTypeAbilities(
  actor,
  typeSlug,
  grantedAbilities = [],
  wildcardSlugs = []
) {
  if (!actor || !typeSlug) return [];
  const wanted = grantedAbilityIndex(grantedAbilities, wildcardSlugs);
  const toCreate = [];

  for (const [slug, name] of wanted) {
    const [existing] = actor.getAbilityBySlug(slug);
    if (!existing) {
      toCreate.push({
        type: "ability",
        name,
        system: { slug },
        flags: { [FLAG_SCOPE]: { [GRANTED_BY_FLAG]: [typeSlug] } },
      });
      continue;
    }
    const grantedBy = existing.getFlag(FLAG_SCOPE, GRANTED_BY_FLAG) ?? [];
    if (grantedBy.includes(typeSlug)) continue;
    await existing.setFlag(FLAG_SCOPE, GRANTED_BY_FLAG, [
      ...grantedBy,
      typeSlug,
    ]);
  }

  if (!toCreate.length) return [];
  return actor.createEmbeddedDocuments("Item", toCreate);
}

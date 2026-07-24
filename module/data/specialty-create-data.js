// The ONE definition of "what a provisioned specialty is" (spec 024, D15 —
// data-model.md §4a). Consumed by BOTH the drop path
// (`module/actors/cs-specialty-provisioning.js`, async) and the conversion's
// backfill (`module/migrations/task140-specialty-items.js`, pure), so a migrated
// character and a character who gains the ability afterwards end up with
// identical documents (FR-027a) by construction, not by two field lists that
// happen to agree.
//
// It lives in the DATA layer, not beside `provisionSpecialties` in the Domain
// layer, precisely so the migration can consume it without importing inward-out
// (constitution §IV). PURE — no Foundry import ⇒ Vitest-importable.

import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";

/** A source's effective specialty slug: its stored slug, else the scoped
 *  derivation from its own `abilitySlug` and name. */
function sourceSlug(source) {
  const stored = source?.system?.slug;
  if (stored) return stored;
  return scopedSpecialtySlug(source?.system?.abilitySlug ?? "", source?.name);
}

/** Integer coercion for the flat modifier — never clamped to 0 (a negative
 *  modifier is legitimate; only the RATING floors at 0, FR-013). */
function clampNumber(value) {
  return Math.trunc(Number(value) || 0);
}

/**
 * The sources that still need to be created (contract specialty-provisioning.md
 * C2.3): order-preserving, dropping every source whose effective slug is already
 * present, and de-duping the survivors by slug (first wins) so one call can never
 * emit two rows of the same slug.
 * @param {Array<object>} sources document-like specialty sources
 * @param {Set<string>|Iterable<string>} existingSlugs slugs already in the scope
 * @returns {Array<object>} the subset to create, in source order
 */
export function selectMissingSpecialtySources(sources, existingSlugs) {
  const owned =
    existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs ?? []);
  const seen = new Set();
  const missing = [];
  for (const source of sources ?? []) {
    const slug = sourceSlug(source);
    if (!slug || owned.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    missing.push(source);
  }
  return missing;
}

/**
 * Item-creation data for one provisioned specialty (data-model.md §4a).
 *
 * `source.toObject()` is what makes FR-019a true — the copy carries the source's
 * `description`, its Active `effects`, its `img` and its `flags`, rather than
 * being a bare placeholder. Only the four keys below are overridden.
 *
 * @param {{name: string, toObject?: function}} source a pack document, a world
 *   Item, or any document-like object
 * @param {string} abilitySlug the owning ability's slug — stamped, never trusted
 *   from the source
 * @returns {object} Item creation data
 */
export function buildProvisionedSpecialtyData(source, abilitySlug) {
  const data =
    typeof source?.toObject === "function"
      ? source.toObject()
      : foundryLikeClone(source);

  delete data._id;
  data.type = "specialty";
  data.name = data.name ?? source?.name ?? "";

  const system = { ...(data.system ?? {}) };
  system.abilitySlug = abilitySlug ?? "";
  system.rating = 0; // provisioning always starts untrained (FR-019/FR-027a)
  system.modifier = clampNumber(system.modifier);
  system.slug = system.slug || scopedSpecialtySlug(abilitySlug, data.name);
  system.description = system.description ?? "";
  system.type = system.type ?? "";
  data.system = system;

  return data;
}

/** Deep-clone fallback for a plain-object source (a seed, or a test double)
 *  that carries no `toObject()`. */
function foundryLikeClone(source) {
  if (!source || typeof source !== "object") return { system: {} };
  return JSON.parse(JSON.stringify(source));
}

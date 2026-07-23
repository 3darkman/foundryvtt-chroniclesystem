/**
 * Ability / Specialty catalogue — the RUNTIME read side (spec 024, contract
 * specialty-catalog.md C4–C6).
 *
 * Two halves with different rules:
 *
 *  · **Synchronous** (`abilityBySlug`, `specialtyBySlug`, `specialtiesForAbility`)
 *    — world `game.items` ∪ the canonical vocabulary, deduped by slug with the
 *    WORLD entry winning. It NEVER reads a pack: the packs exist to *seed* the
 *    world, and every synchronous consumer (the passive catalogue, the slug
 *    suggestions) runs where it cannot await. The canonical vocabulary is the
 *    synchronous stand-in for the pack's canonical rows — and the packs are
 *    generated from it, so the two cannot disagree (C4.5).
 *
 *  · **Asynchronous** (`specialtySourcesForAbility`) — the provisioning source:
 *    the specialties compendium ∪ the world's own, as document-like sources whose
 *    `toObject()` carries the description and the Active Effects a copy must
 *    inherit (FR-019a).
 *
 * Every `game` read is `game?.`-guarded, the technique `cs-passive-catalog.js:65`
 * already uses, so the module stays importable from Vitest.
 */

import { slugify } from "../effects/cs-slugify.js";
import {
  CANONICAL_ABILITIES,
  scopedSpecialtySlug,
} from "./cs-canonical-abilities.js";
import {
  buildAbilitySeedItemData,
  buildSpecialtySeedItemData,
} from "../data/ability-specialty-seeds.js";

const SPECIALTY_PACK_ID = "chroniclesystem.specialties";

/** Lazily-built slug → canonical ability index. */
let abilityIndex = null;
/** Lazily-built specialty slug → {ability, specialty} index. */
let specialtyIndex = null;
/** One-shot "the specialties compendium is missing" warning flag (C6.5). */
let missingPackWarned = false;

function canonicalAbilityIndex() {
  if (!abilityIndex) {
    abilityIndex = new Map(CANONICAL_ABILITIES.map((a) => [a.slug, a]));
  }
  return abilityIndex;
}

function canonicalSpecialtyIndex() {
  if (!specialtyIndex) {
    specialtyIndex = new Map();
    for (const ability of CANONICAL_ABILITIES) {
      for (const specialty of ability.specialties) {
        specialtyIndex.set(specialty.slug, { ability, specialty });
      }
    }
  }
  return specialtyIndex;
}

/** The effective slug of a world specialty item. */
function itemSpecialtySlug(item) {
  return (
    item.system?.slug ||
    scopedSpecialtySlug(item.system?.abilitySlug ?? "", item.name)
  );
}

/**
 * The specialties a given ability may offer (C4): world Specialty items linked to
 * `abilitySlug` **∪** the canonical specialties of that ability, deduped by slug
 * with the world item winning (a GM's edited copy carries their name).
 *
 * Blank slugs, and a slug equal to the bare `abilitySlug` (what
 * `scopedSpecialtySlug` yields for an unnamed row), are dropped — preserving the
 * guard `worldSpecialties` had.
 *
 * Synchronous, pack-free and safe with no `game` (yields the canonical entries
 * alone, C4.6).
 * @param {string} abilitySlug
 * @returns {Array<{slug: string, name: string, nameKey: string|null}>}
 */
export function specialtiesForAbility(abilitySlug) {
  if (!abilitySlug) return [];
  const bySlug = new Map();

  for (const item of game?.items ?? []) {
    if (item?.type !== "specialty") continue;
    if (item.system?.abilitySlug !== abilitySlug) continue;
    const slug = itemSpecialtySlug(item);
    if (!slug || slug === abilitySlug || bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: item.name ?? slug, nameKey: null });
  }

  const canonical = canonicalAbilityIndex().get(abilitySlug);
  for (const specialty of canonical?.specialties ?? []) {
    if (!specialty.slug || bySlug.has(specialty.slug)) continue;
    bySlug.set(specialty.slug, {
      slug: specialty.slug,
      name: specialty.name,
      nameKey: specialty.nameKey,
    });
  }

  return [...bySlug.values()];
}

/**
 * Resolve an Ability definition by stable slug (C5) — a world Item first, else a
 * synthetic `{name, system}` built from the canonical vocabulary. Never throws.
 * @param {string} slug
 * @returns {object|null}
 */
export function abilityBySlug(slug) {
  if (!slug) return null;
  for (const item of game?.items ?? []) {
    if (item?.type !== "ability") continue;
    if ((item.system?.slug || slugify(item.name)) === slug) return item;
  }
  const canonical = canonicalAbilityIndex().get(slug);
  if (!canonical) return null;
  const data = buildAbilitySeedItemData(canonical);
  return { name: data.name, system: data.system };
}

/**
 * Resolve a Specialty definition by stable (scoped) slug (C5) — a world Item
 * first, else a synthetic `{name, system}` built from the canonical vocabulary.
 * The synthetic fallback carries no Active Effects by construction; anything
 * needing them must use the async path. Never throws.
 * @param {string} slug
 * @returns {object|null}
 */
export function specialtyBySlug(slug) {
  if (!slug) return null;
  for (const item of game?.items ?? []) {
    if (item?.type !== "specialty") continue;
    if (itemSpecialtySlug(item) === slug) return item;
  }
  const canonical = canonicalSpecialtyIndex().get(slug);
  if (!canonical) return null;
  const data = buildSpecialtySeedItemData(
    canonical.ability,
    canonical.specialty
  );
  return { name: data.name, system: data.system };
}

/** Warn the GM ONCE per session that the specialties compendium is absent
 *  (C6.5 / D19) — an invisible degradation is what this exists to prevent. */
function warnMissingPackOnce() {
  if (missingPackWarned) return;
  missingPackWarned = true;
  if (!game?.user?.isGM) return;
  ui?.notifications?.warn?.(
    game?.i18n?.localize?.("CS.warnings.specialtyCatalogMissing") ??
      "CS.warnings.specialtyCatalogMissing"
  );
}

/**
 * The provisioning SOURCE for an ability (C6) — **asynchronous**, used only by
 * `provisionSpecialties` and the conversion's backfill, both of which may await.
 *
 * `await pack.getDocuments()` on `chroniclesystem.specialties` ∪ the world's own
 * Specialty items with that `abilitySlug`, deduped by slug with the WORLD
 * winning (a GM's homebrew edit of a canonical specialty is what gets copied).
 * The returned sources are document-like: their `toObject()` carries the
 * description and the Active Effects (FR-019a).
 *
 * A missing pack degrades to the world set alone — never throws, never blocks
 * the ability from being added — but says so once per session (C6.5).
 * @param {string} abilitySlug
 * @returns {Promise<Array<object>>}
 */
export async function specialtySourcesForAbility(abilitySlug) {
  if (!abilitySlug) return [];
  const bySlug = new Map();

  for (const item of game?.items ?? []) {
    if (item?.type !== "specialty") continue;
    if (item.system?.abilitySlug !== abilitySlug) continue;
    const slug = itemSpecialtySlug(item);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, item);
  }

  const pack = game?.packs?.get?.(SPECIALTY_PACK_ID);
  if (!pack) {
    warnMissingPackOnce();
    return [...bySlug.values()];
  }

  try {
    const documents = await pack.getDocuments();
    for (const doc of documents ?? []) {
      if (doc?.system?.abilitySlug !== abilitySlug) continue;
      const slug =
        doc.system?.slug || scopedSpecialtySlug(abilitySlug, doc.name);
      if (!slug || bySlug.has(slug)) continue;
      bySlug.set(slug, doc);
    }
  } catch (err) {
    console.warn(
      "chroniclesystem | specialty catalogue unavailable, using the world set:",
      err
    );
  }

  return [...bySlug.values()];
}

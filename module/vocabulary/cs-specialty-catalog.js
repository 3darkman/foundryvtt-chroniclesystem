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

const ABILITY_PACK_ID = "chroniclesystem.abilities";
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
 * Every ability that can own a specialty: the WORLD's own Ability items ∪ the
 * canonical vocabulary, deduped by slug with the **world entry winning** — the
 * same precedence `specialtiesForAbility` applies, and the same one every
 * slug-keyed listing in the system is expected to follow: a GM who created
 * "Fighting" in their world sees THEIR item, not the catalogue's copy.
 *
 * Synchronous and pack-free, for the identical reason: its consumers (the
 * Specialty sheet's owning-ability select) build their context without awaiting.
 * The canonical vocabulary is the synchronous stand-in for the packs, which are
 * generated from it (C4.5).
 *
 * @returns {Array<{slug: string, name: string, nameKey: string|null}>}
 */
export function abilityOptions() {
  const bySlug = new Map();

  for (const item of game?.items ?? []) {
    if (item?.type !== "ability") continue;
    const slug = item.system?.slug || slugify(item.name ?? "");
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: item.name ?? slug, nameKey: null });
  }

  for (const ability of CANONICAL_ABILITIES) {
    if (bySlug.has(ability.slug)) continue;
    bySlug.set(ability.slug, {
      slug: ability.slug,
      name: ability.name,
      nameKey: ability.nameKey,
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

/**
 * The Item creation data for an ability, by stable slug — **asynchronous**, so
 * it can reach the abilities compendium and carry that document's description
 * and Active Effects instead of a bare synthetic copy.
 *
 * Same precedence as every other slug-keyed lookup here: the world's own Ability
 * item first, then the pack, then the canonical seed. `null` when the slug
 * matches nothing — a specialty pointing at an ability that exists nowhere.
 *
 * @param {string} slug
 * @returns {Promise<object|null>} Item creation data, never a live document
 */
export async function abilitySourceForSlug(slug) {
  if (!slug) return null;

  for (const item of game?.items ?? []) {
    if (item?.type !== "ability") continue;
    if ((item.system?.slug || slugify(item.name ?? "")) === slug) {
      return item.toObject();
    }
  }

  const pack = game?.packs?.get?.(ABILITY_PACK_ID);
  if (pack) {
    try {
      const documents = await pack.getDocuments();
      const found = (documents ?? []).find(
        (doc) => (doc.system?.slug || slugify(doc.name ?? "")) === slug
      );
      if (found) return found.toObject();
    } catch (err) {
      console.warn(
        "chroniclesystem | ability catalogue unavailable, using the canonical seed:",
        err
      );
    }
  }

  const canonical = canonicalAbilityIndex().get(slug);
  return canonical ? buildAbilitySeedItemData(canonical) : null;
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

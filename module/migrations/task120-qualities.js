import {
  SEED_QUALITIES,
  SEED_BY_SLUG,
  buildSeedItemData,
} from "../data/quality-seeds.js";
import { slugify } from "../effects/cs-slugify.js";

// spec 020 (FR-011 / FR-017 / Decision 10) — qualities as first-class items.
//
// Two independent, idempotent steps:
//
//  1. ensureQualityCompendium() — sync the declared system pack
//     `chroniclesystem.qualities` to the deterministic seed catalog (UPSERT: create
//     missing + refresh existing), so the GM has a real, browsable library to DRAG
//     onto weapon/armour sheets (there is no picker) that always reflects the current
//     seeds. System packs ship LOCKED (foundry.mjs:27793) so we unlock → upsert →
//     re-lock. Runs on every GM `ready`. NOT version-gated — a fresh install seeds,
//     and a changed seed (e.g. Bulk gaining its rule) is refreshed, never left stale.
//
//  2. migrateReferencedQualities() — the live effect collector resolves a reference
//     by slug in `game.items` SYNCHRONOUSLY (it cannot await a pack). So every slug
//     actually REFERENCED by a weapon/armour is materialised as a world Quality (from
//     the seed catalog) — idempotent, and only for referenced slugs, so the world is
//     not polluted with unused definitions. A referenced slug with no seed is left
//     unresolved (renders as a "<slug> missing item" chip — never dropped).
//
// The per-document schema `migrateData` already converts each legacy free-text
// `{name, parameter}` row to a `{slug, parameter}` reference at load (non-
// destructive, tolerant `blank:true` slug → the weapon never vanishes).

const PACK_ID = "chroniclesystem.qualities";

/** Add each quality-reference slug of a weapon/armour to `out`. */
function collectRefSlugs(item, out) {
  if (item?.type !== "weapon" && item?.type !== "armor") return;
  for (const ref of item.system?.qualities ?? []) {
    const slug = ref?.slug || slugify(ref?.name ?? "");
    if (slug) out.add(slug);
  }
}

/**
 * Sync the `chroniclesystem.qualities` compendium to the seed catalog (UPSERT):
 * create any missing Quality and UPDATE the existing ones to the current seed data,
 * so the compendium is always a faithful mirror of `SEED_QUALITIES` — a seed whose
 * rules/range/parameter changed (e.g. Bulk gaining its `bulk` rule) is refreshed,
 * not left stale. The system pack ships LOCKED (GMs customise a WORLD copy, not the
 * master), so overwriting it here is safe. Unlocks → upserts → restores the lock.
 * GM only; safe on every `ready`.
 */
export async function ensureQualityCompendium() {
  const pack = game.packs?.get(PACK_ID);
  if (!pack) return; // manifest not (yet) reloaded — nothing to seed into

  await pack.getIndex({ fields: ["system.slug"] });
  const idBySlug = new Map();
  for (const entry of pack.index) {
    idBySlug.set(entry.system?.slug || slugify(entry.name), entry._id);
  }

  const toCreate = [];
  const toUpdate = [];
  for (const seed of SEED_QUALITIES) {
    const data = buildSeedItemData(seed);
    const id = idBySlug.get(seed.slug);
    if (id) {
      // Refresh the master copy; `type` is immutable so it is omitted from updates.
      toUpdate.push({
        _id: id,
        name: data.name,
        img: data.img,
        system: data.system,
      });
    } else {
      toCreate.push(data);
    }
  }
  if (!toCreate.length && !toUpdate.length) return;

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  try {
    if (toCreate.length) {
      await CONFIG.Item.documentClass.createDocuments(toCreate, {
        pack: pack.collection,
      });
    }
    if (toUpdate.length) {
      await CONFIG.Item.documentClass.updateDocuments(toUpdate, {
        pack: pack.collection,
      });
    }
    // spec 021 — sync each seed's authored condition effects (Grabbed/Impaled/…)
    // into the pack MASTER, so a compendium seeded before spec 021 (its entries have
    // NO effects) gains them. Done WITHIN the unlock window, GM-only (migrateData
    // gate). NOTE: effects are deliberately NOT put in the parent `updateDocuments`
    // above — id-less effect data there duplicates on every `ready` (not idempotent,
    // foundry-api-expert); this pass diffs by effect NAME instead. The world-first
    // FR-025 contract is untouched: only the LOCKED master (never GM-edited) is
    // refreshed, never a divergent world copy.
    await syncSeedEffects(pack);
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

/**
 * Ensure every seed Quality that declares condition `effects` has them on its pack
 * MASTER document (spec 021, US3). Idempotent by effect NAME: loads the full pack
 * document (the index carries no embedded effects) and creates only the MISSING
 * effects — never duplicates on re-run, never overwrites/deletes an existing one
 * (a conservative, non-destructive refresh; the locked master is a seed mirror).
 * Embedded CRUD on a pack document inherits its pack automatically (no `{pack}` arg).
 * @param {CompendiumCollection} pack the unlocked qualities pack
 */
async function syncSeedEffects(pack) {
  const withEffects = SEED_QUALITIES.filter((seed) => seed.effects?.length);
  if (!withEffects.length) return;

  await pack.getIndex({ fields: ["system.slug"] });
  const idBySlug = new Map();
  for (const entry of pack.index) {
    idBySlug.set(entry.system?.slug || slugify(entry.name), entry._id);
  }

  for (const seed of withEffects) {
    const id = idBySlug.get(seed.slug);
    if (!id) continue;
    const doc = await pack.getDocument(id);
    if (!doc) continue;
    const existingNames = new Set(doc.effects.map((effect) => effect.name));
    const missing = seed.effects.filter((eff) => !existingNames.has(eff.name));
    if (missing.length) {
      await doc.createEmbeddedDocuments("ActiveEffect", missing);
    }
  }
}

/**
 * Materialise each REFERENCED seed Quality as a world Item (idempotent by slug), so
 * the synchronous collector resolves it. Only referenced slugs that have a seed are
 * created; unknown/homebrew slugs are left to render as "missing item".
 */
export async function migrateReferencedQualities() {
  const needed = new Set();
  for (const item of game.items) collectRefSlugs(item, needed);
  for (const actor of game.actors) {
    for (const item of actor.items) collectRefSlugs(item, needed);
  }

  const existing = new Set(
    game.items
      .filter((i) => i.type === "quality")
      .map((i) => i.system?.slug || slugify(i.name))
  );

  const toCreate = [...needed]
    .filter((slug) => !existing.has(slug) && SEED_BY_SLUG[slug])
    .map((slug) => buildSeedItemData(SEED_BY_SLUG[slug]));

  if (toCreate.length) {
    await CONFIG.Item.documentClass.createDocuments(toCreate);
  }
}

/**
 * One-time repair (spec 020) — strip EMPTY-slug quality references (`{slug:""}`) from
 * every weapon/armour. These reference nothing and only render as a "(empty) missing
 * item" chip the GM cannot otherwise clear in bulk. Only blank refs are removed;
 * a non-empty slug (even an unresolved one) is kept (it identifies a real quality,
 * FR-012). Persists the cleaned array so it does not reappear.
 */
export async function repairEmptyQualityRefs() {
  const fixCollection = async (collection) => {
    for (const item of collection ?? []) {
      if (item.type !== "weapon" && item.type !== "armor") continue;
      const refs = item.system?.qualities;
      if (!Array.isArray(refs) || !refs.length) continue;
      const cleaned = refs.filter((r) => r?.slug && r.slug !== "");
      if (cleaned.length !== refs.length) {
        await item.update({ "system.qualities": cleaned });
      }
    }
  };
  await fixCollection(game.items);
  for (const actor of game.actors) await fixCollection(actor.items);
}

// spec 024 — specialties as first-class items (contract specialty-migration.md).
//
// Three independent, idempotent steps:
//
//  1. ensureAbilityCompendium() / ensureSpecialtyCompendium() — sync the two
//     declared system packs to the deterministic seeds derived from
//     CANONICAL_ABILITIES (UPSERT: create missing + refresh existing), so the GM
//     has a real, browsable, draggable catalogue. System packs ship LOCKED, so we
//     unlock → upsert → RE-LOCK in a `finally` (a failure may never leave a pack
//     unlocked). Runs on every GM `ready`, NOT version-gated.
//
//  2. planSpecialtyConversion() — the whole decision logic, PURE and therefore
//     testable without Foundry: convert each legacy `ability.system.specialties`
//     row into a Specialty item, and backfill the ones the catalogue has and the
//     scope lacks.
//
//  3. migrateSpecialtyItems() — the thin IO shell: walk the world directory,
//     every directory actor and every UNLINKED scene token, batch one create per
//     scope, and report. It NEVER writes `ability.system.specialties`, so an
//     interrupted run can be re-run from intact source data (FR-028).

import {
  SEED_ABILITIES,
  SEED_SPECIALTIES,
} from "../data/ability-specialty-seeds.js";
import {
  selectMissingSpecialtySources,
  buildProvisionedSpecialtyData,
} from "../data/specialty-create-data.js";
import { clampRating } from "../data/item/specialty-data.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";
import { specialtySourcesForAbility } from "../vocabulary/cs-specialty-catalog.js";
import { slugify } from "../effects/cs-slugify.js";

const ABILITY_PACK_ID = "chroniclesystem.abilities";
const SPECIALTY_PACK_ID = "chroniclesystem.specialties";

/* -------------------------------------------- */
/*  1 · Compendium sync                          */
/* -------------------------------------------- */

/**
 * Upsert `seeds` into `packId` (contract C3). A pack the server has not
 * registered yet degrades to a NO-OP, never an error — the missing-catalogue
 * warning that makes that state visible lives in `specialtySourcesForAbility`.
 * @param {string} packId
 * @param {ReadonlyArray<object>} seeds Item creation data
 */
async function ensureSeedCompendium(packId, seeds) {
  const pack = game.packs?.get(packId);
  if (!pack) return; // manifest not (yet) registered — nothing to seed into

  await pack.getIndex({ fields: ["system.slug"] });
  const idBySlug = new Map();
  for (const entry of pack.index) {
    idBySlug.set(entry.system?.slug || slugify(entry.name), entry._id);
  }

  const toCreate = [];
  const toUpdate = [];
  for (const data of seeds) {
    const id = idBySlug.get(data.system.slug);
    if (id) {
      // `type` is immutable, so it is omitted from updates.
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
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

/** Sync `chroniclesystem.abilities` to the 19 canonical ability seeds. */
export async function ensureAbilityCompendium() {
  await ensureSeedCompendium(ABILITY_PACK_ID, SEED_ABILITIES);
}

/** Sync `chroniclesystem.specialties` to the 76 canonical specialty seeds. */
export async function ensureSpecialtyCompendium() {
  await ensureSeedCompendium(SPECIALTY_PACK_ID, SEED_SPECIALTIES);
}

/* -------------------------------------------- */
/*  2 · Pure planner                             */
/* -------------------------------------------- */

/**
 * Plan the Specialty items one ability needs (contract C2). PURE — no `game`, no
 * `Date`, no random — which is why `catalogue` is an argument: the shell resolves
 * it through the async `specialtySourcesForAbility` and passes it in.
 *
 * @param {{name: string, slug?: string, specialties?: object[]|object}} abilityData
 *   the legacy ability's identity + its deprecated embedded rows
 * @param {Set<string>} existingSlugs specialty slugs already present in the scope
 * @param {Array<object>} catalogue the specialty sources for this ability
 * @returns {{create: object[], skipped: Array<{slug: string, name: string, reason: string}>}}
 */
export function planSpecialtyConversion(
  abilityData,
  existingSlugs,
  catalogue = []
) {
  const abilitySlug =
    abilityData?.slug || slugify(abilityData?.name ?? "") || "";
  const owned =
    existingSlugs instanceof Set
      ? new Set(existingSlugs)
      : new Set(existingSlugs ?? []);
  const create = [];
  const skipped = [];
  const convertedSlugs = new Set();

  // --- Convert (FR-027): one entry per legacy row. A legacy row is raw data,
  // not a document, so it has no description and no effects to carry — this
  // field list is complete for the CONVERSION branch only (C2.1).
  for (const row of Object.values(abilityData?.specialties ?? {})) {
    if (!row || typeof row !== "object") {
      skipped.push({ slug: "", name: "", reason: "unreadable" });
      continue;
    }
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const slug = row.slug || scopedSpecialtySlug(abilitySlug, name);
    if (!slug || slug === abilitySlug) {
      skipped.push({ slug: "", name, reason: "unreadable" });
      continue;
    }
    if (convertedSlugs.has(slug)) {
      skipped.push({ slug, name, reason: "duplicate" });
      continue;
    }
    convertedSlugs.add(slug);
    if (owned.has(slug)) continue; // idempotent: value left untouched (C2.3)

    create.push({
      name: name || slug,
      type: "specialty",
      img: "systems/chroniclesystem/assets/icons/specialty.png",
      system: {
        slug,
        description: "",
        type: "",
        abilitySlug,
        rating: clampRating(row.rating),
        modifier: Math.trunc(Number(row.modifier) || 0),
      },
    });
  }

  // --- Backfill (FR-027a, D15): the SAME pure selector + builder the drop path
  // uses, so a backfilled specialty carries the source's description and Active
  // Effects and is byte-equal to what provisioning would have created. Never
  // re-derive the C2.1 field list here — that would strip a homebrew source.
  const covered = new Set([...owned, ...convertedSlugs]);
  for (const source of selectMissingSpecialtySources(catalogue, covered)) {
    create.push(buildProvisionedSpecialtyData(source, abilitySlug));
  }

  return { create, skipped };
}

/* -------------------------------------------- */
/*  3 · IO shell                                 */
/* -------------------------------------------- */

/** The specialty slugs already present in a scope's item collection. */
function existingSpecialtySlugs(items) {
  const slugs = new Set();
  for (const item of items ?? []) {
    if (item?.type !== "specialty") continue;
    const slug =
      item.system?.slug ||
      scopedSpecialtySlug(item.system?.abilitySlug ?? "", item.name);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/** The abilities of a scope, as the planner's `abilityData` shape. */
function abilitiesOf(items) {
  const abilities = [];
  for (const item of items ?? []) {
    if (item?.type !== "ability") continue;
    abilities.push({
      name: item.name,
      slug: item.system?.slug || slugify(item.name),
      specialties: item.system?.specialties ?? [],
    });
  }
  return abilities;
}

/**
 * Plan one scope and return the rows to create there. `resolveCatalogue` is the
 * run-wide memoised async source (C4.2).
 */
async function planScope(items, resolveCatalogue, skipped) {
  const existing = existingSpecialtySlugs(items);
  const toCreate = [];
  for (const ability of abilitiesOf(items)) {
    const catalogue = await resolveCatalogue(ability.slug);
    const plan = planSpecialtyConversion(ability, existing, catalogue);
    for (const row of plan.create) {
      // Keep the running scope set in sync so two abilities sharing a slug
      // (a duplicated homebrew) cannot emit the same document twice.
      if (existing.has(row.system.slug)) continue;
      existing.add(row.system.slug);
      toCreate.push(row);
    }
    skipped.push(...plan.skipped);
  }
  return toCreate;
}

/**
 * Convert every legacy embedded specialty into a real Specialty item, and
 * backfill the canonical ones the scope lacks (contract C3). Non-destructive:
 * `ability.system.specialties` is never written.
 */
export async function migrateSpecialtyItems() {
  const skipped = [];
  let created = 0;
  let scopes = 0;

  // C4.2 — one pack round-trip per ability slug for the WHOLE run (a world of
  // 30 actors × 19 abilities must not fire 570 of them).
  const catalogueCache = new Map();
  const resolveCatalogue = async (abilitySlug) => {
    if (!catalogueCache.has(abilitySlug)) {
      catalogueCache.set(
        abilitySlug,
        await specialtySourcesForAbility(abilitySlug)
      );
    }
    return catalogueCache.get(abilitySlug);
  };

  ui.notifications?.info?.(
    game.i18n.localize("CS.migration.specialties.begin")
  );

  // --- World catalogue (US1 scenario 3).
  try {
    const toCreate = await planScope(game.items, resolveCatalogue, skipped);
    if (toCreate.length) {
      await CONFIG.Item.documentClass.createDocuments(toCreate);
      created += toCreate.length;
      scopes += 1;
    }
  } catch (err) {
    console.warn("chroniclesystem | specialty conversion (world) failed:", err);
  }

  // --- Every directory actor. Types are NOT filtered: a legacy house/unit
  // carrying an ability keeps its values (FR-021 gates PROVISIONING, not the
  // conversion — a migration that dropped data would violate FR-028).
  const visited = new Set();
  const convertActor = async (actor) => {
    if (!actor || visited.has(actor.id)) return;
    visited.add(actor.id);
    try {
      const toCreate = await planScope(actor.items, resolveCatalogue, skipped);
      if (toCreate.length) {
        await actor.createEmbeddedDocuments("Item", toCreate);
        created += toCreate.length;
        scopes += 1;
      }
    } catch (err) {
      console.warn(
        `chroniclesystem | specialty conversion failed for actor ${actor?.name}:`,
        err
      );
    }
  };

  for (const actor of game.actors ?? []) await convertActor(actor);

  // --- Every UNLINKED scene token (FR-027b, D18). A token actor owns its own
  // copy of the item collection; skipping it would leave a legacy array nothing
  // reads any more, silently stopping its ranks from resolving.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue; // linked ⇒ IS the directory actor, done above
      await convertActor(token.actor);
    }
  }

  if (skipped.length) {
    console.warn(
      "chroniclesystem | specialty rows skipped during conversion:",
      skipped
    );
    ui.notifications?.warn?.(
      game.i18n.format("CS.migration.specialties.skipped", {
        count: skipped.length,
      })
    );
  }
  ui.notifications?.info?.(
    game.i18n.format("CS.migration.specialties.done", { created, scopes })
  );
}

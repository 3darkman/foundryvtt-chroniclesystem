// Slug derivation lifecycle (spec 008, US2 / FR-012/FR-013). Wires the pure
// derivation rules (module/vocabulary/cs-canonical-abilities.js) to the LIVE
// create/rename flow via the `preCreateItem` / `preUpdateItem` hooks — the
// proven-portable path (research Decision 3 / T021): identical on v13/v14, one
// registration for all 11 item types, no dependency on the version-specific
// TypeDataModel `_preCreate`/`_preUpdate` forward, and no touch to the
// Proxy-factory. The SAME pure functions also run in the world migration (SSOT).
//
// Rules:
//   • derive `system.slug` from the name ONLY when blank (FR-012 — GM-set slugs
//     are preserved);
//   • for abilities, fill each specialty's SCOPED slug where blank (Decision 4);
//   • on a collision within the same scope, `ui.notifications.warn` — NON-blocking
//     (the save proceeds; Decision 7 — never `return` the warn).

import { slugify } from "../effects/cs-slugify.js";
import {
  deriveSlugUpdate,
  deriveSpecialtySlugs,
  findSlugCollision,
} from "../vocabulary/cs-canonical-abilities.js";

/** Slugs of the same-type siblings (other abilities/items in the same scope). */
function siblingSlugs(item) {
  const set = new Set();
  const collection = item.isEmbedded ? item.parent?.items : game.items;
  for (const other of collection ?? []) {
    if (other.id === item.id || other.type !== item.type) continue;
    const slug = other.system?.slug || slugify(other.name);
    if (slug) set.add(slug);
  }
  return set;
}

/** Duplicate specialty slugs WITHIN one ability's specialty list. */
function duplicateSpecialtySlug(specialties) {
  const seen = new Set();
  for (const sp of specialties ?? []) {
    const slug = sp?.slug;
    if (!slug) continue;
    if (seen.has(slug)) return slug;
    seen.add(slug);
  }
  return null;
}

/** Non-blocking collision warning (Decision 7 — statement, never a return). */
function warnCollision(slug) {
  ui.notifications?.warn(
    game.i18n.format("CS.warnings.slugCollision", { slug })
  );
}

/** Derive slug + specialty slugs on CREATE (mutate the source via updateSource). */
function onPreCreateItem(item) {
  const slug = deriveSlugUpdate(item.name, item.system?.slug);
  const effectiveSlug = slug ?? item.system?.slug ?? "";
  const update = {};
  if (slug) update["system.slug"] = slug;

  if (item.type === "ability") {
    const specialties = deriveSpecialtySlugs(
      effectiveSlug || slugify(item.name),
      item.system?.specialties ?? []
    );
    update["system.specialties"] = specialties;
    const dup = duplicateSpecialtySlug(specialties);
    if (dup) warnCollision(dup);
  }
  if (Object.keys(update).length) item.updateSource(update);

  if (findSlugCollision(effectiveSlug, siblingSlugs(item))) {
    warnCollision(effectiveSlug);
  }
}

/** Derive slug + specialty slugs on UPDATE (mutate the outgoing `changes` diff). */
function onPreUpdateItem(item, changes) {
  const utils = foundry.utils;
  const newName = changes.name ?? item.name;
  const currentSlug =
    utils.getProperty(changes, "system.slug") ?? item.system?.slug;
  const slug = deriveSlugUpdate(newName, currentSlug);
  if (slug) utils.setProperty(changes, "system.slug", slug);
  const effectiveSlug = slug ?? currentSlug ?? "";

  if (item.type === "ability") {
    const specialties = utils.getProperty(changes, "system.specialties");
    if (specialties) {
      const derived = deriveSpecialtySlugs(
        effectiveSlug || slugify(newName),
        specialties
      );
      utils.setProperty(changes, "system.specialties", derived);
      const dup = duplicateSpecialtySlug(derived);
      if (dup) warnCollision(dup);
    }
  }

  if (findSlugCollision(effectiveSlug, siblingSlugs(item))) {
    warnCollision(effectiveSlug);
  }
}

/** Register the slug-derivation hooks (called from config.js init). */
export function registerSlugLifecycleHooks() {
  Hooks.on("preCreateItem", (item) => {
    try {
      onPreCreateItem(item);
    } catch (err) {
      console.warn("chroniclesystem | slug derivation (create) skipped:", err);
    }
  });
  Hooks.on("preUpdateItem", (item, changes) => {
    try {
      onPreUpdateItem(item, changes);
    } catch (err) {
      console.warn("chroniclesystem | slug derivation (update) skipped:", err);
    }
  });
}

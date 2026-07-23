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
//   • a SPECIALTY derives its SCOPED slug `<abilitySlug>_<name>` (spec 024, FR-006);
//   • on a collision within the same scope, `ui.notifications.warn` — NON-blocking
//     (the save proceeds; Decision 7 — never `return` the warn).

import { slugify } from "../effects/cs-slugify.js";
import {
  deriveSlugUpdate,
  findSlugCollision,
  scopedSpecialtySlug,
} from "../vocabulary/cs-canonical-abilities.js";

/**
 * Slugs of the same-type siblings (other abilities/items in the same scope).
 *
 * A document targeting a compendium PACK is never embedded, so `item.isEmbedded
 * ? item.parent?.items : game.items` would compare it against the WORLD — and
 * once a generated compendium (qualities, abilities, specialties) has been
 * upserted once, its master rows share slugs with the very world copies the
 * upsert itself, or a later migration, materialised. Every subsequent GM
 * `ready` would then re-run the upsert's `updateDocuments`/`createDocuments`
 * against the pack, "discover" that collision against the world on every
 * single row, and spam a non-blocking warning per row, forever (spec 024 D17
 * — the twin of the duplicate-REJECTION guard `isDuplicateSpecialty` already
 * carries; the warning path was left ungated). No sibling comparison makes
 * sense for a pack document at all: it always returns an empty set for one.
 */
function siblingSlugs(item) {
  const set = new Set();
  if (item.pack) return set;
  const collection = item.isEmbedded ? item.parent?.items : game.items;
  for (const other of collection ?? []) {
    if (other.id === item.id || other.type !== item.type) continue;
    const slug = other.system?.slug || slugify(other.name);
    if (slug) set.add(slug);
  }
  return set;
}

/**
 * The slug to WRITE, given what the generic rule derived. A Specialty's identity
 * is SCOPED by its owning ability — "Charm" exists under both Animal Handling and
 * Persuasion, so the same name under two abilities must yield two distinct slugs
 * (spec 024, FR-006). A GM-set slug is still preserved: `derived` is already
 * `null` in that case.
 *
 * When `abilitySlug` is still BLANK (the common case right after "Create Item":
 * Foundry's create dialog has no field for it, so a hand-authored Specialty is
 * always born unlinked), there is nothing to scope against yet — this returns
 * `null` and leaves `system.slug` blank, rather than writing a malformed
 * `"_<name>"` slug with an empty ability prefix. Leaving it blank is what lets
 * the derivation run again, correctly, the moment the GM picks an Ability from
 * the sheet's dropdown: `onPreUpdateItem` still sees a BLANK stored slug, so
 * `deriveSlugUpdate` fires again with the now-known `abilitySlug`. Without this
 * guard the malformed slug is written once and — because a non-blank slug is
 * never silently overwritten (FR-012) — never corrects itself, no matter how
 * many times the GM later edits the name or the ability link.
 * @param {object} item     the item being created/updated
 * @param {string|null} derived what `deriveSlugUpdate` returned
 * @param {string} name     the effective display name
 * @param {string} abilitySlug the effective owning-ability slug
 * @returns {string|null}
 */
function scopeDerivedSlug(item, derived, name, abilitySlug) {
  if (!derived || item.type !== "specialty") return derived;
  if (!abilitySlug) return null; // not yet linked — nothing to scope against
  const scoped = scopedSpecialtySlug(abilitySlug, name);
  return scoped && scoped !== abilitySlug ? scoped : null;
}

/**
 * spec 024 (FR-006a, D12/D17) — is this new Specialty a silent duplicate?
 *
 * True when a sibling specialty in the SAME scope, under the SAME `abilitySlug`,
 * already carries this slug. Scoping by ability is what lets "Charm" exist under
 * both Animal Handling and Persuasion.
 *
 * A creation targeting a compendium PACK is never a duplicate (D17): a pack
 * document is not embedded, so `siblingSlugs`' scope resolution would compare it
 * against the WORLD — and once the conversion has materialised canonical slugs
 * there, re-seeding `chroniclesystem.specialties` would find a "sibling" for
 * every row and silently drop them, quietly turning SC-005's 76 into fewer.
 * @param {object} item
 * @param {string} slug the effective slug
 * @returns {boolean}
 */
function isDuplicateSpecialty(item, slug) {
  if (item.type !== "specialty" || !slug) return false;
  if (item.pack) return false; // C7.3a — never reject a pack creation
  const abilitySlug = item.system?.abilitySlug ?? "";
  const collection = item.isEmbedded ? item.parent?.items : game.items;
  for (const other of collection ?? []) {
    if (other.id === item.id || other.type !== "specialty") continue;
    if ((other.system?.abilitySlug ?? "") !== abilitySlug) continue;
    const otherSlug =
      other.system?.slug || scopedSpecialtySlug(abilitySlug, other.name);
    if (otherSlug === slug) return true;
  }
  return false;
}

/** Non-blocking collision warning (Decision 7 — statement, never a return). */
function warnCollision(slug) {
  ui.notifications?.warn(
    game.i18n.format("CS.warnings.slugCollision", { slug })
  );
}

/** Derive the slug on CREATE (mutate the source via updateSource). */
function onPreCreateItem(item) {
  const slug = scopeDerivedSlug(
    item,
    deriveSlugUpdate(item.name, item.system?.slug),
    item.name,
    item.system?.abilitySlug
  );
  const effectiveSlug = slug ?? item.system?.slug ?? "";

  // spec 024 (FR-006a) — a duplicate specialty is rejected SILENTLY: no
  // notification, no suffix. Returning `false` from `preCreateItem` aborts only
  // THIS document; in a batch the loop simply continues, so a 76-item
  // provisioning run is never swallowed by one collision. (This must never move
  // into `_preCreateOperation`, where `false` empties the whole batch.) The
  // check runs BEFORE `updateSource`, so a rejected document is not touched.
  if (isDuplicateSpecialty(item, effectiveSlug)) return false;

  const update = {};
  if (slug) update["system.slug"] = slug;
  if (Object.keys(update).length) item.updateSource(update);

  if (findSlugCollision(effectiveSlug, siblingSlugs(item))) {
    warnCollision(effectiveSlug);
  }
  return undefined;
}

/** Derive the slug on UPDATE (mutate the outgoing `changes` diff). */
function onPreUpdateItem(item, changes) {
  const utils = foundry.utils;
  const newName = changes.name ?? item.name;
  const currentSlug =
    utils.getProperty(changes, "system.slug") ?? item.system?.slug;
  const abilitySlug =
    utils.getProperty(changes, "system.abilitySlug") ??
    item.system?.abilitySlug;
  const slug = scopeDerivedSlug(
    item,
    deriveSlugUpdate(newName, currentSlug),
    newName,
    abilitySlug
  );
  if (slug) utils.setProperty(changes, "system.slug", slug);
  const effectiveSlug = slug ?? currentSlug ?? "";

  if (findSlugCollision(effectiveSlug, siblingSlugs(item))) {
    warnCollision(effectiveSlug);
  }
}

/** Register the slug-derivation hooks (called from config.js init). */
export function registerSlugLifecycleHooks() {
  Hooks.on("preCreateItem", (item) => {
    try {
      // The return value MUST survive this wrapper (spec 024, D17): a block body
      // that returned nothing would swallow the duplicate rejection's `false`
      // and make FR-006a a no-op that every unit test still passes.
      return onPreCreateItem(item);
    } catch (err) {
      console.warn("chroniclesystem | slug derivation (create) skipped:", err);
      // Deliberately `undefined`: a derivation error must never block a
      // legitimate creation.
      return undefined;
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

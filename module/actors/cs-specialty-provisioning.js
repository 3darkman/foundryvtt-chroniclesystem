/**
 * Automatic provisioning (spec 024, US3 — contract specialty-provisioning.md).
 *
 * Adding an Ability to a CHARACTER materialises every specialty of that ability
 * at rating 0, idempotently. The decision layer is NOT implemented here: the
 * selector and the builder come from `module/data/specialty-create-data.js`, the
 * SAME pair the migration's backfill consumes — which is what makes a converted
 * character and a character who gains the ability afterwards end up with
 * identical documents (FR-027a) by construction rather than by coincidence (D15).
 *
 * Each side keeps only the IO strategy its context needs: one
 * `createEmbeddedDocuments` per ability here; one batched call per scope there.
 *
 * There is deliberately NO delete counterpart: removing an ability leaves its
 * specialties and their values untouched (FR-022).
 */

import {
  selectMissingSpecialtySources,
  buildProvisionedSpecialtyData,
} from "../data/specialty-create-data.js";
import { specialtySourcesForAbility } from "../vocabulary/cs-specialty-catalog.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";
import { slugify } from "../effects/cs-slugify.js";

/** The specialty slugs the actor already owns. */
function ownedSpecialtySlugs(actor) {
  const slugs = new Set();
  for (const item of actor?.items ?? []) {
    if (item?.type !== "specialty") continue;
    const slug =
      item.system?.slug ||
      scopedSpecialtySlug(item.system?.abilitySlug ?? "", item.name);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/**
 * Create every missing specialty of `abilityItem` on `actor`, at rating 0.
 *
 * Idempotent (FR-020): a slug the actor already owns is skipped and its existing
 * rating is never touched. The sources are the async union of the specialties
 * compendium and the world's own Specialty items, so a GM's homebrew is
 * provisioned alongside the canonical set, carrying its description and its
 * Active Effects (FR-019a).
 *
 * @param {object} actor the owning character
 * @param {object} abilityItem the Ability that was just added
 * @returns {Promise<object[]>} the created items; `[]` without touching the DB
 *   when there is nothing to create
 */
export async function provisionSpecialties(actor, abilityItem) {
  const abilitySlug =
    abilityItem?.system?.slug || slugify(abilityItem?.name ?? "");
  if (!abilitySlug) return [];

  const sources = await specialtySourcesForAbility(abilitySlug);
  const missing = selectMissingSpecialtySources(
    sources,
    ownedSpecialtySlugs(actor)
  );
  if (!missing.length) return [];

  const toCreate = missing.map((source) =>
    buildProvisionedSpecialtyData(source, abilitySlug)
  );
  // ONE batched call — a Fighting drop is 9 documents, a backfill can be dozens.
  return actor.createEmbeddedDocuments("Item", toCreate);
}

// Migration 0.9.0 — stable slug identity backfill (spec 008, US3).
//
// Existing worlds (English content, no slug) get their `system.slug` derived
// from the current name so routing keeps producing the SAME numbers with zero
// manual action (FR-007). It is NON-destructive: only BLANK slugs are filled, so
// a 2nd pass is a no-op (idempotent). The actionable review list is NARROW by
// design: it fires ONLY when a canonical CORE ability appears to be MISSING
// world-wide (a likely rename that would break routing) — NOT for intentional
// homebrew, which never removes a canonical slug. NEVER silently rewritten
// (FR-014). Pure `deriveWorldSlugs` (testable) + Foundry wrapper (task080 pattern).

import { slugify } from "../effects/cs-slugify.js";
import {
  scopedSpecialtySlug,
  isCanonicalAbilitySlug,
  canonicalAbilityBase,
  ABILITY_SLUGS,
} from "../vocabulary/cs-canonical-abilities.js";
import { CSConstants } from "../system/csConstants.js";

/** Non-blank slug value → its normalised form; else "". */
function existingSlug(value) {
  return value && String(value).trim() !== "" ? slugify(value) : "";
}

/**
 * PURE backfill transform (no Foundry runtime) — testable in Vitest. Idempotent:
 * only fills blank slugs, so a 2nd pass yields no updates.
 * @param {Array<{_id: string, uuid?: string, name: string, type: string, system?: object}>} items
 * @returns {{updates: object[], review: object[]}}
 *   updates: `[{ _id, uuid?, "system.slug"?, "system.specialties"? }]` (blank only)
 *   review:  `[{ uuid, name, derivedSlug, kind }]` — non-canonical abilities, but
 *            ONLY when some canonical ability slug is missing world-wide (rename).
 */
export function deriveWorldSlugs(items) {
  const list = items ?? [];
  const updates = [];
  const abilityInfos = []; // { uuid, name, effSlug } for the world-wide review

  for (const item of list) {
    if (!item) continue;
    const sys = item.system ?? {};
    const stored = existingSlug(sys.slug);
    const effectiveSlug = stored || slugify(item.name);
    const update = {};
    if (!stored && effectiveSlug) update["system.slug"] = effectiveSlug;

    if (item.type === "ability") {
      const raw = sys.specialties ?? [];
      const specialties = Array.isArray(raw) ? raw : Object.values(raw);
      let specialtiesChanged = false;
      const derived = specialties.map((sp) => {
        if (!sp || typeof sp !== "object") return sp;
        if (existingSlug(sp.slug)) return sp;
        specialtiesChanged = true;
        return { ...sp, slug: scopedSpecialtySlug(effectiveSlug, sp.name) };
      });
      if (specialtiesChanged) update["system.specialties"] = derived;
      abilityInfos.push({
        uuid: item.uuid,
        name: item.name,
        effSlug: effectiveSlug,
      });
    }

    if (Object.keys(update).length) {
      updates.push({ _id: item._id, uuid: item.uuid, ...update });
    }
  }

  // A canonical ability is "covered" if an ability carries its slug (or a
  // parameterized variant). The review is meaningful ONLY when at least one
  // canonical ability is missing — that is the signal that a core ability was
  // renamed (its slug drifted off-canon), which silently breaks routing. When
  // every canonical ability is present, extra non-canonical abilities are just
  // homebrew and must NOT raise an alert.
  const covered = new Set(
    abilityInfos.map((a) => canonicalAbilityBase(a.effSlug)).filter(Boolean)
  );
  const anyCanonicalMissing = [...ABILITY_SLUGS].some((s) => !covered.has(s));
  const review = anyCanonicalMissing
    ? abilityInfos
        .filter((a) => !isCanonicalAbilitySlug(a.effSlug))
        .map((a) => ({
          uuid: a.uuid,
          name: a.name,
          derivedSlug: a.effSlug,
          kind: "ability",
        }))
    : [];

  return { updates, review };
}

/**
 * World wrapper: backfill blank slugs on every item (world + embedded in actors)
 * and persist the review list to the `slugReview` world setting. GM-gated and
 * version-gated by the caller (migration.js). Only fills blanks (idempotent). The
 * whole item set is derived in ONE pass so the review can reason world-wide.
 */
export async function migrateWorldSlugs() {
  const actors = Array.from(game.actors?.values() ?? []);
  const worldItems = Array.from(game.items?.values() ?? []);
  const embedded = actors.flatMap((a) => Array.from(a.items?.values() ?? []));
  const docs = [...worldItems, ...embedded];
  const byUuid = new Map(docs.map((d) => [d.uuid, d]));

  const { updates, review } = deriveWorldSlugs(
    docs.map((d) => ({
      _id: d.id,
      uuid: d.uuid,
      name: d.name,
      type: d.type,
      system: d.system,
    }))
  );

  for (const u of updates) {
    const doc = byUuid.get(u.uuid);
    if (!doc) continue;
    const data = { ...u };
    delete data._id;
    delete data.uuid;
    await doc.update(data);
  }

  await game.settings.set(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.SLUG_REVIEW,
    review
  );
}

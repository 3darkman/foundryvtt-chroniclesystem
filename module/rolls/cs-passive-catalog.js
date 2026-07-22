/**
 * Passive values — the RUNTIME half (spec 023 US2, contract passive-options.md).
 *
 * Mirrors the `cs-conflict.js` (pure) / `cs-targeting.js` (runtime) idiom: the
 * grouping/formatting rules live in the dependency-free `cs-passive.js`; this
 * module does the Foundry reads — the world ability catalogue and the target's
 * own sheet — and hands a flat entry list to the pure builder.
 *
 * `ChronicleSystem.getActorPassiveValue` is dereferenced at CALL time only
 * (never at module-eval time), and `handleRollAsync` reaches this module through
 * `await import(…)` — the same pattern it uses for `cs-targeting.js` — so no
 * eval-time import cycle is created (D4).
 */

import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { slugify } from "../effects/cs-slugify.js";
import {
  CANONICAL_ABILITIES,
  scopedSpecialtySlug,
} from "../vocabulary/cs-canonical-abilities.js";
import { combatDefenseSizeModifier } from "../combat/cs-conflict.js";
import { buildPassiveGroups } from "./cs-passive.js";

/** Module-level memo of the world catalogue (C2.6). */
let catalogCache = null;

/**
 * Drop the memoized world catalogue. Wired to the ability-item CRUD hooks, so a
 * GM adding, renaming or deleting an ability is reflected on the next dialog
 * open without a reload (FR-014f).
 */
export function invalidatePassiveCatalog() {
  catalogCache = null;
}

/** The specialties of a world ability item, deduped by scoped slug (C2.3). */
function worldSpecialties(abilitySlug, system) {
  const seen = new Set();
  const specialties = [];
  for (const specialty of Object.values(system?.specialties ?? {})) {
    const slug =
      specialty?.slug || scopedSpecialtySlug(abilitySlug, specialty?.name);
    if (!slug || slug === abilitySlug || seen.has(slug)) continue;
    seen.add(slug);
    specialties.push({ slug, name: specialty?.name ?? slug, nameKey: null });
  }
  return specialties;
}

/**
 * The abilities a difficulty picker may offer: every ability in the world Item
 * directory **∪** the frozen canonical vocabulary, deduped by slug with the
 * WORLD entry winning (so a GM's renamed ability keeps its own name and its own
 * specialties — C2.2). The system ships no ability compendium, so the canonical
 * vocabulary IS "the system's own catalogue" (D5).
 *
 * Fully synchronous and compendium-free (C2.5), memoized (C2.6), and safe
 * outside Foundry — with no `game`, it yields the canonical entries alone
 * (C2.7), which is what makes it importable from Vitest.
 * @returns {Array<{slug: string, name: string, nameKey: string|null,
 *   specialties: Array<{slug: string, name: string, nameKey: string|null}>}>}
 */
export function worldAbilityCatalog() {
  if (catalogCache) return catalogCache;

  const bySlug = new Map();
  for (const item of game?.items ?? []) {
    if (item?.type !== "ability") continue;
    const slug = item.system?.slug || slugify(item.name);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, {
      slug,
      name: item.name ?? slug,
      nameKey: null,
      specialties: worldSpecialties(slug, item.system),
    });
  }
  for (const ability of CANONICAL_ABILITIES) {
    if (bySlug.has(ability.slug)) continue;
    bySlug.set(ability.slug, {
      slug: ability.slug,
      name: ability.name,
      nameKey: ability.nameKey,
      specialties: ability.specialties.map((specialty) => ({
        slug: specialty.slug,
        name: specialty.name,
        nameKey: specialty.nameKey,
      })),
    });
  }

  catalogCache = [...bySlug.values()];
  return catalogCache;
}

/** Localize a key, falling back to the raw display name (canonical entries carry
 *  a `nameKey`; a world item carries only its own name). */
function displayName(entry) {
  if (!entry.nameKey) return entry.name;
  const localized = game?.i18n?.localize?.(entry.nameKey);
  return localized && localized !== entry.nameKey ? localized : entry.name;
}

/** A finite derived-stat total read from the ACTOR — never from the target
 *  context, which coerces a missing defense to 0 (`cs-targeting.js:52-53`) and
 *  would leak a bogus "Intrigue Defense · 0" for a `unit` target (D13). */
function finiteDerivedStat(targetActor, field) {
  const total = Number(targetActor?.system?.derivedStats?.[field]?.total);
  return Number.isFinite(total) ? total : null;
}

/**
 * Assemble every difficulty the roll may be resolved against, grouped for the
 * dialog's single selector (contract C3).
 *
 * Never throws and never reads the canvas: the target context is resolved by
 * the caller and passed in — calling `getUserTarget` here would re-fire the
 * "multiple targets" warning the player already saw (D8).
 *
 * @param {object} targetActor the resolved target's actor
 * @param {object} targetContext the `getUserTarget` result, optionally carrying
 *   `resolvedCombatDifficulty` (the conflict derivation's already-computed
 *   Combat Defense difficulty — reused, never recomputed, D9/SSOT)
 * @param {{showValues?: boolean, difficultyEntries?: Array<{index: number,
 *   label: string, value: number}>|null}} [options] `difficultyEntries` is
 *   supplied ONLY on a non-conflict roll, where it becomes the leading
 *   "Difficulties" group (D16)
 * @returns {Array<{label: string, options: Array<object>}>} `[]` when nothing
 *   could be assembled — the caller then offers NO picker (C3.2)
 */
export function targetPassiveOptions(
  targetActor,
  targetContext,
  { showValues = true, difficultyEntries = null } = {}
) {
  if (!targetActor) return [];

  const localize = (key) => game?.i18n?.localize?.(key) ?? key;
  const passiveOf = (abilityName, specialtyName = null) =>
    Number(
      ChronicleSystem.getActorPassiveValue?.(
        targetActor,
        abilityName,
        specialtyName
      )
    ) || 0;

  const entries = [];

  // 0 · Difficulty levels — public information, so they are never masked and
  // their values come from the table, not from any derivation (D16).
  if (Array.isArray(difficultyEntries)) {
    const groupLabel = localize(
      "CS.dialogs.rollModifier.passiveGroupDifficulties"
    );
    for (const entry of difficultyEntries) {
      entries.push({
        kind: "difficulty",
        key: `tbl:${entry.index}`,
        shortLabel: entry.label,
        groupLabel,
        value: entry.value,
        fromTarget: false,
        maskable: false,
      });
    }
  }

  // 1 · The target's defenses — offered only when the actor GENUINELY has them.
  const defenseGroup = localize("CS.dialogs.rollModifier.passiveGroupDefenses");
  const combatDefense = finiteDerivedStat(targetActor, "combatDefense");
  if (combatDefense !== null) {
    const resolved = Number(targetContext?.resolvedCombatDifficulty);
    entries.push({
      kind: "defense",
      key: "def:combat",
      shortLabel: localize("CS.effects.derivedStats.combat_defense"),
      groupLabel: defenseGroup,
      value: Number.isFinite(resolved)
        ? resolved
        : combatDefense +
          combatDefenseSizeModifier(
            targetContext?.size ?? targetActor.system?.size ?? "medium"
          ),
      fromTarget: true,
      maskable: true,
    });
  }
  const intrigueDefense = finiteDerivedStat(targetActor, "intrigueDefense");
  if (intrigueDefense !== null) {
    entries.push({
      kind: "defense",
      key: "def:intrigue",
      shortLabel: localize("CS.effects.derivedStats.intrigue_defense"),
      groupLabel: defenseGroup,
      value: intrigueDefense,
      fromTarget: true,
      maskable: true,
    });
  }

  // 2 · The target's OWN abilities — keyed by item id, so two abilities sharing
  // a name survive as distinct groups (D6). Their slugs seed the dedupe.
  const overall = localize("CS.dialogs.rollModifier.passiveOverall");
  const ownGroupBySlug = new Map(); // abilitySlug → {groupId, name, specSlugs}
  for (const item of targetActor.items ?? []) {
    if (item?.type !== "ability") continue;
    const abilitySlug = item.system?.slug || slugify(item.name);
    const groupId = `own:${item.id ?? item._id}`;
    const groupLabel = item.name;
    entries.push({
      kind: "ability",
      key: groupId,
      shortLabel: overall,
      groupLabel,
      value: passiveOf(item.name),
      fromTarget: true,
      maskable: true,
    });
    const specSlugs = new Set();
    for (const specialty of Object.values(item.system?.specialties ?? {})) {
      if (!specialty?.rating) continue;
      const slug =
        specialty.slug || scopedSpecialtySlug(abilitySlug, specialty.name);
      if (!slug || specSlugs.has(slug)) continue;
      specSlugs.add(slug);
      entries.push({
        kind: "specialty",
        key: `${groupId}:${slug}`,
        shortLabel: specialty.name,
        groupLabel,
        value: passiveOf(item.name, specialty.name),
        fromTarget: true,
        maskable: true,
      });
    }
    // First item wins the slug — a duplicate ability still gets its own group,
    // but the catalogue extends only the first (they carry the same specialties).
    if (!ownGroupBySlug.has(abilitySlug))
      ownGroupBySlug.set(abilitySlug, { groupId, name: item.name, specSlugs });
  }

  // 3 · Catalogue extension — a CHARACTER can attempt any ability, trained or
  // not (an unowned one resolves through the untrained baseline → 8, FR-014d).
  // Non-character targets offer only what they genuinely have (D13).
  if (targetActor.type === "character") {
    for (const ability of worldAbilityCatalog()) {
      const owned = ownGroupBySlug.get(ability.slug);
      const abilityName = displayName(ability);
      const groupId = owned?.groupId ?? `cat:${ability.slug}`;
      const groupLabel = owned?.name ?? abilityName;
      if (!owned) {
        entries.push({
          kind: "ability",
          key: groupId,
          shortLabel: overall,
          groupLabel,
          value: passiveOf(ability.name),
          fromTarget: false,
          maskable: true,
        });
      }
      for (const specialty of ability.specialties) {
        if (owned?.specSlugs.has(specialty.slug)) continue;
        entries.push({
          kind: "specialty",
          // The catalogue keeps its own `cat:*` key even when it extends an
          // OWNED ability's group — `groupId` files it in the right group
          // without colliding with the target's own keys (FR-014a).
          key: `cat:${ability.slug}:${specialty.slug}`,
          groupId,
          shortLabel: displayName(specialty),
          groupLabel,
          value: passiveOf(ability.name, specialty.name),
          fromTarget: false,
          maskable: true,
        });
      }
    }
  }

  return buildPassiveGroups(entries, { showValues });
}

// Collector + pure aggregation (docs/ae-effect-model-design.md).
//
// The collector is the SINGLE writer of the transient `actor.modifiers` /
// `actor.penalties` buffer (no imperative addModifier anywhere). It recomputes
// the buffer from scratch on every prepareData, aggregating declarative sources
// and pushing into the exact shape `getModifier`/`getPenalty` already read:
//
//   1. Authored ActiveEffect documents (permanent, non-optional) — read via
//      `actor.appliedEffects` (NEVER `actor.effects`; v14 dropped
//      `legacyTransferral`), keyed by the structured `cs.<channel>.*` vocabulary.
//      All five roll channels (result, penalty, test-dice, bonus-dice, reroll)
//      are routed to formula buffers; the actor-level non-roll channels
//      (derived stat, weapon damage, weapon quality) are routed to their own
//      buffers (Wave 4) and applied in prepareDerivedData. The `armorrating`
//      channel is self-targeted (resolved per-armour from its OWN effects, not
//      from appliedEffects). `bulk` authored-AE and the optional (dialog-toggled)
//      effects come online separately.
//   2. Owned equipment (armour penalty/bulk/damage-taken, weapon bulk) — read
//      live from item data + equipped state.
//   3. Dynamic conditions (fatigue, injuries, wounds, frustration, stress) —
//      read live from the actor counters.

import {
  parseEffectKey,
  EFFECT_CHANNELS,
  TARGET_KINDS,
  ROLL_CHANNEL_TO_FORMULA_FIELD,
  slugify,
  weaponTypeSlug,
  qualityBySlug,
  QUALITY_LEVER_MAP,
  APPLY_CONDITION_LEVER,
  effectiveWeaponQualityRefs,
} from "./cs-effect-vocabulary.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";
import { effectiveEquipment } from "../vocabulary/cs-warfare.js";
import { resolveEffectValue } from "./cs-effect-value.js";
import {
  readChanges,
  ACTIVE_EFFECT_MODES,
  readChangeMode,
} from "./cs-effect-compat.js";
import { ChronicleSystem } from "../system/ChronicleSystem.js";

/**
 * Pure aggregation of a list of modifiers onto a base value.
 * Order: OVERRIDE wins; otherwise `(base + Σadd) * Πmultiply`, floored.
 * Mirrors `street-fighter/module/helpers/effect-helpers.mjs`.
 * @param {number} baseValue
 * @param {Array<{value: number|string, mode: number|string}>} modifiers
 * @returns {number}
 */
export function applyModifiers(baseValue, modifiers = []) {
  let add = 0;
  let multiply = 1;
  let override = null;

  for (const entry of modifiers) {
    if (!entry) continue;
    const value = Number(entry.value) || 0;
    switch (readChangeMode(entry)) {
      case ACTIVE_EFFECT_MODES.ADD:
        add += value;
        break;
      case ACTIVE_EFFECT_MODES.MULTIPLY:
        multiply *= value;
        break;
      case ACTIVE_EFFECT_MODES.OVERRIDE:
        override = value;
        break;
      case ACTIVE_EFFECT_MODES.UPGRADE:
        override = override === null ? value : Math.max(override, value);
        break;
      case ACTIVE_EFFECT_MODES.DOWNGRADE:
        override = override === null ? value : Math.min(override, value);
        break;
      default:
        break;
    }
  }

  if (override !== null) return Math.floor(override);
  const base = Number(baseValue) || 0;
  return Math.floor((base + add) * multiply);
}

/** Push one buffer entry, skipping null contributions (value 0). */
function pushEntry(buffer, type, id, value, isDocument) {
  const mod = Number(value) || 0;
  if (!mod) return;
  if (!buffer[type]) buffer[type] = [];
  buffer[type].push({ _id: id, mod, isDocument });
}

const itemData = (item) => item?.system ?? item?.getCSData?.() ?? {};

/**
 * Resolve an ability by stable slug to `{ name, rating }`. Single resolver
 * (constitution §II) — abilities are embedded items today.
 * @returns {{name: string, rating: number}|null}
 */
function resolveAbility(actor, slug) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    const data = itemData(item);
    if ((data.slug || slugify(item.name)) === slug) {
      return { name: item.name, rating: Number(data.rating) || 0 };
    }
  }
  return null;
}

/**
 * Resolve a specialty by stable slug to `{ name, rating }`. **Single resolver**
 * (spec 024, C6): a specialty IS an item now, and the actor already owns the one
 * lookup that finds it — this delegates instead of duplicating the scan. The
 * call is optional-chained so the pure-logic doubles that omit the resolver keep
 * working, exactly as `resolveTraitBase` already does.
 * @returns {{name: string, rating: number}|null}
 */
function resolveSpecialty(actor, slug) {
  const [, specialty] = actor?.getAbilityBySpecialtySlug?.(slug) ?? [];
  if (!specialty) return null;
  return { name: specialty.name, rating: Number(specialty.rating) || 0 };
}

/** Build the value accessors (fixed/derived resolution) from a live actor. */
function actorValueAccessors(actor) {
  return {
    rankOf: (slug) =>
      resolveAbility(actor, slug)?.rating ??
      resolveSpecialty(actor, slug)?.rating ??
      0,
    bonusDiceOf: (slug) => resolveSpecialty(actor, slug)?.rating ?? 0,
    // `sacrificed` is a runtime (roll-dialog) value — absent during preparation.
  };
}

/** Optional/conditional effects are surfaced in the roll dialog, not buffered. */
function isOptionalEffect(effect) {
  return typeof effect.getFlag === "function"
    ? !!effect.getFlag("chroniclesystem", "optional")
    : !!effect.flags?.chroniclesystem?.optional;
}

/** Situational condition tag of an optional effect (label/hint); "" if none. */
function optionalCondition(effect) {
  const fromGetter =
    typeof effect.getFlag === "function"
      ? effect.getFlag("chroniclesystem", "condition")
      : undefined;
  return fromGetter ?? effect.flags?.chroniclesystem?.condition ?? "";
}

/**
 * Buffer key for a roll-channel target: the STABLE SLUG (spec 008). The read-side
 * (`getActorTestFormula`) now keys by the same slug, so the effect and the roll
 * align under ANY display language. `parsed.target` is already the slug for
 * ability (canonical) and specialty (scoped).
 * @returns {string|null}
 */
function rollBufferKey(parsed) {
  if (parsed.targetKind === TARGET_KINDS.ALL) {
    return ChronicleSystem.modifiersConstants.ALL;
  }
  if (
    parsed.targetKind === TARGET_KINDS.ABILITY ||
    parsed.targetKind === TARGET_KINDS.SPECIALTY
  ) {
    return parsed.target;
  }
  return null;
}

/**
 * Resolve the slug of a rolled ability from a name-or-slug reference (roll
 * buttons pass the display name; initiative/renamed content passes a slug).
 * Matches by persisted slug, by slugified name, or by display name, falling back
 * to `slugify(ref)`. @returns {string|null}
 */
function abilitySlugForRef(actor, ref) {
  if (ref == null) return null;
  const refStr = String(ref);
  const refLower = refStr.toLowerCase();
  const refSlug = slugify(refStr);
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    const slug = itemData(item).slug || slugify(item.name);
    if (
      slug === refStr ||
      slug === refSlug ||
      item.name?.toLowerCase() === refLower
    )
      return slug;
  }
  return refSlug;
}

/**
 * Resolve the SCOPED slug of a rolled specialty from a name-or-slug reference.
 * @returns {string|null}
 */
function specialtySlugForRef(actor, abilitySlug, ref) {
  if (ref == null) return null;
  const refStr = String(ref);
  const refLower = refStr.toLowerCase();
  for (const item of actor?.items ?? []) {
    if (item.type !== "specialty") continue;
    const data = itemData(item);
    const spSlug =
      data.slug || scopedSpecialtySlug(data.abilitySlug ?? "", item.name);
    if (spSlug === refStr) return spSlug;
    // The NAME match must also respect the caller's ability scope when one is
    // known (spec 024 regression): specialty names are NOT globally unique
    // ("Charm" is both Animal Handling's and Persuasion's), and post-024 a
    // fully-provisioned character owns every specialty of every ability they
    // have — so an unscoped name match would resolve to whichever of the two
    // items happens to come first in `actor.items`, not the one the roll or
    // effect actually targets. The scoped-SLUG match above is already
    // unambiguous and needs no such guard; only the free-text name fallback does.
    if (
      item.name?.toLowerCase() === refLower &&
      (!abilitySlug || (data.abilitySlug ?? "") === abilitySlug)
    ) {
      return spSlug;
    }
  }
  // MANDATORY fallback (FR-024): a specialty the actor does NOT own still keys
  // by its scoped slug, so an effect can target it (a weapon declaring
  // "Fighting:Axes" on a character with no Axes ranks).
  return abilitySlug
    ? scopedSpecialtySlug(abilitySlug, refStr)
    : slugify(refStr);
}

/** Maps each roll channel to the buffer name it feeds. */
const ROLL_CHANNEL_TO_BUFFER = {
  [EFFECT_CHANNELS.RESULT]: "modifiers", // ±N on the result → formula.modifier
  [EFFECT_CHANNELS.PENALTY]: "penalties", // −#D → formula.dicePenalty
  [EFFECT_CHANNELS.TEST_DICE]: "testDice", // +#D → formula.pool
  [EFFECT_CHANNELS.BONUS_DICE]: "bonusDice", // +#B → formula.bonusDice
  [EFFECT_CHANNELS.REROLL]: "reRolls", // reroll Ns → formula.reRoll
  [EFFECT_CHANNELS.PASSIVE]: "passives", // spec 023: ±N on the passive value ONLY (no formula field)
};

/** Buffer key a weapon-targeting change feeds: the ALL bucket or the type slug. */
function weaponTargetKey(parsed) {
  return parsed.targetKind === TARGET_KINDS.WEAPON_ALL
    ? ChronicleSystem.modifiersConstants.ALL
    : parsed.target;
}

/**
 * Parse a `quality` change value (a NAME string, NOT a number — it bypasses
 * `resolveEffectValue`) into the `{name, parameter}` shape the qualities array
 * uses. A trailing integer becomes the parameter ("Piercing 1" → {Piercing, 1});
 * otherwise the whole string is the name ("Shattering" → {Shattering, ""}).
 * @param {string} rawValue
 * @returns {{name: string, parameter: string}|null}
 */
function parseQualityGrant(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(.*?)\s+(\d+)$/);
  return match
    ? { name: match[1].trim(), parameter: match[2] }
    : { name: text, parameter: "" };
}

/** Push a granted quality into the weapon-quality buffer. */
function pushQuality(buffer, key, id, grant) {
  if (!key || !grant) return;
  if (!buffer[key]) buffer[key] = [];
  buffer[key].push({ _id: id, name: grant.name, parameter: grant.parameter });
}

/**
 * Route a NON-roll authored change into its dedicated buffer. The derived-stat
 * and weapon-damage channels resolve a numeric value; the quality channel grants
 * a NAME (so it must NOT pass through the numeric resolver); `bulk` feeds the
 * shared BULK modifier buffer (movement). The self-targeted `armorrating` channel
 * is resolved per-armour in {@link applyOwnedItemEffects}, not here.
 * @param {object} parsed
 * @param {object} change
 * @param {string} effectId
 * @param {object} accessors
 * @param {object} buffers
 */
function routeNonRollChange(parsed, change, effectId, accessors, buffers) {
  // Disposition delta (US4): rides the `result` channel but feeds its OWN buffer,
  // summed into the technique modifiers on the sheet (never touching the selected
  // disposition level). `both` adds to persuasion AND deception.
  if (parsed.targetKind === TARGET_KINDS.DISPOSITION) {
    const value = resolveEffectValue(change.value, accessors);
    if (!value) return;
    if (parsed.target === "persuasion" || parsed.target === "both") {
      buffers.dispositionDelta.persuasion += value;
    }
    if (parsed.target === "deception" || parsed.target === "both") {
      buffers.dispositionDelta.deception += value;
    }
    return;
  }
  switch (parsed.channel) {
    case EFFECT_CHANNELS.INFLUENCE: {
      // Per-technique influence (US4): `cs.influence.<slug>` → that technique;
      // `cs.influence` (target null) → the ALL bucket added to every technique.
      const value = resolveEffectValue(change.value, accessors);
      if (!value) break;
      const key = parsed.target ?? ChronicleSystem.modifiersConstants.ALL;
      buffers.influence[key] = (buffers.influence[key] || 0) + value;
      break;
    }
    case EFFECT_CHANNELS.DERIVED_STAT: {
      const value = resolveEffectValue(change.value, accessors);
      pushEntry(buffers.derivedStats, parsed.target, effectId, value, false);
      break;
    }
    case EFFECT_CHANNELS.DAMAGE: {
      const value = resolveEffectValue(change.value, accessors);
      pushEntry(
        buffers.weaponDamage,
        weaponTargetKey(parsed),
        effectId,
        value,
        false
      );
      break;
    }
    case EFFECT_CHANNELS.QUALITY: {
      const grant = parseQualityGrant(change.value);
      pushQuality(
        buffers.weaponQuality,
        weaponTargetKey(parsed),
        effectId,
        grant
      );
      break;
    }
    case EFFECT_CHANNELS.BULK: {
      // Authored bulk feeds the same BULK modifier buffer the armour/weapon bulk
      // uses, which calculateMovementData reads via getModifier(BULK). Always-on
      // (the "while wearing armour" condition of Armor Mastery is not modelled).
      const value = resolveEffectValue(change.value, accessors);
      pushEntry(
        buffers.modifiers,
        ChronicleSystem.modifiersConstants.BULK,
        effectId,
        value,
        false
      );
      break;
    }
    default:
      break; // armorrating is self-targeted (resolved per-armour in applyOwnedItemEffects)
  }
}

/**
 * Source 1 — authored ActiveEffect documents (permanent, non-optional). Roll
 * channels feed the formula buffers; the non-roll channels (Wave 4) feed their
 * own buffers via {@link routeNonRollChange}. Optional effects are surfaced in
 * the roll dialog, not buffered.
 * @param {object} actor
 * @param {object} buffers
 */
function collectAuthoredEffects(actor, buffers) {
  const accessors = actorValueAccessors(actor);
  for (const effect of actor?.appliedEffects ?? []) {
    if (!effect || effect.disabled || effect.isSuppressed) continue;
    if (isOptionalEffect(effect)) continue; // dialog-toggled (Wave 3)

    for (const change of readChanges(effect)) {
      const parsed = parseEffectKey(change.key);
      if (!parsed) continue;

      // Disposition rides the `result` channel but is NOT a plain roll modifier —
      // let routeNonRollChange divert it to the dispositionDelta buffer.
      const bufferName =
        parsed.targetKind === TARGET_KINDS.DISPOSITION
          ? null
          : ROLL_CHANNEL_TO_BUFFER[parsed.channel];
      if (bufferName) {
        const value = resolveEffectValue(change.value, accessors);
        if (!value) continue;
        const bufferKey = rollBufferKey(parsed);
        if (!bufferKey) continue;
        pushEntry(buffers[bufferName], bufferKey, effect.id, value, false);
        continue;
      }

      routeNonRollChange(parsed, change, effect.id, accessors, buffers);
    }
  }
}

/**
 * Armour contribution: penalty→agility/combat-defence + rating→damage-taken while
 * WORN; bulk while OWNED. Parity with legacy onObtained/onEquippedChanged.
 */
function collectArmorModifiers(item, modifiers) {
  const M = ChronicleSystem.modifiersConstants;
  const sys = itemData(item);
  if ((Number(sys.equipped) || 0) > 0) {
    pushEntry(modifiers, M.AGILITY, item._id, sys.penalty, true);
    pushEntry(modifiers, M.COMBAT_DEFENSE, item._id, sys.penalty, true);
    pushEntry(modifiers, M.DAMAGE_TAKEN, item._id, sys.rating, true);
  }
  if ((Number(sys.bulk) || 0) > 0) {
    pushEntry(modifiers, M.BULK, item._id, sys.bulk, true);
  }
}

/**
 * spec 025 (contract unit-derivation.md C3) — a Unit's equipment contribution:
 * the EFFECTIVE PRIMARY Unit Type's armour pushes its penalty into the
 * combat-defence bucket and its bulk into the bulk bucket, exactly as an armour
 * item does (same shape, same `isDocument` flag, so itemized tooltips name the
 * Unit Type). AGILITY is deliberately NOT pushed — no warfare rule reduces a
 * unit's Agility from its equipment.
 *
 * WHICH armour is read — the starting set or the type's Upgrades — is decided by
 * the shared `effectiveEquipment`, the same call the sheet renders from, so an
 * evolved armour changes the Defence and the Movement it displays (handoff §2).
 * @param {object} actor a `unit` actor
 * @param {object} modifiers
 */
function collectUnitTypeModifiers(actor, modifiers) {
  const primaryType = actor?.effectivePrimaryType?.();
  if (!primaryType) return;
  const armor = effectiveEquipment(
    itemData(primaryType),
    itemData(actor).evolvedEquipment
  ).armor;
  if (!armor) return;
  const M = ChronicleSystem.modifiersConstants;
  pushEntry(modifiers, M.COMBAT_DEFENSE, primaryType._id, armor.penalty, true);
  pushEntry(modifiers, M.BULK, primaryType._id, armor.bulk, true);
}

/**
 * Source 2 — owned equipment, read live from item data. Dispatches to the
 * per-type collectors (keeping nesting ≤ 3, constitution §I). Weapon Bulk is NOT
 * handled here anymore: it is a data-driven quality rule (`lever:"bulk"`) routed by
 * {@link collectReferencedQualities} (equipped-gated, resolves the definition) — a
 * GM's custom bulk-like quality works the same, and there is no hardcoded slug.
 * @param {object} actor
 * @param {object} modifiers
 */
function collectItemModifiers(actor, modifiers) {
  for (const item of actor?.items ?? []) {
    if (item.type === "armor") collectArmorModifiers(item, modifiers);
  }
  if (actor?.type === "unit") collectUnitTypeModifiers(actor, modifiers);
}

/* ------------------- referenced qualities (spec 020) --------------------- */

/**
 * Resolve a Quality rule's value against its per-instance parameter (contract C6).
 * A fixed number (`+1`, `-2`, `3`), or the `@param` / `-@param` bind (→ ±the
 * reference's parameter). Blank / unparseable → 0 (never `NaN`; FR-005 edge case).
 * @param {string} rawValue the rule's authored `value`
 * @param {string} parameter the weapon/armour reference's per-instance parameter
 * @returns {number}
 */
export function resolveRuleValue(rawValue, parameter) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return 0;
  const p = Number(parameter);
  const param = Number.isFinite(p) ? p : 0;
  if (raw === "@param") return param;
  if (raw === "-@param") return -param;
  const fixed = Number(raw);
  return Number.isFinite(fixed) ? fixed : 0;
}

/**
 * The effective quality set of a weapon/armour: the UNION of its `{slug}`
 * references and the slugs arriving via the `cs.quality` grant channel, keyed by
 * slug so a quality present through BOTH applies exactly once (FR-028, SC-006,
 * contract C7). References win (keep their per-instance parameter); a grant-only
 * slug is added carrying its own slug. Pure → Vitest.
 * @param {Array<{slug: string, parameter?: string}>} references
 * @param {Array<{name?: string, slug?: string, parameter?: string}>} grants
 * @returns {Array<{slug: string, parameter?: string}>}
 */
export function dedupeQualitiesBySlug(references = [], grants = []) {
  const seen = new Set();
  const result = [];
  for (const ref of references) {
    const slug = ref?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(ref);
  }
  for (const grant of grants) {
    const slug = grant?.slug ?? slugify(grant?.name ?? "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push({ ...grant, slug });
  }
  return result;
}

// spec 021 (D4) — `effectiveWeaponQualityRefs` (conferral resolver) lives in
// cs-effect-vocabulary.js (co-located with qualityBySlug/weaponWieldingFlags to
// avoid an eval-time import cycle) and is imported above; RE-EXPORTED here so the
// roll-time pass and the collectors resolve it from this module (contract location).
export { effectiveWeaponQualityRefs };

/**
 * Is a weapon's Defensive contribution suppressed for this actor right now
 * (spec 020, Decision 8 / FR-030)? True while an active marker AE carries
 * `flags.chroniclesystem.defensiveSpent === weaponId` (per-turn, created on attack
 * — US4), OR while the weapon's manual out-of-combat stance flag is explicitly off.
 * No marker + no stance-off → Defensive is on (default). Read-only.
 * @param {object} actor
 * @param {object} weapon the wielded weapon Item
 * @returns {boolean}
 */
function isDefensiveSuppressed(actor, weapon) {
  const weaponId = weapon?._id ?? weapon?.id;
  // The marker lives on the ACTOR (`actor.effects`); a changes-less marker may not
  // reach `appliedEffects`, so read the embedded collection directly.
  for (const effect of actor?.effects ?? actor?.appliedEffects ?? []) {
    // Skip disabled AND expired-but-not-deleted markers (expiryAction "update" only
    // flips `duration.expired`, never disables/deletes — foundry-api-expert).
    if (!effect || effect.disabled || effect.duration?.expired) continue;
    const spent =
      typeof effect.getFlag === "function"
        ? effect.getFlag("chroniclesystem", "defensiveSpent")
        : effect.flags?.chroniclesystem?.defensiveSpent;
    if (spent !== weaponId) continue;
    // Active while its combat duration has not expired (remaining null = no live
    // duration tracking → treat as active). RT-1: validate the exact expiry turn.
    const remaining = effect.duration?.remaining;
    if (remaining == null || remaining > 0) return true;
  }
  // Out-of-combat manual stance: a weapon flag of exactly `false` drops the bonus
  // (FR-030). Undefined (never toggled) keeps Defensive on.
  const stance =
    typeof weapon?.getFlag === "function"
      ? weapon.getFlag("chroniclesystem", "defensiveStance")
      : weapon?.flags?.chroniclesystem?.defensiveStance;
  if (stance === false && !actor?.inCombat) return true;
  return false;
}

/** Route one resolved (passive/auto, non-attack) quality rule into its buffer. The
 *  attack-scoped levers (damage/armorbypass/range) are NOT routed here — they are
 *  applied per-weapon at roll time in `_deriveTargetConflict` (FR-016 parity). */
function routeReferencedRule(lever, value, item, buffers, actor) {
  const M = ChronicleSystem.modifiersConstants;
  switch (lever.channel) {
    case EFFECT_CHANNELS.DERIVED_STAT:
      // Defensive → Combat Defense while wielded (honours per-turn suppression).
      if (
        lever.id === "defensewhilewielded" &&
        isDefensiveSuppressed(actor, item)
      )
        return;
      pushEntry(buffers.derivedStats, lever.target, item._id, value, true);
      break;
    case EFFECT_CHANNELS.BULK:
      pushEntry(buffers.modifiers, M.BULK, item._id, value, true);
      break;
    case EFFECT_CHANNELS.ARMOR_PENALTY:
      // Mirrors the armour's own penalty: agility + combat-defence reduction.
      pushEntry(buffers.modifiers, M.AGILITY, item._id, value, true);
      pushEntry(buffers.modifiers, M.COMBAT_DEFENSE, item._id, value, true);
      break;
    case EFFECT_CHANNELS.ARMOR_RATING:
      pushEntry(buffers.modifiers, M.DAMAGE_TAKEN, item._id, value, true);
      break;
    case EFFECT_CHANNELS.TEST_DICE:
      pushEntry(buffers.testDice, M.ALL, item._id, value, true);
      break;
    case EFFECT_CHANNELS.PENALTY:
      pushEntry(buffers.penalties, M.ALL, item._id, value, true);
      break;
    default:
      break; // unhandled channel → inert (attack-scoped levers already filtered)
  }
}

/**
 * Route the referenced qualities of one EQUIPPED weapon/armour into the buffers
 * (contract C6, US3). Resolves each `{slug}` reference to its live Quality
 * definition (null → skip, label-only elsewhere, FR-012), then each passive/auto
 * non-attack rule → its buffer. Attack-scoped levers and `optional` rules are
 * skipped here (roll-time / dialog). Runs only over equipped items, so unequipping
 * removes 100% of the contribution (SC-003).
 * @param {object} actor
 * @param {object} item an equipped weapon or armour
 * @param {object} buffers
 */
function collectReferencedQualities(actor, item, buffers) {
  const refs = effectiveWeaponQualityRefs(item); // includes conferred slugs (D4)
  if (!Array.isArray(refs)) return;
  for (const ref of refs) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue; // unresolved slug → label-only, applies no rule
    for (const rule of def.system?.rules ?? []) {
      const lever = QUALITY_LEVER_MAP[rule?.lever];
      if (!lever) continue; // blank/unknown lever → inert (FR-005)
      if (lever.attackScoped) continue; // applied at roll time (_deriveTargetConflict)
      if (rule.scope === "optional") continue; // offered in the modifier dialog (US4)
      const value = resolveRuleValue(rule.value, ref.parameter);
      routeReferencedRule(lever, value, item, buffers, actor);
    }
  }
}

/**
 * Sum the ATTACK-SCOPED value of a lever across a weapon's referenced qualities,
 * resolved at ROLL TIME (spec 020, T027/T028 — `armorbypass`, `damage`, `range`).
 * Bound to the specific weapon instance (`rollContext.itemId`), so it contributes
 * to that weapon's roll only and is NEVER summed onto passive stats or the chip
 * (FR-016 parity, spec 017). @returns {number}
 */
export function weaponAttackScopedTotal(item, leverId, { scope } = {}) {
  let total = 0;
  for (const ref of effectiveWeaponQualityRefs(item)) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue;
    for (const rule of def.system?.rules ?? []) {
      if (rule?.lever !== leverId) continue;
      // spec 021 (D9/D11) — optional scope filter so the roll-time pass sums `auto`
      // only and leaves `optional` (Off-hand/Powerful) for the dialog (no double count).
      if (scope && rule.scope !== scope) continue;
      total += resolveRuleValue(rule.value, ref.parameter);
    }
  }
  return total;
}

/**
 * The total armour bypass this weapon's Piercing/Penetration/Penetrating grants
 * against a target at `dist` scene units (spec 021, D1/FR-001). Per quality: a
 * quality with its OWN `system.range > 0` (Penetration, seeded 10) DECAYS by 1 for
 * each full increment of that range beyond 0 — `max(0, raw − floor(dist / range))`;
 * a range-0 quality (Piercing/Penetrating) stays flat; no measurable distance
 * (`dist == null`) → full value (US1.6 fallback). Summed across effective refs.
 * Replaces the flat `weaponAttackScopedTotal(weapon,"armorbypass")` — that flattened
 * Piercing + Penetration into one distance-blind number.
 * @param {object} weapon a weapon Item
 * @param {number|null} dist measured distance in scene units, or null (no canvas/token)
 * @returns {number}
 */
export function weaponArmorBypassTotal(weapon, dist) {
  let total = 0;
  for (const ref of effectiveWeaponQualityRefs(weapon)) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue;
    const range = Number(def.system?.range) || 0;
    for (const rule of def.system?.rules ?? []) {
      if (rule?.lever !== "armorbypass") continue;
      const raw = resolveRuleValue(rule.value, ref.parameter);
      total +=
        range > 0 && dist != null
          ? Math.max(0, raw - Math.floor(dist / range))
          : raw;
    }
  }
  return total;
}

/**
 * The product of every `rangemultiplier` lever value across a weapon's effective
 * qualities (spec 021, D5/FR-002) — Inaccurate contributes ×2. Default 1 (no
 * multiplier quality). Multiplies the measured distance BEFORE the range-penalty
 * computation; the card row still shows the real distance (D5).
 * @param {object} weapon a weapon Item
 * @returns {number}
 */
export function productOfRangeMultipliers(weapon) {
  let product = 1;
  for (const ref of effectiveWeaponQualityRefs(weapon)) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue;
    for (const rule of def.system?.rules ?? []) {
      if (rule?.lever !== "rangemultiplier") continue;
      const v = resolveRuleValue(rule.value, ref.parameter);
      if (v) product *= v;
    }
  }
  return product;
}

/**
 * The OPTIONAL (dialog-toggled) weapon-damage qualities of a weapon (spec 021,
 * D11/FR-006) — each `scope:"optional"` rule on the `damage` channel
 * (Powerful/Off-hand), as `{name, value, slug}`. Surfaced in the modifier dialog
 * as default-off toggles that add their value to the resolution's base damage
 * (never a dice-formula field). Distinct from the auto `damage` levers
 * (Extraordinary) applied at roll time — no double counting.
 * @param {object} weapon a weapon Item
 * @returns {Array<{name: string, value: number, slug: string}>}
 */
export function collectOptionalWeaponDamageToggles(weapon) {
  const out = [];
  for (const ref of effectiveWeaponQualityRefs(weapon)) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue;
    for (const rule of def.system?.rules ?? []) {
      if (rule?.scope !== "optional") continue;
      const lever = QUALITY_LEVER_MAP[rule?.lever];
      if (lever?.channel !== EFFECT_CHANNELS.DAMAGE) continue;
      const value = resolveRuleValue(rule.value, ref.parameter);
      if (!value) continue;
      out.push({ name: def.name || ref?.slug || "", value, slug: ref?.slug });
    }
  }
  return out;
}

/** The itemizable formula/damage field each auto lever channel feeds (spec 021,
 *  D9). `armorbypass`/`rangemultiplier` are intentionally absent — they are applied
 *  by their own dedicated functions (weaponArmorBypassTotal/productOfRangeMultipliers). */
const AUTO_LEVER_FIELD_BY_CHANNEL = {
  [EFFECT_CHANNELS.PENALTY]: "dicePenalty", // Poor/Reach −1 die
  [EFFECT_CHANNELS.TEST_DICE]: "pool", // +#D kept
  [EFFECT_CHANNELS.RESULT]: "modifier", // Superior/Extraordinary +1 result
  [EFFECT_CHANNELS.DAMAGE]: "damage", // Extraordinary +1 base damage (auto only)
};

/**
 * The generalised attack-scoped `auto` lever contributions of a weapon at roll time
 * (spec 021, D6/D9/FR-003/FR-015): each `scope:"auto"` rule whose lever routes to a
 * formula field (`penalty`→dicePenalty, `testdice`→pool, `result`→modifier) or to
 * base damage (`damage`→"damage"), that passes its optional `maxDistance` gate.
 * `armorbypass`/`rangemultiplier` are excluded (handled by their own functions).
 * The distance gate (D6): a rule with `maxDistance != null` fires ONLY when a
 * measurable distance exists AND `gridSpaces <= maxDistance` (Reach within 1 space);
 * `gridSpaces == null` (no canvas/token) → the gated rule is omitted. The caller
 * (`_deriveTargetConflict`) applies each to the formula/baseValue and itemizes it.
 * @param {object} weapon a weapon Item
 * @param {number|null} gridSpaces measured distance in grid spaces, or null
 * @returns {Array<{name: string, field: string, value: number, slug: string}>}
 */
export function collectAutoAttackLevers(weapon, gridSpaces) {
  const out = [];
  for (const ref of effectiveWeaponQualityRefs(weapon)) {
    const def = qualityBySlug(ref?.slug);
    if (!def) continue;
    for (const rule of def.system?.rules ?? []) {
      if (rule?.scope !== "auto") continue;
      const lever = QUALITY_LEVER_MAP[rule?.lever];
      if (!lever) continue; // blank/unknown lever → inert (FR-005)
      const field = AUTO_LEVER_FIELD_BY_CHANNEL[lever.channel];
      if (!field) continue; // armorbypass/rangemultiplier applied elsewhere
      if (rule.maxDistance != null) {
        if (gridSpaces == null || gridSpaces > rule.maxDistance) continue;
      }
      const value = resolveRuleValue(rule.value, ref.parameter);
      if (!value) continue;
      out.push({
        name: def.name || ref?.slug || "",
        field,
        value,
        slug: ref?.slug,
      });
    }
  }
  return out;
}

/**
 * Resolve a weapon's effective range band from its referenced qualities' `range`
 * field (spec 020 — data-driven, replaces the hardcoded close/long slugs in
 * cs-conflict). The WIDEST range wins (a longbow's 100 beats a throwing knife's 10);
 * `inc === free` (−1D per full range-increment beyond it). In the SCENE's distance
 * units, so it compares directly to the measured distance. `null` = melee (no
 * referenced quality declares a range). Needs the live definition (`qualityBySlug`).
 * @param {object} item a weapon Item
 * @returns {{free: number, inc: number} | null}
 */
export function weaponRangeBand(item) {
  let free = 0;
  for (const ref of effectiveWeaponQualityRefs(item)) {
    const def = qualityBySlug(ref?.slug);
    // spec 021 (D2) — a quality that carries an `armorbypass` rule (Penetration)
    // uses its `range` ONLY as an armour-bypass decay increment, NOT as a range
    // penalty band; skip it here so it never adds a spurious range penalty.
    if (def?.system?.rules?.some((rule) => rule?.lever === "armorbypass"))
      continue;
    const r = Number(def?.system?.range);
    if (Number.isFinite(r) && r > free) free = r;
  }
  return free > 0 ? { free, inc: free } : null;
}

/** True when any of an item's referenced qualities defines a rule on `leverId`
 *  (spec 020 — e.g. the attack flow asking "does this weapon grant Defensive?"). */
export function weaponHasQualityLever(item, leverId) {
  for (const ref of effectiveWeaponQualityRefs(item)) {
    const def = qualityBySlug(ref?.slug);
    if (def?.system?.rules?.some((rule) => rule.lever === leverId)) return true;
  }
  return false;
}

/** ALL of a weapon's referenced qualities, as `{name, parameter, description}`, for
 *  the attack RESULT card (spec 020, FR-018 — revised: the card lists EVERY quality
 *  of the rolled weapon as an adjudication note, targeted or not, so a dedicated
 *  `reminder` lever is no longer needed). Each ref resolves live (world ∪ seed
 *  catalog); an unresolved slug falls back to its stamped name/slug so nothing is
 *  silently dropped. Blank references are skipped. */
export function weaponReminders(item) {
  const out = [];
  for (const ref of effectiveWeaponQualityRefs(item)) {
    const def = qualityBySlug(ref?.slug);
    const name = def?.name || ref?.name || ref?.slug || "";
    if (!name) continue;
    const rules = def?.system?.rules ?? [];
    // spec 021 (D13/D14) — the degree/count trigger this quality highlights on
    // (first rule carrying a non-"none" trigger); US2 evaluates it against the roll.
    const triggerRule = rules.find(
      (r) => r?.trigger?.kind && r.trigger.kind !== "none"
    );
    // spec 021 (D16/D19) — the "apply condition to target" rules (US3): each with the
    // authored effect NAME it applies + its own trigger (an ungated rule fires on any
    // hit). Keyed on the `applycondition` lever (the UI redesign's single canonical
    // signal, replacing the old `scope:"target"` marker). The effect itself is
    // resolved async at apply time (world ∪ compendium).
    const targetRules = rules
      .filter((r) => r?.lever === APPLY_CONDITION_LEVER && r?.effectRef)
      .map((r) => ({
        effectRef: r.effectRef,
        trigger: r.trigger ?? { kind: "none", threshold: null },
      }));
    out.push({
      name,
      parameter: ref?.parameter ?? "",
      description: def?.system?.description ?? ref?.description ?? "",
      slug: ref?.slug ?? "",
      trigger: triggerRule?.trigger ?? { kind: "none", threshold: null },
      targetRules,
    });
  }
  return out;
}

/** Collect the referenced-quality rules of every EQUIPPED weapon/armour (US3). */
function collectReferencedQualityModifiers(actor, buffers) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "weapon" && item.type !== "armor") continue;
    if ((Number(itemData(item).equipped) || 0) > 0) {
      collectReferencedQualities(actor, item, buffers);
    }
  }
}

/**
 * Source 3 — dynamic conditions, read live from the actor counters. The
 * channel/sign map (research §D1) reproduces the legacy net result exactly.
 * @param {object} actor
 * @param {object} modifiers
 * @param {object} penalties
 */
function collectConditionModifiers(actor, modifiers, penalties) {
  const data = actor?.getCSData?.() ?? actor?.system;
  if (!data) return;
  const M = ChronicleSystem.modifiersConstants;
  const K = ChronicleSystem.keyConstants;

  const fatigue = Number(data.derivedStats?.fatigue?.current) || 0;
  if (fatigue > 0) pushEntry(modifiers, M.ALL, K.FATIGUE, -fatigue, false);

  const injuries = data.injuries ? Object.values(data.injuries).length : 0;
  if (injuries > 0) pushEntry(modifiers, M.ALL, K.INJURY, -injuries, false);

  const wounds = data.wounds ? Object.values(data.wounds).length : 0;
  if (wounds > 0) pushEntry(penalties, M.ALL, K.WOUNDS, wounds, false);

  const frustration = Number(data.derivedStats?.frustration?.current) || 0;
  if (frustration > 0) {
    pushEntry(penalties, M.DECEPTION, K.FRUSTRATION, frustration, false);
    pushEntry(penalties, M.PERSUASION, K.FRUSTRATION, frustration, false);
  }

  // NOTE: legacy `setStressValue` clamps stress to `frustration.total` (a known
  // pre-existing bug) and the counter persisted there already reflects it; we
  // read that stored value, preserving parity. Fixing the cap is a future feature.
  const stress = Number(data.currentStress) || 0;
  if (stress > 0) {
    pushEntry(penalties, M.AWARENESS, K.STRESS, stress, false);
    pushEntry(penalties, M.CUNNING, K.STRESS, stress, false);
    pushEntry(penalties, M.STATUS, K.STRESS, stress, false);
  }
}

/**
 * Read every declarative source and build the transient modifier/penalty buffer.
 * The ONLY writer of the buffer (SC-001).
 * @param {object} actor
 * @returns {{modifiers: object, penalties: object}}
 */
export function collectEffectModifiers(actor) {
  const buffers = {
    modifiers: {},
    penalties: {},
    testDice: {},
    bonusDice: {},
    reRolls: {},
    passives: {},
    derivedStats: {},
    weaponDamage: {},
    weaponQuality: {},
    dispositionDelta: { persuasion: 0, deception: 0 },
    influence: {},
  };
  collectAuthoredEffects(actor, buffers);
  collectItemModifiers(actor, buffers.modifiers);
  collectReferencedQualityModifiers(actor, buffers); // spec 020 — referenced qualities
  collectConditionModifiers(actor, buffers.modifiers, buffers.penalties);
  return buffers;
}

/**
 * spec 024 (US5, D10 / contract specialty-resolution.md C7) — is an enabled,
 * non-suppressed effect acting on THIS specialty?
 *
 * `actor.appliedEffects` is the right collection: it includes item-transferred
 * effects (`actor.effects` does not, and `legacyTransferral` is gone in v14) and
 * it already yields only `effect.active`, which IS `!disabled && !isSuppressed`
 * — precisely FR-009's "enabled, non-suppressed". No manual filtering needed.
 *
 * Deliberately narrow: the global **ALL** bucket does NOT count (it would make
 * every specialty of every character permanently visible, contradicting SC-006),
 * while OPTIONAL effects DO — the player must see that the option exists. Never
 * throws: a malformed key parses to null and is skipped.
 * @param {object} actor
 * @param {string} specialtySlug the SCOPED slug
 * @returns {boolean}
 */
export function hasSpecialtyEffect(actor, specialtySlug) {
  if (!actor || !specialtySlug) return false;
  for (const effect of actor.appliedEffects ?? []) {
    for (const change of effect?.system?.changes ?? []) {
      const parsed = parseEffectKey(change?.key);
      if (!parsed) continue;
      if (
        parsed.targetKind === TARGET_KINDS.SPECIALTY &&
        parsed.target === specialtySlug
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Read the influence delta for one technique: its own bucket + the ALL bucket
 * (both written by {@link collectEffectModifiers}). Absent buckets read 0, so an
 * unaddressed technique is a silent no-op (US4 parity).
 * @param {object} influenceBuffer the `influence` buffer
 * @param {string} techniqueSlug
 * @returns {number}
 */
export function influenceFor(influenceBuffer, techniqueSlug) {
  const all = influenceBuffer?.[ChronicleSystem.modifiersConstants.ALL] || 0;
  return (influenceBuffer?.[techniqueSlug] || 0) + all;
}

/** Sum a single item's OWN effects on one channel (self-targeted, e.g. armour
 *  rating). Reads `item.effects` directly — self effects (transfer:false) never
 *  reach `actor.appliedEffects` (foundry-api-expert §2). */
function ownEffectChannelTotal(item, channel, accessors) {
  let total = 0;
  for (const effect of item?.effects ?? []) {
    if (!effect || effect.disabled || effect.isSuppressed) continue;
    for (const change of readChanges(effect)) {
      const parsed = parseEffectKey(change.key);
      if (parsed?.channel !== channel) continue;
      total += resolveEffectValue(change.value, accessors);
    }
  }
  return total;
}

/** Append the granted qualities matching a weapon (its type slug + ALL) onto its
 *  prepared `system.qualities` (transient; reset each prepare cycle). spec 020 —
 *  each grant carries a `slug`, and a grant duplicating one of the weapon's own
 *  references is skipped so the quality appears exactly once (FR-028). */
function grantWeaponQualities(item, qualityBuffer) {
  const sys = item.system;
  if (!Array.isArray(sys?.qualities)) return;
  const allKey = ChronicleSystem.modifiersConstants.ALL;
  const typeSlug = weaponTypeSlug(itemData(item).specialty);
  const grants = [
    ...(qualityBuffer[allKey] ?? []),
    ...(typeSlug && typeSlug !== allKey ? qualityBuffer[typeSlug] ?? [] : []),
  ];
  const seen = new Set(sys.qualities.map((q) => q.slug).filter(Boolean));
  for (const grant of grants) {
    const slug = slugify(grant.name);
    if (seen.has(slug)) continue; // dedupe against references + other grants
    seen.add(slug);
    sys.qualities.push({ slug, name: grant.name, parameter: grant.parameter });
  }
}

/** Stamp a transient display `name` + `missing` flag on each quality reference that
 *  lacks a name (the persisted rows are `{slug, parameter}`), resolved from the live
 *  world definition — so the character-sheet quality chips read a name (or a
 *  "<slug> missing item" chip when no world Quality has that slug), never a blank
 *  (transient; reset each prepare cycle). Resolution is SYNC → world only (matches
 *  the collector); a slug that lives only in a compendium is materialised into the
 *  world by the migration, so it resolves here too. */
function stampQualityDisplayNames(item) {
  const qualities = item.system?.qualities;
  if (!Array.isArray(qualities)) return;
  for (const ref of qualities) {
    if (!ref) continue;
    const def = qualityBySlug(ref.slug);
    ref.description = def?.system?.description ?? ""; // hover tooltip (FR-018)
    if (ref.name) continue; // grants already carry a name (not missing)
    ref.missing = !def;
    ref.name = def?.name ?? ref.slug ?? "";
  }
}

/** Add an armour's own `armorrating` effects to its prepared `system.rating`
 *  (transient). "self" = the bearing armour item (design §2). */
function applyArmorRating(item, accessors) {
  const bonus = ownEffectChannelTotal(
    item,
    EFFECT_CHANNELS.ARMOR_RATING,
    accessors
  );
  if (bonus && typeof item.system?.rating === "number") {
    item.system.rating += bonus;
  }
}

/**
 * Wave 4 transient item pass — applies the non-roll channels that mutate OWNED
 * items, run from `prepareDerivedData` (items are already prepared; the writes
 * are transient and discarded next cycle — NEVER `item.update`; foundry-api-
 * expert §1/§3). Covers `quality` (append granted qualities to matching weapons)
 * and `armorrating` (add each armour's own effects to its rating). The `damage`
 * channel is applied at render by `updateDamageValue` via {@link getWeaponDamageBonus}.
 * @param {object} actor
 */
export function applyOwnedItemEffects(actor) {
  const qualityBuffer = actor?.weaponQuality ?? {};
  const accessors = actorValueAccessors(actor);
  for (const item of actor?.items ?? []) {
    if (item.type === "weapon") {
      grantWeaponQualities(item, qualityBuffer);
      stampQualityDisplayNames(item);
    } else if (item.type === "armor") {
      applyArmorRating(item, accessors);
      stampQualityDisplayNames(item);
    }
  }
}

/**
 * Shared core of the two roll-effect collectors: every roll-channel change on the
 * actor's applied effects that matches THIS test, filtered by `wantOptional`.
 * Matching reuses the exact buffer-key resolution the permanent (read-side) path
 * uses ({@link rollBufferKey}), so an effect targets the same roll its buffer twin
 * would: the global ALL bucket, the rolled ability, or the rolled specialty. Each
 * descriptor carries the resolved value and the `DiceRollFormula` lever
 * (`formulaField`). Permanent effects are NEVER optional, so the two public
 * collectors partition the applied effects and can never double-count one.
 * @param {object} actor
 * @param {string|null} abilityRef name-or-slug of the rolled ability (or null)
 * @param {string|null} specialtyRef name-or-slug of the rolled specialty (or null)
 * @param {boolean} wantOptional true → optional (dialog-toggle) effects; false → permanent
 * @returns {Array<{name: string, effectId: string, channel: string, formulaField: string, value: number, condition: string}>}
 */
function collectRollEffects(actor, abilityRef, specialtyRef, wantOptional) {
  const accessors = actorValueAccessors(actor);
  const ALL = ChronicleSystem.modifiersConstants.ALL;
  // Resolve the rolled ability/specialty to their STABLE slugs (spec 008) so the
  // dialog matches the same identity the buffer keys by — under any language.
  const abilityKey =
    abilityRef != null ? abilitySlugForRef(actor, abilityRef) : null;
  const specialtyKey =
    specialtyRef != null
      ? specialtySlugForRef(actor, abilityKey, specialtyRef)
      : null;

  const results = [];
  for (const effect of actor?.appliedEffects ?? []) {
    if (!effect || effect.disabled || effect.isSuppressed) continue;
    if (isOptionalEffect(effect) !== wantOptional) continue;

    for (const change of readChanges(effect)) {
      const parsed = parseEffectKey(change.key);
      if (!parsed) continue;

      const formulaField = ROLL_CHANNEL_TO_FORMULA_FIELD[parsed.channel];
      if (!formulaField) continue; // only roll channels surface in the dialog

      const bufferKey = rollBufferKey(parsed);
      const applies =
        bufferKey === ALL ||
        bufferKey === abilityKey ||
        (specialtyKey !== null && bufferKey === specialtyKey);
      if (!applies) continue;

      const value = resolveEffectValue(change.value, accessors);
      if (!value) continue;

      results.push({
        name: effect.name,
        effectId: effect.id,
        channel: parsed.channel,
        formulaField,
        value,
        condition: optionalCondition(effect),
      });
    }
  }
  return results;
}

/**
 * On-read collection of the OPTIONAL (dialog-toggled) roll effects applicable to
 * one test — `optional:true` effects surfaced as default-off checkboxes in the
 * roll dialog (design §4). Same matching + descriptor shape as the permanent twin.
 * @param {object} actor
 * @param {string|null} abilityName localized name of the rolled ability (or null)
 * @param {string|null} specialtyName localized name of the rolled specialty (or null)
 * @returns {Array<{name: string, effectId: string, channel: string, formulaField: string, value: number, condition: string}>}
 */
export function collectOptionalRollEffects(
  actor,
  abilityName = null,
  specialtyName = null
) {
  return collectRollEffects(actor, abilityName, specialtyName, true);
}

/**
 * On-read collection of the PERMANENT (always-on) roll effects applicable to one
 * test — the read-side twin of {@link collectOptionalRollEffects} for
 * `optional:false` effects. These already entered the formula via the modifier
 * buffer ({@link collectAuthoredEffects}); this surfaces them in the roll dialog
 * as LOCKED (disabled + checked) rows so the player sees WHY the roll is boosted,
 * without re-applying them (the dialog guard skips disabled checkboxes). Same
 * matching + descriptor shape as the optional path.
 * @param {object} actor
 * @param {string|null} abilityName localized name of the rolled ability (or null)
 * @param {string|null} specialtyName localized name of the rolled specialty (or null)
 * @returns {Array<{name: string, effectId: string, channel: string, formulaField: string, value: number, condition: string}>}
 */
export function collectPermanentRollEffects(
  actor,
  abilityName = null,
  specialtyName = null
) {
  return collectRollEffects(actor, abilityName, specialtyName, false);
}

/**
 * Itemize EVERY always-on contribution to one roll, LABELED BY ORIGIN (US2). The
 * three source collectors are run into FRESH buffers so each contribution keeps
 * its origin (condition / equipment / effect) instead of being merged. An entry
 * matches when its buffer key is the global ALL bucket, the rolled ability slug,
 * or the rolled specialty slug (the same slug identity the buffers key by). The
 * result is the roll dialog's itemized list; its per-field sums equal the
 * effective formula minus the raw base (SC-001). Sources are disjoint, so no
 * contribution is double-counted.
 * @param {object} actor
 * @param {string|null} abilityRef name-or-slug of the rolled ability (or null)
 * @param {string|null} specialtyRef name-or-slug of the rolled specialty (or null)
 * @returns {Array<{sourceLabel: string, origin: "condition"|"equipment"|"effect",
 *   field: string, value: number, condition: string}>}
 */
export function collectItemizedAlwaysOn(
  actor,
  abilityRef = null,
  specialtyRef = null
) {
  const ALL = ChronicleSystem.modifiersConstants.ALL;
  const abilityKey =
    abilityRef != null ? abilitySlugForRef(actor, abilityRef) : null;
  const specialtyKey =
    specialtyRef != null
      ? specialtySlugForRef(actor, abilityKey, specialtyRef)
      : null;
  const applies = (key) =>
    key === ALL ||
    key === abilityKey ||
    (specialtyKey !== null && key === specialtyKey);

  const localize = (key) => game?.i18n?.localize?.(key) ?? key;
  const itemName = new Map((actor?.items ?? []).map((it) => [it._id, it.name]));

  const items = [];
  const pushBuffer = (buffer, field, origin, labelFor) => {
    for (const [key, entries] of Object.entries(buffer)) {
      if (!applies(key)) continue;
      for (const entry of entries) {
        items.push({
          sourceLabel: labelFor(entry),
          origin,
          field,
          value: entry.mod,
          condition: "",
        });
      }
    }
  };

  // 1 — dynamic conditions (modifier + penalty buffers; `_id` is a i18n key).
  const condMods = {};
  const condPens = {};
  collectConditionModifiers(actor, condMods, condPens);
  pushBuffer(condMods, "modifier", "condition", (e) => localize(e._id));
  pushBuffer(condPens, "dicePenalty", "condition", (e) => localize(e._id));

  // 2 — owned equipment (armour penalty → agility/combat-defence modifier;
  //     `_id` is the item id → resolve to its display name).
  const equipMods = {};
  collectItemModifiers(actor, equipMods);
  pushBuffer(
    equipMods,
    "modifier",
    "equipment",
    (e) => itemName.get(e._id) ?? e._id
  );

  // 3 — permanent authored effects (already resolved per-effect, per-field).
  for (const eff of collectPermanentRollEffects(
    actor,
    abilityRef,
    specialtyRef
  )) {
    items.push({
      sourceLabel: eff.name,
      origin: "effect",
      field: eff.formulaField,
      value: eff.value,
      condition: eff.condition,
    });
  }
  return items;
}

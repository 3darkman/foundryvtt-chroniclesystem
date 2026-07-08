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
} from "./cs-effect-vocabulary.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";
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
 * Resolve a specialty by stable slug to `{ name, rating }`. **Single resolver**:
 * specialties live in `ability.system.specialties` today and will become their
 * own item type later (design §5 forward-compat) — only this function changes then.
 * @returns {{name: string, rating: number}|null}
 */
function resolveSpecialty(actor, slug) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    const data = itemData(item);
    const abilitySlug = data.slug || slugify(item.name);
    for (const specialty of Object.values(data.specialties ?? {})) {
      // Read the persisted SCOPED slug (fallback to the derived scoped slug) —
      // mirrors resolveAbility's `slug || slugify(name)` (fixes the asymmetry).
      const spSlug =
        specialty?.slug || scopedSpecialtySlug(abilitySlug, specialty?.name);
      if (spSlug === slug) {
        return { name: specialty.name, rating: Number(specialty.rating) || 0 };
      }
    }
  }
  return null;
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
    if (item.type !== "ability") continue;
    const data = itemData(item);
    const aSlug = data.slug || slugify(item.name);
    for (const sp of Object.values(data.specialties ?? {})) {
      const spSlug = sp?.slug || scopedSpecialtySlug(aSlug, sp?.name);
      if (spSlug === refStr || sp?.name?.toLowerCase() === refLower)
        return spSlug;
    }
  }
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
  switch (parsed.channel) {
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

      const bufferName = ROLL_CHANNEL_TO_BUFFER[parsed.channel];
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

/** Weapon contribution: each `bulk` quality adds to the bulk channel (owned). */
function collectWeaponBulk(item, modifiers) {
  const M = ChronicleSystem.modifiersConstants;
  const qualities = itemData(item).qualities
    ? Object.values(itemData(item).qualities)
    : [];
  for (const quality of qualities) {
    if ((quality?.name ?? "").toLowerCase() === M.BULK) {
      pushEntry(modifiers, M.BULK, item._id, parseInt(quality.parameter), true);
    }
  }
}

/**
 * Source 2 — owned equipment, read live from item data. Dispatches to the
 * per-type collectors (keeping nesting ≤ 3, constitution §I).
 * @param {object} actor
 * @param {object} modifiers
 */
function collectItemModifiers(actor, modifiers) {
  for (const item of actor?.items ?? []) {
    if (item.type === "armor") collectArmorModifiers(item, modifiers);
    else if (item.type === "weapon") collectWeaponBulk(item, modifiers);
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
    derivedStats: {},
    weaponDamage: {},
    weaponQuality: {},
  };
  collectAuthoredEffects(actor, buffers);
  collectItemModifiers(actor, buffers.modifiers);
  collectConditionModifiers(actor, buffers.modifiers, buffers.penalties);
  return buffers;
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
 *  prepared `system.qualities` (transient; reset each prepare cycle). */
function grantWeaponQualities(item, qualityBuffer) {
  const sys = item.system;
  if (!Array.isArray(sys?.qualities)) return;
  const allKey = ChronicleSystem.modifiersConstants.ALL;
  const typeSlug = weaponTypeSlug(itemData(item).specialty);
  const grants = [
    ...(qualityBuffer[allKey] ?? []),
    ...(typeSlug && typeSlug !== allKey ? qualityBuffer[typeSlug] ?? [] : []),
  ];
  for (const grant of grants) {
    sys.qualities.push({ name: grant.name, parameter: grant.parameter });
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
    if (item.type === "weapon") grantWeaponQualities(item, qualityBuffer);
    else if (item.type === "armor") applyArmorRating(item, accessors);
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

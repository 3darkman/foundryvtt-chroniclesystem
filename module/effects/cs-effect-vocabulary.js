// Effect vocabulary — the single source of truth (SSOT, constitution §II) for the
// structured Active Effect change key: `cs.<channel>.<targetKind>[.<slug>]`.
//
// Grounded in the Chronicle System rulebooks (see docs/ae-effect-model-design.md).
// PURE module (no Foundry runtime) → testable in Vitest. Reuses
// `ChronicleSystem.modifiersConstants` for the shared buffer ids it overlaps.

import { ChronicleSystem } from "../system/ChronicleSystem.js";

/** Namespace prefix of every Chronicle effect key. */
export const EFFECT_KEY_PREFIX = "cs.";

/**
 * Effect channels — WHAT lever the effect pulls. Each maps (in the collector,
 * later wave) to a DiceRollFormula lever, a derived field, or an item mutation.
 */
export const EFFECT_CHANNELS = {
  RESULT: "result", // flat ±N on the test result → formula.modifier
  TEST_DICE: "testdice", // +#D kept dice → formula.pool
  BONUS_DICE: "bonusdice", // +#B rolled extra → formula.bonusDice
  REROLL: "reroll", // reroll ≤N → formula.reRoll
  PENALTY: "penalty", // −#D (negative value = reduction) → formula.dicePenalty
  DERIVED_STAT: "derivedstat", // a system.derivedStats.* field
  ARMOR_RATING: "armorrating", // armour AR
  BULK: "bulk", // movement bulk
  DAMAGE: "damage", // weapon damage
  QUALITY: "quality", // grant a quality to an item
};

/** Channels that target a roll (all / ability / specialty). */
const ROLL_CHANNELS = new Set([
  EFFECT_CHANNELS.RESULT,
  EFFECT_CHANNELS.TEST_DICE,
  EFFECT_CHANNELS.BONUS_DICE,
  EFFECT_CHANNELS.REROLL,
  EFFECT_CHANNELS.PENALTY,
]);

/** Channels that target an owned weapon (by type or all). */
const WEAPON_CHANNELS = new Set([
  EFFECT_CHANNELS.DAMAGE,
  EFFECT_CHANNELS.QUALITY,
]);

/** True for the five roll channels (all/ability/specialty targets). */
export function isRollChannel(channel) {
  return ROLL_CHANNELS.has(channel);
}

/** True for the weapon channels (damage/quality; weapon/weapontype targets). */
export function isWeaponChannel(channel) {
  return WEAPON_CHANNELS.has(channel);
}

/**
 * Maps each roll channel to the `DiceRollFormula` lever it feeds — the SSOT
 * (constitution §II) for the channel→formula wiring shared by the read-side
 * (`getActorTestFormula`) and the optional-effect dialog (design §4). The values
 * are the exact `DiceRollFormula` accessor names so a descriptor can be applied
 * with `formula[field] += value`.
 */
export const ROLL_CHANNEL_TO_FORMULA_FIELD = {
  [EFFECT_CHANNELS.RESULT]: "modifier", // flat ±N → formula.modifier
  [EFFECT_CHANNELS.PENALTY]: "dicePenalty", // −#D → formula.dicePenalty
  [EFFECT_CHANNELS.TEST_DICE]: "pool", // +#D → formula.pool
  [EFFECT_CHANNELS.BONUS_DICE]: "bonusDice", // +#B → formula.bonusDice
  [EFFECT_CHANNELS.REROLL]: "reRoll", // reroll ≤N → formula.reRoll
};

/** Target kinds — WHAT the channel applies to. */
export const TARGET_KINDS = {
  ALL: ChronicleSystem.modifiersConstants.ALL, // "all" — the global-roll bucket the read-side/collector key by (SSOT)
  ABILITY: "ability", // a single ability (slug)
  SPECIALTY: "specialty", // a single specialty (slug)
  STAT: "stat", // a derived stat (slug, e.g. combatdefense)
  WEAPON_TYPE: "weapontype", // weapons of a type (slug, e.g. shortblade)
  WEAPON_ALL: "weapon", // all weapons
  SELF: "self", // the bearing item itself (armorrating)
};

/**
 * Derived-stat slugs addressable by the `derivedstat` channel. Reuses the
 * existing modifiersConstants id for combat defense (SSOT).
 */
export const DERIVED_STATS = {
  COMBAT_DEFENSE: ChronicleSystem.modifiersConstants.COMBAT_DEFENSE, // "combat_defense"
  INTRIGUE_DEFENSE: "intrigue_defense",
  HEALTH: "health",
  COMPOSURE: "composure",
  MOVEMENT: "movement",
};

const VALID_CHANNELS = new Set(Object.values(EFFECT_CHANNELS));

/**
 * The `derivedstat` target is a CLOSED enumeration (unlike the open ability /
 * specialty / weapon-type slugs), so the parser validates it: an out-of-set slug
 * would otherwise parse "valid", land in a buffer key no field ever reads, and
 * silently no-op. Membership-gating turns that authoring typo into a rejected key.
 */
const VALID_DERIVED_STATS = new Set(Object.values(DERIVED_STATS));

/**
 * Stable, localization-independent slug. Normalises a name: strip accents,
 * lowercase, collapse every run of non-alphanumeric characters (whitespace,
 * punctuation, dots) to a single `_`, trimming leading/trailing `_`. Dots are
 * removed so a slug can never collide with the `.` key separator. Shared by
 * ability, specialty and weapon-type targets (DRY, constitution §III).
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Back-compat alias — ability slug is just a slug. */
export const toAbilitySlug = slugify;

/**
 * The weapon "type" slug used by the `damage`/`quality` weapon-type matching.
 * Per the user's domain decision, a weapon's type IS its combat specialty (the
 * `Specialty` half of the `Ability:Specialty` string — e.g. "Fighting:Axes" →
 * `axes`). SSOT for weapon-type resolution (constitution §II): both the collector
 * and `updateDamageValue` resolve the slug through here, never re-deriving it.
 * @param {string} specialty the weapon's `system.specialty`
 * @returns {string}
 */
export function weaponTypeSlug(specialty) {
  const parts = String(specialty ?? "").split(":");
  return slugify(parts.length > 1 ? parts[1] : parts[0]);
}

/* --------------------------- weapon qualities ---------------------------- */

/** Authoring groups for the `quality` dropdown: the feudal core rules vs the
 *  Spark-to-Powder gunpowder expansion (drives the optgroups). */
export const WEAPON_QUALITY_GROUPS = {
  FEUDAL: "feudal",
  GUNPOWDER: "gunpowder",
};

/**
 * Canonical weapon qualities (SSOT), validated against the Chronicle System
 * rulebooks — SIFRP (Game of Thrones Ed.), Sword Chronicle Core and the Spark
 * to Powder expansion — via the project's NotebookLM. `param:true` carries a
 * trailing rating in the stored value ("Piercing 1", "Reload Greater"); the
 * others are bare names. `group` drives the authoring optgroups. Free text
 * ("Other…") covers anything off-list, so this need not enumerate homebrew.
 */
export const WEAPON_QUALITIES = [
  // Feudal core (SIFRP / Sword Chronicle Core)
  { name: "Adaptable", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Bulk", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Close Range", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Defensive", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Entangling", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Fast", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Fragile", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Grab", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Impale", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Long Range", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Mounted", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Off-hand", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Piercing", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Powerful", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Reach", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Reload", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  {
    name: "Set for Charge Only",
    param: false,
    group: WEAPON_QUALITY_GROUPS.FEUDAL,
  },
  { name: "Shattering", param: true, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Slow", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Staggering", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Two-Handed", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Unwieldy", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  { name: "Vicious", param: false, group: WEAPON_QUALITY_GROUPS.FEUDAL },
  // Gunpowder expansion (Spark to Powder)
  { name: "Inaccurate", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Longarm", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Penetrating", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Penetration", param: true, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Reliable", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Smoke", param: true, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Snaphance", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Snaplock", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  { name: "Treacherous", param: true, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
  {
    name: "Vulnerable to Wet",
    param: false,
    group: WEAPON_QUALITY_GROUPS.GUNPOWDER,
  },
  { name: "Wheel-Lock", param: false, group: WEAPON_QUALITY_GROUPS.GUNPOWDER },
];

/** Stable i18n-key suffix for a quality name (reuses the shared slugify). */
export function weaponQualitySlug(name) {
  return slugify(name);
}

/** True when the named canonical quality carries a parameter/rating. */
export function weaponQualityTakesParam(name) {
  return WEAPON_QUALITIES.some((q) => q.name === name && q.param);
}

/**
 * Match a stored quality value against the canonical list, longest-name first so
 * multi-word names win (e.g. "Close Range" over a shorter prefix). Returns
 * `{ name, param }` (param may be "") or null when off-list (→ free text).
 * @param {string} value the stored `change.value` (a NAME string)
 * @returns {{name: string, param: string}|null}
 */
export function matchWeaponQuality(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let best = null;
  for (const quality of WEAPON_QUALITIES) {
    if (text === quality.name || text.startsWith(`${quality.name} `)) {
      if (!best || quality.name.length > best.length) best = quality.name;
    }
  }
  if (!best) return null;
  return { name: best, param: text.slice(best.length).trim() };
}

/**
 * Parse a structured effect key into `{ channel, targetKind, target }`, or
 * `null` for anything outside the `cs.*` grammar. Never throws (FR-005).
 * @param {string} key
 * @returns {{channel: string, targetKind: string, target: string|null}|null}
 */
export function parseEffectKey(key) {
  if (!key || typeof key !== "string" || !key.startsWith(EFFECT_KEY_PREFIX)) {
    return null;
  }
  const parts = key.split(".");
  const channel = parts[1];
  if (!VALID_CHANNELS.has(channel)) return null;
  const rest = parts.slice(2);

  // Strict: reject any key carrying extra/unexpected segments (slugs never
  // contain dots, so segment counts are exact) — a malformed key parses to null.
  if (ROLL_CHANNELS.has(channel)) return parseRollTarget(channel, rest);
  if (WEAPON_CHANNELS.has(channel)) return parseWeaponTarget(channel, rest);
  if (channel === EFFECT_CHANNELS.DERIVED_STAT) {
    return rest.length === 1 && VALID_DERIVED_STATS.has(rest[0])
      ? { channel, targetKind: TARGET_KINDS.STAT, target: rest[0] }
      : null;
  }
  if (channel === EFFECT_CHANNELS.ARMOR_RATING) {
    return rest.length === 0
      ? { channel, targetKind: TARGET_KINDS.SELF, target: null }
      : null;
  }
  if (channel === EFFECT_CHANNELS.BULK) {
    return rest.length === 0
      ? { channel, targetKind: TARGET_KINDS.ALL, target: null }
      : null;
  }
  return null;
}

function parseRollTarget(channel, rest) {
  if (rest.length === 1 && rest[0] === TARGET_KINDS.ALL) {
    return { channel, targetKind: TARGET_KINDS.ALL, target: null };
  }
  const targetKind = rest[0];
  const isAbilityOrSpecialty =
    targetKind === TARGET_KINDS.ABILITY ||
    targetKind === TARGET_KINDS.SPECIALTY;
  if (rest.length === 2 && isAbilityOrSpecialty && rest[1]) {
    return { channel, targetKind, target: rest[1] };
  }
  return null;
}

function parseWeaponTarget(channel, rest) {
  if (rest.length === 1 && rest[0] === TARGET_KINDS.WEAPON_ALL) {
    return { channel, targetKind: TARGET_KINDS.WEAPON_ALL, target: null };
  }
  if (rest.length === 2 && rest[0] === TARGET_KINDS.WEAPON_TYPE && rest[1]) {
    return { channel, targetKind: TARGET_KINDS.WEAPON_TYPE, target: rest[1] };
  }
  return null;
}

/**
 * Build a structured effect key. Round-trips with {@link parseEffectKey}.
 * Returns "" for an invalid (channel, targetKind, target) combination.
 * @param {{channel: string, targetKind: string, target?: string|null}} spec
 * @returns {string}
 */
export function buildEffectKey({ channel, targetKind, target = null } = {}) {
  if (!VALID_CHANNELS.has(channel)) return "";

  if (ROLL_CHANNELS.has(channel)) {
    if (targetKind === TARGET_KINDS.ALL)
      return `${EFFECT_KEY_PREFIX}${channel}.all`;
    if (
      targetKind === TARGET_KINDS.ABILITY ||
      targetKind === TARGET_KINDS.SPECIALTY
    ) {
      return target
        ? `${EFFECT_KEY_PREFIX}${channel}.${targetKind}.${target}`
        : "";
    }
    return "";
  }
  if (WEAPON_CHANNELS.has(channel)) {
    if (targetKind === TARGET_KINDS.WEAPON_ALL)
      return `${EFFECT_KEY_PREFIX}${channel}.weapon`;
    if (targetKind === TARGET_KINDS.WEAPON_TYPE) {
      return target
        ? `${EFFECT_KEY_PREFIX}${channel}.weapontype.${target}`
        : "";
    }
    return "";
  }
  if (channel === EFFECT_CHANNELS.DERIVED_STAT) {
    return target ? `${EFFECT_KEY_PREFIX}${channel}.${target}` : "";
  }
  if (channel === EFFECT_CHANNELS.ARMOR_RATING)
    return `${EFFECT_KEY_PREFIX}${channel}`;
  if (channel === EFFECT_CHANNELS.BULK) return `${EFFECT_KEY_PREFIX}${channel}`;
  return "";
}

/** i18n key for a channel label (authoring dropdown). */
export function getChannelLabel(channel) {
  return `CS.effects.channels.${channel}`;
}

/** i18n key for a target-kind label (authoring dropdown). */
export function getTargetKindLabel(targetKind) {
  return `CS.effects.targetKinds.${targetKind}`;
}

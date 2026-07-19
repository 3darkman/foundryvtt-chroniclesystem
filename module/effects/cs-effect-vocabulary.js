// Effect vocabulary — the single source of truth (SSOT, constitution §II) for the
// structured Active Effect change key: `cs.<channel>.<targetKind>[.<slug>]`.
//
// Grounded in the Chronicle System rulebooks (see docs/ae-effect-model-design.md).
// PURE module (no Foundry runtime) → testable in Vitest. Reuses
// `ChronicleSystem.modifiersConstants` for the shared buffer ids it overlaps.

import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { slugify } from "./cs-slugify.js";
import { SEED_BY_SLUG, buildSeedItemData } from "../data/quality-seeds.js";

// Re-export the shared slug normaliser (its definition moved to the
// dependency-free cs-slugify.js so ChronicleSystem can key by slug without an
// eval-time import cycle). Existing `import { slugify } from
// "./cs-effect-vocabulary.js"` sites keep working.
export { slugify };

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
  REROLL: "reroll", // reroll up to N dice showing 1 → formula.reRoll (rN=1)
  PENALTY: "penalty", // −#D (negative value = reduction) → formula.dicePenalty
  DERIVED_STAT: "derivedstat", // a system.derivedStats.* field
  ARMOR_RATING: "armorrating", // armour AR
  BULK: "bulk", // movement bulk
  DAMAGE: "damage", // weapon damage
  QUALITY: "quality", // grant a quality to an item
  INFLUENCE: "influence", // intrigue-technique influence (US4)
  // spec 020 — quality rule levers (Decision 3). Attack-scoped/self channels: no
  // authored-AE routing (scoped to the Quality rule list, not the AE dropdown),
  // but they carry a `cs.*` key + parser branch so the grammar round-trips.
  ARMOR_BYPASS: "armorbypass", // attack-scoped: reduce the TARGET's Armor Rating (Piercing/Penetration)
  ARMOR_PENALTY: "armorpenalty", // armour's own Armor Penalty
  // spec 021 (D5) — roll-time ONLY: value is a MULTIPLIER on the measured distance
  // (Inaccurate ×2), read directly by _deriveTargetConflict. Routes to no formula
  // field and carries no `cs.*` key (never parsed/built), an intentional exception
  // to the additive-±N lever norm (tracked complexity, research Part C).
  RANGE_MULTIPLIER: "rangemultiplier",
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

/** spec 020 — quality levers stored as a bare `cs.<channel>` key (self-scoped, no
 *  target segment); their parse/build branches mirror `armorrating`. */
const SELF_SCOPED_QUALITY_CHANNELS = new Set([
  EFFECT_CHANNELS.ARMOR_BYPASS,
  EFFECT_CHANNELS.ARMOR_PENALTY,
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
  [EFFECT_CHANNELS.REROLL]: "reRoll", // reroll up to N ones → formula.reRoll
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
  DISPOSITION: "disposition", // intrigue disposition delta (US4; facet slug)
  INFLUENCE: "influence", // intrigue influence: a technique slug, or null = ALL (US4)
};

/**
 * The disposition facets addressable by `cs.result.disposition.<facet>` (US4).
 * `both` adds to persuasion AND deception. A CLOSED set — an out-of-set facet is
 * a rejected key (silent typo protection, like the derived-stat gating).
 */
export const DISPOSITION_FACETS = new Set(["persuasion", "deception", "both"]);

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
  // Disposition rides the `result` channel but routes to its OWN buffer, so it is
  // matched before the generic roll-target parse (US4).
  if (
    channel === EFFECT_CHANNELS.RESULT &&
    rest[0] === TARGET_KINDS.DISPOSITION
  ) {
    return rest.length === 2 && DISPOSITION_FACETS.has(rest[1])
      ? { channel, targetKind: TARGET_KINDS.DISPOSITION, target: rest[1] }
      : null;
  }
  if (ROLL_CHANNELS.has(channel)) return parseRollTarget(channel, rest);
  if (WEAPON_CHANNELS.has(channel)) return parseWeaponTarget(channel, rest);
  if (channel === EFFECT_CHANNELS.INFLUENCE) {
    // `cs.influence` (no slug) = the ALL bucket; `cs.influence.<slug>` = one
    // technique. The slug is NOT validated here — an unknown technique parses
    // fine and simply no-ops in the sheet (silent parity, contract §Validação).
    if (rest.length === 0)
      return { channel, targetKind: TARGET_KINDS.INFLUENCE, target: null };
    if (rest.length === 1 && rest[0])
      return { channel, targetKind: TARGET_KINDS.INFLUENCE, target: rest[0] };
    return null;
  }
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
  // spec 020 — the four self-scoped quality levers mirror the armorrating/bulk
  // "bare channel key" shape (no target segment). A trailing segment is rejected.
  if (SELF_SCOPED_QUALITY_CHANNELS.has(channel)) {
    return rest.length === 0
      ? { channel, targetKind: TARGET_KINDS.SELF, target: null }
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

  // Disposition round-trips to `cs.result.disposition.<facet>` (US4).
  if (
    channel === EFFECT_CHANNELS.RESULT &&
    targetKind === TARGET_KINDS.DISPOSITION
  ) {
    return target && DISPOSITION_FACETS.has(target)
      ? `${EFFECT_KEY_PREFIX}result.disposition.${target}`
      : "";
  }
  if (channel === EFFECT_CHANNELS.INFLUENCE) {
    return target
      ? `${EFFECT_KEY_PREFIX}influence.${target}`
      : `${EFFECT_KEY_PREFIX}influence`;
  }

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
  // spec 020 — self-scoped quality levers round-trip to their bare `cs.<channel>` key.
  if (SELF_SCOPED_QUALITY_CHANNELS.has(channel))
    return `${EFFECT_KEY_PREFIX}${channel}`;
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

/* --------------------------- quality levers (spec 020) ------------------------- */

/**
 * spec 021 (US3 UI redesign) — the lever id marking an "apply condition to target"
 * rule. Deliberately NOT a member of {@link QUALITY_LEVERS} (it carries no `cs.*`
 * channel, so the buffer collector's `QUALITY_LEVER_MAP[rule.lever]` lookup returns
 * undefined and treats it as inert). Instead it is the SINGLE canonical signal the
 * target-condition pipeline (`weaponReminders`) keys on — replacing the old
 * `scope:"target"` marker so the rule editor can present it as the "What changes"
 * lever with the effect as its value. A `migrateData` converts legacy rows.
 */
export const APPLY_CONDITION_LEVER = "applycondition";

/**
 * The authoring vocabulary for a Quality's "Efeitos de Regra" list (Decision 3,
 * handoff §1.4). SSOT: each lever maps to a backing `EFFECT_CHANNELS` channel and
 * carries the metadata the collector needs — `attackScoped` (bound to the rolled
 * weapon at roll time, NOT summed onto passive stats or the chip — FR-016), the
 * natural `defaultScope`, and an optional fixed `target` (e.g. combat-defense for
 * Defensive). Ordered for the dropdown; the label is `CS.quality.levers.<id>`.
 * @type {ReadonlyArray<{id: string, channel: string, attackScoped: boolean, defaultScope: "passive"|"auto"|"optional", target?: string}>}
 */
export const QUALITY_LEVERS = [
  {
    id: "damage",
    channel: EFFECT_CHANNELS.DAMAGE,
    attackScoped: true,
    defaultScope: "auto",
  },
  {
    id: "armorbypass",
    channel: EFFECT_CHANNELS.ARMOR_BYPASS,
    attackScoped: true,
    defaultScope: "auto",
  },
  {
    id: "defensewhilewielded",
    channel: EFFECT_CHANNELS.DERIVED_STAT,
    attackScoped: false,
    defaultScope: "passive",
    target: DERIVED_STATS.COMBAT_DEFENSE,
  },
  {
    id: "bulk",
    channel: EFFECT_CHANNELS.BULK,
    attackScoped: false,
    defaultScope: "passive",
  },
  {
    id: "testdice",
    channel: EFFECT_CHANNELS.TEST_DICE,
    attackScoped: true,
    defaultScope: "auto",
  },
  {
    id: "penalty",
    channel: EFFECT_CHANNELS.PENALTY,
    attackScoped: true,
    defaultScope: "auto",
  },
  {
    id: "armorrating",
    channel: EFFECT_CHANNELS.ARMOR_RATING,
    attackScoped: false,
    defaultScope: "passive",
  },
  {
    id: "armorpenalty",
    channel: EFFECT_CHANNELS.ARMOR_PENALTY,
    attackScoped: false,
    defaultScope: "passive",
  },
  // spec 021 (D10) — flat ±N on the test result (Superior "+1 result", grades). The
  // RESULT channel already maps to formula.modifier via ROLL_CHANNEL_TO_FORMULA_FIELD.
  {
    id: "result",
    channel: EFFECT_CHANNELS.RESULT,
    attackScoped: true,
    defaultScope: "auto",
  },
  // spec 021 (D5) — Inaccurate ×2 distance. Value is a MULTIPLIER read directly by
  // the roll-time range-penalty site (not routed to any formula field).
  {
    id: "rangemultiplier",
    channel: EFFECT_CHANNELS.RANGE_MULTIPLIER,
    attackScoped: true,
    defaultScope: "auto",
  },
];

/** Lever id → its descriptor (SSOT lookup derived from {@link QUALITY_LEVERS}). */
export const QUALITY_LEVER_MAP = Object.freeze(
  Object.fromEntries(QUALITY_LEVERS.map((lever) => [lever.id, lever]))
);

/**
 * The descriptor for a lever id, or `null` for a blank/unknown lever (the
 * collector treats that as inert — FR-005 authoring resilience).
 * @param {string} id
 * @returns {{id: string, channel: string, attackScoped: boolean, defaultScope: string, target?: string}|null}
 */
export function qualityLever(id) {
  return QUALITY_LEVER_MAP[id] ?? null;
}

/** i18n key for a quality-lever label (authoring dropdown). */
export function getQualityLeverLabel(id) {
  return `CS.quality.levers.${id}`;
}

/**
 * Applicability filter (FR-010, contract C4). Pure — used by both the picker
 * (offer list) and the drop handler (accept/ignore). Accepts a Quality document
 * (`quality.system.applicability`), a compendium index row, or a bare
 * `{applicability}` object.
 * @param {object} quality
 * @param {"weapon"|"armor"} itemType
 * @returns {boolean}
 */
export function qualityAppliesTo(quality, itemType) {
  const app =
    quality?.system?.applicability ?? quality?.applicability ?? "both";
  if (itemType === "weapon") return app === "weapon" || app === "both";
  if (itemType === "armor") return app === "armor" || app === "both";
  return false;
}

/**
 * Resolve a Quality definition by stable slug (contract C5). **Synchronous** —
 * the collector runs in `prepareData` and MUST NOT await.
 *
 * Resolution order: (1) a WORLD Quality item with that slug — a GM's own homebrew
 * OR a customised copy of a seed quality (world-first, so GM edits win); (2) the
 * canonical SEED catalog (`SEED_BY_SLUG`) as a synthetic `{name, system}` def. The
 * seed fallback means a built-in quality ALWAYS resolves — a weapon never shows
 * "missing item" for a catalog quality, and a deleted/absent world copy self-heals
 * without a version-gated migration re-run. Only a genuine homebrew slug with no
 * world item AND no seed returns `null` (label-only chip, applies no rule, FR-012).
 * Guarded so it is a no-op (→ seed or null) outside Foundry (Vitest): `game` is absent.
 * @param {string} slug
 * @returns {object|null} the Quality Item document, a synthetic seed def, or null
 */
export function qualityBySlug(slug) {
  if (!slug) return null;
  for (const item of game?.items ?? []) {
    if (item.type !== "quality") continue;
    if ((item.system?.slug || slugify(item.name)) === slug) return item;
  }
  // Canonical fallback — resolve the built-in seed without a materialised world
  // copy. Shaped like an item ({name, system}) so every read-only caller (rules,
  // parameter, range, wielding, name, description) works unchanged.
  const seed = SEED_BY_SLUG[slug];
  if (seed) {
    const data = buildSeedItemData(seed);
    return { name: data.name, system: data.system };
  }
  return null;
}

/**
 * Resolve a weapon's wielding behaviour from its referenced qualities' definitions
 * (spec 020, FR-022 SSOT — by slug, NOT by name). OR-s the `wielding.*` booleans
 * across every referenced Quality that resolves. Used by the equip logic (US5) and
 * `updateDamageValue`'s Adaptable +1 (US2) so both read one wielding state.
 * @param {object} item a weapon Item (its `system.qualities` reference list)
 * @returns {{occupiesBothHands: boolean, offHandEligible: boolean, adaptable: boolean}}
 */
export function weaponWieldingFlags(item) {
  const flags = {
    occupiesBothHands: false,
    offHandEligible: false,
    adaptable: false,
  };
  for (const ref of effectiveWeaponQualityRefs(item)) {
    const wielding = qualityBySlug(ref?.slug)?.system?.wielding;
    if (!wielding) continue;
    if (wielding.occupiesBothHands) flags.occupiesBothHands = true;
    if (wielding.offHandEligible) flags.offHandEligible = true;
    if (wielding.adaptable) flags.adaptable = true;
  }
  return flags;
}

/**
 * The EFFECTIVE quality references of a weapon/armour (spec 021, D4/FR-005): its
 * own `{slug, parameter}` references PLUS every component slug those references
 * `confer` (Longarm → Long Range/Slow/Two-Handed/Unwieldy), deduped by slug so a
 * component present directly counts exactly once (references win, keeping their
 * per-instance parameter; conferred refs carry no parameter). ONE SSOT indirection
 * (constitution §II) — every iterator (`collectReferencedQualities`,
 * `weaponRangeBand`, `weaponReminders`, `weaponWieldingFlags`,
 * `weaponHasQualityLever`, and the roll-time lever pass) routes through this
 * instead of raw `item.system.qualities`, so conferral works everywhere without
 * touching per-lever routing. Conferral is one level (a conferred quality's own
 * `confers` is not re-expanded — no seed needs it). Defined HERE (not in
 * cs-effect-modifiers.js) to avoid an eval-time import cycle; re-exported from
 * cs-effect-modifiers.js for the contract location. Pure → Vitest.
 * @param {object} item a weapon/armour Item (its `system.qualities` reference list)
 * @returns {Array<{slug: string, parameter?: string}>}
 */
export function effectiveWeaponQualityRefs(item) {
  const refs = item?.system?.qualities ?? [];
  // Reuse the dedupeQualitiesBySlug Set pattern inline (that helper lives in
  // cs-effect-modifiers.js; importing it here would close an eval-time cycle).
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    const slug = ref?.slug;
    if (!slug || seen.has(slug)) continue; // references win, keep their parameter
    seen.add(slug);
    result.push(ref);
  }
  for (const ref of refs) {
    const confers = qualityBySlug(ref?.slug)?.system?.confers;
    if (!Array.isArray(confers)) continue;
    for (const slug of confers) {
      if (!slug || seen.has(slug)) continue; // conferred refs carry no parameter
      seen.add(slug);
      result.push({ slug });
    }
  }
  return result;
}

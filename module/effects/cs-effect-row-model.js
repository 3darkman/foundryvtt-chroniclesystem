// Pure row-model for the effect authoring cascade (Wave 5). Separated from the
// Foundry sheet (cs-effect-config-sheet.js) so the read/write mapping is a PURE
// module — no Foundry runtime — and is unit-testable in Vitest. The sheet only
// renders these rows and rebuilds `system.changes` from them.
//
//   parseChangeRow(change)  → synthetic cascade row (prefill / read path)
//   buildChangeFromRow(row) → real {key, value, type, phase} change (write path)
//
// Changes the cascade cannot represent (foreign/legacy keys, or a derived value
// form the dropdown omits like @sacrificed) are carried VERBATIM as `isRaw` rows,
// so this default-for-all-effects UI never clobbers data it does not understand.

import {
  EFFECT_CHANNELS,
  TARGET_KINDS,
  DERIVED_STATS,
  WEAPON_QUALITIES,
  buildEffectKey,
  parseEffectKey,
  slugify,
  weaponTypeSlug,
  isRollChannel,
  isWeaponChannel,
  matchWeaponQuality,
  weaponQualityTakesParam,
} from "./cs-effect-vocabulary.js";
import {
  parseValueSpec,
  buildValueString,
  VALUE_FORMS,
} from "./cs-effect-value.js";
import {
  isCanonicalAbilitySlug,
  isCanonicalSpecialtySlug,
} from "../vocabulary/cs-canonical-abilities.js";

/** Sentinel `rollSlug` for the free-text "Custom…" option (homebrew slugs). */
export const ROLL_SLUG_CUSTOM = "__custom__";

/** True when a slug is offered by the canonical roll-target dropdown. */
function isCanonicalRollSlug(slug) {
  return isCanonicalAbilitySlug(slug) || isCanonicalSpecialtySlug(slug);
}

/* --- choice maps (value → i18n key); consumed by the {{selectOptions}} helper --- */

export const CHANNEL_CHOICES = {
  [EFFECT_CHANNELS.RESULT]: "CS.effects.channels.result",
  [EFFECT_CHANNELS.TEST_DICE]: "CS.effects.channels.testdice",
  [EFFECT_CHANNELS.BONUS_DICE]: "CS.effects.channels.bonusdice",
  [EFFECT_CHANNELS.REROLL]: "CS.effects.channels.reroll",
  [EFFECT_CHANNELS.PENALTY]: "CS.effects.channels.penalty",
  [EFFECT_CHANNELS.DERIVED_STAT]: "CS.effects.channels.derivedstat",
  [EFFECT_CHANNELS.ARMOR_RATING]: "CS.effects.channels.armorrating",
  [EFFECT_CHANNELS.DAMAGE]: "CS.effects.channels.damage",
  [EFFECT_CHANNELS.QUALITY]: "CS.effects.channels.quality",
  [EFFECT_CHANNELS.BULK]: "CS.effects.channels.bulk",
};

export const ROLL_TARGETKIND_CHOICES = {
  [TARGET_KINDS.ALL]: "CS.effects.targetKinds.all",
  [TARGET_KINDS.ABILITY]: "CS.effects.targetKinds.ability",
  [TARGET_KINDS.SPECIALTY]: "CS.effects.targetKinds.specialty",
};

export const WEAPON_TARGETKIND_CHOICES = {
  [TARGET_KINDS.WEAPON_ALL]: "CS.effects.targetKinds.weapon",
  [TARGET_KINDS.WEAPON_TYPE]: "CS.effects.targetKinds.weapontype",
};

export const DERIVED_STAT_CHOICES = {
  [DERIVED_STATS.COMBAT_DEFENSE]: "CS.effects.derivedStats.combat_defense",
  [DERIVED_STATS.INTRIGUE_DEFENSE]: "CS.effects.derivedStats.intrigue_defense",
  [DERIVED_STATS.HEALTH]: "CS.effects.derivedStats.health",
  [DERIVED_STATS.COMPOSURE]: "CS.effects.derivedStats.composure",
  [DERIVED_STATS.MOVEMENT]: "CS.effects.derivedStats.movement",
};

export const VALUE_MODE_CHOICES = {
  fixed: "CS.effects.valueModes.fixed",
  derived: "CS.effects.valueModes.derived",
};

// `sacrificed` is a roll-runtime form (design §5) — excluded from authoring.
export const DERIVED_FORM_CHOICES = {
  [VALUE_FORMS.RANK]: "CS.effects.valueForms.rank",
  [VALUE_FORMS.HALF]: "CS.effects.valueForms.half",
  [VALUE_FORMS.BONUS_DICE]: "CS.effects.valueForms.bonusdice",
};

/** Derived value forms the cascade can author (the dropdown options). */
const AUTHORABLE_FORMS = new Set(Object.keys(DERIVED_FORM_CHOICES));

/** Sentinel `qualityKind` for the free-text "Other…" option (off-list qualities). */
export const QUALITY_OTHER = "__other__";

/** Default quality preselected on a fresh quality row (first canonical entry). */
const DEFAULT_QUALITY = WEAPON_QUALITIES[0]?.name ?? "";

/* ------------------------------ row model ------------------------------ */

/** Attach the boolean visibility flags the template reads from a parsed row. */
function withRowFlags(row) {
  const isRoll = isRollChannel(row.channel);
  const isWeapon = isWeaponChannel(row.channel);
  const isQuality = row.channel === EFFECT_CHANNELS.QUALITY;
  return {
    ...row,
    isRoll,
    isDerivedStat: row.channel === EFFECT_CHANNELS.DERIVED_STAT,
    isArmorRating: row.channel === EFFECT_CHANNELS.ARMOR_RATING,
    isBulk: row.channel === EFFECT_CHANNELS.BULK,
    isWeapon,
    isQuality,
    showRollSlug:
      isRoll &&
      (row.rollTargetKind === TARGET_KINDS.ABILITY ||
        row.rollTargetKind === TARGET_KINDS.SPECIALTY),
    showRollSlugCustom:
      isRoll &&
      (row.rollTargetKind === TARGET_KINDS.ABILITY ||
        row.rollTargetKind === TARGET_KINDS.SPECIALTY) &&
      row.rollSlug === ROLL_SLUG_CUSTOM,
    showWeaponSlug:
      isWeapon && row.weaponTargetKind === TARGET_KINDS.WEAPON_TYPE,
    valueIsFixed: !isQuality && row.valueMode === "fixed",
    valueIsDerived: !isQuality && row.valueMode === "derived",
    qualityIsOther: isQuality && row.qualityKind === QUALITY_OTHER,
    qualityTakesParam:
      isQuality &&
      row.qualityKind !== QUALITY_OTHER &&
      weaponQualityTakesParam(row.qualityKind),
  };
}

/**
 * True when a stored change cannot be represented by the cascade and must be
 * preserved VERBATIM (so this default-for-all-effects sheet is non-destructive):
 *   - a NON-EMPTY key outside the cs.* grammar (foreign/legacy/raw-field key);
 *   - a value whose derived form the dropdown omits (e.g. @sacrificed).
 * An empty key is a fresh/incomplete row → a normal (editable) cascade row.
 */
export function isUnrepresentable(change) {
  const key = change?.key ?? "";
  const parsed = parseEffectKey(key);
  if (key.trim() !== "" && !parsed) return true;
  if (parsed && parsed.channel !== EFFECT_CHANNELS.QUALITY) {
    const spec = parseValueSpec(change?.value);
    if (spec?.mode === "derived" && !AUTHORABLE_FORMS.has(spec.form))
      return true;
  }
  return false;
}

/** Parse one stored change into the synthetic cascade row (prefill / read path). */
export function parseChangeRow(change, index) {
  if (isUnrepresentable(change)) {
    return {
      index,
      isRaw: true,
      rawKey: change?.key ?? "",
      rawValue: change?.value ?? "",
      rawType: change?.type ?? "add",
      rawPhase: change?.phase ?? "initial",
    };
  }

  const parsed = parseEffectKey(change?.key);
  const channel = parsed?.channel ?? EFFECT_CHANNELS.RESULT;
  const row = {
    index,
    channel,
    rollTargetKind: TARGET_KINDS.ALL,
    rollSlug: "",
    rollSlugCustom: "",
    statTarget: DERIVED_STATS.COMBAT_DEFENSE,
    weaponTargetKind: TARGET_KINDS.WEAPON_ALL,
    weaponSlug: "",
    valueMode: "fixed",
    fixedValue: 0,
    derivedForm: VALUE_FORMS.RANK,
    derivedSlug: "",
    qualityKind: DEFAULT_QUALITY,
    qualityParam: "",
    qualityCustom: "",
  };

  if (isRollChannel(channel)) {
    row.rollTargetKind = parsed?.targetKind ?? TARGET_KINDS.ALL;
    const target = parsed?.target ?? "";
    // A canonical slug preselects the dropdown; anything else falls to "Custom…"
    // with the raw slug in the free-text field (homebrew, FR-005).
    if (target && isCanonicalRollSlug(target)) {
      row.rollSlug = target;
      row.rollSlugCustom = "";
    } else {
      row.rollSlug = target ? ROLL_SLUG_CUSTOM : "";
      row.rollSlugCustom = target;
    }
  } else if (channel === EFFECT_CHANNELS.DERIVED_STAT) {
    row.statTarget = parsed?.target ?? DERIVED_STATS.COMBAT_DEFENSE;
  } else if (isWeaponChannel(channel)) {
    row.weaponTargetKind = parsed?.targetKind ?? TARGET_KINDS.WEAPON_ALL;
    row.weaponSlug = parsed?.target ?? "";
  }

  if (channel === EFFECT_CHANNELS.QUALITY) {
    // Quality value is a raw NAME (never through parseValueSpec). Split it into a
    // canonical dropdown pick + parameter, falling back to free-text "Other…".
    const match = matchWeaponQuality(change?.value);
    if (match) {
      row.qualityKind = match.name;
      row.qualityParam = match.param;
    } else if ((change?.value ?? "") !== "") {
      row.qualityKind = QUALITY_OTHER;
      row.qualityCustom = change.value;
    }
  } else {
    const spec = parseValueSpec(change?.value);
    if (spec?.mode === "derived") {
      row.valueMode = "derived";
      row.derivedForm = spec.form;
      row.derivedSlug = spec.slug ?? "";
    } else {
      row.valueMode = "fixed";
      row.fixedValue = spec?.mode === "fixed" ? spec.value : 0;
    }
  }
  return withRowFlags(row);
}

/** Rebuild a real `{key, value, type, phase}` change from a synthetic row (write path). */
export function buildChangeFromRow(row) {
  // Verbatim rows (foreign/legacy keys, @sacrificed) are re-emitted unchanged.
  if (row && row.rawKey !== undefined) {
    return {
      key: row.rawKey ?? "",
      value: row.rawValue ?? "",
      type: row.rawType || "add",
      phase: row.rawPhase || "initial",
    };
  }

  const channel = row?.channel ?? EFFECT_CHANNELS.RESULT;
  let key = "";
  if (isRollChannel(channel)) {
    const targetKind = row.rollTargetKind || TARGET_KINDS.ALL;
    // The dropdown value is a canonical slug; "Custom…" defers to the free text.
    const rawSlug =
      row.rollSlug === ROLL_SLUG_CUSTOM ? row.rollSlugCustom : row.rollSlug;
    const target = targetKind === TARGET_KINDS.ALL ? null : slugify(rawSlug);
    key = buildEffectKey({ channel, targetKind, target });
  } else if (channel === EFFECT_CHANNELS.DERIVED_STAT) {
    key = buildEffectKey({
      channel,
      targetKind: TARGET_KINDS.STAT,
      target: row.statTarget,
    });
  } else if (channel === EFFECT_CHANNELS.ARMOR_RATING) {
    key = buildEffectKey({ channel, targetKind: TARGET_KINDS.SELF });
  } else if (channel === EFFECT_CHANNELS.BULK) {
    key = buildEffectKey({ channel, targetKind: TARGET_KINDS.ALL });
  } else if (isWeaponChannel(channel)) {
    const targetKind = row.weaponTargetKind || TARGET_KINDS.WEAPON_ALL;
    const target =
      targetKind === TARGET_KINDS.WEAPON_TYPE
        ? weaponTypeSlug(row.weaponSlug)
        : null;
    key = buildEffectKey({ channel, targetKind, target });
  }

  let value;
  if (channel === EFFECT_CHANNELS.QUALITY) {
    if (row.qualityKind === QUALITY_OTHER) {
      value = String(row.qualityCustom ?? "").trim();
    } else {
      const name = String(row.qualityKind ?? "").trim();
      const param = String(row.qualityParam ?? "").trim();
      value = param ? `${name} ${param}` : name;
    }
  } else if (row.valueMode === "derived") {
    value = buildValueString({
      mode: "derived",
      form: row.derivedForm,
      slug: slugify(row.derivedSlug),
    });
  } else {
    value = buildValueString({ mode: "fixed", value: row.fixedValue });
  }

  return { key, value, type: "add", phase: "initial" };
}

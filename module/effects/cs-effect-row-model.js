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
import {
  INTRIGUE_TECHNIQUES,
  techniqueChoices,
} from "../vocabulary/cs-intrigue-techniques.js";

/** Sentinel `rollSlug` for the free-text "Custom…" option (homebrew slugs). */
export const ROLL_SLUG_CUSTOM = "__custom__";

/**
 * Authoring-only pseudo-channel for the disposition delta (US4). The real key
 * rides the `result` channel (`cs.result.disposition.<facet>`), but the cascade
 * presents "Disposition" as its own Type so the facet subselect is discoverable.
 */
export const DISPOSITION_CHANNEL = "disposition";

/** Default technique preselected on a fresh "one technique" influence row. */
const DEFAULT_TECHNIQUE = INTRIGUE_TECHNIQUES[0]?.slug ?? "";

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
  // spec 023 — the whole all/ability/specialty cascade, the canonical slug
  // dropdown, "Custom…" and the fixed/derived value modes are inherited from
  // `isRollChannel`, so no parse/build branch is needed (FR-030/031/037).
  [EFFECT_CHANNELS.PASSIVE]: "CS.effects.channels.passive",
  [EFFECT_CHANNELS.DERIVED_STAT]: "CS.effects.channels.derivedstat",
  [EFFECT_CHANNELS.ARMOR_RATING]: "CS.effects.channels.armorrating",
  [EFFECT_CHANNELS.DAMAGE]: "CS.effects.channels.damage",
  [EFFECT_CHANNELS.QUALITY]: "CS.effects.channels.quality",
  [EFFECT_CHANNELS.BULK]: "CS.effects.channels.bulk",
  [DISPOSITION_CHANNEL]: "CS.effects.channels.disposition",
  [EFFECT_CHANNELS.INFLUENCE]: "CS.effects.channels.influence",
};

/** Disposition facet subselect (US4): which side of disposition the delta hits. */
export const DISPOSITION_FACET_CHOICES = {
  persuasion: "CS.effects.authoring.dispositionPersuasion",
  deception: "CS.effects.authoring.dispositionDeception",
  both: "CS.effects.authoring.dispositionBoth",
};

/** Influence scope subselect (US4): all techniques vs a single one. */
export const INFLUENCE_SCOPE_CHOICES = {
  all: "CS.effects.authoring.influenceAll",
  one: "CS.effects.authoring.influenceOne",
};

/** Technique subselect (US4): the canonical techniques, one localized name each. */
export const TECHNIQUE_CHOICES = Object.fromEntries(
  techniqueChoices().map((choice) => [choice.value, choice.labelKey])
);

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
  const isDisposition = row.channel === DISPOSITION_CHANNEL;
  const isInfluence = row.channel === EFFECT_CHANNELS.INFLUENCE;
  return {
    ...row,
    isRoll,
    isDerivedStat: row.channel === EFFECT_CHANNELS.DERIVED_STAT,
    isArmorRating: row.channel === EFFECT_CHANNELS.ARMOR_RATING,
    isBulk: row.channel === EFFECT_CHANNELS.BULK,
    isWeapon,
    isQuality,
    isDisposition,
    isInfluence,
    showInfluenceTechnique: isInfluence && row.influenceScope === "one",
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
  // Disposition rides the `result` channel but is authored as its OWN pseudo-
  // channel (US4), so the facet subselect surfaces instead of the roll target.
  const isDisposition = parsed?.targetKind === TARGET_KINDS.DISPOSITION;
  const channel = isDisposition
    ? DISPOSITION_CHANNEL
    : parsed?.channel ?? EFFECT_CHANNELS.RESULT;
  const row = {
    index,
    channel,
    rollTargetKind: TARGET_KINDS.ALL,
    rollSlug: "",
    rollSlugCustom: "",
    statTarget: DERIVED_STATS.COMBAT_DEFENSE,
    weaponTargetKind: TARGET_KINDS.WEAPON_ALL,
    weaponSlug: "",
    dispositionFacet: "persuasion",
    influenceScope: "all",
    influenceTechnique: DEFAULT_TECHNIQUE,
    valueMode: "fixed",
    fixedValue: 0,
    derivedForm: VALUE_FORMS.RANK,
    derivedSlug: "",
    qualityKind: DEFAULT_QUALITY,
    qualityParam: "",
    qualityCustom: "",
  };

  if (isDisposition) {
    row.dispositionFacet = parsed?.target ?? "persuasion";
  } else if (channel === EFFECT_CHANNELS.INFLUENCE) {
    row.influenceScope = parsed?.target ? "one" : "all";
    row.influenceTechnique = parsed?.target ?? DEFAULT_TECHNIQUE;
  } else if (isRollChannel(channel)) {
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
  if (channel === DISPOSITION_CHANNEL) {
    key = buildEffectKey({
      channel: EFFECT_CHANNELS.RESULT,
      targetKind: TARGET_KINDS.DISPOSITION,
      target: row.dispositionFacet,
    });
  } else if (channel === EFFECT_CHANNELS.INFLUENCE) {
    const target = row.influenceScope === "one" ? row.influenceTechnique : null;
    key = buildEffectKey({
      channel: EFFECT_CHANNELS.INFLUENCE,
      targetKind: TARGET_KINDS.INFLUENCE,
      target,
    });
  } else if (isRollChannel(channel)) {
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

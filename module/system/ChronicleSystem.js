import { DiceRollFormula } from "../diceRollFormula.js";
import { Disposition } from "../disposition.js";
import LOGGER from "../utils/logger.js";
import { CSRoll } from "../rolls/cs-roll.js";
import { CSConstants } from "./csConstants.js";
import SystemUtils from "../utils/systemUtils.js";
import { slugify } from "../effects/cs-slugify.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";

export const ChronicleSystem = {};

window.ChronicleSystem = ChronicleSystem;

ChronicleSystem.LastActor = null;

ChronicleSystem.SetLastActor = function (actor) {
  if (actor !== ChronicleSystem.LastActor)
    LOGGER.debug(`Setting Last Actor: ${actor?.name}`);
  ChronicleSystem.LastActor = actor;
};

ChronicleSystem.ClearLastActor = function (actor) {
  if (ChronicleSystem.LastActor === actor) {
    LOGGER.debug(`Clearing Last Actor: ${ChronicleSystem.LastActor?.name}`);
    ChronicleSystem.LastActor = null;
    ChronicleSystem.LastActorName = null;
    const tokens = canvas.tokens;
    if (tokens && tokens.controlled.length > 0) {
      ChronicleSystem.SetLastActor(tokens.controlled[0].actor);
    } // There may still be tokens selected... if so, select one of them
  }
};

function escapeUnicode(str) {
  return str.replace(/[^\0-~]/g, function (ch) {
    return (
      "&#x" +
      ("0000" + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4) +
      ";"
    );
  });
}

function trim(s) {
  return s.replace(/^\s*$(?:\r\n?|\n)/gm, "").trim(); // /^\s*[\r\n]/gm
}

ChronicleSystem.trim = trim;
ChronicleSystem.escapeUnicode = escapeUnicode;

async function eventHandleRoll(event, actor) {
  event.preventDefault();
  let showModifierDialog = false;
  if (event.shiftKey) {
    showModifierDialog = true;
  }
  const rollType = event.currentTarget.id;
  await ChronicleSystem.handleRollAsync(rollType, actor, showModifierDialog);
}

function _getFormula(roll_definition, actor) {
  let formula = new DiceRollFormula();

  switch (roll_definition[0]) {
    case "ability":
      formula = ChronicleSystem.getActorAbilityFormula(
        actor,
        roll_definition[1]
      );
      break;
    case "specialty":
      formula = ChronicleSystem.getActorAbilityFormula(
        actor,
        roll_definition[2],
        roll_definition[1]
      );
      break;
    case "weapon-test":
      formula = DiceRollFormula.fromStr(roll_definition[2]);
      break;
    case "persuasion":
    case "deception":
    case "formula":
      formula = DiceRollFormula.fromStr(roll_definition[2]);
      break;
  }

  return formula;
}

/**
 * Resolve the ability/specialty a roll targets so the dialog can offer the
 * matching optional effects. Only ability/specialty rolls carry that context;
 * the formula-string rolls (weapon-test, persuasion, deception, formula) resolve
 * to nulls, so only ALL-targeted optional effects apply to them (design §4 MVP).
 * @param {string[]} roll_definition
 * @returns {{abilityName: string|null, specialtyName: string|null}}
 */
function _resolveRollTarget(roll_definition) {
  switch (roll_definition[0]) {
    case "ability":
      return { abilityName: roll_definition[1], specialtyName: null };
    case "specialty":
      return {
        abilityName: roll_definition[2],
        specialtyName: roll_definition[1],
      };
    default:
      return { abilityName: null, specialtyName: null };
  }
}

/**
 * Add the dialog's checked optional effects to the formula. Each checkbox is a
 * `DiceRollFormula` lever (`data-field`) and a resolved value (`data-value`);
 * `formula[field] += value` is safe because every formula accessor parses ints.
 * @param {HTMLFormElement} form
 * @param {DiceRollFormula} formula
 */
/** Formula fields measured in DICE (as opposed to a flat result modifier). Their
 *  roll-dialog display gets a "d" suffix so a +2 dice bonus reads "+2d", while a
 *  flat result modifier stays "+2". Re-roll is a threshold, not a die count. */
const DICE_FORMULA_FIELDS = new Set(["pool", "bonusDice", "dicePenalty"]);

function _applyCheckedOptionalEffects(form, formula) {
  if (!form?.querySelectorAll) return false;
  // Only ENABLED, checked toggles are applied here. The always-on itemized rows
  // are display-only (no checkbox), so they can never be re-applied here — the
  // effective formula already embeds them (SC-001).
  const checked = form.querySelectorAll(
    ".cs-optional-effect input[type=checkbox]:checked:not([disabled])"
  );
  let applied = false;
  checked.forEach((checkbox) => {
    const field = checkbox.dataset.field;
    const value = parseInt(checkbox.dataset.value);
    if (!field || Number.isNaN(value)) return;
    formula[field] += value;
    applied = true;
  });
  return applied;
}

/**
 * Add the dialog's user-EXTRA fields to the formula (marked as user changes,
 * FR-009). Each extra is a small signed number the player types on top of the
 * always-on base. @returns {boolean} whether any non-zero extra was applied.
 */
function _applyUserExtras(form, formula) {
  let changed = false;
  const apply = (name, field) => {
    const value = parseInt(form?.[name]?.value);
    if (!Number.isNaN(value) && value !== 0) {
      formula[field] += value;
      changed = true;
    }
  };
  apply("extraPool", "pool");
  apply("extraBonusDice", "bonusDice");
  apply("extraModifier", "modifier");
  apply("extraDicePenalty", "dicePenalty");
  apply("extraReRoll", "reRoll");
  return changed;
}

/**
 * The dialog's read-only BASE formula (US2): the raw trait capacity for
 * ability/specialty rolls; for formula-string rolls, derived by subtracting the
 * itemized always-on from the effective formula so `base + Σ itemized` always
 * equals the effective formula we roll from (SC-001).
 */
function _rawFormulaForDialog(
  actor,
  effectiveFormula,
  abilityName,
  specialtyName,
  itemized
) {
  if (abilityName)
    return getActorRawTestFormula(actor, abilityName, specialtyName);
  const raw = new DiceRollFormula();
  raw.pool = effectiveFormula.pool;
  raw.bonusDice = effectiveFormula.bonusDice;
  raw.modifier = effectiveFormula.modifier;
  raw.dicePenalty = effectiveFormula.dicePenalty;
  raw.reRoll = effectiveFormula.reRoll ?? 0;
  for (const item of itemized) raw[item.field] -= item.value;
  return raw;
}

/** Resolve the difficulty descriptor at `index` in the sanitized table, or null
 *  (free roll). Label is the GM literal when set, else the canonical i18n key. */
function _difficultyAt(table, index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= table.entries.length) return null;
  const entry = table.entries[i];
  return {
    target: entry.target,
    label: entry.label ?? null,
    labelKey: entry.label ? null : entry.labelKey,
  };
}

function handleRoll(rollType, actor) {
  const roll_definition = rollType.split(":");
  if (roll_definition.length < 2) return;

  const formula = _getFormula(roll_definition, actor);

  let csRoll = new CSRoll(roll_definition[1], formula);
  return csRoll.doRoll(actor, false);
}

async function _showModifierDialog(context) {
  const template = CSConstants.Templates.Dialogs.ROLL_MODIFIER;
  const html = await foundry.applications.handlebars.renderTemplate(
    template,
    context
  );

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: SystemUtils.localize("CS.dialogs.rollModifier.title"),
    },
    content: html,
    buttons: [
      {
        action: "confirm",
        label: SystemUtils.localize("CS.dialogs.actions.confirm"),
        icon: "fas fa-check",
        default: true,
        callback: (event, button) => button.form,
      },
      {
        action: "cancel",
        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
        icon: "fas fa-times",
      },
    ],
    rejectClose: false,
  });
}

async function handleRollAsync(rollType, actor, showModifierDialog = false) {
  const roll_definition = rollType.split(":");
  if (roll_definition.length < 2) return;
  let formula = _getFormula(roll_definition, actor); // effective = base + always-on

  // Difficulty table (US3): drives the dialog selector and the quick-roll default
  // (defaultIndex). cs-difficulty imports only csConstants — no eval-time cycle.
  const { readDifficultyTable, entryLabel } = await import(
    "../difficulty/cs-difficulty.js"
  );
  const difficultyTable = readDifficultyTable();
  let difficulty = _difficultyAt(difficultyTable, difficultyTable.defaultIndex);

  const revertModifierDialog = game.settings.get(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.MODIFIER_DIALOG_AS_DEFAULT
  );

  if (showModifierDialog ? !revertModifierDialog : revertModifierDialog) {
    // Lazy import: a static one would close the eval-time cycle
    // ChronicleSystem → cs-effect-modifiers → cs-effect-vocabulary →
    // ChronicleSystem (vocabulary reads modifiersConstants at module-eval time).
    const { collectOptionalRollEffects, collectItemizedAlwaysOn } =
      await import("../effects/cs-effect-modifiers.js");
    const { abilityName, specialtyName } = _resolveRollTarget(roll_definition);

    const signed = (v) => (v >= 0 ? `+${v}` : `${v}`);
    const withUnit = (v, field) =>
      `${signed(v)}${DICE_FORMULA_FIELDS.has(field) ? "d" : ""}`;
    const withDisplayValue = (effect) => ({
      ...effect,
      displayValue: withUnit(effect.value, effect.formulaField),
    });
    const withItemDisplay = (item) => ({
      ...item,
      displayValue: withUnit(item.value, item.field),
      originLabel: SystemUtils.localize(
        `CS.dialogs.rollModifier.origin.${item.origin}`
      ),
    });

    // US2: itemize every always-on source (labeled by origin); show the RAW base
    // read-only. `base + Σ itemized` equals the effective formula we roll from.
    const itemizedAlwaysOn = collectItemizedAlwaysOn(
      actor,
      abilityName,
      specialtyName
    ).map(withItemDisplay);
    const base = _rawFormulaForDialog(
      actor,
      formula,
      abilityName,
      specialtyName,
      itemizedAlwaysOn
    );
    const optionalEffects = collectOptionalRollEffects(
      actor,
      abilityName,
      specialtyName
    ).map(withDisplayValue);
    const difficultyOptions = difficultyTable.entries.map((entry, index) => ({
      index,
      label: entryLabel(entry, SystemUtils.localize),
      selected: index === difficultyTable.defaultIndex,
    }));

    const formData = await _showModifierDialog({
      base,
      itemizedAlwaysOn,
      optionalEffects,
      difficultyOptions,
      noneSelected: difficultyTable.defaultIndex < 0,
    });
    if (!formData) return null;

    // Roll from the EFFECTIVE formula (= base + itemized), then add the checked
    // optional effects (default off) and the user's extras.
    const rolled = new DiceRollFormula();
    rolled.pool = formula.pool;
    rolled.bonusDice = formula.bonusDice;
    rolled.modifier = formula.modifier;
    rolled.dicePenalty = formula.dicePenalty;
    rolled.reRoll = formula.reRoll ?? 0;
    const optionalApplied = _applyCheckedOptionalEffects(formData, rolled);
    const extrasApplied = _applyUserExtras(formData, rolled);
    rolled.isUserChanged = optionalApplied || extrasApplied;
    formula = rolled;

    difficulty = _difficultyAt(
      difficultyTable,
      formData.difficultyIndex?.value ?? difficultyTable.defaultIndex
    );
  }

  let csRoll = new CSRoll(roll_definition[1], formula, difficulty);
  return await csRoll.doRoll(actor, true);
}

function adjustFormulaByWeapon(actor, formula, weapon) {
  let weaponData = weapon.system;
  if (!weaponData.training) return formula;
  let poolModifier = formula.bonusDice - weaponData.training;

  if (poolModifier <= 0) {
    formula.pool += poolModifier;
    formula.bonusDice = 0;
  } else {
    formula.bonusDice = poolModifier;
  }

  return formula;
}

/**
 * Resolve a rolled ability/specialty to its base capacity — the SSOT shared by
 * both the effective ({@link getActorTestFormula}) and RAW
 * ({@link getActorRawTestFormula}) formula builders (US2). Returns the stable
 * slugs (for channel matching) plus the trait's own base pool/modifier and the
 * specialty's rating/modifier — WITHOUT any effect channel.
 * @returns {{abilityKey: string, specialtyKey: string|null, basePool: number,
 *   baseModifier: number, specValue: number, specModifier: number}}
 */
function resolveTraitBase(actor, abilityName, specialtyName = null) {
  console.assert(actor, "actor is invalid!");
  console.assert(abilityName, "ability name is invalid!");
  let ability;
  let specialty;
  // Resolve by display NAME first (roll buttons carry the current name), then
  // fall back to the STABLE slug (initiative constants and renamed abilities
  // pass a slug). The slug resolvers are optional-chained so the pure-logic test
  // doubles (which omit them) keep the legacy name-only resolution.
  if (specialtyName === null) {
    [ability, specialty] = actor.getAbility(abilityName);
    if (!ability && actor.getAbilityBySlug)
      [ability, specialty] = actor.getAbilityBySlug(abilityName);
  } else {
    [ability, specialty] = actor.getAbilityBySpecialty(
      abilityName,
      specialtyName
    );
    if (ability === undefined && actor.getAbilityBySpecialtySlug)
      [ability, specialty] = actor.getAbilityBySpecialtySlug(specialtyName);
    if (ability === undefined) {
      [ability, specialty] = actor.getAbility(abilityName);
      if (!ability && actor.getAbilityBySlug)
        [ability, specialty] = actor.getAbilityBySlug(abilityName);
    }
  }
  let specValue = 0;
  let specModifier = 0;
  if (specialty !== undefined && specialty !== null) {
    specValue = specialty.rating ? specialty.rating : 0;
    specModifier = specialty.modifier ? specialty.modifier : 0;
  }

  const abilityData = ability?.getCSData?.() ?? ability?.system;
  const abilityKey = abilityData?.slug || slugify(ability?.name ?? abilityName);
  const specialtyKey =
    specialty != null
      ? specialty.slug || scopedSpecialtySlug(abilityKey, specialty.name)
      : null;
  const basePool = ability ? ability.getCSData().rating : 2;
  const baseModifier = ability ? ability.getCSData().modifier : 0;

  return {
    abilityKey,
    specialtyKey,
    basePool,
    baseModifier,
    specValue,
    specModifier,
  };
}

function getActorTestFormula(actor, abilityName, specialtyName = null) {
  const {
    abilityKey,
    specialtyKey,
    basePool,
    baseModifier,
    specValue,
    specModifier,
  } = resolveTraitBase(actor, abilityName, specialtyName);

  // Sum an effect channel across the targeted ability (including the global ALL
  // bucket) and the targeted specialty (excluding ALL, to avoid double-counting
  // it). Buffers are keyed by STABLE SLUG (spec 008) — the same identity the
  // fixed sources (armour/conditions) and authored effects push by — so the
  // math survives a rename to any language. The new-channel getters are
  // optional-chained so non-character actors (and the doubles) contribute 0.
  const channelTotal = (getter) => {
    const fromAbility = actor[getter]?.(abilityKey, false, true)?.total ?? 0;
    const fromSpecialty = specialtyKey
      ? actor[getter]?.(specialtyKey, false, false)?.total ?? 0
      : 0;
    return fromAbility + fromSpecialty;
  };

  const formula = new DiceRollFormula();
  formula.pool = basePool + channelTotal("getTestDice");
  formula.dicePenalty = channelTotal("getPenalty");
  formula.modifier = baseModifier + specModifier + channelTotal("getModifier");
  formula.bonusDice = specValue + channelTotal("getBonusDice");
  formula.reRoll = channelTotal("getReRoll");

  return formula;
}

/**
 * The RAW test formula (US2): the trait's own capacity ONLY — no effect channels
 * — so the roll dialog can show the true base read-only and itemize every
 * always-on source separately (the itemized entries sum back to the effective
 * formula, SC-001). NEVER regresses content without effects (FR-032/SC-009).
 * @returns {DiceRollFormula}
 */
function getActorRawTestFormula(actor, abilityName, specialtyName = null) {
  const { basePool, baseModifier, specValue, specModifier } = resolveTraitBase(
    actor,
    abilityName,
    specialtyName
  );
  const formula = new DiceRollFormula();
  formula.pool = basePool;
  formula.dicePenalty = 0;
  formula.modifier = baseModifier + specModifier;
  formula.bonusDice = specValue;
  formula.reRoll = 0;
  return formula;
}

ChronicleSystem.adjustFormulaByWeapon = adjustFormulaByWeapon;
ChronicleSystem.eventHandleRoll = eventHandleRoll;
ChronicleSystem.handleRoll = handleRoll;
ChronicleSystem.handleRollAsync = handleRollAsync;
ChronicleSystem.getActorAbilityFormula = getActorTestFormula;
ChronicleSystem.getActorRawTestFormula = getActorRawTestFormula;

ChronicleSystem.dispositions = [
  new Disposition("CS.sheets.character.dispositions.affectionate", 1, -2, 5),
  new Disposition("CS.sheets.character.dispositions.friendly", 2, -1, 3),
  new Disposition("CS.sheets.character.dispositions.amiable", 3, 0, 1),
  new Disposition("CS.sheets.character.dispositions.indifferent", 4, 0, 0),
  new Disposition("CS.sheets.character.dispositions.dislike", 5, 1, -2),
  new Disposition("CS.sheets.character.dispositions.unfriendly", 6, 2, -4),
  new Disposition("CS.sheets.character.dispositions.malicious", 7, 3, -6),
];

ChronicleSystem.equippedConstants = {
  IS_NOT_EQUIPPED: 0,
  WEARING: 1,
  MAIN_HAND: 2,
  OFFHAND: 3,
  BOTH_HANDS: 4,
};

ChronicleSystem.defaultMovement = 4;

ChronicleSystem.modifiersConstants = {
  ALL: "all",
  PENALTY: "penalty",

  AGILITY: "agility",
  AWARENESS: "awareness",
  CUNNING: "cunning",
  DECEPTION: "deception",
  PERSUASION: "persuasion",
  STATUS: "status",

  BULK: "bulk",
  DAMAGE_TAKEN: "damage_taken",
  COMBAT_DEFENSE: "combat_defense",
};

ChronicleSystem.keyConstants = {
  AGILITY: "CS.constants.abilities.agility",
  ATHLETICS: "CS.constants.abilities.athletics",
  AWARENESS: "CS.constants.abilities.awareness",
  CUNNING: "CS.constants.abilities.cunning",
  DECEPTION: "CS.constants.abilities.deception",
  PERSUASION: "CS.constants.abilities.persuasion",
  ENDURANCE: "CS.constants.abilities.endurance",
  STATUS: "CS.constants.abilities.status",
  WILL: "CS.constants.abilities.will",

  RUN: "CS.constants.specialties.run",
  BLUFF: "CS.constants.specialties.bluff",
  ACT: "CS.constants.specialties.act",
  BARGAIN: "CS.constants.specialties.bargain",
  CHARM: "CS.constants.specialties.charm",
  CONVINCE: "CS.constants.specialties.convince",
  INCITE: "CS.constants.specialties.incite",
  INTIMIDATE: "CS.constants.specialties.intimidate",
  SEDUCE: "CS.constants.specialties.seduce",
  TAUNT: "CS.constants.specialties.taunt",
  STEWARDSHIP: "CS.constants.specialties.stewardship",

  BULK: "CS.constants.qualities.bulk",

  WOUNDS: "CS.constants.others.wounds",
  INJURY: "CS.constants.others.injuries",
  FRUSTRATION: "CS.constants.others.frustrations",
  STRESS: "CS.constants.others.stress",
  FATIGUE: "CS.constants.others.fatigue",
};

ChronicleSystem.lawModifiers = [
  { min: 0, mod: -20 },
  { min: 1, mod: -10 },
  { min: 11, mod: -5 },
  { min: 21, mod: -2 },
  { min: 31, mod: -1 },
  { min: 41, mod: 0 },
  { min: 51, mod: 1 },
  { min: 61, mod: 2 },
  { min: 71, mod: 5 },
];

ChronicleSystem.populationModifiers = [
  { min: 0, mod: -10 },
  { min: 1, mod: -5 },
  { min: 11, mod: 0 },
  { min: 21, mod: 1 },
  { min: 31, mod: 3 },
  { min: 41, mod: 1 },
  { min: 51, mod: 0 },
  { min: 61, mod: -5 },
  { min: 71, mod: -10 },
];

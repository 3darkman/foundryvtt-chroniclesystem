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
  if (!form?.querySelectorAll) return;
  // Only ENABLED, checked toggles are applied here. The permanent "active
  // effects" render as disabled+checked (visual only) and already entered the
  // formula via the read-side buffer, so `:not([disabled])` prevents a double count.
  const checked = form.querySelectorAll(
    ".cs-optional-effect input[type=checkbox]:checked:not([disabled])"
  );
  checked.forEach((checkbox) => {
    const field = checkbox.dataset.field;
    const value = parseInt(checkbox.dataset.value);
    if (!field || Number.isNaN(value)) return;
    formula[field] += value;
  });
}

function handleRoll(rollType, actor) {
  const roll_definition = rollType.split(":");
  if (roll_definition.length < 2) return;

  const formula = _getFormula(roll_definition, actor);

  let csRoll = new CSRoll(roll_definition[1], formula);
  return csRoll.doRoll(actor, false);
}

async function _showModifierDialog(
  formula,
  optionalEffects = [],
  activeEffects = []
) {
  const template = CSConstants.Templates.Dialogs.ROLL_MODIFIER;
  const html = await foundry.applications.handlebars.renderTemplate(template, {
    formula: formula,
    optionalEffects: optionalEffects,
    activeEffects: activeEffects,
  });

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
  let formula = _getFormula(roll_definition, actor);

  const revertModifierDialog = game.settings.get(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.MODIFIER_DIALOG_AS_DEFAULT
  );

  if (showModifierDialog ? !revertModifierDialog : revertModifierDialog) {
    // Lazy import: a static one would close the eval-time cycle
    // ChronicleSystem → cs-effect-modifiers → cs-effect-vocabulary →
    // ChronicleSystem (vocabulary reads modifiersConstants at module-eval time).
    const { collectOptionalRollEffects, collectPermanentRollEffects } =
      await import("../effects/cs-effect-modifiers.js");
    const { abilityName, specialtyName } = _resolveRollTarget(roll_definition);
    const withDisplayValue = (effect) => {
      const sign = effect.value >= 0 ? `+${effect.value}` : `${effect.value}`;
      const unit = DICE_FORMULA_FIELDS.has(effect.formulaField) ? "d" : "";
      return { ...effect, displayValue: `${sign}${unit}` };
    };
    const optionalEffects = collectOptionalRollEffects(
      actor,
      abilityName,
      specialtyName
    ).map(withDisplayValue);
    // Permanent roll effects already entered the formula via the read-side buffer;
    // surface them as LOCKED (disabled+checked) rows so the player sees the source.
    const activeEffects = collectPermanentRollEffects(
      actor,
      abilityName,
      specialtyName
    ).map(withDisplayValue);

    let formData = await _showModifierDialog(
      formula,
      optionalEffects,
      activeEffects
    );
    if (formData) {
      const formulaChanged = new DiceRollFormula();
      formulaChanged.pool = formData.pool.value;
      formulaChanged.bonusDice = formData.bonusDice.value;
      formulaChanged.reRoll = formData.reRoll.value;
      formulaChanged.modifier = formData.modifier.value;
      formulaChanged.dicePenalty = formData.dicePenalty.value;

      // Permanent effects already entered the formula via the read-side buffer;
      // the checked optional effects are added here (default off). No double
      // counting — permanent effects are never optional (design §4).
      _applyCheckedOptionalEffects(formData, formulaChanged);

      if (formulaChanged.toStr() !== formula.toStr()) {
        formulaChanged.isUserChanged = true;
        formula = formulaChanged;
      }
    } else {
      return null;
    }
  }

  let csRoll = new CSRoll(roll_definition[1], formula);
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

function getActorTestFormula(actor, abilityName, specialtyName = null) {
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

  // Sum an effect channel across the targeted ability (including the global ALL
  // bucket) and the targeted specialty (excluding ALL, to avoid double-counting
  // it). Buffers are keyed by STABLE SLUG (spec 008) — the same identity the
  // fixed sources (armour/conditions) and authored effects push by — so the
  // math survives a rename to any language. The new-channel getters are
  // optional-chained so non-character actors (and the doubles) contribute 0.
  const abilityData = ability?.getCSData?.() ?? ability?.system;
  const abilityKey = abilityData?.slug || slugify(ability?.name ?? abilityName);
  const specialtyKey =
    specialty != null
      ? specialty.slug || scopedSpecialtySlug(abilityKey, specialty.name)
      : null;
  const channelTotal = (getter) => {
    const fromAbility = actor[getter]?.(abilityKey, false, true)?.total ?? 0;
    const fromSpecialty = specialtyKey
      ? actor[getter]?.(specialtyKey, false, false)?.total ?? 0
      : 0;
    return fromAbility + fromSpecialty;
  };

  const formula = new DiceRollFormula();
  const basePool = ability ? ability.getCSData().rating : 2;
  const baseModifier = ability ? ability.getCSData().modifier : 0;

  formula.pool = basePool + channelTotal("getTestDice");
  formula.dicePenalty = channelTotal("getPenalty");
  formula.modifier = baseModifier + specModifier + channelTotal("getModifier");
  formula.bonusDice = specValue + channelTotal("getBonusDice");
  formula.reRoll = channelTotal("getReRoll");

  return formula;
}

ChronicleSystem.adjustFormulaByWeapon = adjustFormulaByWeapon;
ChronicleSystem.eventHandleRoll = eventHandleRoll;
ChronicleSystem.handleRoll = handleRoll;
ChronicleSystem.handleRollAsync = handleRollAsync;
ChronicleSystem.getActorAbilityFormula = getActorTestFormula;

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

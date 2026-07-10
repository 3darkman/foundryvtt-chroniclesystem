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

/** Signed string for an itemized value (+2 / −1). */
const _signed = (v) => (v >= 0 ? `+${v}` : `${v}`);

/** Display string for an itemized value: bonus dice always read as "B" (+2B, the
 *  same notation the sheet chips / ToFormattedStr use); a dice penalty is always
 *  subtractive, so it reads as a negative die count (−2d, never +); test dice get
 *  a "d" suffix (+2d); the target's `difficulty` adjustment (size) and flat
 *  modifiers stay unit-less. */
function _withUnit(value, field) {
  if (field === "difficulty") return _signed(value);
  if (field === "bonusDice") return `${_signed(value)}B`;
  if (field === "dicePenalty") return `-${Math.abs(value)}d`;
  return `${_signed(value)}${DICE_FORMULA_FIELDS.has(field) ? "d" : ""}`;
}

/** Value TONE (spec 011, data-model §3): direction is mapped by FIELD, not by
 *  sign — a `dicePenalty` stores a positive value but always hinders, so it reads
 *  red; pool/bonusDice/re-roll always help (green); a flat modifier / size follows
 *  its own sign; zero is muted. Drives the `.cs-value-{gain,loss,zero}` utility. */
function _valueTone(value, field) {
  if (value === 0) return "zero";
  if (field === "dicePenalty") return "loss";
  // `reReoll` keeps the codebase-wide typo (F7) — it is a beneficial re-roll count.
  if (field === "pool" || field === "bonusDice" || field === "reReoll")
    return "gain";
  return value >= 0 ? "gain" : "loss";
}

/** Decorate an itemized entry (spec 009 shape + spec 010 origins) with the
 *  localized origin label, display value and value tone the dialog and the card
 *  both show (spec 011). */
function _decorateItem(item) {
  return {
    ...item,
    displayValue: _withUnit(item.value, item.field),
    tone: _valueTone(item.value, item.field),
    originLabel: SystemUtils.localize(
      `CS.dialogs.rollModifier.origin.${item.origin}`
    ),
  };
}

/**
 * Itemize the dialog's CHECKED optional effects for the transparent card (FR-025):
 * the same effects `_applyCheckedOptionalEffects` folds into the rolled formula,
 * surfaced as `origin:"effect"` entries so the card lists 100% of the modifiers.
 * @param {HTMLFormElement} form
 * @param {Array<{effectId: string, name: string, condition: string}>} optionalEffects
 * @returns {Array<object>}
 */
function _checkedOptionalItemized(form, optionalEffects) {
  if (!form?.querySelectorAll) return [];
  const byId = new Map((optionalEffects ?? []).map((e) => [e.effectId, e]));
  const out = [];
  form
    .querySelectorAll(
      ".cs-optional-effect input[type=checkbox]:checked:not([disabled])"
    )
    .forEach((cb) => {
      const field = cb.dataset.field;
      const value = parseInt(cb.dataset.value);
      if (!field || Number.isNaN(value)) return;
      const eff = byId.get(cb.dataset.effectId);
      out.push({
        sourceLabel: eff?.name ?? "",
        origin: "effect",
        field,
        value,
        condition: eff?.condition ?? "",
      });
    });
  return out;
}

/** Formula fields the user-extras inputs feed, in dialog order. */
const _EXTRA_FIELDS = [
  ["extraPool", "pool"],
  ["extraBonusDice", "bonusDice"],
  ["extraModifier", "modifier"],
  ["extraDicePenalty", "dicePenalty"],
  ["extraReRoll", "reRoll"],
];

/**
 * Itemize the dialog's non-zero user EXTRAS for the transparent card (FR-025) —
 * the manual adjustments `_applyUserExtras` folds in, as `origin:"user"` entries.
 * @param {HTMLFormElement} form
 * @returns {Array<object>}
 */
function _extrasItemized(form) {
  const out = [];
  for (const [name, field] of _EXTRA_FIELDS) {
    const value = parseInt(form?.[name]?.value);
    if (!Number.isNaN(value) && value !== 0) {
      out.push({
        // The field label (Pool/Modifier/…) reads better than repeating "You".
        sourceLabel: SystemUtils.localize(`CS.dialogs.rollModifier.${field}`),
        origin: "user",
        field,
        value,
        condition: "",
      });
    }
  }
  return out;
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

/**
 * Derive the target-driven difficulty + itemized modifiers of a conflict roll
 * (spec 010, US1/US3). Mutates the effective `formula` in place: range/prone go
 * to the roll fields, size goes to the difficulty target (not the formula), the
 * attacker's disposition (intrigue) goes to the result modifier. Returns the
 * decorated itemized rows (origin "character"/"target"), the target difficulty
 * descriptor (or null with no valid target), and the resolution inputs (US4).
 * The pure math lives in `cs-conflict.js`; the canvas reads in `cs-targeting.js`.
 * @returns {Promise<{itemized: Array, difficulty: object|null, resolution: object|null}>}
 */
async function _deriveTargetConflict(
  actor,
  roll_definition,
  rollContext,
  formula
) {
  const kind = rollContext.kind;
  const { getUserTarget, getAttackerToken, measureDistanceYards } =
    await import("../combat/cs-targeting.js");
  const {
    rangeCategoryFromQualities,
    rangePenalty,
    combatDefenseSizeModifier,
  } = await import("../combat/cs-conflict.js");

  const itemized = [];
  const weapon = kind === "weapon" ? actor.items.get(rollContext.itemId) : null;

  // Resolve the ability/specialty this conflict roll actually exercises, so the
  // card/dialog itemize its ability/specialty-specific always-on modifiers
  // (FR-025). A weapon-test/technique roll is a formula-string roll that carries
  // NO ability context via `_resolveRollTarget`, so without this only the global
  // ALL-bucket rows would surface — a Fighting-boosting effect (or the trait
  // itself) would be invisible on the card. Weapon: "Ability:Specialty"; intrigue:
  // the persuasion/deception ability.
  let itemizeAbility = null;
  let itemizeSpecialty = null;
  if (kind === "weapon" && weapon) {
    const parts = String(weapon.system?.specialty ?? "").split(":");
    itemizeAbility = parts[0] || null;
    itemizeSpecialty = parts[1] || null;
  } else if (kind === "intrigue") {
    itemizeAbility = roll_definition[0] || null; // "persuasion" | "deception"
  }

  // Attacker disposition (intrigue) — an itemized "character" always-on (FR-013),
  // applied to the effective formula whether or not there is a target. Extracted
  // from the technique's base formula (T034) so it is never double-counted.
  if (kind === "intrigue") {
    const disposition = ChronicleSystem.dispositions.find(
      (d) => d.rating === actor.getCSData().currentDisposition
    );
    const dispMod =
      roll_definition[0] === "deception"
        ? disposition?.deceptionModifier ?? 0
        : disposition?.persuasionModifier ?? 0;
    if (dispMod !== 0) {
      formula.modifier += dispMod;
      itemized.push(
        _decorateItem({
          sourceLabel: SystemUtils.format("CS.conflict.disposition", {
            level: SystemUtils.localize(disposition?.name ?? ""),
          }),
          origin: "character",
          field: "modifier",
          value: dispMod,
          condition: "",
        })
      );
    }
  }

  const target = getUserTarget(actor, kind);
  if (target.status !== "ok") {
    return {
      itemized,
      difficulty: null,
      resolution: null,
      itemizeAbility,
      itemizeSpecialty,
    };
  }

  const defense =
    kind === "weapon" ? target.combatDefense : target.intrigueDefense;
  let difficultyTargetValue = defense;

  if (kind === "weapon" && weapon) {
    // Range penalty — ranged weapon (by slug) with a measurable attacker token.
    const category = rangeCategoryFromQualities(weapon.system?.qualities);
    if (category) {
      const attackerToken = getAttackerToken(actor);
      const yd = attackerToken
        ? measureDistanceYards(attackerToken, target.token)
        : null;
      if (yd != null) {
        const pen = rangePenalty(yd, category);
        if (pen > 0) {
          formula.dicePenalty += pen;
          itemized.push(
            _decorateItem({
              sourceLabel: SystemUtils.format("CS.conflict.range", {
                distance: Math.round(yd),
                units: "yd",
              }),
              origin: "target",
              field: "dicePenalty",
              value: pen,
              condition: "",
            })
          );
        }
      }
    }
    // Prone target — +1 Test Die, Fighting only (the weapon's ability half).
    const abilityHalf = (weapon.system?.specialty ?? "").split(":")[0];
    if (slugify(abilityHalf) === "fighting" && target.conditions?.prone) {
      formula.pool += 1;
      itemized.push(
        _decorateItem({
          sourceLabel: SystemUtils.localize("CS.conflict.prone"),
          origin: "target",
          field: "pool",
          value: 1,
          condition: "",
        })
      );
    }
    // Size → difficulty (adjusts the Combat Defense target, not the formula).
    const sizeMod = combatDefenseSizeModifier(target.size);
    if (sizeMod !== 0) {
      difficultyTargetValue += sizeMod;
      itemized.push(
        _decorateItem({
          sourceLabel: SystemUtils.format("CS.conflict.size", {
            size: SystemUtils.localize(`CS.sizes.${target.size}`),
          }),
          origin: "target",
          field: "difficulty",
          value: sizeMod,
          condition: "",
        })
      );
    }
  }

  // Resolution inputs (US4): the base value + the target's reductions.
  let baseValue = 0;
  if (kind === "weapon" && weapon) {
    weapon.updateDamageValue(actor);
    baseValue = Number(weapon.damageValue) || 0;
  } else if (kind === "intrigue") {
    baseValue = Number(rollContext.influenceValue) || 0;
  }

  return {
    itemized,
    difficulty: {
      target: difficultyTargetValue,
      label: target.token.name,
      labelKey: null,
    },
    resolution: {
      kind,
      targetActor: target.actor,
      baseValue,
      armorRating: target.armorRating,
      dispositionRating: target.dispositionRating,
    },
    itemizeAbility,
    itemizeSpecialty,
  };
}

async function handleRollAsync(
  rollType,
  actor,
  showModifierDialog = false,
  rollContext = {}
) {
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

  const { abilityName, specialtyName } = _resolveRollTarget(roll_definition);

  // spec 010: for a weapon/intrigue roll, derive the target's difficulty + the
  // itemized target/disposition modifiers, applied to the effective formula for
  // BOTH the quick roll and the dialog (parity, SC-005).
  const kind = rollContext.kind ?? null;
  const isConflict = kind === "weapon" || kind === "intrigue";
  const conflictItemized = []; // decorated rows: origin "character"/"target"
  let targetDifficulty = null; // {value, name} pre-fill for the dialog
  let resolutionCtx = null; // US4 damage/influence inputs
  // The ability/specialty to ITEMIZE against. For weapon/intrigue rolls the
  // formula-string target is null, so `_deriveTargetConflict` resolves the roll's
  // real ability/specialty; ability/specialty rolls keep their own (FR-025).
  let itemAbility = abilityName;
  let itemSpecialty = specialtyName;

  if (isConflict) {
    const conflict = await _deriveTargetConflict(
      actor,
      roll_definition,
      rollContext,
      formula
    );
    conflictItemized.push(...conflict.itemized);
    itemAbility = conflict.itemizeAbility ?? abilityName;
    itemSpecialty = conflict.itemizeSpecialty ?? specialtyName;
    if (conflict.difficulty) {
      difficulty = conflict.difficulty;
      // Read-only in the dialog (spec 010): the target's defense replaces the
      // difficulty selector; it is NOT editable, so only value + name are needed.
      targetDifficulty = {
        value: conflict.difficulty.target,
        name: conflict.difficulty.label,
      };
    }
    resolutionCtx = conflict.resolution;
  }

  const revertModifierDialog = game.settings.get(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.MODIFIER_DIALOG_AS_DEFAULT
  );

  let dialogItemized = null; // the card decomposition when the dialog ran

  if (showModifierDialog ? !revertModifierDialog : revertModifierDialog) {
    // Lazy import: a static one would close the eval-time cycle
    // ChronicleSystem → cs-effect-modifiers → cs-effect-vocabulary →
    // ChronicleSystem (vocabulary reads modifiersConstants at module-eval time).
    const { collectOptionalRollEffects, collectItemizedAlwaysOn } =
      await import("../effects/cs-effect-modifiers.js");

    // US2: itemize every always-on source (labeled by origin); the target rows
    // (spec 010) are shown in the SAME list. The RAW base is shown read-only —
    // `base + Σ itemized` (roll-field rows) equals the effective formula.
    const itemizedAlwaysOn = collectItemizedAlwaysOn(
      actor,
      itemAbility,
      itemSpecialty
    ).map(_decorateItem);
    const displayedItemized = [...itemizedAlwaysOn, ...conflictItemized];
    const base = _rawFormulaForDialog(
      actor,
      formula,
      abilityName,
      specialtyName,
      // The size row (field "difficulty") never touches the formula — exclude it.
      displayedItemized.filter((i) => i.field !== "difficulty")
    );
    const optionalEffects = collectOptionalRollEffects(
      actor,
      itemAbility,
      itemSpecialty
    ).map((effect) => ({
      ...effect,
      displayValue: _withUnit(effect.value, effect.formulaField),
    }));
    const difficultyOptions = difficultyTable.entries.map((entry, index) => ({
      index,
      label: entryLabel(entry, SystemUtils.localize),
      selected: index === difficultyTable.defaultIndex,
    }));

    const formData = await _showModifierDialog({
      base,
      itemizedAlwaysOn: displayedItemized,
      optionalEffects,
      difficultyOptions,
      noneSelected: difficultyTable.defaultIndex < 0,
      targetDifficulty,
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

    // spec 010: with a target, its defense IS the difficulty (read-only, already
    // set before the dialog). Only the table selector — shown when there is no
    // target — can change it here.
    if (!targetDifficulty) {
      difficulty = _difficultyAt(
        difficultyTable,
        formData.difficultyIndex?.value ?? difficultyTable.defaultIndex
      );
    }

    // The card decomposition (FR-025): the displayed always-on/target rows plus
    // the optionals + extras actually applied (parity with the quick roll).
    dialogItemized = [
      ...displayedItemized,
      ..._checkedOptionalItemized(formData, optionalEffects).map(_decorateItem),
      ..._extrasItemized(formData).map(_decorateItem),
    ];
  }

  // spec 011 (FR-011/FR-013): there is no "free roll". An unresolved difficulty
  // (None selected in the dialog, or a -1 default) resolves against TARGET 0 so
  // EVERY roll through this path renders the unified card below — never the plain
  // Foundry message. Initiative rolls take the sync handleRoll() path (no
  // difficulty) and keep their own message (D6).
  if (!difficulty || difficulty.target == null) {
    difficulty = { target: 0, label: null, labelKey: null };
  }

  // spec 010 (FR-025): whenever a difficulty resolves, post the transparent card
  // (itemized decomposition + dice faces) with the conflict resolution inputs.
  let conflictContext = null;
  if (difficulty && difficulty.target != null) {
    let itemized = dialogItemized;
    if (itemized === null) {
      const { collectItemizedAlwaysOn } = await import(
        "../effects/cs-effect-modifiers.js"
      );
      itemized = [
        ...collectItemizedAlwaysOn(actor, itemAbility, itemSpecialty).map(
          _decorateItem
        ),
        ...conflictItemized,
      ];
    }
    // Base (raw capacity) shown on the card so the total is reconstructable even
    // with no modifiers (SC-008): base + Σ itemized (roll-fields) = rolled formula.
    // The size row (field "difficulty") never touches the formula, so exclude it.
    const base = _rawFormulaForDialog(
      actor,
      formula,
      abilityName,
      specialtyName,
      itemized.filter((i) => i.field !== "difficulty")
    );
    conflictContext = {
      itemized,
      // Compact base label (e.g. "4d6+2B+1"), the same format the sheet chips use
      // — clean even when the weapon-training shift makes a raw component negative.
      baseLabel: base.ToFormattedStr(),
      // The target's token name (spec 010 polish): shown as an explicit "Target"
      // line on the card so it is not mistaken for the roller.
      targetName: targetDifficulty ? targetDifficulty.name : null,
      kind: resolutionCtx ? resolutionCtx.kind : null,
      targetActor: resolutionCtx ? resolutionCtx.targetActor : null,
      baseValue: resolutionCtx ? resolutionCtx.baseValue : 0,
      armorRating: resolutionCtx ? resolutionCtx.armorRating : 0,
      dispositionRating: resolutionCtx ? resolutionCtx.dispositionRating : 0,
    };
  }

  let csRoll = new CSRoll(
    roll_definition[1],
    formula,
    difficulty,
    conflictContext
  );
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

import SystemUtils from "../utils/systemUtils.js";
import { CSConstants } from "../system/csConstants.js";
import { resolveVerdict } from "../difficulty/cs-difficulty.js";
import {
  degreesOfSuccess,
  computeDamage,
  computeInfluence,
} from "../combat/cs-conflict.js";
import { buildDieFormula } from "./cs-die-formula.js";
import { collapseDiceResults } from "./cs-die-view.js";

export class CSRoll {
  /**
   * @param {string} title the rolled test's name
   * @param {DiceRollFormula} formula
   * @param {{target: number, labelKey: string|null, label: string|null}|null} difficulty
   *   the resolved difficulty. Player test rolls always carry one (handleRollAsync
   *   coerces an unselected one to target 0, spec 011); a null only reaches the
   *   sync initiative path, which keeps the default Foundry message.
   * @param {object|null} conflictContext spec 010: the card decomposition
   *   ({ itemized, baseLabel, kind, targetActor, baseValue, armorRating,
   *   dispositionRating }), or null for a plain roll with no decomposition.
   */
  constructor(title, formula, difficulty = null, conflictContext = null) {
    this.formula = formula;
    this.title = title;
    this.difficulty = difficulty;
    this.conflictContext = conflictContext;
    this.results = [];
  }

  async doRoll(actor) {
    if (this.formula.pool - this.formula.dicePenalty <= 0) {
      ui.notifications.info(
        SystemUtils.localize("CS.notifications.dicePoolInvalid")
      );
      return null;
    }
    const dieFormula = buildDieFormula(this.formula);

    let resultRoll = new Roll(dieFormula);
    await resultRoll.evaluate();
    this.results = resultRoll.terms[0].results;

    // spec 011 (FR-011/FR-013): every player TEST roll now carries a resolved
    // difficulty (handleRollAsync coerces an unselected one to target 0), so it
    // always renders the unified card. The else branch is now exclusively the
    // no-difficulty SYNC path — initiative (handleRoll → CsCombatant), which
    // posts its own message and stays as-is (D6).
    if (this.difficulty && this.difficulty.target != null) {
      await this._toVerdictMessage(resultRoll, actor);
    } else {
      resultRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        // The test name alone (spec 010 polish) — not the "<name> make a <test>
        // roll" sentence, whose translation surfaces the word "test"/"teste".
        flavor: this.title,
      });
    }
    return resultRoll;
  }

  /**
   * Resolve the conflict outcome on a hit (spec 010, US4): degrees → damage or
   * influence, floored at 0. Never called on a miss (FR-020). Returns null when
   * there is no conflict resolution (a plain difficulty roll, or a miss).
   * @returns {object|null}
   */
  _resolveConflict(verdict) {
    const cc = this.conflictContext;
    if (!cc || !cc.kind || !cc.targetActor || !verdict.success) return null;
    const degrees = degreesOfSuccess(verdict.margin);
    const isDamage = cc.kind === "weapon";
    return {
      kind: isDamage ? "damage" : "influence",
      degrees,
      value: isDamage
        ? computeDamage(cc.baseValue, degrees, cc.armorRating)
        : computeInfluence(cc.baseValue, degrees, cc.dispositionRating),
      reduction: isDamage ? cc.armorRating : cc.dispositionRating,
      path: isDamage
        ? "system.derivedStats.health.current"
        : "system.derivedStats.composure.current",
      targetUuid: cc.targetActor.uuid,
      targetName: cc.targetActor.name,
    };
  }

  /**
   * Post the unified result card (spec 011) — the single surface for every roll:
   * verdict + numbers (target 0 with no difficulty) + base + itemized
   * decomposition + one pip face per physical die (kept/discarded/re-rolled) and,
   * on a hit of a real conflict, the damage/influence resolution + apply button.
   */
  async _toVerdictMessage(roll, actor) {
    const { target, label, labelKey } = this.difficulty;
    const verdict = resolveVerdict(roll.total, target);
    const cc = this.conflictContext;
    // With a target, its token name is the difficulty label — surface it as an
    // explicit "Target" line instead of the ambiguous difficulty name, so it is
    // not mistaken for the character making the roll (spec 010 polish).
    const targetName = cc?.targetName ?? null;
    const difficultyName = targetName
      ? ""
      : label || (labelKey ? SystemUtils.localize(labelKey) : "");
    const marginText =
      verdict.margin >= 0 ? `+${verdict.margin}` : `${verdict.margin}`;
    // Margin tone: a hit (margin ≥ 0) reads green, a miss red (spec 011).
    const marginTone = verdict.margin >= 0 ? "gain" : "loss";
    const degree = SystemUtils.localize(verdict.degreeKey);
    // Degrees of success shown on EVERY successful roll, not just conflicts.
    const degrees = verdict.success ? degreesOfSuccess(verdict.margin) : null;

    // spec 011 (T014): collapse the raw die results into one pip-view per physical
    // die (final face + kept/discarded/rerolled) and attach the i18n tooltip HERE
    // — the single source the template renders as title/data-tooltip (F2). The hook
    // never recomputes it.
    const term = roll.terms?.[0];
    const dice = collapseDiceResults(term?.results ?? [], term?.number).map(
      (d) => {
        const label = SystemUtils.localize(`CS.conflict.dice.${d.state}`);
        // Handoff tooltips: "Kept · N" / "Discarded · N" / "Re-rolled 1 → N".
        const sep = d.state === "rerolled" ? "→" : "·";
        return { ...d, tooltip: `${label} ${sep} ${d.value}` };
      }
    );

    const resolution = this._resolveConflict(verdict);
    // The reduction unit shown beside the resolution value ("−2 armor" / "… disposition").
    if (resolution) {
      resolution.reductionUnit = SystemUtils.localize(
        resolution.kind === "damage"
          ? "CS.conflict.reduction.armor"
          : "CS.conflict.reduction.disposition"
      );
    }
    // spec 011 (FR-011/T017): ONE structure for every roll. difficulty-result.hbs
    // is gone; the unified card handles the plain case (target 0, no target line,
    // no resolution) through its own conditional blocks.
    const template = CSConstants.Templates.Chat.CONFLICT_RESULT;

    const content = await foundry.applications.handlebars.renderTemplate(
      template,
      {
        title: this.title,
        difficultyName,
        targetName,
        target,
        total: roll.total,
        margin: verdict.margin,
        marginText,
        marginTone,
        success: verdict.success,
        degree,
        degrees,
        baseLabel: cc?.baseLabel ?? null,
        itemized: cc?.itemized ?? [],
        dice,
        roll,
        resolution,
      }
    );
    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      // The test name is now shown inside the card title (spec 010 polish); the
      // "<name> make a <test> roll" flavor would only duplicate it — omit it.
      content,
      rolls: [roll],
      flags: {
        chroniclesystem: {
          difficulty: { target, labelKey, label },
          total: roll.total,
          margin: verdict.margin,
          success: verdict.success,
          degreeKey: verdict.degreeKey,
          ...(resolution
            ? {
                apply: {
                  targetUuid: resolution.targetUuid,
                  path: resolution.path,
                  delta: resolution.value,
                },
              }
            : {}),
        },
      },
    };
    // Respect the selected chat mode (v14 messageMode; v13 rollMode fallback).
    const isV14 =
      typeof CONFIG !== "undefined" &&
      CONFIG.ChatMessage &&
      "modes" in CONFIG.ChatMessage;
    const mode = game.settings.get("core", isV14 ? "messageMode" : "rollMode");
    if (isV14 && ChatMessage.applyMode)
      ChatMessage.applyMode(messageData, mode);
    else if (ChatMessage.applyRollMode)
      ChatMessage.applyRollMode(messageData, mode);
    await ChatMessage.create(messageData);
  }
}

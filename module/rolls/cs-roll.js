import SystemUtils from "../utils/systemUtils.js";
import { CSConstants } from "../system/csConstants.js";
import { resolveVerdict } from "../difficulty/cs-difficulty.js";
import {
  degreesOfSuccess,
  computeDamage,
  computeInfluence,
} from "../combat/cs-conflict.js";
import { buildDieFormula } from "./cs-die-formula.js";

export class CSRoll {
  /**
   * @param {string} title the rolled test's name
   * @param {DiceRollFormula} formula
   * @param {{target: number, labelKey: string|null, label: string|null}|null} difficulty
   *   the selected difficulty (US3), or null for a free roll (FR-015).
   * @param {object|null} conflictContext spec 010: the transparent-card decomposition
   *   ({ itemized, kind, targetActor, baseValue, armorRating, dispositionRating }),
   *   or null to keep the plain difficulty card.
   */
  constructor(title, formula, difficulty = null, conflictContext = null) {
    this.formula = formula;
    this.title = title;
    this.difficulty = difficulty;
    this.conflictContext = conflictContext;
    this.entityData = undefined;
    this.rollCard =
      "systems/chroniclesystem/templates/chat/cs-stat-rollcard.html";
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

    // With a selected difficulty (US3), resolve the verdict + degree and post a
    // custom card; otherwise keep the default roll message (FR-015 free roll).
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
   * Post the difficulty verdict card (US3). With a conflict context (spec 010),
   * post the TRANSPARENT card instead: the itemized decomposition + every die
   * face (kept vs. discarded) + the damage/influence resolution and apply button.
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
    const degree = SystemUtils.localize(verdict.degreeKey);
    // Degrees of success shown on EVERY successful roll, not just conflicts.
    const degrees = verdict.success ? degreesOfSuccess(verdict.margin) : null;

    const resolution = this._resolveConflict(verdict);
    const template = cc
      ? CSConstants.Templates.Chat.CONFLICT_RESULT
      : "systems/chroniclesystem/templates/chat/difficulty-result.hbs";

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
        success: verdict.success,
        degree,
        degrees,
        baseLabel: cc?.baseLabel ?? null,
        itemized: cc?.itemized ?? [],
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

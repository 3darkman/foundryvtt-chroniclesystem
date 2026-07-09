import SystemUtils from "../utils/systemUtils.js";
import { resolveVerdict } from "../difficulty/cs-difficulty.js";

export class CSRoll {
  /**
   * @param {string} title the rolled test's name
   * @param {DiceRollFormula} formula
   * @param {{target: number, labelKey: string|null, label: string|null}|null} difficulty
   *   the selected difficulty (US3), or null for a free roll (FR-015).
   */
  constructor(title, formula, difficulty = null) {
    this.formula = formula;
    this.title = title;
    this.difficulty = difficulty;
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
    const pool = Math.max(this.formula.pool, 1);
    const dices = pool + this.formula.bonusDice;
    const keep = Math.max(this.formula.pool - this.formula.dicePenalty, 0);

    // v13: Build the complete formula string so all terms evaluate together.
    // Roll.fromTerms rejects mixing evaluated/unevaluated terms.
    let dieFormula = `${dices}d6`;
    if (this.formula.reRoll > 0) {
      dieFormula += `r=${this.formula.reRoll}`;
    }
    dieFormula += `kh${keep}`;
    dieFormula += ` + ${this.formula.modifier}`;

    let resultRoll = new Roll(dieFormula);
    await resultRoll.evaluate();
    this.results = resultRoll.terms[0].results;

    const messageId = this.formula.isUserChanged
      ? "CS.chatMessages.customRoll"
      : "CS.chatMessages.simpleRoll";
    let flavor = SystemUtils.format(messageId, {
      name: actor.name,
      test: this.title,
    });

    // With a selected difficulty (US3), resolve the verdict + degree and post a
    // custom card; otherwise keep the default roll message (FR-015 free roll).
    if (this.difficulty && this.difficulty.target != null) {
      await this._toVerdictMessage(resultRoll, actor, flavor);
    } else {
      resultRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: flavor,
      });
    }
    return resultRoll;
  }

  /** Post the difficulty verdict card (US3): success/failure + degree + margin. */
  async _toVerdictMessage(roll, actor, flavor) {
    const { target, label, labelKey } = this.difficulty;
    const verdict = resolveVerdict(roll.total, target);
    const difficultyName =
      label || (labelKey ? SystemUtils.localize(labelKey) : "");
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/chroniclesystem/templates/chat/difficulty-result.hbs",
      {
        difficultyName,
        target,
        total: roll.total,
        margin: verdict.margin,
        marginText:
          verdict.margin >= 0 ? `+${verdict.margin}` : `${verdict.margin}`,
        success: verdict.success,
        degree: SystemUtils.localize(verdict.degreeKey),
      }
    );
    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor,
      content,
      rolls: [roll],
      flags: {
        chroniclesystem: {
          difficulty: { target, labelKey, label },
          total: roll.total,
          margin: verdict.margin,
          success: verdict.success,
          degreeKey: verdict.degreeKey,
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

import SystemUtils from "../utils/systemUtils.js";

export class CSRoll {
  constructor(title, formula) {
    this.formula = formula;
    this.title = title;
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
    resultRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: flavor,
    });
    return resultRoll;
  }
}

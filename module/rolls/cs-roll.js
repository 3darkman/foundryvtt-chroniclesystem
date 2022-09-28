export class CSRoll {
    constructor(title, formula) {
        this.formula = formula;
        this.title = title;
        this.entityData = undefined;
        this.rollCard  = "systems/chroniclesystem/templates/chat/cs-stat-rollcard.html";
        this.results = [];
    }

    async doRoll(actor) {
        const pool = Math.max(this.formula.pool - this.formula.dicePenalty, 1);
        const dices = pool + this.formula.bonusDice;
        let dieRoll = new Die({faces: 6, number: dices});
        dieRoll.evaluate({async : false});

        this.results = dieRoll.results;

        let reRollFormula = "r"+this.formula.reroll+"=1";
        dieRoll.reroll(reRollFormula);

        dieRoll.keep('kh' + (this.formula.pool - this.formula.dicePenalty));

        const plus = new OperatorTerm({operator: "+"});
        plus.evaluate();
        const bonus = new NumericTerm({number: this.formula.modifier});
        bonus.evaluate();

        let resultRoll = Roll.fromTerms([dieRoll, plus, bonus]);
        let flavor = this.title + " test";
        resultRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            flavor: flavor
        });
    }
}

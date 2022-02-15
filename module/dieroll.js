export async function doRoll(actor, formula, thing, difficulty = 0) {
    const dices = formula.pool + formula.bonusDice;

    let dieRoll = new Die({faces: 6, number: dices});
    dieRoll.evaluate({async : false});
    if (formula.reroll > 0) {
        let rerollFormula = "r"+formula.reroll+"=1";
        console.log(rerollFormula);
        dieRoll.reroll(rerollFormula);
    }
    dieRoll.keep('kh' + (formula.pool - formula.drawback));

    const plus = new OperatorTerm({operator: "+"});
    plus.evaluate();
    const bonus = new NumericTerm({number: formula.modifier});
    bonus.evaluate();

    dieRoll.mar

    let resultRoll = Roll.fromTerms([dieRoll, plus, bonus]);
    let flavor = thing + " test";
    resultRoll.toMessage({
         speaker: ChatMessage.getSpeaker({ actor: actor }),
         flavor: flavor
     });
}
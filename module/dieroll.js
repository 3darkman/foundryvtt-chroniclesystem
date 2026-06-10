// noinspection JSUnusedLocalSymbols
export async function doRoll(actor, formula, thing, difficulty = 0) {
  const pool = Math.max(formula.pool - formula.dicePenalty, 1);
  const dices = pool + formula.bonusDice;
  let dieRoll = new foundry.dice.terms.Die({ faces: 6, number: dices });
  await dieRoll.evaluate();

  let rerollFormula = "r" + formula.reroll + "=1";
  dieRoll.reroll(rerollFormula);

  dieRoll.keep("kh" + formula.pool);

  const plus = new foundry.dice.terms.OperatorTerm({ operator: "+" });
  await plus.evaluate();
  const bonus = new foundry.dice.terms.NumericTerm({
    number: formula.modifier,
  });
  await bonus.evaluate();

  let resultRoll = Roll.fromTerms([dieRoll, plus, bonus]);
  let flavor = thing + " test";
  resultRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    flavor: flavor,
  });
}

import {ChronicleSystem} from "../system/ChronicleSystem.js";

export class CsCombatant extends Combatant {
    constructor(data, context) {
        super(data, context);
    }

    getInitiativeRoll(formula) {
        formula = formula || this._getInitiativeFormula();
        return ChronicleSystem.handleRoll(formula, this.actor);
    }
}

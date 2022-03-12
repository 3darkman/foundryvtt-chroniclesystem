import {CSItem} from "./csItem.js";
import LOGGER from "../utils/logger.js";
import {CSConstants} from "../system/csConstants.js";

export class CSEventItem extends CSItem {
    generateModifiers(choices) {
        LOGGER.trace("generate historical event modifiers | CSEventItem.cs");
        let data = this.getCSData();

        if (data.playerChoice) {
            console.log(choices);
            choices.forEach((choice) => {
                this._generateModifier(choice.toLowerCase(), data);
            });
        }else {
            this._generateModifier("defense", data);
            this._generateModifier("influence", data);
            this._generateModifier("lands", data);
            this._generateModifier("law", data);
            this._generateModifier("population", data);
            this._generateModifier("power", data);
            this._generateModifier("wealth", data);
        }
        this.update({"data.modifiers": data.modifiers});
    }

    _generateModifier(resource, data) {
        LOGGER.trace(`generate the modifier to ${resource} | CSEventItem.js`);

        let formula = data.playerChoice ? data.bonusToChoices : data.formulas[resource];

        if (!formula) {
            LOGGER.debug(`there is no modifier for the resource ${resource} | CSEventItem.js`);
            return;
        }

        let roll = new Roll(formula);
        roll.evaluate({async: false});
        data.modifiers[resource] = roll.total;
    }
}
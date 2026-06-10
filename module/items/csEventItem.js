import {CSItem} from "./csItem.js";
import LOGGER from "../utils/logger.js";
import {CSConstants} from "../system/csConstants.js";

export class CSEventItem extends CSItem {
    async generateModifiers(choices) {
        LOGGER.trace("generate historical event modifiers | CSEventItem.cs");
        let data = this.getCSData();

        if (data.playerChoice) {
            for (const choice of choices) {
                await this._generateModifier(choice.toLowerCase(), data);
            }
        }else {
            await this._generateModifier("defense", data);
            await this._generateModifier("influence", data);
            await this._generateModifier("lands", data);
            await this._generateModifier("law", data);
            await this._generateModifier("population", data);
            await this._generateModifier("power", data);
            await this._generateModifier("wealth", data);
        }
        this.update({"system.modifiers": data.modifiers});
    }

    async _generateModifier(resource, data) {
        LOGGER.trace(`generate the modifier to ${resource} | CSEventItem.js`);

        let formula = data.playerChoice ? data.bonusToChoices : data.formulas[resource];

        if (!formula) {
            LOGGER.debug(`there is no modifier for the resource ${resource} | CSEventItem.js`);
            return;
        }

        let roll = new Roll(formula);
        await roll.evaluate();
        data.modifiers[resource] = roll.total;
    }
}
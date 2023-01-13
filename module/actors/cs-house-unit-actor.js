import {CsAbstractCombatActor} from "./cs-abstract-combat-actor.js";
import LOGGER from "../utils/logger.js";

export class CsHouseUnitActor extends CsAbstractCombatActor {

    getTrainingLevelTotal() {
        return parseInt(this.system.trainingLevel.base) + parseInt(this.system.trainingLevel.modifier);
    }

    getExperienceCurrent() {
        let experience = 0;
        if (this.system.owned) {
            this.system.owned.abilities.forEach(ability => {
                experience += Math.max(parseInt(ability.system.rating) - 2, 0) * 20;
            });
        }

        return experience;
    }

    getExperienceTotal() {
        let totalLevel = this.getTrainingLevelTotal();
        let totalXP = 20;
        totalXP += totalLevel * 40 - Math.max(0, totalLevel - 3) * 20;
        return totalXP;
    }

    getDisciplineBase() {
        let trainingLevel = this.getTrainingLevelTotal();
        trainingLevel = trainingLevel > 3 ? 3 : trainingLevel;
        return (3 - parseInt(trainingLevel)) * 3;
    }

    getDisciplineModifier() {
        let modifier = 0;
        if (this.system.owned) {
            this.system.owned.types.forEach(type => {
                modifier += parseInt(type.system.disciplineModifier);
            });
        }
        return modifier;
    }

    getDisciplineTotal() {
        return this.getDisciplineBase() + this.getDisciplineModifier();
    }

    getPowerCostTotal() {
        let powerCost = parseInt(this.system.trainingLevel.base) * 2 + 1;
        if (this.system.owned) {
            this.system.owned.types.forEach(type => {
                powerCost += parseInt(type.system.powerCost);
            });
        }
        return powerCost;
    }

    getAnotherCosts() {
        let costs = {};
        if (this.system.owned) {
            this.system.owned.types.forEach(type => {
                if (type.system.hasAnotherCost) {
                    //initialize
                    if (!(type.system.anotherCost.keyResource in costs)) {
                        costs[type.system.anotherCost.keyResource] = 0;
                    }

                    if (type.system.anotherCost.hasModifierByTraining) {
                        costs[type.system.anotherCost.keyResource] += parseInt(type.system.anotherCost.modifierByTraining[this.system.trainingLevel.base].modifier);
                    } else {
                        costs[type.system.anotherCost.keyResource] += parseInt(type.system.anotherCost.modifier);
                    }
                }
            });
        }
        return costs;
    }

    getAnotherCostsAsString() {
        let costs = this.getAnotherCosts();
        let values = Object.values(costs);
        let keys = Object.keys(costs);
        let costsText = []
        for (let i = 0; i < values.length; i++) {
            costsText.push(`${keys[i]}: ${Math.max(values[i], 0)}`);
        }
        return costsText.join(", ");
    }
}
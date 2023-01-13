import {ChronicleSystem} from "../system/ChronicleSystem.js";
import {CSActor} from "./csActor.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import {CSConstants} from "../system/csConstants.js";
import {CsAbstractCombatActor} from "./cs-abstract-combat-actor.js";

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {CSActor}
 */
export class CSCharacterActor extends CsAbstractCombatActor {
    prepareData() {
        super.prepareData();
        this.calculateMovementData();
    }

    prepareEmbeddedDocuments() {
        super.prepareEmbeddedDocuments();
    }

    /** @override */
    getRollData() {
        return super.getRollData();
    }

    calculateDerivedValues() {
        let data = super.calculateDerivedValues();
        data.derivedStats.intrigueDefense.value = this.calcIntrigueDefense();
        data.derivedStats.intrigueDefense.total = data.derivedStats.intrigueDefense.value + parseInt(data.derivedStats.intrigueDefense.modifier);
        data.derivedStats.composure.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.WILL)) * 3;
        data.derivedStats.composure.total = data.derivedStats.composure.value + parseInt(data.derivedStats.composure.modifier);

        data.derivedStats.frustration.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.WILL));
        data.derivedStats.frustration.total = data.derivedStats.frustration.value + parseInt(data.derivedStats.frustration.modifier);
        data.derivedStats.fatigue.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
        data.derivedStats.fatigue.total = data.derivedStats.fatigue.value + parseInt(data.derivedStats.fatigue.modifier);

        return data;
    }

    getMaxInjuries() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
    }

    getMaxWounds() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
    }

    calcIntrigueDefense() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.CUNNING)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.STATUS));
    }

    calculateMovementData() {
        let data = this.getCSData();
        data.movement.base = ChronicleSystem.defaultMovement;
        let runFormula = ChronicleSystem.getActorAbilityFormula(this, SystemUtils.localize(ChronicleSystem.keyConstants.ATHLETICS), SystemUtils.localize(ChronicleSystem.keyConstants.RUN));
        data.movement.runBonus = Math.floor(runFormula.bonusDice / 2);
        let bulkMod = this.getModifier(SystemUtils.localize(ChronicleSystem.modifiersConstants.BULK));
        data.movement.bulk = Math.floor(bulkMod.total/2);
        data.movement.total = Math.max(data.movement.base + data.movement.runBonus - data.movement.bulk + parseInt(data.movement.modifier), 1);
        data.movement.sprintTotal = data.movement.total * data.movement.sprintMultiplier - data.movement.bulk;
    }

    _onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId);
        this.updateTempModifiers();
        result.forEach((doc) => {
            let item = this.items.find((item) => item._id === doc._id);
            if (item) {
                item.onObtained(this);
                item.onEquippedChanged(this, item.getCSData().equipped > 0);
            }
        })
        this.saveModifiers();
    }
}

import {CSItem} from "./csItem.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";

export class CSArmorItem extends CSItem {
    onEquippedChanged(actor, isEquipped) {
        LOGGER.trace(`Armor ${this._id} ${isEquipped? "equipped" : "unequipped" } by the actor ${actor.name} | csArmorItem.js`);
        super.onEquippedChanged(actor, isEquipped);
        if (isEquipped) {
            actor.addModifier(ChronicleSystem.modifiersConstants.AGILITY, this._id, this.getCSData().penalty);
            actor.addModifier(ChronicleSystem.modifiersConstants.COMBAT_DEFENSE, this._id, this.getCSData().penalty);
            actor.addModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this._id, this.getCSData().rating);
        } else {
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, this._id);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this._id);
            actor.removeModifier(ChronicleSystem.modifiersConstants.COMBAT_DEFENSE, this._id);
        }
    }

    onObtained(actor) {
        LOGGER.trace(`Armor ${this._id} obtained by the actor ${actor.name} | csArmorItem.js`);
        super.onObtained(actor);
        if (this.getCSData().bulk > 0) {
            actor.addModifier(ChronicleSystem.modifiersConstants.BULK, this._id, this.getCSData().bulk);
        }
    }

    onDiscardedFromActor(actor, oldId) {
        LOGGER.trace(`Armor ${oldId} Discarded from actor | csArmorItem.js`);
        super.onDiscardedFromActor(actor, oldId);
        if (this.getCSData().bulk > 0) {
            actor.removeModifier(ChronicleSystem.modifiersConstants.BULK, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, oldId);
        }
    }
}

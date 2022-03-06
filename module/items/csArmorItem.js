import {CSItem} from "./csItem.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";

export class CSArmorItem extends CSItem {
    onEquippedChanged(actor, isEquipped) {
        LOGGER.trace(`Armor ${this.data._id} ${isEquipped? "equipped" : "unequipped" } by the actor ${actor.name} | csArmorItem.js`);
        super.onEquippedChanged(actor, isEquipped);
        if (isEquipped) {
            actor.addModifier(ChronicleSystem.modifiersConstants.AGILITY, this.data._id, this.data.data.penalty);
            actor.addModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this.data._id, this.data.data.rating);
        } else {
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, this.data._id);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this.data._id);
        }
    }

    onObtained(actor) {
        LOGGER.trace(`Armor ${this.data._id} obtained by the actor ${actor.name} | csArmorItem.js`);
        super.onObtained(actor);
        if (this.data.data.bulk > 0) {
            actor.addModifier(ChronicleSystem.modifiersConstants.BULK, this.data._id, this.data.data.bulk);
        }
    }

    onDiscardedFromActor(actor, oldId) {
        LOGGER.trace(`Armor ${oldId} Discarded from actor | csArmorItem.js`);
        super.onDiscardedFromActor(actor, oldId);
        if (this.data.data.bulk > 0) {
            actor.removeModifier(ChronicleSystem.modifiersConstants.BULK, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, oldId);
        }
    }
}
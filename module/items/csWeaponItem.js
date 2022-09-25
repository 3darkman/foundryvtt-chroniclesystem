import {CSItem} from "./csItem.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";

export class CSWeaponItem extends CSItem {
    onEquippedChanged(actor, isEquipped) {
        LOGGER.trace(`Weapon ${this._id} ${isEquipped? "equipped" : "unequipped" } by the actor ${actor.name} | csWeaponItem.js`);
        super.onEquippedChanged(actor, isEquipped);
        //TODO: implement the onEquippedChanged from CSWeaponItem
    }

    onObtained(actor) {
        LOGGER.trace(`Weapon ${this._id} obtained by the actor ${actor.name} | csWeaponItem.js`);
        super.onObtained(actor);
        let qualities = this.getCSData().qualities;
        Object.values(qualities).forEach(quality => {
            switch (quality.name.toLowerCase())
            {
                case ChronicleSystem.modifiersConstants.BULK:
                    actor.addModifier(ChronicleSystem.modifiersConstants.BULK, this._id, parseInt(quality.parameter));
                    break;
            }
        });
    }

    onDiscardedFromActor(actor, oldId) {
        LOGGER.trace(`Weapon ${oldId} Discarded from actor | csWeaponItem.js`);
        super.onDiscardedFromActor(actor, oldId);
        let qualities = this.getCSData().qualities;
        console.log(qualities);
        Object.values(qualities).forEach(quality => {
            switch (quality.name.toLowerCase())
            {
                case ChronicleSystem.modifiersConstants.BULK:
                    actor.removeModifier(ChronicleSystem.modifiersConstants.BULK, oldId);
                    break;
            }
        });
    }
}
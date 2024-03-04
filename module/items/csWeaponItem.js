import {CSItem} from "./csItem.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";

export class CSWeaponItem extends CSItem {
    onEquippedChanged(actor, isEquipped) {
        LOGGER.trace(`Weapon ${this._id} ${isEquipped? "equipped" : "unequipped" } by the actor ${actor.name} | csWeaponItem.js`);
        super.onEquippedChanged(actor, isEquipped);
        //TODO: implement the onEquippedChanged from CSWeaponItem
    }

    updateDamageValue(actor) {
        let matches = this.getCSData().damage.match('@([a-z\sA-Z]*)([-\+\/\*]*)([0-9]*)');
        if (matches) {
            if (matches.length === 4) {
                let ability = actor.getAbilityValue(matches[1]);
                this.damageValue = eval(`${ability}${matches[2]}${matches[3]}`);
                let adaptableQuality = Object.values(this.getCSData().qualities).filter((quality) => quality.name.toLowerCase() === "adaptable");
                if(adaptableQuality.length > 0 && this.getCSData().equipped === ChronicleSystem.equippedConstants.BOTH_HANDS) {
                    this.damageValue += 1;
                }
            }
        }
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
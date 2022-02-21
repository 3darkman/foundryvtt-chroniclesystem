import {ChronicleSystem} from "../ChronicleSystem.js";

export class ChronicleSystemItem extends Item {

    getChronicleSystemItemData() {
        return this.data.data;
    }

    prepareData() {
        super.prepareData();
    }

    onEquippedChanged(actor, isEquipped) {
        switch (this.type) {
            case "weapon":
                this._onWeaponEquippedChanged(actor, isEquipped);
                break;
            case "armor":
                this._onArmorEquippedChanged(actor, isEquipped);
                break;
        }
    }

    onObtained(actor) {
        switch (this.type) {
            case "weapon":
                this._onWeaponObtained(actor);
                break;
            case "armor":
                this._onArmorObtained(actor);
                break;
        }
    }

    onDiscardedFromActor(actor, oldId) {
        switch (this.type) {
            case "weapon":
                this._onWeaponDiscarded(actor, oldId);
                break;
            case "armor":
                this._onArmorDiscarded(actor, oldId);
                break;
        }
    }

    _onWeaponDiscarded(actor, oldId) {
        let qualities = this.data.data.qualities;
        Object.values(qualities).forEach(quality => {
            switch (quality.name.toLowerCase())
            {
                case ChronicleSystem.keyConstants.BULK:
                    actor.removeModifier(ChronicleSystem.modifiersConstants.BULK, oldId);
                    break;
            }
        });
    }

    _onWeaponObtained(actor) {
        let qualities = this.data.data.qualities;
        Object.values(qualities).forEach(quality => {
            switch (quality.name.toLowerCase())
            {
                case ChronicleSystem.keyConstants.BULK:
                    actor.addModifier(ChronicleSystem.modifiersConstants.BULK, this.data._id, parseInt(quality.parameter));
                    break;
            }
        });
    }

    _onArmorObtained(actor) {
        if (this.data.data.bulk > 0) {
            actor.addModifier(ChronicleSystem.modifiersConstants.BULK, this.data._id, this.data.data.bulk);
        }
    }

    _onArmorDiscarded(actor, oldId) {
        if (this.data.data.bulk > 0) {
            actor.removeModifier(ChronicleSystem.modifiersConstants.BULK, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, oldId);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, oldId);
        }
    }

    _onWeaponEquippedChanged(actor, isEquipped) {
        
    }

    _onArmorEquippedChanged(actor, isEquipped) {
        if (isEquipped) {
            actor.addModifier(ChronicleSystem.modifiersConstants.AGILITY, this.data._id, this.data.data.penalty);
            actor.addModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this.data._id, this.data.data.rating);
        } else {
            actor.removeModifier(ChronicleSystem.modifiersConstants.AGILITY, this.data._id);
            actor.removeModifier(ChronicleSystem.modifiersConstants.DAMAGE_TAKEN, this.data._id);
        }
    }
}
import {ChronicleSystem} from "../system/ChronicleSystem.js";

export class CSItem extends Item {

    getCSData() {
        return this.system;
    }

    prepareData() {
        super.prepareData();
    }

    onEquippedChanged(actor, isEquipped) { }

    onObtained(actor) { }

    onDiscardedFromActor(actor, oldId) { }

    _onArmorEquippedChanged(actor, isEquipped) {

    }
}

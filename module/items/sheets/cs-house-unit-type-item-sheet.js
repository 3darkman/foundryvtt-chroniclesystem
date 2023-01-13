import {CSItemSheet} from "./csItemSheet.js";
import LOGGER from "../../utils/logger.js";
import {CSConstants} from "../../system/csConstants.js";

export class CsHouseUnitTypeItemSheet extends CSItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["chroniclesystem", "uniType", "sheet", "item"],
            width: 700,
            height: 700,
            tabs: [
                {
                    navSelector: ".tabs",
                    contentSelector: ".sheet-body",
                    initial: "details"
                }
            ]
        });
    }

    getData() {
        const data = super.getData();
        let abilities = {};
        ChronicleSystem.getAllItemFromType("ability").forEach((ability) => {
            abilities[ability.name] = ability.name;
        });
        data.abilities = abilities;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        $('.hasAnotherCost').on("click", this._onClickHasAnotherCost.bind(this));
        $('.hasModifierByTraining').on("click", this._onClickHasModifierByTraining.bind(this));
        $('.startingIsCloseRange').on("click", this._onClickStartingIsCloseRange.bind(this));
        $('.startingIsLongRange').on("click", this._onClickStartingIsLongRange.bind(this));
        $('.upgradedIsCloseRange').on("click", this._onClickUpgradedIsCloseRange.bind(this));
        $('.upgradedIsLongRange').on("click", this._onClickUpgradedIsLongRange.bind(this));
        $('.allowAnyAbilities').on("click", this._onClickAllowAnyAbilities.bind(this));
    }

    async _onClickHasAnotherCost(ev) {
        ev.preventDefault();
        await this.item.update({"data.hasAnotherCost": !this.item.getCSData().hasAnotherCost});
    }

    async _onClickAllowAnyAbilities(ev) {
        ev.preventDefault();
        await this.item.update({"data.allowAnyAbility": !this.item.getCSData().allowAnyAbility});
    }

    async _onClickHasModifierByTraining(ev) {
        ev.preventDefault();
        await this.item.update({"data.anotherCost.hasModifierByTraining": !this.item.getCSData().anotherCost.hasModifierByTraining});
    }

    async _onClickStartingIsCloseRange(ev) {
        ev.preventDefault();
        await this.item.update({"data.startingEquipment.isCloseRange": !this.item.getCSData().startingEquipment.isCloseRange});
    }

    async _onClickStartingIsLongRange(ev) {
        ev.preventDefault();
        await this.item.update({"data.startingEquipment.isLongRange": !this.item.getCSData().startingEquipment.isLongRange});
    }

    async _onClickUpgradedIsCloseRange(ev) {
        ev.preventDefault();
        await this.item.update({"data.upgradedEquipment.isCloseRange": !this.item.getCSData().upgradedEquipment.isCloseRange});
    }

    async _onClickUpgradedIsLongRange(ev) {
        ev.preventDefault();
        await this.item.update({"data.upgradedEquipment.isLongRange": !this.item.getCSData().upgradedEquipment.isLongRange});
    }

    override

    _updateObject(event, formData) {
        LOGGER.debugObject(formData);
        formData["system.anotherCost.modifierByTraining.0.training"] = CSConstants.UnitTrainingLevel[0];
        formData["system.anotherCost.modifierByTraining.1.training"] = CSConstants.UnitTrainingLevel[1];
        formData["system.anotherCost.modifierByTraining.2.training"] = CSConstants.UnitTrainingLevel[2];
        formData["system.anotherCost.modifierByTraining.3.training"] = CSConstants.UnitTrainingLevel[3];
        return super._updateObject(event, formData);
    }
}
import {CSItemSheet} from "./csItemSheet.js";
import LOGGER from "../../utils/logger.js";

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

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.hasAnotherCost').on("click", this._onClickHasAnotherCost.bind(this));
        html.find('.hasModifierByTraining').on("click", this._onClickHasModifierByTraining.bind(this));
        html.find('.startingIsCloseRange').on("click", this._onClickStartingIsCloseRange.bind(this));
        html.find('.startingIsLongRange').on("click", this._onClickStartingIsLongRange.bind(this));
        html.find('.upgradedIsCloseRange').on("click", this._onClickUpgradedIsCloseRange.bind(this));
        html.find('.upgradedIsLongRange').on("click", this._onClickUpgradedIsLongRange.bind(this));
    }

    async _onClickHasAnotherCost(ev) {
        ev.preventDefault();
        await this.item.update({"data.hasAnotherCost": !this.item.getCSData().hasAnotherCost});
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
        formData["system.anotherCost.modifierByTraining.0.training"] = "CS.sheets.houseUnit.trainingRanks.Green";
        formData["system.anotherCost.modifierByTraining.1.training"] = "CS.sheets.houseUnit.trainingRanks.Trained";
        formData["system.anotherCost.modifierByTraining.2.training"] = "CS.sheets.houseUnit.trainingRanks.Veteran";
        formData["system.anotherCost.modifierByTraining.3.training"] = "CS.sheets.houseUnit.trainingRanks.Elite";
        return super._updateObject(event, formData);
    }
}
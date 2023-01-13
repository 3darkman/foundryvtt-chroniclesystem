import {CSActorSheet} from "./csActorSheet.js";
import {CSConstants} from "../../system/csConstants.js";
import LOGGER from "../../utils/logger.js";
import SystemUtils from "../../utils/systemUtils.js";

export class CsHouseUnitActorSheet extends CSActorSheet {
    itemTypesPermitted = [
        "unitType"
    ]

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["chroniclesystem", "sheet", "unit", "actor"],
            template: "systems/chroniclesystem/templates/actors/units/house-unit-sheet.hbs",
            width: 800,
            height: 600,
            tabs: [
                {
                    navSelector: ".tabs",
                    contentSelector: ".sheet-body",
                    initial: "resources"
                }
            ],
            dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Update Inventory Item
        $('.subAbilityRank').click(this._subAbilityRank.bind(this));
        $('.addAbilityRank').click(this._addAbilityRank.bind(this));
    }

    _subAbilityRank(event) {
        event.preventDefault();
        let id = $(event.currentTarget).data('itemId');
        let ability = this.actor.items.get(id);

        if (ability.system.rating <= 2) {
            SystemUtils.displayMessage("notify", SystemUtils.localize("CS.messages.abilityMin"));
            return;
        }

        if (ability)
            ability.update({'data.rating': ability.system.rating - 1});
    }

    _addAbilityRank(event) {
        event.preventDefault();
        let id = $(event.currentTarget).data('itemId');
        let ability = this.actor.items.get(id);

        if (this.actor.getCSData().xp.value >= this.actor.getCSData().xp.max) {
            SystemUtils.displayMessage("notify", SystemUtils.localize("CS.messages.noXp"));
            return;
        }

        if (ability)
            ability.update({'data.rating': ability.system.rating + 1});
    }

    isItemPermitted(type) {
        return this.itemTypesPermitted.includes(type);
    }

    getData() {
        const data = super.getData();
        data.dtypes = ["String", "Number", "Boolean"];
        this.splitItemsByType(data);

        let unit = data.actor.getCSData();
        this.isOwner = this.actor.isOwner;

        unit.owned.abilities = this._checkNull(data.itemsByType['ability']).sort((a, b) => a.name.localeCompare(b.name));
        unit.owned.types = this._checkNull(data.itemsByType['unitType']).sort((a, b) => a.name.localeCompare(b.name));

        unit.xp.max = data.actor.getExperienceTotal();
        unit.xp.value = data.actor.getExperienceCurrent();
        unit.discipline = {
            base: data.actor.getDisciplineBase(),
            modifier: data.actor.getDisciplineModifier(),
            total: data.actor.getDisciplineTotal()
        }

        unit.powerCost = data.actor.getPowerCostTotal();

        data.unit = unit;
        data.anotherCosts = {
            list: data.actor.getAnotherCosts(),
            string: data.actor.getAnotherCostsAsString()
        };

        data.trainingLevels = {};
        CSConstants.UnitTrainingLevel.forEach((level, index) => {
            data.trainingLevels[index] = level;
        })

        return data;
    }
}
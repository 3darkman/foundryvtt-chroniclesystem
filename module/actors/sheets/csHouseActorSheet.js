import {CSActorSheet} from "./csActorSheet.js";
import {CSConstants} from "../../system/csConstants.js";
import SystemUtils from "../../utils/systemUtils.js";
import LOGGER from "../../utils/logger.js";
import {ChronicleSystem} from "../../system/ChronicleSystem.js";

export class CSHouseActorSheet extends CSActorSheet {
    itemTypesPermitted = [
        "event",
        "holding"
    ]

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["chroniclesystem", "sheet", "house", "actor"],
            template: "systems/chroniclesystem/templates/actors/houses/house-sheet.html",
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

    getData(options) {
        let data =  super.getData(options);

        this.splitItemsByType(data);

        let house = data.data.data;

        house.historicalEvents = this._checkNull(data.itemsByType['event']);

        this.prepareHoldingData(house, data);

        this.prepareRolesData(house, data);

        this.prepareFortuneData(house, data);

        return data;
    }

    prepareRolesData(house, data) {
        house.head = data.actor.getCharactersFromRole(data.actor.roleMap.HEAD);
        house.steward = data.actor.getCharactersFromRole(data.actor.roleMap.STEWARD);
        house.heirs = data.actor.getCharactersFromRole(data.actor.roleMap.HEIR);
        house.family = data.actor.getCharactersFromRole(data.actor.roleMap.FAMILY);
        house.retainers = data.actor.getCharactersFromRole(data.actor.roleMap.RETAINER);
        house.servants = data.actor.getCharactersFromRole(data.actor.roleMap.SERVANT);
    }

    prepareFortuneData(house, data) {
        if (!house.steward.id)
            return;
        house.fortune = {
            lawMod: data.actor.getLawModifier(),
            populationMod: data.actor.getPopulationModifier(),
            holdingsMod: 0
        }
        const steward = game.actors.get(house.steward.id);
        let stewardshipFormula = ChronicleSystem.getActorAbilityFormula(steward, SystemUtils.localize(ChronicleSystem.keyConstants.STATUS), SystemUtils.localize(ChronicleSystem.keyConstants.STEWARDSHIP));
        stewardshipFormula.modifier = stewardshipFormula.modifier + house.fortune.lawMod + house.fortune.populationMod + house.fortune.holdingsMod;
        house.fortune.formula = stewardshipFormula;
    }

    prepareHoldingData(house, data) {
        house.holdings = {
            defense: [],
            influence: [],
            lands: [],
            law: [],
            population: [],
            power: [],
            wealth: []
        }

        let holdings = this._checkNull(data.itemsByType['holding']);
        holdings.forEach((holding) => {
            let doc = this.actor.getEmbeddedDocument('Item', holding._id);
            house.holdings[holding.data.resource].push(holding);
            if (!house[holding.data.resource].invested)
                house[holding.data.resource].invested = 0;
            house[holding.data.resource].invested += doc.getTotalInvested();
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        html.find('.item .item-controls').on('click', (ev) => {
            $(ev.currentTarget).parents('.item').find('.description').slideToggle();
        });

        html.find(".family-list").on("click", ".item-control", this._onclickMemberControl.bind(this));
        html.find(".servants-list").on("click", ".item-control", this._onclickMemberControl.bind(this));
        html.find('.member-name').click(this._openActorSheet.bind(this));
        html.find('.resource-edit').click(this._openResourceEditor.bind(this));
        html.find('.regenerate-resources').click(this._regenerateResources.bind(this));

    }

    async _onclickMemberControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const actorId = a.dataset.id;
        const action = a.dataset.action;
        const role = a.dataset.role;

        if ( action === "delete" ) {
            this.actor.removeCharacterFromHouse(actorId, role);
        }
    }

    async _regenerateResources(event) {
        event.preventDefault();
        await this.actor.regenerateAllStartingResources();
    }

    async _openResourceEditor(ev) {
        ev.preventDefault();
        let resourceId = ev.currentTarget.dataset.id;
        let resourceName = ev.currentTarget.dataset.name;

        if (!resourceId || !resourceName)
            return;

        const template = CSConstants.Templates.Dialogs.HOUSE_RESOURCE_EDITOR;
        const html = await renderTemplate(template, {
            startingValue: this.actor.data.data[resourceId].startingValue,
            description: this.actor.data.data[resourceId].description,
            resourceId: resourceId});
        return new Promise(resolve => {
            const data = {
                title: SystemUtils.format("CS.dialogs.houseResourceEditor.title", {resourceName: resourceName}),
                content: html,
                buttons: {
                    normal: {
                        label: SystemUtils.localize("CS.dialogs.actions.save"),
                        callback: html => resolve(this._processResourceEdition(html[0].querySelector("form")))
                    },
                    cancel: {
                        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
                        callback: html => resolve({cancelled: true})
                    }
                },
                default: "normal",
                close: () => resolve({cancelled: true})
            };
            new Dialog(data, null).render(true);
        })
    }

    _processResourceEdition(formData) {
        this.actor.changeResource(formData.resourceId.value, formData.startingValue.value, formData.description.value);
        return true;
    }

    _openActorSheet(ev) {
        ev.preventDefault();
        const id = ev.currentTarget.dataset.id;
        const actor = game.actors.get(id);
        if (actor)
            actor.sheet.render(true);
    }

    isItemPermitted(type) {
        return this.itemTypesPermitted.includes(type);
    }

    async _onDropActor(event, data) {
        event.preventDefault();
        if ( !this.actor.isOwner ) return false;

        let actor = game.actors.get(data.id);
        if (actor && actor.type === "character") {
            await this.showCharacterRoleDialog(actor);
        }
    }

    async _onDropItemCreate(itemData) {
        let embeddedItem = [];
        let itemsToCreate = [];
        let data = [];

        let eventsCanGenerateModifiers = [];

        data = data.concat(itemData);
        for (let i = 0; i < data.length; i++){
            const doc = data[i];
            if (this.isItemPermitted(doc.type)) {
                if (doc.type === "event") {
                    await this.showAddingEventDialog(doc)
                        .then((result) => {
                            if (!result.cancelled) {
                                let generateData = this._processAddingEvent(result);
                                if (generateData.canGenerate) {
                                    eventsCanGenerateModifiers.push({doc: doc.name, choices: generateData.choices});
                                }
                                itemsToCreate.push(doc);
                            }
                        });
                } else {
                    itemsToCreate.push(doc);
                }
            }
        }

        if (itemsToCreate.length > 0) {
            this.actor.createEmbeddedDocuments("Item", itemsToCreate)
                .then(function(result) {
                    result.forEach((item) => {
                        let event = eventsCanGenerateModifiers.find(ev => ev.doc === item.name);
                        if (event)
                            item.generateModifiers(event.choices);
                        item.onObtained(item.actor);
                    });
                    embeddedItem.concat(result);
                });
        }

        return embeddedItem;
    }


    async showAddingEventDialog(event) {
        LOGGER.trace("show adding event dialog | CSHouseActorSheet |" +
            " csHouseActorSheet.js");
        const template = CSConstants.Templates.Dialogs.ADDING_HOUSE_EVENT;
        const html = await renderTemplate(template, {data: event, choices: CSConstants.HouseResources, id: event.id});
        return new Promise(resolve => {
            const data = {
                title: SystemUtils.localize("CS.dialogs.addingHouseEvent.title"),
                content: html,
                buttons: {
                    normal: {
                        label: SystemUtils.localize("CS.dialogs.actions.save"),
                        callback: html => resolve({data: html[0].querySelector("form"), event: event})
                    },
                    cancel: {
                        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
                        callback: html => resolve({cancelled: true})
                    }
                },
                default: "normal",
                close: () => resolve({cancelled: true})
            };
            new Dialog(data, null).render(true);
        })
    }

    _processAddingEvent(formData) {
        if (!formData.data.generateModifiers.checked)
            return { canGenerate: false };

        let choices = [];
        for (let i = 1; i <= formData.event.data.numberOfChoices; i++) {
            choices.push(formData.data[`resource_${i}`].value);
        }
        return {canGenerate: true, choices: choices};
    }

    async showCharacterRoleDialog(actor) {
        LOGGER.trace("show character role dialog | CSHouseActorSheet |" +
            " csHouseActorSheet.js");
        const template = CSConstants.Templates.Dialogs.CHARACTER_ROLE_IN_HOUSE;
        const html = await renderTemplate(template, {choices: CSConstants.HouseRoles, value: "HEAD", id: actor.id});
        return new Promise(resolve => {
            const data = {
                title: SystemUtils.format("CS.dialogs.characterRole.title", {actorName: actor.name}),
                content: html,
                buttons: {
                    normal: {
                        label: SystemUtils.localize("CS.dialogs.actions.save"),
                        callback: html => resolve(this._processCharacterRole(html[0].querySelector("form")))
                    },
                    cancel: {
                        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
                        callback: html => resolve({cancelled: true})
                    }
                },
                default: "normal",
                close: () => resolve({cancelled: true})
            };
            new Dialog(data, null).render(true);
        })
    }

    _processCharacterRole(formData) {
        this.actor.addCharacterToHouse(formData.characterId.value, formData.characterRole.value, formData.description.value);
        return true;
    }
}
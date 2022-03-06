import {CSActorSheet} from "./csActorSheet.js";
import {CSConstants} from "../../system/csConstants.js";
import SystemUtils from "../../utils/systemUtils.js";
import LOGGER from "../../utils/logger.js";

export class CSHouseActorSheet extends CSActorSheet {
    itemTypesPermitted = [
        "event",
        "holding"
    ]

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["chroniclesystem", "sheet", "house"],
            template: "systems/chroniclesystem/templates/actors/houses/house-sheet.html",
            width: 700,
            height: 600,
            dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
        });
    }

    getData(options) {
        let data =  super.getData(options);

        let house = data.data.data;

        house.head = data.actor.getCharactersFromRole(data.actor.roleMap.HEAD);
        house.steward = data.actor.getCharactersFromRole(data.actor.roleMap.STEWARD);
        house.heirs = data.actor.getCharactersFromRole(data.actor.roleMap.HEIR);
        house.family = data.actor.getCharactersFromRole(data.actor.roleMap.FAMILY);
        house.retainers = data.actor.getCharactersFromRole(data.actor.roleMap.RETAINER);
        house.servants = data.actor.getCharactersFromRole(data.actor.roleMap.SERVANT);

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        html.find('.head-name').click(this._openActorSheet.bind(this));
        html.find('.resource-edit').click(this._openResourceEditor.bind(this));
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
        this.actor.addCharacterToHouse(formData.characterId.value, formData.characterRole.value);
        return true;
    }
}
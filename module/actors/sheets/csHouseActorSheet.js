import {CSActorSheet} from "./csActorSheet.js";
import {CSConstants} from "../../system/csConstants.js";
import SystemUtils from "../../utils/systemUtils.js";
import LOGGER from "../../utils/logger.js";

export class CSHouseActorSheet extends CSActorSheet {
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

    async _onDropActor(event, data) {
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
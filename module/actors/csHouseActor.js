import {CSActor} from "./csActor.js";
import LOGGER from "../utils/logger.js";
import SystemUtils from "../utils/systemUtils.js";

export class CSHouseActor extends CSActor {
    roleMap = {
        HEAD: "head",
        STEWARD: "steward",
        HEIR: "heirs",
        FAMILY: "family",
        RETAINER: "retainers",
        SERVANT: "servants"
    }

    removeCharacterFromHouse(actorId, role = undefined, ignoreRoles = ["STEWARD",]) {
        if (role) {
            let result = this.characterHasRole(actorId, role);
            if (result.hasRole)
                this._removeCharacterFromRole(role, actorId, result.index);
        } else {
            Object.entries(this.roleMap).forEach((item) =>{
                if  (!ignoreRoles.includes(item[0])) {
                    let result = this.characterHasRole(actorId, item[0]);
                    if (result.hasRole)
                        this._removeCharacterFromRole(item[0], actorId, result.index);
                }
            });
        }
    }

    characterHasRole(actorId, role) {
        LOGGER.trace(`Check if the Character has the Role ${role} | CSHouseActor | csHouseActor.js`);
        let result = {
            hasRole : false,
            index : -1
        }
        switch (role) {
            case "STEWARD":
            case "HEAD":
                if (this.data.data.members[this.roleMap[role]] === actorId) {
                    result.hasRole = true;
                }
                break;
            case "HEIR":
            case "FAMILY":
            case "RETAINER":
            case "SERVANT":
                let list = this.getCSData().members[this.roleMap[role]];
                let index = list.indexOf(actorId);
                if (index >= 0) {
                    result.hasRole = true;
                    result.index = index;
                }
                break;
        }
        if (result.hasRole)
            LOGGER.debug(`actor ${actorId} is founded as ${role}`);
        return result;
    }

    _removeCharacterFromRole(role, actorId, index = -1) {
        LOGGER.trace("Remove the Character from a Role | CSHouseActor |" +
            " csHouseActor.js");
        let founded = false;
        switch (role) {
            case "STEWARD":
            case "HEAD":
                if (this.data.data.members[this.roleMap[role]] === actorId) {
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({[key]: ""});
                    founded = true;
                }
                break;
            case "HEIR":
            case "FAMILY":
            case "RETAINER":
            case "SERVANT":
                let list = this.getCSData().members[this.roleMap[role]];
                if (index < 0)
                    index = list.indexOf(actorId);
                if (index >= 0) {
                    list.splice(index);
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({
                        [key]: list
                    });
                    founded = true;
                }
                break;
        }

        if (founded)
            LOGGER.debug(`actor ${actorId} removed from ${role}`);
    }

    changeResource(resourceId, startingValue, description) {
        let newResourceValue = {
            startingValue: startingValue,
            description: description
        }
        let key = `data.${resourceId}`;
        this.update({[key]: newResourceValue});
    }

    addCharacterToHouse(actorId, role) {
        LOGGER.trace("Add Character to House | CSHouseActor | csHouseActor.js");
        let result = this.characterHasRole(actorId, role);
        if (result.hasRole) {
            return;
        }
        if (role !== "STEWARD") {
            this.removeCharacterFromHouse(actorId);
        }
        switch (role) {
            case "STEWARD":
            case "HEAD":
                let key = `data.members.${[this.roleMap[role]]}`;
                this.update({[key]: actorId});
                break;
            case "HEIR":
            case "FAMILY":
            case "RETAINER":
            case "SERVANT":
                let list = this.getCSData().members[this.roleMap[role]];
                if (!list.includes(actorId)) {
                    list.push(actorId);
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({
                        [key]: list
                    });
                } else {
                    LOGGER.debug(`actor is already part of the house ${this.roleMap[role]}`);
                }
                break;
        }
    }

    getCharactersFromRole(role) {
        LOGGER.trace(`get Characters from Role ${role} | CSHouseActor | csActorHouse.js`);
        let membersData = this.getCSData().members[role];
        let members = [];
        if (Array.isArray(membersData)) {
            membersData.forEach((id) => {
                members.push({"name": this._getCharacterNameById(id), "id": id});
            })
        } else {
            members = {"name": this._getCharacterNameById(membersData), "id": membersData};
        }
        return members;
    }

    _getCharacterNameById(id) {
        if (!id)
            return SystemUtils.localize("CS.messages.nobodyHasBeenChosen");
        let actor = game.actors.get(id);
        let name = SystemUtils.localize('CS.messages.actorDoesntExists');
        if (actor) {
            name = actor.name;
        }
        return name;
    }
}
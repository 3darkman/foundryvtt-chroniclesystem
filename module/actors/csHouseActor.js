import { CSActor } from './csActor.js';
import LOGGER from '../utils/logger.js';
import SystemUtils from '../utils/systemUtils.js';
import { ChronicleSystem } from '../system/ChronicleSystem.js';
import { CSConstants } from '../system/csConstants.js';

export class CSHouseActor extends CSActor {
    roleMap = {
        HEAD: 'head',
        STEWARD: 'steward',
        HEIR: 'heirs',
        FAMILY: 'family',
        RETAINER: 'retainers',
        SERVANT: 'servants',
    };

    removeCharacterFromHouse(
        actorId,
        role = undefined,
        ignoreRoles = ['STEWARD']
    ) {
        if (role) {
            let result = this.characterHasRole(actorId, role);
            if (result.hasRole)
                this._removeCharacterFromRole(role, actorId, result.index);
        } else {
            Object.entries(this.roleMap).forEach((item) => {
                if (!ignoreRoles.includes(item[0])) {
                    let result = this.characterHasRole(actorId, item[0]);
                    if (result.hasRole)
                        this._removeCharacterFromRole(
                            item[0],
                            actorId,
                            result.index
                        );
                }
            });
        }
    }

    async regenerateAllStartingResources() {
        let data = this.getCSData();
        await this._regenerateResource(data, 'defense');
        await this._regenerateResource(data, 'influence');
        await this._regenerateResource(data, 'lands');
        await this._regenerateResource(data, 'law');
        await this._regenerateResource(data, 'population');
        await this._regenerateResource(data, 'power');
        await this._regenerateResource(data, 'wealth');

        this._updateAllResourcesTotal(data);
    }

    async _regenerateResource(data, resource) {
        let roll = new Roll('8d6-2d6');
        await roll.evaluate({ async: true });
        data[resource].startingValue = roll.total;
    }

    _onCreateEmbeddedDocuments(
        embeddedName,
        documents,
        result,
        options,
        userId
    ) {
        super._onCreateEmbeddedDocuments(
            embeddedName,
            documents,
            result,
            options,
            userId
        );

        let isToUpdate = documents.find((doc) => doc.type === 'event');

        if (isToUpdate) this._updateAllResourcesTotal();
    }

    _onUpdateEmbeddedDocuments(
        embeddedName,
        documents,
        result,
        options,
        userId
    ) {
        super._onUpdateEmbeddedDocuments(
            embeddedName,
            documents,
            result,
            options,
            userId
        );

        let isToUpdate = documents.find((doc) => doc.type === 'event');

        if (isToUpdate) this._updateAllResourcesTotal();
    }

    _onDeleteEmbeddedDocuments(
        embeddedName,
        documents,
        result,
        options,
        userId
    ) {
        super._onDeleteEmbeddedDocuments(
            embeddedName,
            documents,
            result,
            options,
            userId
        );

        let isToUpdate = documents.find((doc) => doc.type === 'event');

        if (isToUpdate) this._updateAllResourcesTotal();
    }

    characterHasRole(actorId, role) {
        LOGGER.trace(
            `Check if the Character has the Role ${role} | CSHouseActor | csHouseActor.js`
        );
        let result = {
            hasRole: false,
            index: -1,
        };
        switch (role) {
            case 'STEWARD':
            case 'HEAD':
                if (
                    this.getCSData().members[this.roleMap[role]].id === actorId
                ) {
                    result.hasRole = true;
                }
                break;
            case 'HEIR':
            case 'FAMILY':
            case 'RETAINER':
            case 'SERVANT':
                let index = this._getMemberIndexIfExists(role, actorId);
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

    _getMemberIndexIfExists(role, id, list = undefined) {
        if (!list) list = this.getCSData().members[this.roleMap[role]];
        let index = list.findIndex((member) => member.id === id);
        return index;
    }

    _removeCharacterFromRole(role, actorId, index = -1) {
        LOGGER.trace(
            'Remove the Character from a Role | CSHouseActor |' +
                ' csHouseActor.js'
        );
        let founded = false;
        switch (role) {
            case 'STEWARD':
            case 'HEAD':
                if (
                    this.getCSData().members[this.roleMap[role]].id === actorId
                ) {
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({ [key]: '' });
                    founded = true;
                }
                break;
            case 'HEIR':
            case 'FAMILY':
            case 'RETAINER':
            case 'SERVANT':
                let list = this.getCSData().members[this.roleMap[role]];
                if (index < 0)
                    index = this._getMemberIndexIfExists(role, actorId, list);
                if (index >= 0) {
                    list.splice(index);
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({
                        [key]: list,
                    });
                    founded = true;
                }
                break;
        }

        if (founded) LOGGER.debug(`actor ${actorId} removed from ${role}`);
    }

    changeResource(resourceId, startingValue, description) {
        let data = this.getCSData();
        data[resourceId].startingValue = parseInt(startingValue);
        data[resourceId].description = description;
        data[resourceId].total = this._updateResourceTotal(data, resourceId);
        let key = `data.${resourceId}`;
        this.update({ [key]: data[resourceId] });
    }

    addCharacterToHouse(actorId, role, description) {
        LOGGER.trace('Add Character to House | CSHouseActor | csHouseActor.js');
        let result = this.characterHasRole(actorId, role);
        if (result.hasRole) {
            return;
        }
        if (role !== 'STEWARD') {
            this.removeCharacterFromHouse(actorId);
        }
        switch (role) {
            case 'HEAD':
                if (!description) {
                    description = SystemUtils.localize(
                        'CS.sheets.house.labels.head'
                    );
                }
            case 'STEWARD':
                let key = `data.members.${[this.roleMap[role]]}`;
                this.update({
                    [key]: { id: actorId, description: description },
                });
                break;
            case 'HEIR':
            case 'FAMILY':
            case 'RETAINER':
            case 'SERVANT':
                let list = this.getCSData().members[this.roleMap[role]];
                if (this._getMemberIndexIfExists(role, actorId, list) < 0) {
                    list.push({ id: actorId, description: description });
                    let key = `data.members.${[this.roleMap[role]]}`;
                    this.update({
                        [key]: list,
                    });
                } else {
                    LOGGER.debug(
                        `actor is already part of the house ${this.roleMap[role]}`
                    );
                }
                break;
        }
    }

    getCharactersFromRole(role) {
        LOGGER.trace(
            `get Characters from Role ${role} | CSHouseActor | csActorHouse.js`
        );
        let membersData = this.getCSData().members[role];
        let members = [];
        if (Array.isArray(membersData)) {
            membersData.forEach((member) => {
                let actor = this._getCharacterDataById(member.id);
                members.push({
                    name: actor.name,
                    age: actor.age,
                    id: member.id,
                    description: member.description,
                });
            });
        } else {
            let actor = this._getCharacterDataById(membersData.id);
            members = {
                name: actor.name,
                age: actor.age,
                id: membersData.id,
                description: membersData.description,
            };
        }
        return members;
    }

    _getCharacterDataById(id) {
        if (!id) return SystemUtils.localize('CS.messages.nobodyHasBeenChosen');
        let actor = game.actors.get(id);
        let name = SystemUtils.localize('CS.messages.actorDoesntExists');
        let age = 0;
        if (actor) {
            name = actor.name;
            age = actor.getCSData().age;
        }
        return { name: name, age: age };
    }

    _updateResourceTotal(data, resource) {
        data[resource].total =
            data[resource].startingValue + this._getAllEventModifiers(resource);
        LOGGER.debug(
            `the resource ${resource} total is: ${data[resource].total}`
        );
        return data[resource].total;
    }

    _updateAllResourcesTotal(data = undefined) {
        if (!data) data = this.getCSData();

        this._updateResourceTotal(data, 'defense');
        this._updateResourceTotal(data, 'influence');
        this._updateResourceTotal(data, 'lands');
        this._updateResourceTotal(data, 'law');
        this._updateResourceTotal(data, 'population');
        this._updateResourceTotal(data, 'power');
        this._updateResourceTotal(data, 'wealth');

        this.update({
            'data.defense': data.defense,
            'data.influence': data.influence,
            'data.lands': data.lands,
            'data.law': data.law,
            'data.population': data.population,
            'data.power': data.power,
            'data.wealth': data.wealth,
        });
    }

    _getAllEventModifiers(resource) {
        let items = this.getEmbeddedCollection('Item').contents;
        let events = items.filter((item) => item.type === 'event');
        let modifier = 0;
        events.forEach((event) => {
            modifier += event.getCSData().modifiers[resource];
        });
        return modifier;
    }

    getPopulationModifier() {
        let data = this.getCSData();
        let lastMod;
        ChronicleSystem.populationModifiers.forEach((mod) => {
            if (data.population.total >= mod.min) {
                lastMod = mod.mod;
            }
        });
        return lastMod;
    }

    getLawModifier() {
        let data = this.getCSData();
        let lastMod;
        ChronicleSystem.lawModifiers.forEach((mod) => {
            if (data.law.total >= mod.min) {
                lastMod = mod.mod;
            }
        });
        return lastMod;
    }

    getHoldingsModifier() {
        let holdings = this.getEmbeddedCollection('Item').contents.filter(
            (item) => item.type === 'holding'
        );
        let modifier = { dice: 0, flat: 0 };
        holdings.forEach((holding) => {
            const holdingMod = holding.getCSData().fortuneModifier;
            if (holdingMod) {
                if (!isNaN(+holdingMod)) {
                    modifier.flat += holdingMod;
                } else if (holdingMod.match(/^\d+[dD]6/)) {
                    modifier.dice += +holdingMod.split(/d|D/)[0];

                    if (holdingMod.match(/^\d+[dD]6\s*[+-]\d+$/)) {
                        modifier.flat += +holdingMod.split(/[+|-]/)[1];
                    }
                }
            }
        });
    }
}

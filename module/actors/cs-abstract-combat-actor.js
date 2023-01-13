import {CSActor} from "./csActor.js";
import SystemUtils from "../utils/systemUtils.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import {CSConstants} from "../system/csConstants.js";
import LOGGER from "../utils/logger.js";

export class CsAbstractCombatActor extends CSActor {
    modifiers;
    penalties;

    prepareDerivedData() {
        super.prepareDerivedData()
        this.calculateDerivedValues()
    }

    calculateDerivedValues() {
        let data = this.getCSData();
        data.derivedStats.combatDefense.value = this.calcCombatDefense();
        data.derivedStats.combatDefense.total = data.derivedStats.combatDefense.value + parseInt(data.derivedStats.combatDefense.modifier);
        data.derivedStats.health.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)) * 3;
        data.derivedStats.health.total = data.derivedStats.health.value + parseInt(data.derivedStats.health.modifier);
        return data;
    }

    getAbilities() {
        let items = this.getEmbeddedCollection("Item");
        return items.filter((item) => item.type === 'ability');
    }

    getAbility(abilityName) {
        let items = this.getEmbeddedCollection("Item");
        const ability = items.find((item) => item.name.toLowerCase() === abilityName.toString().toLowerCase() && item.type === 'ability');
        return [ability, undefined];
    }

    getAbilityBySpecialty(abilityName, specialtyName) {
        let items = this.getEmbeddedCollection("Item");
        let specialty = null;
        const ability = items.filter((item) => item.type === 'ability' && item.name.toLowerCase() === abilityName.toString().toLowerCase()).find(function (ability) {
            let data = ability.getCSData();
            if (data.specialties === undefined)
                return false;

            // convert specialties list to array
            let specialties = data.specialties;
            let specialtiesArray = Object.keys(specialties).map((key) => specialties[key]);

            specialty = specialtiesArray.find((specialty) => specialty.name.toLowerCase() === specialtyName.toString().toLowerCase());
            if (specialty !== null && specialty !== undefined) {
                return true;
            }
        });

        return [ability, specialty];
    }

    getAbilityValue(abilityName) {
        const [ability,] = this.getAbility(abilityName);
        return ability !== undefined? ability.getCSData().rating : 2;
    }

    calcCombatDefense() {
        let value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.AGILITY)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ATHLETICS));

        if (game.settings.get(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.ASOIAF_DEFENSE_STYLE)){
            let mod = this.getModifier(ChronicleSystem.modifiersConstants.COMBAT_DEFENSE);
            value += mod.total;
        }

        return value;
    }


    getModifier(type, includeDetail = false, includeModifierGlobal = false) {
        this.updateTempModifiers();

        let total = 0;
        let detail = [];

        if (this.modifiers[type]) {
            this.modifiers[type].forEach((modifier) => {
                total += modifier.mod;
                if (includeDetail) {
                    let tempItem = modifier._id;
                    if (modifier.isDocument) {
                        tempItem = this.getEmbeddedDocument('Item', modifier._id);
                    }
                    if (tempItem) {
                        detail.push({docName: tempItem.name, mod: modifier.mod});
                    }
                }
            });
        }

        if (includeModifierGlobal && this.modifiers[ChronicleSystem.modifiersConstants.ALL]) {
            this.modifiers[ChronicleSystem.modifiersConstants.ALL].forEach((modifier) => {
                total += modifier.mod;
                if (includeDetail) {
                    let tempItem = modifier._id;
                    if (modifier.isDocument) {
                        tempItem = this.getEmbeddedDocument('Item', modifier._id);
                    }
                    if (tempItem)
                        detail.push({docName: tempItem.name, mod: modifier.mod});
                }
            });
        }

        return { total: total, detail: detail};
    }

    getPenalty(type, includeDetail = false, includeModifierGlobal = false) {
        this.updateTempPenalties();

        let total = 0;
        let detail = [];

        if (this.penalties[type]) {
            this.penalties[type].forEach((penalty) => {
                total += penalty.mod;
                if (includeDetail) {
                    let tempItem = penalty._id;
                    if (penalty.isDocument) {
                        tempItem = this.getEmbeddedDocument('Item', penalty._id);
                    }
                    if (tempItem) {
                        detail.push({docName: tempItem.name, mod: penalty.mod});
                    }
                }
            });
        }

        if (includeModifierGlobal && this.penalties[ChronicleSystem.modifiersConstants.ALL]) {
            this.penalties[ChronicleSystem.modifiersConstants.ALL].forEach((penalty) => {
                total += penalty.mod;
                if (includeDetail) {
                    let tempItem = penalty._id;
                    if (penalty.isDocument) {
                        tempItem = this.getEmbeddedDocument('Item', penalty._id);
                    }
                    if (tempItem)
                        detail.push({docName: tempItem.name, mod: penalty.mod});
                }
            });
        }

        return { total: total, detail: detail};
    }

    addModifier(type, documentId, value, isDocument = true, save = false) {
        LOGGER.trace(`add ${documentId} modifier to ${type} | csCharacterActor.js`);

        console.assert(this.modifiers, "call actor.updateTempModifiers before adding a modifier!");

        if (!this.modifiers[type]) {
            this.modifiers[type] = [];
        }

        let index = this.modifiers[type].findIndex((mod) => {
            return mod._id === documentId
        });
        if (index >= 0) {
            this.modifiers[type][index].mod = value;
        } else {
            this.modifiers[type].push({_id: documentId, mod: value, isDocument: isDocument});
        }

        if (save) {
            this.update({"data.modifiers": this.modifiers});
        }
    }

    addPenalty(type, documentId, value, isDocument = true, save = false) {
        LOGGER.trace(`add ${documentId} penalty to ${type} | csCharacterActor.js`);

        console.assert(this.penalties, "call actor.updateTempPenalties before adding a penalty!");

        if (!this.penalties[type]) {
            this.penalties[type] = [];
        }

        let index = this.penalties[type].findIndex((mod) => {
            return mod._id === documentId
        });

        if (index >= 0) {
            this.penalties[type][index].mod = value;
        } else {
            this.penalties[type].push({
                _id: documentId,
                mod: value,
                isDocument: isDocument
            });
        }

        if (save) {
            this.update({"data.penalties": this.penalties});
        }
    }

    removeModifier(type, documentId, save = false) {
        LOGGER.trace(`remove ${documentId} modifier to ${type} | csCharacterActor.js`);

        console.assert(this.modifiers, "call actor.updateTempModifiers before removing a modifier!");

        if (this.modifiers[type]) {
            let index = this.modifiers[type].indexOf((mod) => mod._id === documentId);
            this.modifiers[type].splice(index, 1);
        }
        if (save)
            this.update({"data.modifiers" : this.modifiers});
    }

    removePenalty(type, documentId, save = false) {
        LOGGER.trace(`remove ${documentId} penalty to ${type} | csCharacterActor.js`);

        console.assert(this.penalties, "call actor.updateTempPenalties before removing a penalty!");

        if (this.penalties[type]) {
            let index = this.penalties[type].indexOf((mod) => mod._id === documentId);
            this.penalties[type].splice(index, 1);
        }
        if (save)
            this.update({"data.penalties" : this.penalties});
    }

    saveModifiers() {
        console.assert(this.modifiers, "call actor.updateTempModifiers before saving the modifiers!");
        this.update({"data.modifiers" : this.modifiers}, {diff:false});
    }

    savePenalties() {
        console.assert(this.penalties, "call actor.updateTempPenalties before saving the penalties!");
        this.update({"data.penalties" : this.penalties}, {diff:false});
    }

    _onDeleteEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onDeleteEmbeddedDocuments(embeddedName, documents, result, options, userId);
        this.updateTempModifiers();
        for (let i = 0; i < documents.length; i++) {
            documents[i].onDiscardedFromActor(this, result[0]);
        }
        this.saveModifiers();
    }

    _onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId);
        this.updateTempModifiers();
        for (let i = 0; i < documents.length; i++) {
            documents[i].onObtained(this);
        }

        this.saveModifiers();
    }

    updateTempModifiers() {
        let data = this.getCSData()
        this.modifiers = data.modifiers;
    }

    updateTempPenalties() {
        let data = this.getCSData()
        this.penalties = data.penalties;
    }
}
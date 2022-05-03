import {ChronicleSystem} from "../system/ChronicleSystem.js";
import {CSActor} from "./csActor.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import {CSConstants} from "../system/csConstants.js";

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {CSActor}
 */
export class CSCharacterActor extends CSActor {
    modifiers;
    penalties;

    prepareData() {
        super.prepareData();
        this.calculateMovementData();
    }

    prepareEmbeddedEntities() {
        super.prepareEmbeddedEntities();
        // let data = this.getChronicleSystemActorData();
        // data.owned.equipments = this._checkNull(data.itemsByType['equipment']);
        // data.owned.weapons = this._checkNull(data.itemsByType['weapon']);
        // data.owned.armors = this._checkNull(data.itemsByType['armor']);
        // data.owned.edges = this._checkNull(data.itemsByType['quality']);
        // data.owned.hindrances = this._checkNull(data.itemsByType['drawback']);
        // data.owned.abilities = this._checkNull(data.itemsByType['ability']).sort((a, b) => a.name.localeCompare(b.name));
    }

    prepareDerivedData() {
        super.prepareDerivedData()
        this.calculateDerivedValues()

    }

    /** @override */
    getRollData() {
        return super.getRollData();
    }


    calculateDerivedValues() {
        let data = this.getCSData();
        data.derivedStats.intrigueDefense.value = this.calcIntrigueDefense();
        data.derivedStats.intrigueDefense.total = data.derivedStats.intrigueDefense.value + parseInt(data.derivedStats.intrigueDefense.modifier);
        data.derivedStats.composure.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.WILL)) * 3;
        data.derivedStats.composure.total = data.derivedStats.composure.value + parseInt(data.derivedStats.composure.modifier);
        data.derivedStats.combatDefense.value = this.calcCombatDefense();


        data.derivedStats.combatDefense.total = data.derivedStats.combatDefense.value + parseInt(data.derivedStats.combatDefense.modifier);
        data.derivedStats.health.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)) * 3;
        data.derivedStats.health.total = data.derivedStats.health.value + parseInt(data.derivedStats.health.modifier);
        data.derivedStats.frustration.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.WILL));
        data.derivedStats.frustration.total = data.derivedStats.frustration.value + parseInt(data.derivedStats.frustration.modifier);
        data.derivedStats.fatigue.value = this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
        data.derivedStats.fatigue.total = data.derivedStats.fatigue.value + parseInt(data.derivedStats.fatigue.modifier);
    }

    getAbilities() {
        let items = this.getEmbeddedCollection("Item");
        return items.filter((item) => item.type === 'ability');
    }

    getAbility(abilityName) {
        let items = this.getEmbeddedCollection("Item");
        const ability = items.find((item) => item.data.name.toLowerCase() === abilityName.toString().toLowerCase() && item.type === 'ability');
        return [ability, undefined];
    }

    getAbilityBySpecialty(abilityName, specialtyName) {
        let items = this.getEmbeddedCollection("Item");
        let specialty = null;
        const ability = items.filter((item) => item.type === 'ability' && item.name.toLowerCase() === abilityName.toString().toLowerCase()).find(function (ability) {
            if (ability.data.data.specialties === undefined)
                return false;

            // convert specialties list to array
            let specialties = ability.data.data.specialties;
            let specialtiesArray = Object.keys(specialties).map((key) => specialties[key]);

            specialty = specialtiesArray.find((specialty) => specialty.name.toLowerCase() === specialtyName.toString().toLowerCase());
            if (specialty !== null && specialty !== undefined) {
                return true;
            }
        });

        return [ability, specialty];
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
        if (this.modifiers[type]) {
            let index = this.modifiers[type].indexOf((mod) => mod._id === documentId);
            this.modifiers[type].splice(index, 1);
        }
        if (save)
            this.update({"data.modifiers" : this.modifiers});
    }

    removePenalty(type, documentId, save = false) {
        LOGGER.trace(`remove ${documentId} penalty to ${type} | csCharacterActor.js`);
        if (this.penalties[type]) {
            let index = this.penalties[type].indexOf((mod) => mod._id === documentId);
            this.penalties[type].splice(index, 1);
        }
        if (save)
            this.update({"data.penalties" : this.penalties});
    }

    getMaxInjuries() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
    }

    getMaxWounds() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE));
    }

    saveModifiers() {
        this.update({"data.modifiers" : this.modifiers}, {diff:false});
    }

    savePenalties() {
        this.update({"data.penalties" : this.penalties}, {diff:false});
    }

    getAbilityValue(abilityName) {
        const [ability,] = this.getAbility(abilityName);
        return ability !== undefined? ability.data.data.rating : 2;
    }

    calcIntrigueDefense() {
        return this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.CUNNING)) +
            this.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.STATUS));
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

    calculateMovementData() {
        let data = this.getCSData();
        data.movement.base = ChronicleSystem.defaultMovement;
        let runFormula = ChronicleSystem.getActorAbilityFormula(this, SystemUtils.localize(ChronicleSystem.keyConstants.ATHLETICS), SystemUtils.localize(ChronicleSystem.keyConstants.RUN));
        data.movement.runBonus = Math.floor(runFormula.bonusDice / 2);
        let bulkMod = this.getModifier(SystemUtils.localize(ChronicleSystem.modifiersConstants.BULK));
        data.movement.bulk = Math.floor(bulkMod.total/2);
        data.movement.total = Math.max(data.movement.base + data.movement.runBonus - data.movement.bulk + parseInt(data.movement.modifier), 1);
        data.movement.sprintTotal = data.movement.total * data.movement.sprintMultiplier - data.movement.bulk;
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

    _onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId);
        this.updateTempModifiers();
        result.forEach((doc) => {
            let item = this.items.find((item) => item.data._id === doc._id);
            if (item) {
                item.onObtained(this);
                item.onEquippedChanged(this, item.data.data.equipped > 0);
            }
        })
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

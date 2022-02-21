/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
import {ChronicleSystem} from "../ChronicleSystem.js";

export class ChronicleSystemActor extends Actor {
  modifiers;

  getChronicleSystemActorData() {
    return this.data.data;
  }

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
    let data = this.getChronicleSystemActorData();
    data.derivedStats.intrigueDefense.value = this.calcIntrigueDefense();
    data.derivedStats.intrigueDefense.total = data.derivedStats.intrigueDefense.value + data.derivedStats.intrigueDefense.modifier;
    data.derivedStats.composure.value = this.getAbilityValue(data, "Will") * 3;
    data.derivedStats.composure.total = data.derivedStats.composure.value + data.derivedStats.composure.modifier;
    data.derivedStats.combatDefense.value = this.calcCombatDefense();
    data.derivedStats.combatDefense.total = data.derivedStats.combatDefense.value + data.derivedStats.combatDefense.modifier;
    data.derivedStats.health.value = this.getAbilityValue(data, "Endurance") * 3;
    data.derivedStats.health.total = data.derivedStats.health.value + data.derivedStats.health.modifier;
    data.derivedStats.frustration.value = this.getAbilityValue(data, "Will");
    data.derivedStats.frustration.total = data.derivedStats.frustration.value + data.derivedStats.frustration.modifier;
    data.derivedStats.fatigue.value = this.getAbilityValue(data, "Endurance");
    data.derivedStats.fatigue.total = data.derivedStats.fatigue.value + data.derivedStats.fatigue.modifier;
    // let weapons = docs.filter()
    //data.movement.bulk =
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

  addModifier(type, documentId, value, save = false) {
    if (!this.modifiers[type])
      this.modifiers[type] = []
    let index = this.modifiers[type].findIndex((mod) => {
      return mod._id === documentId
    });
    if (index >= 0) {
      this.modifiers[type][index].mod = value;
    } else {
      this.modifiers[type].push({_id: documentId, mod: value});
    }
    if (save) {
      this.update({"modifiers": this.modifiers});
    }
  }

  removeModifier(type, documentId, save = false) {
    if (this.modifiers[type]) {
      let index = this.modifiers[type].indexOf((mod) => mod._id === documentId);
      this.modifiers[type].splice(index, 1);
    }
    if (save)
      this.update({"modifiers" : this.modifiers});
  }

  saveModifiers() {
    this.update({"data.modifiers" : this.modifiers}, {diff:false});
  }

  getAbilityValue(abilityName) {
    const [ability,] = this.getAbility(abilityName);
    return ability !== undefined? ability.data.data.rating : 2;
  }

  calcIntrigueDefense() {
    return this.getAbilityValue("Awareness") +
        this.getAbilityValue("Cunning") +
        this.getAbilityValue("Status");
  }

  calcCombatDefense() {
    return this.getAbilityValue("Awareness") +
        this.getAbilityValue("Agility") +
        this.getAbilityValue("Athletics");
  }

  calculateMovementData() {
    let data = this.getChronicleSystemActorData();
    data.movement = {};
    data.movement.base = ChronicleSystem.defaultMovement;
    let runFormula = ChronicleSystem.getActorAbilityFormula(this, "Athletics", "Run");
    data.movement.runBonus = Math.floor(runFormula.bonusDice / 2);
    let docs = this.items;
    let weapons = docs.filter((item) => item.type === 'weapon');
    let armors = docs.filter((item) => item.type === 'armor');
    let bulk = 0;
    weapons.forEach((weapon) => {
      let bulks = Object.values(weapon.data.data.qualities).filter((quality) => quality.name.toLowerCase() === "bulk");
      if (bulks) {
        bulks.forEach((quality) => {
          bulk += parseInt(quality.parameter);
        })
      }
    });

    armors.forEach((armor) => {
      bulk += parseInt(armor.data.data.bulk);
    });
    data.movement.bulk = bulk;

    data.movement.total = data.movement.base + data.movement.runBonus - Math.floor(data.movement.bulk/2);
    data.movement.total = data.movement.total < 1 ? 1 : data.movement.total;
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
    let data = this.getChronicleSystemActorData()
    this.modifiers = data.modifiers;
  }
}

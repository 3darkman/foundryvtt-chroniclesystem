/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class ChronicleSystemActor extends Actor {


  getChronicleSystemActorData() {
    return this.data.data;
  }

  prepareData() {
    super.prepareData();
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
  }

  getAbilities() {
      let items = this.getEmbeddedCollection("Item");
      return items.filter((item) => item.type === 'ability');
  }

  getAbility(abilityName) {
    let items = this.getEmbeddedCollection("Item");
    const ability = items.find((item) => item.data.name === abilityName && item.type === 'ability');
    return [ability, undefined];
  }

  getAbilityBySpecialty(abilityName, specialtyName) {
    let items = this.getEmbeddedCollection("Item");
    let specialty = null;
    const ability = items.filter((item) => item.type === 'ability' && item.name === abilityName).find(function (ability) {
      if (ability.data.data.specialties === undefined)
        return false;

      // convert specialties list to array
      let specialties = ability.data.data.specialties;
      let specialtiesArray = Object.keys(specialties).map((key) => specialties[key]);

      specialty = specialtiesArray.find((specialty) => specialty.name === specialtyName);
      if (specialty !== null && specialty !== undefined) {
        return true;
      }
    });

    return [ability, specialty];
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
}

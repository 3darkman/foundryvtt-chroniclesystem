/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class ChronicleSystemActorSheet extends ActorSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
  	  classes: ["chroniclesystem", "worldbuilding", "sheet", "actor"],
  	  template: "systems/chroniclesystem/templates/actor-sheet.html",
      width: 700,
      height: 900,
      tabs: [
          {
            navSelector: ".tabs",
            contentSelector: ".sheet-body",
            initial: "abilities"
          }
      ],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const data = super.getData();
    console.log(data);
    data.dtypes = ["String", "Number", "Boolean"];

    data.itemsByType = {};
    for (const item of data.items) {
      let list = data.itemsByType[item.type];
      if (!list) {
        list = [];
        data.itemsByType[item.type] = list;
      }
      list.push(item);
    }

    data.data.owned.equipments = this._checkNull(data.itemsByType['equipment']);
    data.data.owned.weapons = this._checkNull(data.itemsByType['weapon']);
    data.data.owned.armors = this._checkNull(data.itemsByType['armor']);
    data.data.owned.edges = this._checkNull(data.itemsByType['quality']);
    data.data.owned.hindrances = this._checkNull(data.itemsByType['drawback']);
    data.data.owned.abilities = this._checkNull(data.itemsByType['ability']).sort((a, b) => a.name.localeCompare(b.name));

    data.data.derivedStats.intrigueDefense.value = this.calcIntrigueDefense(data);
    data.data.derivedStats.intrigueDefense.total = data.data.derivedStats.intrigueDefense.value + data.data.derivedStats.intrigueDefense.modifier;
    data.data.derivedStats.composure.value = this.getAbilityValue(data, "Will") * 3;
    data.data.derivedStats.composure.total = data.data.derivedStats.composure.value + data.data.derivedStats.composure.modifier;
    data.data.derivedStats.combatDefense.value = this.calcCombatDefense(data);
    data.data.derivedStats.combatDefense.total = data.data.derivedStats.combatDefense.value + data.data.derivedStats.combatDefense.modifier;
    data.data.derivedStats.health.value = this.getAbilityValue(data, "Endurance") * 3;
    data.data.derivedStats.health.total = data.data.derivedStats.health.value + data.data.derivedStats.health.modifier;

    return data;
  }

  getAbilityValue(actor, abilityName) {
    const ability = actor.data.owned.abilities.find((ability) => ability.name === abilityName);
    return ability !== undefined? ability.data.rating : 2;
  }

  calcIntrigueDefense(data) {
    return this.getAbilityValue(data, "Awareness") +
        this.getAbilityValue(data, "Cunning") +
        this.getAbilityValue(data, "Status");
  }

  calcCombatDefense(data) {
    return this.getAbilityValue(data, "Awareness") +
        this.getAbilityValue(data, "Agility") +
        this.getAbilityValue(data, "Athletics");
  }

  /* -------------------------------------------- */

  /** @override */
	activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.getOwnedItem(li.data('itemId'));
      item.data.isOwned = true;
      item.sheet.render(true);
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
    });

    // Add or Remove Attribute
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options={}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".sheet-body");
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  _checkNull(items) {
    if (items && items.length) {
      return items;
    }
    return [];
  }

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
      console.log(data);
    }
    catch (err) {
      return;
    }
    return super._onDrop(event);
  }

}

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { ChronicleSystem } from "../ChronicleSystem.js";

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

    let character = data.data.data;
    this.isOwner = this.actor.isOwner;
    character.owned.equipments = this._checkNull(data.itemsByType['equipment']);
    character.owned.weapons = this._checkNull(data.itemsByType['weapon']);
    character.owned.armors = this._checkNull(data.itemsByType['armor']);
    character.owned.benefits = this._checkNull(data.itemsByType['benefit']);
    character.owned.drawbacks = this._checkNull(data.itemsByType['drawback']);
    character.owned.abilities = this._checkNull(data.itemsByType['ability']).sort((a, b) => a.name.localeCompare(b.name));


    character.owned.weapons.forEach((weapon) => {
      let info = weapon.data.specialty.split(':');
      if (info.length < 2)
        return "";
      let formula = ChronicleSystem.getActorAbilityFormula(data.actor, info[0], info[1]);
      formula = ChronicleSystem.adjustFormulaByWeapon(data.actor, formula, weapon);
      let matches = weapon.data.damage.match('@([a-zA-Z]*)([-\+\/\*]*)([0-9]*)');
      if (matches.length === 4) {
        let ability = data.actor.getAbilityValue(matches[1]);
        weapon.damageValue = eval(`${ability}${matches[2]}${matches[3]}`);
      }
      weapon.formula = formula;
    });

    return data;
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
      const item = this.actor.items.get(li.data('itemId'));
      item.data.isOwned = true;
      item.sheet.render(true);
    });

    html.find('.item .item-name').on('click', (ev) => {
      $(ev.currentTarget).parents('.item').find('.description').slideToggle();
    });

    html.find('.rollable').click(this._onClickRoll.bind(this))

    // Add or Remove Attribute
  }

  async _onClickRoll(event, targets) {
    await ChronicleSystem.handleRoll(event, this.actor, targets);
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
    }
    catch (err) {
      return;
    }
    return super._onDrop(event);
  }

  async _onDropItemCreate(itemData) {
    const item = this.actor.items.find(i => i.name === itemData.name);
    let embeddedItem;

    if (item === null || typeof item === 'undefined') {
      let data = [ itemData, ];
      embeddedItem = this.actor.createEmbeddedDocuments("Item", data);
    } else {
      embeddedItem = this.actor.getEmbeddedDocument("Item", item.data._id);
    }
    return embeddedItem;
  }

}

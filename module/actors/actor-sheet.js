/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { ChronicleSystem } from "../ChronicleSystem.js";
import { Technique } from "../technique.js";


export class ChronicleSystemActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["chroniclesystem", "worldbuilding", "sheet", "actor"],
      template: "systems/chroniclesystem/templates/actors/characters/character-sheet.html",
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

    data.dispositions = ChronicleSystem.dispositions;

    data.notEquipped = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED;

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

    let cunningValue = data.actor.getAbilityValue("Cunning");
    let willValue = data.actor.getAbilityValue("Will");
    let persuasionValue = data.actor.getAbilityValue("Persuasion");
    let awarenessValue = data.actor.getAbilityValue("Awareness");

    let bluffFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Deception", "Bluff");
    let actFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Deception", "Act");
    let bargainFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Bargain");
    let charmFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Charm");
    let convinceFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Convince");
    let inciteFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Incite");
    let intimidateFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Intimidate");
    let seduceFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Seduce");
    let tauntFormula = ChronicleSystem.getActorAbilityFormula(data.actor, "Persuasion", "Taunt");

    let intimidateDeceptionFormula = actFormula.bonusDice + actFormula.modifier > bluffFormula.bonusDice + bluffFormula.modifier ? actFormula : bluffFormula;

    data.techniques = {
      bargain: new Technique("Bargain", cunningValue, bargainFormula, bluffFormula),
      charm: new Technique("Charm", persuasionValue, charmFormula, actFormula),
      convince: new Technique("Convince", willValue, convinceFormula, actFormula),
      incite: new Technique("Incite", cunningValue, inciteFormula, bluffFormula),
      intimidate: new Technique("Intimidate", willValue, intimidateFormula, intimidateDeceptionFormula),
      seduce: new Technique("Seduce", persuasionValue, seduceFormula, bluffFormula),
      taunt: new Technique("Taunt", awarenessValue, tauntFormula, bluffFormula)
    };
    data.currentInjuries = Object.values(character.injuries).length;
    data.currentWounds = Object.values(character.wounds).length;
    data.maxInjuries = this.actor.getMaxInjuries();
    data.maxWounds = this.actor.getMaxWounds();

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

    html.find('.rollable').click(this._onClickRoll.bind(this));

    html.find('.disposition.option').click(this._onDispositionChanged.bind(this));

    html.find('.equipped').click(this._onEquippedStateChanged.bind(this));

    html.find('.injury-create').on("click", this._onClickInjuryCreate.bind(this));
    html.find(".injuries-list").on("click", ".injury-control", this._onclickInjuryControl.bind(this));

    html.find('.wound-create').on("click", this._onClickWoundCreate.bind(this));
    html.find(".wounds-list").on("click", ".wound-control", this._onclickWoundControl.bind(this));

    html.find(".square").on("click", this._onClickSquare.bind(this));

    // Add or Remove Attribute
  }

  async setFrustrationValue(newValue) {
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getChronicleSystemActorData().derivedStats.frustration.total), 0);

    this.actor.updateTempPenalties();

    if (value > 0) {
      this.actor.addPenalty(ChronicleSystem.modifiersConstants.DECEPTION, ChronicleSystem.keyConstants.FRUSTRATION, value, false);
      this.actor.addPenalty(ChronicleSystem.modifiersConstants.PERSUASION, ChronicleSystem.keyConstants.FRUSTRATION, value, false);
    } else {
      this.actor.removePenalty(ChronicleSystem.modifiersConstants.DECEPTION, ChronicleSystem.keyConstants.FRUSTRATION);
      this.actor.removePenalty(ChronicleSystem.modifiersConstants.PERSUASION, ChronicleSystem.keyConstants.FRUSTRATION);
    }

    this.actor.update({
      "data.derivedStats.frustration.current" : value,
      "data.penalties": this.actor.penalties
    });
  }

  async setFatigueValue(newValue) {
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getChronicleSystemActorData().derivedStats.fatigue.total), 0);

    this.actor.updateTempModifiers();

    if (value > 0) {
      this.actor.addModifier(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.FATIGUE, -value, false);
    } else {
      this.actor.removeModifier(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.FATIGUE);
    }

    this.actor.update({
      "data.derivedStats.fatigue.current" : value,
      "data.modifiers": this.actor.modifiers
    });
  }

  async setStressValue(newValue) {
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getChronicleSystemActorData().derivedStats.frustration.total), 0);

    this.actor.updateTempPenalties();

    if (value > 0) {
      this.actor.addPenalty(ChronicleSystem.modifiersConstants.AWARENESS, ChronicleSystem.keyConstants.STRESS, value, false);
      this.actor.addPenalty(ChronicleSystem.modifiersConstants.CUNNING, ChronicleSystem.keyConstants.STRESS, value, false);
      this.actor.addPenalty(ChronicleSystem.modifiersConstants.STATUS, ChronicleSystem.keyConstants.STRESS, value, false);
    } else {
      this.actor.removePenalty(ChronicleSystem.modifiersConstants.AWARENESS, ChronicleSystem.keyConstants.STRESS);
      this.actor.removePenalty(ChronicleSystem.modifiersConstants.CUNNING, ChronicleSystem.keyConstants.STRESS);
      this.actor.removePenalty(ChronicleSystem.modifiersConstants.STATUS, ChronicleSystem.keyConstants.STRESS);
    }

    this.actor.update({
      "data.currentStress" : value,
      "data.penalties": this.actor.penalties
    });
  }

  async _onClickSquare(ev) {
    let method = `set${ev.currentTarget.dataset.type}Value`;
    await this[method](ev.currentTarget.id);
  }

  async _onClickWoundCreate(ev) {
    const data = this.actor.getChronicleSystemActorData();
    let wound = "";
    let wounds = Object.values(data.wounds);
    if (wounds.length >= this.actor.getMaxWounds())
      return;
    wounds.push(wound);
    this.actor.updateTempPenalties();
    this.actor.addPenalty(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.WOUNDS, wounds.length, false);
    this.actor.update({
      "data.wounds" : wounds,
      "data.penalties" : this.actor.penalties
    });
  }

  async _onclickWoundControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const index = parseInt(a.dataset.id);
    const action = a.dataset.action;

    if ( action === "delete" ) {
      const data = this.actor.getChronicleSystemActorData();
      let wounds = Object.values(data.wounds);
      wounds.splice(index,1);

      this.actor.updateTempPenalties();
      if (wounds.length === 0) {
        this.actor.removePenalty(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.WOUNDS);
      } else {
        this.actor.addPenalty(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.WOUNDS, wounds.length, false);
      }
      this.actor.update({
        "data.wounds" : wounds,
        "data.penalties" : this.actor.penalties
      });
    }
  }

  async _onClickInjuryCreate(ev) {
    const data = this.actor.getChronicleSystemActorData();
    let injury = "";
    let injuries = Object.values(data.injuries);
    if (injuries.length >= this.actor.getMaxInjuries())
      return;

    injuries.push(injury);

    this.actor.updateTempModifiers();
    this.actor.addModifier(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.INJURY, -injuries.length, false);

    this.actor.update({
      "data.injuries" : injuries,
      "data.modifiers" : this.actor.modifiers
    });
  }

  async _onclickInjuryControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const index = parseInt(a.dataset.id);
    const action = a.dataset.action;

    if ( action === "delete" ) {
      const data = this.actor.getChronicleSystemActorData();
      let injuries = Object.values(data.injuries);
      injuries.splice(index,1);

      this.actor.updateTempModifiers();
      if (injuries.length === 0) {
        this.actor.removeModifier(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.INJURY);
      } else {
        this.actor.addModifier(ChronicleSystem.modifiersConstants.ALL, ChronicleSystem.keyConstants.INJURY, -injuries.length, false);
      }

      this.actor.update({
        "data.injuries" : injuries,
        "data.modifiers" : this.actor.modifiers
      });
    }
  }

  async _onEquippedStateChanged(event) {
    const eventData = event.currentTarget.dataset;
    let documment = this.actor.getEmbeddedDocument('Item', eventData.itemId);
    let collection = [];
    let tempCollection = [];

    let isArmor = parseInt(eventData.hand) === ChronicleSystem.equippedConstants.WEARING;
    let isUnequipping = parseInt(eventData.hand) === 0;

    if (isUnequipping) {
      documment.data.data.equipped = 0;
    } else {
      if (isArmor) {
        documment.data.data.equipped = ChronicleSystem.equippedConstants.WEARING;
        tempCollection = this.actor.getEmbeddedCollection('Item').filter((item) => item.data.data.equipped === ChronicleSystem.equippedConstants.WEARING);
      } else {
        let twoHandedQuality = Object.values(documment.data.data.qualities).filter((quality) => quality.name.toLowerCase() === "two-handed");
        if (twoHandedQuality.length > 0) {
          tempCollection = this.actor.getEmbeddedCollection('Item').filter((item) => item.data.data.equipped === ChronicleSystem.equippedConstants.MAIN_HAND || item.data.data.equipped === ChronicleSystem.equippedConstants.OFFHAND || item.data.data.equipped === ChronicleSystem.equippedConstants.BOTH_HANDS);
          documment.data.data.equipped = ChronicleSystem.equippedConstants.BOTH_HANDS;
        } else {
          tempCollection = this.actor.getEmbeddedCollection('Item').filter((item) => item.data.data.equipped === parseInt(eventData.hand) || item.data.data.equipped === ChronicleSystem.equippedConstants.BOTH_HANDS);
          documment.data.data.equipped = parseInt(eventData.hand);
        }
      }
    }

    this.actor.updateTempModifiers();

    tempCollection.forEach((item) => {
      collection.push({_id: item.data._id, "data.equipped": ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED});
      item.onEquippedChanged(this.actor, false);
    });

    collection.push({_id: documment.data._id, "data.equipped": documment.data.data.equipped});
    documment.onEquippedChanged(this.actor, documment.data.data.equipped > 0);

    this.actor.saveModifiers();

    this.actor.updateEmbeddedDocuments('Item', collection);
  }

  async _onDispositionChanged(event, targets) {
    if (!ChronicleSystem.dispositions.find((disposition) => disposition.rating === parseInt(event.target.dataset.id))) {
      console.log("the informed disposition does not exist.");
      return;
    }
    this.actor.update({"data.currentDisposition": event.target.dataset.id});
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
    let embeddedItem = [];
    let itemsToCreate = [];
    let data = [];
    data = data.concat(itemData);
    data.forEach((doc) => {
      const item = this.actor.items.find((i) => {
        return i.name === doc.name;
      });
      if (item) {
        embeddedItem.push(this.actor.getEmbeddedDocument("Item", item.data._id));
      } else {
        itemsToCreate.push(doc);
      }
    });

    if (itemsToCreate.length > 0) {
      this.actor.createEmbeddedDocuments("Item", itemsToCreate)
          .then(function(result) {
            result.forEach((item) => {
              item.onObtained(item.actor);
            });
            embeddedItem.concat(result);
          });
    }

    return embeddedItem;
  }

}

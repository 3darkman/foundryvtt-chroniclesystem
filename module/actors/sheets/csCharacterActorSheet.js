/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import { Technique } from "../../technique.js";
import {CSActorSheet} from "./csActorSheet.js";
import LOGGER from "../../utils/logger.js";
import SystemUtils from "../../utils/systemUtils.js";
import {CSConstants} from "../../system/csConstants.js";


export class CSCharacterActorSheet extends CSActorSheet {
  itemTypesPermitted = [
      "ability",
      "weapon",
      "armor",
      "equipment",
      "benefit",
      "drawback",
      "technique"
  ]

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["chroniclesystem", "character", "sheet", "actor"],
      template: "systems/chroniclesystem/templates/actors/characters/character-sheet.hbs",
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
    this.splitItemsByType(data);

    let character = data.actor.getCSData();
    this.isOwner = this.actor.isOwner;

    character.owned.equipments = this._checkNull(data.itemsByType['equipment']);
    character.owned.weapons = this._checkNull(data.itemsByType['weapon']);
    character.owned.armors = this._checkNull(data.itemsByType['armor']);
    character.owned.benefits = this._checkNull(data.itemsByType['benefit']);
    character.owned.drawbacks = this._checkNull(data.itemsByType['drawback']);
    character.owned.abilities = this._checkNull(data.itemsByType['ability']).sort((a, b) => a.name.localeCompare(b.name));
    character.owned.techniques = this._checkNull(data.itemsByType['technique']).sort((a, b) => a.name.localeCompare(b.name));

    data.dispositions = ChronicleSystem.dispositions;

    data.notEquipped = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED;

    data.techniquesTypes = CSConstants.TechniqueType;
    data.techniquesCosts = CSConstants.TechniqueCost;

    character.owned.weapons.forEach((weapon) => {
      let weaponData = weapon.system;
      let info = weaponData.specialty.split(':');
      if (info.length < 2)
        return "";
      let formula = ChronicleSystem.getActorAbilityFormula(data.actor, info[0], info[1]);
      formula = ChronicleSystem.adjustFormulaByWeapon(data.actor, formula, weapon);
      weapon.updateDamageValue(this.actor);
      weapon.formula = formula;
    });

    character.owned.techniques.forEach((technique) => {
      let techniqueData = technique.system;
      let works = data.currentInjuries = Object.values(techniqueData.works);
      works.forEach((work) => {
        if (work.type === "SPELL") {
          work.test.spellcastingFormula = ChronicleSystem.getActorAbilityFormula(data.actor, work.test.spellcasting, null);
        } else {
          work.test.alignmentFormula = ChronicleSystem.getActorAbilityFormula(data.actor, work.test.alignment, null);
          work.test.invocationFormula = ChronicleSystem.getActorAbilityFormula(data.actor, work.test.invocation, null);
          work.test.unleashingFormula = ChronicleSystem.getActorAbilityFormula(data.actor, work.test.unleashing, null);
        }
      });
    });

    this._calculateIntrigueTechniques(data);

    data.currentInjuries = Object.values(character.injuries).length;
    data.currentWounds = Object.values(character.wounds).length;
    data.maxInjuries = this.actor.getMaxInjuries();
    data.maxWounds = this.actor.getMaxWounds();
    data.character = character;
    return data;
  }

  _calculateIntrigueTechniques(data) {
    let cunningValue = data.actor.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.CUNNING));
    let willValue = data.actor.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.WILL));
    let persuasionValue = data.actor.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION));
    let awarenessValue = data.actor.getAbilityValue(SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS));

    let bluffFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.DECEPTION), SystemUtils.localize(ChronicleSystem.keyConstants.BLUFF));
    let actFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.DECEPTION), SystemUtils.localize(ChronicleSystem.keyConstants.ACT));
    let bargainFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.BARGAIN));
    let charmFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.CHARM));
    let convinceFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.CONVINCE));
    let inciteFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.INCITE));
    let intimidateFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.INTIMIDATE));
    let seduceFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.SEDUCE));
    let tauntFormula = ChronicleSystem.getActorAbilityFormula(data.actor, SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION), SystemUtils.localize(ChronicleSystem.keyConstants.TAUNT));

    let intimidateDeceptionFormula = actFormula.bonusDice + actFormula.modifier > bluffFormula.bonusDice + bluffFormula.modifier ? actFormula : bluffFormula;

    data.techniques = {
      bargain: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.BARGAIN), cunningValue, bargainFormula, bluffFormula),
      charm: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.CHARM), persuasionValue, charmFormula, actFormula),
      convince: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.CONVINCE), willValue, convinceFormula, actFormula),
      incite: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.INCITE), cunningValue, inciteFormula, bluffFormula),
      intimidate: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.INTIMIDATE), willValue, intimidateFormula, intimidateDeceptionFormula),
      seduce: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.SEDUCE), persuasionValue, seduceFormula, bluffFormula),
      taunt: new Technique(SystemUtils.localize(ChronicleSystem.keyConstants.TAUNT), awarenessValue, tauntFormula, bluffFormula)
    };
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    html.find('.item .item-name').on('click', (ev) => {
      $(ev.currentTarget).parents('.item').find('.description').slideToggle();
    });

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
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getCSData().derivedStats.frustration.total), 0);

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
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getCSData().derivedStats.fatigue.total), 0);

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
    let value = Math.max(Math.min(parseInt(newValue), this.actor.getCSData().derivedStats.frustration.total), 0);

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
    ev.preventDefault();
    let method = `set${ev.currentTarget.dataset.type}Value`;
    await this[method](ev.currentTarget.id);
  }

  async _onClickWoundCreate(ev) {
    ev.preventDefault();
    const data = this.actor.getCSData();
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
      const data = this.actor.getCSData();
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
    ev.preventDefault();
    const data = this.actor.getCSData();
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
      const data = this.actor.getCSData();
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
    event.preventDefault();
    const eventData = event.currentTarget.dataset;
    let currentItem = this.actor.getEmbeddedDocument('Item', eventData.itemId);
    let collection = [];
    let tempCollection = [];

    let isArmor = parseInt(eventData.hand) === ChronicleSystem.equippedConstants.WEARING;
    let isUnequipping = parseInt(eventData.hand) === 0;

    this.actor.updateTempModifiers();

    if (isUnequipping) {
      let adaptableQuality = Object.values(currentItem.getCSData().qualities).filter((quality) => quality.name.toLowerCase() === "adaptable");
      if (adaptableQuality.length > 0 && parseInt(eventData.hand) === ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED && currentItem.getCSData().equipped !== ChronicleSystem.equippedConstants.BOTH_HANDS) {
        collection = this.UnequipsAllItemsInTheSlots([ ChronicleSystem.equippedConstants.MAIN_HAND, ChronicleSystem.equippedConstants.OFFHAND, ChronicleSystem.equippedConstants.BOTH_HANDS], collection);
        collection = this.ChangeItemEquippedStatus(collection, currentItem, ChronicleSystem.equippedConstants.BOTH_HANDS);
      } else {
        collection = this.ChangeItemEquippedStatus(collection, currentItem);
      }
    } else {
      if (isArmor) {
        collection = this.UnequipsAllItemsInTheSlots([ ChronicleSystem.equippedConstants.WEARING], collection);
        collection = this.ChangeItemEquippedStatus(collection, currentItem, ChronicleSystem.equippedConstants.WEARING);
      } else {
        let twoHandedQuality = Object.values(currentItem.getCSData().qualities).filter((quality) => quality.name.toLowerCase() === "two-handed");
        if (twoHandedQuality.length > 0) {
          collection = this.UnequipsAllItemsInTheSlots([ ChronicleSystem.equippedConstants.MAIN_HAND, ChronicleSystem.equippedConstants.OFFHAND, ChronicleSystem.equippedConstants.BOTH_HANDS], collection);
          collection = this.ChangeItemEquippedStatus(collection, currentItem, ChronicleSystem.equippedConstants.BOTH_HANDS);
        } else {
          collection = this.UnequipsAllItemsInTheSlots([ parseInt(eventData.hand), ChronicleSystem.equippedConstants.BOTH_HANDS], collection);
          collection = this.ChangeItemEquippedStatus(collection, currentItem, parseInt(eventData.hand));
        }
      }
    }

    this.actor.saveModifiers();

    this.actor.updateEmbeddedDocuments('Item', collection);
  }

  UnequipsAllItemsInTheSlots(slots = [], collection = []) {
    let tempCollection = this.actor.getEmbeddedCollection('Item').filter((item) => slots.includes(item.getCSData().equipped));

    tempCollection.forEach((item) => {
      collection.push({_id: item._id, "data.equipped": ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED});
      item.onEquippedChanged(this.actor, false);
    });

    return collection;
  }

  ChangeItemEquippedStatus(collection = [], item, equippedStatus = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED) {
    item.getCSData().equipped = equippedStatus;

    collection.push({_id: item._id, "data.equipped": item.getCSData().equipped});

    item.onEquippedChanged(this.actor, equippedStatus > 0);

    return collection;
  }

  async _onDispositionChanged(event, targets) {
    event.preventDefault();
    if (!ChronicleSystem.dispositions.find((disposition) => disposition.rating === parseInt(event.target.dataset.id))) {
      LOGGER.warn("the informed disposition does not exist.");
      return;
    }
    this.actor.update({"data.currentDisposition": event.target.dataset.id});
  }

  /* -------------------------------------------- */

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));

    }
    catch (err) {
      return;
    }
    return super._onDrop(event);
  }

  isItemPermitted(type) {
    return this.itemTypesPermitted.includes(type);
  }

}

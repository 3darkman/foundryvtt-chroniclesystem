/**
 * Extend the basic ActorSheetV2 with character-specific modifications
 * @extends {CSActorSheet}
 */
import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import { Technique } from "../../technique.js";
import { CSActorSheet } from "./csActorSheet.js";
import LOGGER from "../../utils/logger.js";
import SystemUtils from "../../utils/systemUtils.js";
import { CSConstants } from "../../system/csConstants.js";

export class CSCharacterActorSheet extends CSActorSheet {
  itemTypesPermitted = [
    "ability",
    "weapon",
    "armor",
    "equipment",
    "benefit",
    "drawback",
    "technique",
    "unitType",
  ];

  static DEFAULT_OPTIONS = {
    classes: ["chroniclesystem", "character", "sheet", "actor"],
    position: { width: 750, height: 900 },
    window: { resizable: true },
    actions: {
      changeDisposition: CSCharacterActorSheet._onDispositionChanged,
      toggleEquipped: CSCharacterActorSheet._onEquippedStateChanged,
      createInjury: CSCharacterActorSheet._onClickInjuryCreate,
      deleteInjury: CSCharacterActorSheet._onClickInjuryDelete,
      createWound: CSCharacterActorSheet._onClickWoundCreate,
      deleteWound: CSCharacterActorSheet._onClickWoundDelete,
      clickSquare: CSCharacterActorSheet._onClickSquare,
    },
  };

  static PARTS = {
    form: {
      template:
        "systems/chroniclesystem/templates/actors/characters/character-sheet.hbs",
      scrollable: [""],
    },
  };

  static TABS = {
    primary: {
      tabs: [
        "abilities",
        "combat-and-intrigue",
        "qualities",
        "sorcery",
        "equipments",
        "actor-description",
      ],
      initial: "abilities",
    },
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dtypes = ["String", "Number", "Boolean"];

    // Provide backward-compatible template variables
    const actor = this.document;
    context.actor = actor;
    context.items = Array.from(actor.items);
    context.owner = actor.isOwner;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;

    // Split items by type (reuse base class helper)
    this.splitItemsByType(context);

    let character = actor.getCSData();

    character.owned.equipments = this._checkNull(
      context.itemsByType["equipment"]
    );
    character.owned.weapons = this._checkNull(context.itemsByType["weapon"]);
    character.owned.armors = this._checkNull(context.itemsByType["armor"]);
    character.owned.benefits = this._checkNull(context.itemsByType["benefit"]);
    character.owned.drawbacks = this._checkNull(
      context.itemsByType["drawback"]
    );
    character.owned.abilities = this._checkNull(
      context.itemsByType["ability"]
    ).sort((a, b) => a.name.localeCompare(b.name));
    character.owned.techniques = this._checkNull(
      context.itemsByType["technique"]
    ).sort((a, b) => a.name.localeCompare(b.name));

    context.dispositions = ChronicleSystem.dispositions;

    context.notEquipped = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED;

    context.techniquesTypes = CSConstants.TechniqueType;
    context.techniquesCosts = CSConstants.TechniqueCost;

    character.owned.weapons.forEach((weapon) => {
      let weaponData = weapon.system;
      let info = weaponData.specialty.split(":");
      if (info.length < 2) return "";
      let formula = ChronicleSystem.getActorAbilityFormula(
        actor,
        info[0],
        info[1]
      );
      formula = ChronicleSystem.adjustFormulaByWeapon(actor, formula, weapon);
      weapon.updateDamageValue(this.actor);
      weapon.formula = formula;
    });

    character.owned.techniques.forEach((technique) => {
      let techniqueData = technique.system;
      let works = (context.currentInjuries = Object.values(
        techniqueData.works
      ));
      works.forEach((work) => {
        if (work.type === "SPELL") {
          work.test.spellcastingFormula =
            ChronicleSystem.getActorAbilityFormula(
              actor,
              work.test.spellcasting,
              null
            );
        } else {
          work.test.alignmentFormula = ChronicleSystem.getActorAbilityFormula(
            actor,
            work.test.alignment,
            null
          );
          work.test.invocationFormula = ChronicleSystem.getActorAbilityFormula(
            actor,
            work.test.invocation,
            null
          );
          work.test.unleashingFormula = ChronicleSystem.getActorAbilityFormula(
            actor,
            work.test.unleashing,
            null
          );
        }
      });
    });

    this._calculateIntrigueTechniques(context, actor);

    context.currentInjuries = character.injuries
      ? Object.values(character.injuries).length
      : 0;
    context.currentWounds = character.wounds
      ? Object.values(character.wounds).length
      : 0;
    context.maxInjuries = this.actor.getMaxInjuries();
    context.maxWounds = this.actor.getMaxWounds();
    context.character = character;

    // Pre-enrich HTML descriptions for benefit and drawback items
    const rollData = this.actor.getRollData();
    const enrichOpts = { async: true, rollData };
    for (const item of [
      ...character.owned.benefits,
      ...character.owned.drawbacks,
    ]) {
      if (item.system.description) {
        item.system.description =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            item.system.description,
            enrichOpts
          );
      }
    }

    // Pre-enrich HTML descriptions for technique works
    for (const technique of character.owned.techniques) {
      const works = Object.values(technique.system.works);
      for (const work of works) {
        if (work.description) {
          work.description =
            await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              work.description,
              enrichOpts
            );
        }
      }
    }

    // Pre-enrich editor fields for the description tab
    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    context.enrichedPersonalHistory = await TextEditorImpl.enrichHTML(
      character.personalHistory || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedAllies = await TextEditorImpl.enrichHTML(
      character.allies || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedEnemies = await TextEditorImpl.enrichHTML(
      character.enemies || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedOaths = await TextEditorImpl.enrichHTML(
      character.oaths || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedMotto = await TextEditorImpl.enrichHTML(
      character.motto || "",
      { async: true, relativeTo: actor }
    );

    // Prepare tab state
    context.tabs = this._getTabs();

    return context;
  }

  /**
   * Prepare tabs data for template rendering.
   * @returns {object} Tab group configuration with active states.
   */
  _getTabs() {
    const tabGroup = this.constructor.TABS.primary;
    const activeTab = this.tabGroups?.primary ?? tabGroup.initial;
    return tabGroup.tabs.reduce((tabs, tab) => {
      tabs[tab] = { active: tab === activeTab };
      return tabs;
    }, {});
  }

  _calculateIntrigueTechniques(data, actor) {
    let cunningValue = actor.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.CUNNING)
    );
    let willValue = actor.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.WILL)
    );
    let persuasionValue = actor.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION)
    );
    let awarenessValue = actor.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)
    );

    let bluffFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.DECEPTION),
      SystemUtils.localize(ChronicleSystem.keyConstants.BLUFF)
    );
    let actFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.DECEPTION),
      SystemUtils.localize(ChronicleSystem.keyConstants.ACT)
    );
    let bargainFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.BARGAIN)
    );
    let charmFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.CHARM)
    );
    let convinceFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.CONVINCE)
    );
    let inciteFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.INCITE)
    );
    let intimidateFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.INTIMIDATE)
    );
    let seduceFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.SEDUCE)
    );
    let tauntFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      SystemUtils.localize(ChronicleSystem.keyConstants.PERSUASION),
      SystemUtils.localize(ChronicleSystem.keyConstants.TAUNT)
    );

    let intimidateDeceptionFormula =
      actFormula.bonusDice + actFormula.modifier >
      bluffFormula.bonusDice + bluffFormula.modifier
        ? actFormula
        : bluffFormula;

    // Apply current disposition modifiers to technique formulas
    const currentDisposition = ChronicleSystem.dispositions.find(
      (d) => d.rating === actor.getCSData().currentDisposition
    );
    if (currentDisposition) {
      for (const f of [
        bargainFormula,
        charmFormula,
        convinceFormula,
        inciteFormula,
        intimidateFormula,
        seduceFormula,
        tauntFormula,
      ]) {
        f.modifier += currentDisposition.persuasionModifier;
      }
      bluffFormula.modifier += currentDisposition.deceptionModifier;
      actFormula.modifier += currentDisposition.deceptionModifier;
    }

    data.techniques = {
      bargain: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.BARGAIN),
        cunningValue,
        bargainFormula,
        bluffFormula
      ),
      charm: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.CHARM),
        persuasionValue,
        charmFormula,
        actFormula
      ),
      convince: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.CONVINCE),
        willValue,
        convinceFormula,
        actFormula
      ),
      incite: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.INCITE),
        cunningValue,
        inciteFormula,
        bluffFormula
      ),
      intimidate: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.INTIMIDATE),
        willValue,
        intimidateFormula,
        intimidateDeceptionFormula
      ),
      seduce: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.SEDUCE),
        persuasionValue,
        seduceFormula,
        bluffFormula
      ),
      taunt: new Technique(
        SystemUtils.localize(ChronicleSystem.keyConstants.TAUNT),
        awarenessValue,
        tauntFormula,
        bluffFormula
      ),
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // V2 action handlers (changeDisposition, toggleEquipped, createInjury,
    // deleteInjury, createWound, deleteWound, clickSquare) are registered
    // in DEFAULT_OPTIONS.actions and dispatched automatically by the
    // framework for elements with data-action attributes.
    // No manual event listeners needed here.
  }

  async setFrustrationValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.frustration) return;
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.frustration.total
      ),
      0
    );

    this.actor.updateTempPenalties();

    if (value > 0) {
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.DECEPTION,
        ChronicleSystem.keyConstants.FRUSTRATION,
        value,
        false
      );
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.PERSUASION,
        ChronicleSystem.keyConstants.FRUSTRATION,
        value,
        false
      );
    } else {
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.DECEPTION,
        ChronicleSystem.keyConstants.FRUSTRATION
      );
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.PERSUASION,
        ChronicleSystem.keyConstants.FRUSTRATION
      );
    }

    this.actor.update({
      "system.derivedStats.frustration.current": value,
      "system.penalties": this.actor.penalties,
    });
  }

  async setFatigueValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.fatigue) return;
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.fatigue.total
      ),
      0
    );

    this.actor.updateTempModifiers();

    if (value > 0) {
      this.actor.addModifier(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.FATIGUE,
        -value,
        false
      );
    } else {
      this.actor.removeModifier(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.FATIGUE
      );
    }

    this.actor.update({
      "system.derivedStats.fatigue.current": value,
      "system.modifiers": this.actor.modifiers,
    });
  }

  async setStressValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.frustration) return;
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.frustration.total
      ),
      0
    );

    this.actor.updateTempPenalties();

    if (value > 0) {
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.AWARENESS,
        ChronicleSystem.keyConstants.STRESS,
        value,
        false
      );
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.CUNNING,
        ChronicleSystem.keyConstants.STRESS,
        value,
        false
      );
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.STATUS,
        ChronicleSystem.keyConstants.STRESS,
        value,
        false
      );
    } else {
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.AWARENESS,
        ChronicleSystem.keyConstants.STRESS
      );
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.CUNNING,
        ChronicleSystem.keyConstants.STRESS
      );
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.STATUS,
        ChronicleSystem.keyConstants.STRESS
      );
    }

    this.actor.update({
      "system.currentStress": value,
      "system.penalties": this.actor.penalties,
    });
  }

  /**
   * Static action handler for clicking fatigue/frustration/stress squares.
   * Called from data-action="clickSquare" or via _attachPartListeners.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickSquare(event, target) {
    event.preventDefault();
    let method = `set${target.dataset.type}Value`;
    await this[method](target.id);
  }

  /**
   * Static action handler for creating a wound.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickWoundCreate(event, target) {
    event.preventDefault();
    const data = this.actor.getCSData();
    if (!data.wounds) return;
    let wound = "";
    let wounds = Object.values(data.wounds);
    if (wounds.length >= this.actor.getMaxWounds()) return;
    wounds.push(wound);
    this.actor.updateTempPenalties();
    this.actor.addPenalty(
      ChronicleSystem.modifiersConstants.ALL,
      ChronicleSystem.keyConstants.WOUNDS,
      wounds.length,
      false
    );
    this.actor.update({
      "system.wounds": wounds,
      "system.penalties": this.actor.penalties,
    });
  }

  /**
   * Static action handler for wound delete (via data-action="deleteWound").
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickWoundDelete(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.id);

    const data = this.actor.getCSData();
    if (!data.wounds) return;
    let wounds = Object.values(data.wounds);
    wounds.splice(index, 1);

    this.actor.updateTempPenalties();
    if (wounds.length === 0) {
      this.actor.removePenalty(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.WOUNDS
      );
    } else {
      this.actor.addPenalty(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.WOUNDS,
        wounds.length,
        false
      );
    }
    this.actor.update({
      "system.wounds": wounds,
      "system.penalties": this.actor.penalties,
    });
  }

  /**
   * Static action handler for creating an injury.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickInjuryCreate(event, target) {
    event.preventDefault();
    const data = this.actor.getCSData();
    if (!data.injuries) return;
    let injury = "";
    let injuries = Object.values(data.injuries);
    if (injuries.length >= this.actor.getMaxInjuries()) return;

    injuries.push(injury);

    this.actor.updateTempModifiers();
    this.actor.addModifier(
      ChronicleSystem.modifiersConstants.ALL,
      ChronicleSystem.keyConstants.INJURY,
      -injuries.length,
      false
    );

    this.actor.update({
      "system.injuries": injuries,
      "system.modifiers": this.actor.modifiers,
    });
  }

  /**
   * Static action handler for injury delete (via data-action="deleteInjury").
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickInjuryDelete(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.id);

    const data = this.actor.getCSData();
    if (!data.injuries) return;
    let injuries = Object.values(data.injuries);
    injuries.splice(index, 1);

    this.actor.updateTempModifiers();
    if (injuries.length === 0) {
      this.actor.removeModifier(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.INJURY
      );
    } else {
      this.actor.addModifier(
        ChronicleSystem.modifiersConstants.ALL,
        ChronicleSystem.keyConstants.INJURY,
        -injuries.length,
        false
      );
    }

    this.actor.update({
      "system.injuries": injuries,
      "system.modifiers": this.actor.modifiers,
    });
  }

  /**
   * Static action handler for equipped state changes.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onEquippedStateChanged(event, target) {
    event.preventDefault();
    const eventData = target.dataset;
    let currentItem = this.actor.getEmbeddedDocument("Item", eventData.itemId);
    let collection = [];

    let isArmor =
      parseInt(eventData.hand) === ChronicleSystem.equippedConstants.WEARING;
    let isUnequipping = parseInt(eventData.hand) === 0;

    this.actor.updateTempModifiers();

    if (isUnequipping) {
      let adaptableQuality = Object.values(
        currentItem.getCSData().qualities
      ).filter((quality) => quality.name.toLowerCase() === "adaptable");
      if (
        adaptableQuality.length > 0 &&
        parseInt(eventData.hand) ===
          ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED &&
        currentItem.getCSData().equipped !==
          ChronicleSystem.equippedConstants.BOTH_HANDS
      ) {
        collection = this.UnequipsAllItemsInTheSlots(
          [
            ChronicleSystem.equippedConstants.MAIN_HAND,
            ChronicleSystem.equippedConstants.OFFHAND,
            ChronicleSystem.equippedConstants.BOTH_HANDS,
          ],
          collection
        );
        collection = this.ChangeItemEquippedStatus(
          collection,
          currentItem,
          ChronicleSystem.equippedConstants.BOTH_HANDS
        );
      } else {
        collection = this.ChangeItemEquippedStatus(collection, currentItem);
      }
    } else {
      if (isArmor) {
        collection = this.UnequipsAllItemsInTheSlots(
          [ChronicleSystem.equippedConstants.WEARING],
          collection
        );
        collection = this.ChangeItemEquippedStatus(
          collection,
          currentItem,
          ChronicleSystem.equippedConstants.WEARING
        );
      } else {
        let twoHandedQuality = Object.values(
          currentItem.getCSData().qualities
        ).filter((quality) => quality.name.toLowerCase() === "two-handed");
        if (twoHandedQuality.length > 0) {
          collection = this.UnequipsAllItemsInTheSlots(
            [
              ChronicleSystem.equippedConstants.MAIN_HAND,
              ChronicleSystem.equippedConstants.OFFHAND,
              ChronicleSystem.equippedConstants.BOTH_HANDS,
            ],
            collection
          );
          collection = this.ChangeItemEquippedStatus(
            collection,
            currentItem,
            ChronicleSystem.equippedConstants.BOTH_HANDS
          );
        } else {
          collection = this.UnequipsAllItemsInTheSlots(
            [
              parseInt(eventData.hand),
              ChronicleSystem.equippedConstants.BOTH_HANDS,
            ],
            collection
          );
          collection = this.ChangeItemEquippedStatus(
            collection,
            currentItem,
            parseInt(eventData.hand)
          );
        }
      }
    }

    this.actor.saveModifiers();

    this.actor.updateEmbeddedDocuments("Item", collection);
  }

  UnequipsAllItemsInTheSlots(slots = [], collection = []) {
    let tempCollection = this.actor
      .getEmbeddedCollection("Item")
      .filter((item) => slots.includes(item.getCSData().equipped));

    tempCollection.forEach((item) => {
      collection.push({
        _id: item._id,
        "system.equipped": ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED,
      });
      item.onEquippedChanged(this.actor, false);
    });

    return collection;
  }

  ChangeItemEquippedStatus(
    collection = [],
    item,
    equippedStatus = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED
  ) {
    item.getCSData().equipped = equippedStatus;

    collection.push({
      _id: item._id,
      "system.equipped": item.getCSData().equipped,
    });

    item.onEquippedChanged(this.actor, equippedStatus > 0);

    return collection;
  }

  /**
   * Static action handler for disposition changes.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onDispositionChanged(event, target) {
    event.preventDefault();
    if (
      !ChronicleSystem.dispositions.find(
        (disposition) => disposition.rating === parseInt(target.dataset.id)
      )
    ) {
      LOGGER.warn("the informed disposition does not exist.");
      return;
    }
    this.actor.update({
      "system.currentDisposition": parseInt(target.dataset.id),
    });
  }

  /* -------------------------------------------- */

  isItemPermitted(type) {
    return this.itemTypesPermitted.includes(type);
  }
}

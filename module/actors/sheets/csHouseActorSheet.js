import { CSActorSheet } from "./csActorSheet.js";
import { CSConstants } from "../../system/csConstants.js";
import SystemUtils from "../../utils/systemUtils.js";
import LOGGER from "../../utils/logger.js";
import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import { CoatOfArmsEditor } from "../../coat-of-arms/cs-coa-editor.js";

export class CSHouseActorSheet extends CSActorSheet {
  itemTypesPermitted = ["event", "holding"];

  static DEFAULT_OPTIONS = {
    classes: ["chroniclesystem", "sheet", "house", "actor"],
    position: { width: 800, height: 600 },
    window: { resizable: true },
    actions: {
      removeMember: CSHouseActorSheet._onRemoveMember,
      openActorSheet: CSHouseActorSheet._onOpenActorSheet,
      editResource: CSHouseActorSheet._onEditResource,
      regenerateResources: CSHouseActorSheet._onRegenerateResources,
      openCoaEditor: CSHouseActorSheet._onOpenCoaEditor,
      reRenderCoa: CSHouseActorSheet._onReRenderCoa,
    },
  };

  static PARTS = {
    form: {
      template:
        "systems/chroniclesystem/templates/actors/houses/house-sheet.hbs",
      // `.sheet-body` is the real scroll container; an empty selector targets the
      // overflow:hidden part-root wrapper, so the scroll would reset to the top on
      // every re-render. Point it at the actual scroller (same fix as the
      // character sheet).
      scrollable: [".sheet-body"],
    },
  };

  static TABS = {
    primary: {
      tabs: ["resources", "events", "members", "holdings", "effects"],
      initial: "resources",
    },
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Provide backward-compatible template variables
    const actor = this.document;
    context.actor = actor;
    context.items = Array.from(actor.items);
    context.owner = actor.isOwner;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;

    // Split items by type (reuse base class helper)
    this.splitItemsByType(context);

    let house = actor.getCSData();

    house.historicalEvents = this._checkNull(context.itemsByType["event"]);

    this.prepareHoldingData(house, context);

    this.prepareRolesData(house, context);

    this.prepareFortuneData(house, context);

    // spec 025 (US3, contract house-power-allocation.md C2) — the Power its Units
    // consume. Written on the RENDER CONTEXT only, never back onto
    // `actor.system.power`: a sheet must not mutate the document's system data.
    const { allocated, units } = actor.getUnitsPowerAllocated();
    const powerTotal = Number(house.power?.total) || 0;
    context.house = {
      power: {
        allocated,
        remaining: powerTotal - allocated,
        overAllocated: allocated > powerTotal,
        hasUnits: units.length > 0,
      },
    };

    // Pre-enrich HTML descriptions for events and holdings (FR-015)
    const rollData = this.document.getRollData();
    for (const event of house.historicalEvents) {
      if (event.system.description) {
        event.system.description =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            event.system.description,
            { async: true, rollData }
          );
      }
    }
    for (const resourceKey of Object.keys(house.holdings)) {
      for (const holding of house.holdings[resourceKey]) {
        if (holding.system.description) {
          holding.system.description =
            await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              holding.system.description,
              { async: true, rollData }
            );
        }
      }
    }

    // Effects tab (shared across all actor types)
    this._prepareEffectsContext(context);

    // Coat of arms display (spec 014, D11): prefer the crisp vector SVG; fall back
    // to actor.img (legacy PNG, or a user-set portrait). When actor.img already
    // points at the saved SVG it carries the ?t cache-bust — use it so a re-render
    // refreshes; otherwise use the clean coaSvg path.
    const coaSvg = actor.system.coaSvg;
    context.coaImage =
      coaSvg && actor.img?.startsWith(coaSvg) ? actor.img : coaSvg || actor.img;
    // Show the manual "Re-render" affordance only when a definition exists but has
    // no saved image at all (neither SVG nor PNG — FR-010).
    context.coaNeedsRender =
      actor.hasCoaDefinition() && !actor.system.coaSvg && !actor.system.coaImg;

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

  /* -------------------------------------------- */

  prepareRolesData(house, data) {
    house.head = data.actor.getCharactersFromRole(data.actor.roleMap.HEAD);
    house.steward = data.actor.getCharactersFromRole(
      data.actor.roleMap.STEWARD
    );
    house.heirs = data.actor.getCharactersFromRole(data.actor.roleMap.HEIR);
    house.family = data.actor.getCharactersFromRole(data.actor.roleMap.FAMILY);
    house.retainers = data.actor.getCharactersFromRole(
      data.actor.roleMap.RETAINER
    );
    house.servants = data.actor.getCharactersFromRole(
      data.actor.roleMap.SERVANT
    );
  }

  prepareFortuneData(house, data) {
    if (!house.steward.id) return;
    house.fortune = {
      lawMod: data.actor.getLawModifier(),
      populationMod: data.actor.getPopulationModifier(),
      holdingsDice: data.actor.getHoldingsDice(),
      holdingsFlat: data.actor.getHoldingsModifier(),
      holdingsMod: "0",
    };

    house.fortune.holdingsMod =
      house.fortune.holdingsDice && house.fortune.holdingsDice !== 0
        ? `${house.fortune.holdingsDice}d6`
        : "";
    house.fortune.holdingsMod +=
      house.fortune.holdingsFlat && house.fortune.holdingsFlat !== 0
        ? house.fortune.holdingsFlat > 0
          ? `${house.fortune.holdingsMod ? " + " : ""}${
              house.fortune.holdingsFlat
            }`
          : `${house.fortune.holdingsMod ? " - " : ""}${-house.fortune
              .holdingsFlat}`
        : "";

    const steward = game.actors.get(house.steward.id);
    // Resolve Status:Stewardship by stable slug (spec 008) — survives a rename.
    let stewardshipFormula = ChronicleSystem.getActorAbilityFormula(
      steward,
      "status",
      "status_stewardship"
    );
    stewardshipFormula.pool += house.fortune.holdingsDice;
    stewardshipFormula.modifier =
      stewardshipFormula.modifier +
      house.fortune.lawMod +
      house.fortune.populationMod +
      house.fortune.holdingsFlat;
    // spec 017 (US2): the House Fortune chip through the SSOT utility, using the
    // SAME rollId the template built (`formula:{Stewardship}:{toStr}`). Via T017
    // the hand-rolled chip is migrated to the shared rollable-chip partial, so it
    // inherits parity like every other chip (DRY/SSOT).
    house.fortune.fortuneChip = ChronicleSystem.getRollChip(
      data.actor,
      `formula:${SystemUtils.localize(
        "CS.constants.specialties.stewardship"
      )}:${stewardshipFormula.toStr()}`
    );
  }

  prepareHoldingData(house, data) {
    house.holdings = {
      defense: [],
      influence: [],
      lands: [],
      law: [],
      population: [],
      power: [],
      wealth: [],
    };
    this.resetResourceInvestments(house);

    let holdings = this._checkNull(data.itemsByType["holding"]);
    holdings.forEach((holding) => {
      let doc = this.document.getEmbeddedDocument("Item", holding._id);
      house.holdings[holding.system.resource].push(holding);
      house[holding.system.resource].invested += doc.getTotalInvested();
      house[holding.system.resource].hasHoldings = true;
    });
  }

  resetResourceInvestments(house) {
    house.defense.invested = 0;
    house.influence.invested = 0;
    house.lands.invested = 0;
    house.law.invested = 0;
    house.population.invested = 0;
    house.power.invested = 0;
    house.wealth.invested = 0;
  }

  /* -------------------------------------------- */

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Note: Member removal, actor sheet opening, resource editing, and
    // resource regeneration are now handled via V2 static action handlers
    // (removeMember, openActorSheet, editResource, regenerateResources)
    // registered in DEFAULT_OPTIONS.actions.
  }

  /* -------------------------------------------- */
  /*  Static Action Handlers                       */
  /* -------------------------------------------- */

  /**
   * Static action handler for removing a member from the house.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static _onRemoveMember(event, target) {
    event.preventDefault();
    const actorId = target.dataset.id;
    const role = target.dataset.role;
    this.document.removeCharacterFromHouse(actorId, role);
  }

  /**
   * Static action handler for opening a linked actor's sheet.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static _onOpenActorSheet(event, target) {
    event.preventDefault();
    const id = target.dataset.id;
    const actor = game.actors.get(id);
    if (actor) actor.sheet.render({ force: true });
  }

  /**
   * Static action handler for editing a resource.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static _onEditResource(event, target) {
    event.preventDefault();
    const resourceId = target.dataset.id;
    const resourceName = target.dataset.name;
    if (!resourceId || !resourceName) return;
    this._openResourceEditorForResource(resourceId, resourceName);
  }

  /**
   * Static action handler for regenerating resources.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onRegenerateResources(event, target) {
    event.preventDefault();
    await this.document.regenerateAllStartingResources();
  }

  /**
   * Static action handler for opening the Coat of Arms editor (OWNER only, GM
   * included — FR-015). A unique id per house allows several editors at once.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static _onOpenCoaEditor(event, target) {
    event.preventDefault();
    if (!this.document.isOwner) return;
    new CoatOfArmsEditor({
      document: this.document,
      id: `cs-coa-editor-${this.document.id}`,
    }).render(true);
  }

  /**
   * Static action handler for the manual re-render of a saved definition
   * (FR-020) — only meaningful when a definition exists but has no image.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onReRenderCoa(event, target) {
    event.preventDefault();
    if (!this.document.isOwner) return;
    await this.document.reRenderCoa();
  }

  /* -------------------------------------------- */
  /*  Resource Editor Dialog (DialogV2)            */
  /* -------------------------------------------- */

  async _openResourceEditor(ev) {
    ev.preventDefault();
    let resourceId = ev.currentTarget.dataset.id;
    let resourceName = ev.currentTarget.dataset.name;
    if (!resourceId || !resourceName) return;
    return this._openResourceEditorForResource(resourceId, resourceName);
  }

  async _openResourceEditorForResource(resourceId, resourceName) {
    const actor = this.document;
    const template = CSConstants.Templates.Dialogs.HOUSE_RESOURCE_EDITOR;
    const html = await foundry.applications.handlebars.renderTemplate(
      template,
      {
        startingValue: actor.getCSData()[resourceId].startingValue,
        description: actor.getCSData()[resourceId].description,
        resourceId: resourceId,
      }
    );

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: SystemUtils.format("CS.dialogs.houseResourceEditor.title", {
          resourceName: resourceName,
        }),
      },
      content: html,
      buttons: [
        {
          action: "save",
          label: SystemUtils.localize("CS.dialogs.actions.save"),
          icon: "fas fa-check",
          default: true,
          callback: (event, button) => button.form,
        },
        {
          action: "cancel",
          label: SystemUtils.localize("CS.dialogs.actions.cancel"),
          icon: "fas fa-times",
        },
      ],
      rejectClose: false,
    });

    if (result) {
      this._processResourceEdition(result);
    }
  }

  _processResourceEdition(formData) {
    this.document.changeResource(
      formData.resourceId.value,
      formData.startingValue.value,
      formData.description.value
    );
    return true;
  }

  /* -------------------------------------------- */
  /*  Drop Handlers                                */
  /* -------------------------------------------- */

  isItemPermitted(type) {
    return this.itemTypesPermitted.includes(type);
  }

  /** @override */
  async _onDropActor(event, actor) {
    LOGGER.trace("On Drop Actor | CSHouseActorSheet | csHouseActorSheet.js");
    event.preventDefault();
    if (!this.document.isOwner) return false;

    if (actor && actor.type === "character") {
      this.showCharacterRoleDialog(actor);
    }
  }

  /** @override */
  async _onDropItem(event, item) {
    if (!this.document.isOwner) return null;

    // If the item already belongs to this actor, handle sorting
    if (this.document.uuid === item.parent?.uuid) {
      return this._onSortItem(event, item);
    }

    const itemData = item.toObject();

    // Check for duplicate items by name
    const existingItem = this.document.items.find((i) => i.name === item.name);
    if (existingItem) {
      return existingItem;
    }

    let embeddedItem = [];
    let itemsToCreate = [];
    let dataArray = [];
    let eventsCanGenerateModifiers = [];

    dataArray = dataArray.concat(itemData);
    for (let i = 0; i < dataArray.length; i++) {
      const doc = dataArray[i];
      if (this.isItemPermitted(doc.type)) {
        if (doc.type === "event") {
          const result = await this.showAddingEventDialog(doc);
          if (result) {
            let generateData = this._processAddingEvent(
              result.data,
              result.event
            );
            if (generateData.canGenerate) {
              eventsCanGenerateModifiers.push({
                doc: doc.name,
                choices: generateData.choices,
              });
            }
            itemsToCreate.push(doc);
          }
        } else {
          itemsToCreate.push(doc);
        }
      }
    }

    if (itemsToCreate.length > 0) {
      const createdItems = await this.document.createEmbeddedDocuments(
        "Item",
        itemsToCreate
      );
      for (const createdItem of createdItems) {
        let ev = eventsCanGenerateModifiers.find(
          (e) => e.doc === createdItem.name
        );
        if (ev) await createdItem.generateModifiers(ev.choices);
        createdItem.onObtained(createdItem.actor);
      }
      embeddedItem = embeddedItem.concat(createdItems);
    }

    return embeddedItem;
  }

  /* -------------------------------------------- */
  /*  Adding Event Dialog (DialogV2)               */
  /* -------------------------------------------- */

  async showAddingEventDialog(eventItem) {
    LOGGER.trace(
      "show adding event dialog | CSHouseActorSheet |" + " csHouseActorSheet.js"
    );
    const template = CSConstants.Templates.Dialogs.ADDING_HOUSE_EVENT;
    const html = await foundry.applications.handlebars.renderTemplate(
      template,
      {
        data: eventItem,
        choices: CSConstants.HouseResources,
        id: eventItem.id,
      }
    );

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: SystemUtils.localize("CS.dialogs.addingHouseEvent.title"),
      },
      content: html,
      buttons: [
        {
          action: "save",
          label: SystemUtils.localize("CS.dialogs.actions.save"),
          icon: "fas fa-check",
          default: true,
          callback: (event, button) => ({
            data: button.form,
            event: eventItem,
          }),
        },
        {
          action: "cancel",
          label: SystemUtils.localize("CS.dialogs.actions.cancel"),
          icon: "fas fa-times",
        },
      ],
      rejectClose: false,
    });

    return result || null;
  }

  _processAddingEvent(formData, eventItem) {
    if (!formData.generateModifiers.checked) return { canGenerate: false };

    let choices = [];
    for (let i = 1; i <= eventItem.system.numberOfChoices; i++) {
      choices.push(formData[`resource_${i}`].value);
    }
    return { canGenerate: true, choices: choices };
  }

  /* -------------------------------------------- */
  /*  Character Role Dialog (DialogV2)             */
  /* -------------------------------------------- */

  async showCharacterRoleDialog(actor) {
    LOGGER.trace(
      "show character role dialog | CSHouseActorSheet |" +
        " csHouseActorSheet.js"
    );
    const template = CSConstants.Templates.Dialogs.CHARACTER_ROLE_IN_HOUSE;
    const html = await foundry.applications.handlebars.renderTemplate(
      template,
      {
        choices: CSConstants.HouseRoles,
        value: "HEAD",
        id: actor.id,
      }
    );

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: SystemUtils.format("CS.dialogs.characterRole.title", {
          actorName: actor.name,
        }),
      },
      content: html,
      buttons: [
        {
          action: "save",
          label: SystemUtils.localize("CS.dialogs.actions.save"),
          icon: "fas fa-check",
          default: true,
          callback: (event, button) => button.form,
        },
        {
          action: "cancel",
          label: SystemUtils.localize("CS.dialogs.actions.cancel"),
          icon: "fas fa-times",
        },
      ],
      rejectClose: false,
    });

    if (result) {
      this._processCharacterRole(result);
    }
  }

  _processCharacterRole(formData) {
    this.document.addCharacterToHouse(
      formData.characterId.value,
      formData.characterRole.value,
      formData.description.value
    );
    return true;
  }

  /* -------------------------------------------- */

  async _regenerateResources() {
    await this.document.regenerateAllStartingResources();
  }
}

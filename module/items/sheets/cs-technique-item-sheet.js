import { CSItemSheet } from "./csItemSheet.js";
import { CSConstants } from "../../system/csConstants.js";

export class CSTechniqueItemSheet extends CSItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["chroniclesystem", "technique", "sheet", "item"],
    position: { width: 650, height: 560 },
    actions: {
      createArt: CSTechniqueItemSheet._onCreateArt,
      deleteArt: CSTechniqueItemSheet._onDeleteArt,
      createWork: CSTechniqueItemSheet._onCreateWork,
      deleteWork: CSTechniqueItemSheet._onDeleteWork,
    },
  };

  static TABS = {
    primary: {
      tabs: ["details", "works", "effects"],
      initial: "details",
    },
  };

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Re-apply active tab state after each render
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      this.changeTab(tab, group, { force: true, updatePosition: false });
    }
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.types = CSConstants.TechniqueType;
    context.costs = CSConstants.TechniqueCost;

    // Enrich work descriptions for the works tab
    const works = context.item?.system?.works;
    if (works) {
      for (const work of Object.values(works)) {
        if (work.description) {
          work.description =
            await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              work.description,
              { async: true }
            );
        }
      }
    }

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
  /*  Static Action Handlers                      */
  /* -------------------------------------------- */

  /**
   * Action handler: Create a new art entry on this technique item.
   * For use with data-action="createArt" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onCreateArt(event, target) {
    const item = this.document;
    const art = { name: "" };
    const newArts = Object.values(item.getCSData().arts);
    newArts.push(art);
    item.update({ "system.arts": newArts });
  }

  /**
   * Action handler: Delete an art entry from this technique item.
   * For use with data-action="deleteArt" in templates.
   * Expects target to have data-id attribute with the art index.
   */
  static _onDeleteArt(event, target) {
    const item = this.document;
    const index = parseInt(target.dataset.id);
    const newArts = Object.values(item.getCSData().arts);
    newArts.splice(index, 1);
    item.update({ "system.arts": newArts });
  }

  /**
   * Action handler: Create a new work entry on this technique item.
   * For use with data-action="createWork" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onCreateWork(event, target) {
    const item = this.document;
    const work = {
      name: "",
      type: "",
      description: "",
      test: {
        alignment: "",
        invocation: "",
        unleashing: "",
        spellcasting: "",
      },
      cost: "",
      resonance: "",
    };
    const newWorks = Object.values(item.getCSData().works);
    newWorks.push(work);
    item.update({ "system.works": newWorks });
  }

  /**
   * Action handler: Delete a work entry from this technique item.
   * For use with data-action="deleteWork" in templates.
   * Expects target to have data-id attribute with the work index.
   */
  static _onDeleteWork(event, target) {
    const item = this.document;
    const index = parseInt(target.dataset.id);
    const newWorks = Object.values(item.getCSData().works);
    newWorks.splice(index, 1);
    item.update({ "system.works": newWorks });
  }
}

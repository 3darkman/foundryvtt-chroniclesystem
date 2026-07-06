import {
  buildEffectContext,
  buildNewEffectData,
  canUserModifyEffect,
} from "../../effects/cs-active-effect.js";

/**
 * Extend the basic ItemSheetV2 with some very simple modifications
 * @extends {ItemSheetV2}
 */
export class CSItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2
) {
  static DEFAULT_OPTIONS = {
    classes: ["worldbuilding", "chroniclesystem", "sheet", "item"],
    position: { width: 650, height: 560 },
    form: {
      submitOnChange: true,
    },
    actions: {
      deleteItem: CSItemSheet._onDeleteItem,
      createQuality: CSItemSheet._onCreateQuality,
      deleteQuality: CSItemSheet._onDeleteQuality,
      effectCreate: CSItemSheet._onEffectCreate,
      effectEdit: CSItemSheet._onEffectEdit,
      effectDelete: CSItemSheet._onEffectDelete,
      effectToggle: CSItemSheet._onEffectToggle,
    },
  };

  // Every item sheet gains a universal "Effects" tab alongside its details
  // (SC-003 — the tab exists on all 10 item types).
  static TABS = {
    primary: {
      tabs: ["details", "effects"],
      initial: "details",
    },
  };

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Restore the active tab after each re-render (V2 tab system).
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      this.changeTab(tab, group, { force: true, updatePosition: false });
    }
  }

  /** Tab state for template rendering. */
  _getTabs() {
    const tabGroup = this.constructor.TABS.primary;
    const activeTab = this.tabGroups?.primary ?? tabGroup.initial;
    return tabGroup.tabs.reduce((tabs, tab) => {
      tabs[tab] = { active: tab === activeTab };
      return tabs;
    }, {});
  }

  /** @override */
  // eslint-disable-next-line no-unused-vars
  _configureRenderParts(options) {
    const type = this.document.type;
    return {
      form: {
        template: `systems/chroniclesystem/templates/items/${type}.hbs`,
        scrollable: [""],
      },
    };
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dtypes = ["String", "Number", "Boolean"];
    const item = this.document;
    const system = item.system;

    // Provide template variables expected by V1 templates
    context.item = item;
    context.system = system;
    context.data = { item: item }; // backward compat for templates using data.item
    context.owner = item.isOwner;
    context.cssClass = this.isEditable ? "editable" : "locked";

    // Pre-enrich HTML for editor display (separate variables to avoid corrupting save data)
    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    context.enrichedDescription = system?.description
      ? await TextEditorImpl.enrichHTML(system.description, {
          async: true,
          relativeTo: item,
        })
      : "";
    context.enrichedEffects = system?.effects
      ? await TextEditorImpl.enrichHTML(system.effects, {
          async: true,
          relativeTo: item,
        })
      : "";
    context.enrichedRecovery = system?.recovery
      ? await TextEditorImpl.enrichHTML(system.recovery, {
          async: true,
          relativeTo: item,
        })
      : "";

    // Effects tab — pass the item as the viewing doc so its OWN effects show "—"
    // as source (not the item's own name).
    context.effects = Array.from(item.effects).map((e) =>
      buildEffectContext(e, game.user, item)
    );
    context.tabs = this._getTabs();

    return context;
  }

  /* -------------------------------------------- */

  /** Action: create a new Active Effect on this item. */
  // eslint-disable-next-line no-unused-vars
  static async _onEffectCreate(event, target) {
    const item = this.document;
    await item.createEmbeddedDocuments("ActiveEffect", [
      buildNewEffectData(item, game.user),
    ]);
  }

  /** Action: open an effect's config sheet. */
  static _onEffectEdit(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect) effect.sheet.render(true);
  }

  /** Action: delete an effect (permission-guarded). */
  static async _onEffectDelete(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) await effect.delete();
  }

  /** Action: toggle an effect's disabled state (permission-guarded). */
  static async _onEffectToggle(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) {
      await effect.update({ disabled: !effect.disabled });
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // Delete item button (V1 templates use class="item-delete")
    htmlElement.querySelectorAll(".item-delete").forEach((el) => {
      el.addEventListener("click", () => {
        const item = this.document;
        if (item.actor) {
          item.actor.deleteEmbeddedDocuments("Item", [item._id]);
        }
      });
    });

    // Delete quality button (V1 templates use class="item-qualities-control")
    htmlElement.querySelectorAll(".item-qualities-control").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        const index = parseInt(el.dataset.id);
        const action = el.dataset.action;
        if (action === "delete") {
          const item = this.document;
          let qualities = Object.values(item.getCSData().qualities);
          qualities.splice(index, 1);
          item.update({ "system.qualities": qualities });
        }
      });
    });

    // Create quality button (V1 templates use class="item-quality-create")
    htmlElement.querySelectorAll(".item-quality-create").forEach((el) => {
      el.addEventListener("click", () => {
        const item = this.document;
        let quality = {
          name: "",
          parameter: "",
        };
        let newQuality = Object.values(item.getCSData().qualities);
        newQuality.push(quality);
        item.update({ "system.qualities": newQuality });
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Action handler: Delete this item from its parent actor.
   * For use with data-action="deleteItem" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onDeleteItem(event, target) {
    const item = this.document;
    if (item.actor) {
      item.actor.deleteEmbeddedDocuments("Item", [item._id]);
    }
  }

  /**
   * Action handler: Create a new quality entry on this item.
   * For use with data-action="createQuality" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onCreateQuality(event, target) {
    const item = this.document;
    let quality = {
      name: "",
      parameter: "",
    };
    let newQuality = Object.values(item.getCSData().qualities);
    newQuality.push(quality);
    item.update({ "system.qualities": newQuality });
  }

  /**
   * Action handler: Delete a quality entry from this item.
   * For use with data-action="deleteQuality" in templates.
   * Expects target to have data-id attribute with the quality index.
   */
  static _onDeleteQuality(event, target) {
    const item = this.document;
    const index = parseInt(target.dataset.id);
    let qualities = Object.values(item.getCSData().qualities);
    qualities.splice(index, 1);
    item.update({ "system.qualities": qualities });
  }
}

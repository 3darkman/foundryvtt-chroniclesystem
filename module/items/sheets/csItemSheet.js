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
    },
  };

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

    return context;
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

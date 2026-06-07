import { CSItemSheet } from "./csItemSheet.js";

export class CSHoldingItemSheet extends CSItemSheet {
  static DEFAULT_OPTIONS = {
    actions: {
      createFeature: CSHoldingItemSheet._onCreateFeature,
      deleteFeature: CSHoldingItemSheet._onDeleteFeature,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.resourceChoices = {
      defense: "CS.sheets.house.resources.defense",
      influence: "CS.sheets.house.resources.influence",
      lands: "CS.sheets.house.resources.lands",
      law: "CS.sheets.house.resources.law",
      population: "CS.sheets.house.resources.population",
      power: "CS.sheets.house.resources.power",
      wealth: "CS.sheets.house.resources.wealth",
    };
    return context;
  }

  /**
   * Action handler: Create a new feature entry on this holding item.
   * For use with data-action="createFeature" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onCreateFeature(event, target) {
    const item = this.document;
    const feature = {
      name: "",
      rating: 0,
      modifier: 0,
    };
    const featureList = Object.values(item.getCSData().features);
    featureList.push(feature);
    item.update({ "system.features": featureList });
  }

  /**
   * Action handler: Delete a feature entry from this holding item.
   * For use with data-action="deleteFeature" in templates.
   * Expects target to have data-id attribute with the feature index.
   */
  static _onDeleteFeature(event, target) {
    const index = parseInt(target.dataset.id);
    const item = this.document;
    const featureList = Object.values(item.getCSData().features);
    featureList.splice(index, 1);
    item.update({ "system.features": featureList });
  }
}

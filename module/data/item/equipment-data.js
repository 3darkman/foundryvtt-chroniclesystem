import {
  itemDescriptionFields,
  equipmentItemFields,
  normalizeSlugSource,
} from "../fields.js";

export default class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...equipmentItemFields(),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

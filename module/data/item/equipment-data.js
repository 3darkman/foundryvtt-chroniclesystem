import { itemDescriptionFields, equipmentItemFields } from "../fields.js";

export default class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...equipmentItemFields(),
    };
  }
}

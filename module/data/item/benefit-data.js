import { itemDescriptionFields } from "../fields.js";

const fields = foundry.data.fields;

export default class BenefitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      categories: new fields.StringField({ required: true, initial: "" }),
      requirements: new fields.StringField({ required: true, initial: "" }),
      sorcerousArtAccess: new fields.BooleanField({ initial: false }),
    };
  }
}

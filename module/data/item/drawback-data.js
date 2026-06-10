import { itemDescriptionFields } from "../fields.js";

const fields = foundry.data.fields;

export default class DrawbackData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      requireSorcerousArt: new fields.BooleanField({ initial: false }),
      isAStricture: new fields.BooleanField({ initial: false }),
      isAFlaw: new fields.BooleanField({ initial: false }),
      flawAttribute: new fields.StringField({ required: true, initial: "" }),
      requirements: new fields.StringField({ required: true, initial: "" }),
    };
  }
}

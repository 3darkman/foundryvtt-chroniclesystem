import {
  itemDescriptionFields,
  physicalItemFields,
  equipmentItemFields,
} from "../fields.js";

const fields = foundry.data.fields;

export default class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(),
      ...physicalItemFields(),
      ...equipmentItemFields(),
      specialty: new fields.StringField({ required: true, initial: "" }),
      training: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      damage: new fields.StringField({ required: true, initial: "" }),
      qualities: new fields.ArrayField(new fields.ObjectField()),
      reach: new fields.StringField({ required: true, initial: "" }),
      equipped: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
    };
  }
}

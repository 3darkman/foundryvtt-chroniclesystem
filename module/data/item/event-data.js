import { identityField, normalizeSlugSource } from "../fields.js";

const fields = foundry.data.fields;

export default class EventData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...identityField(),
      description: new fields.StringField({ required: true, initial: "" }),
      formulas: new fields.SchemaField({
        defense: new fields.StringField({ required: true, initial: "" }),
        influence: new fields.StringField({ required: true, initial: "" }),
        lands: new fields.StringField({ required: true, initial: "" }),
        law: new fields.StringField({ required: true, initial: "" }),
        population: new fields.StringField({ required: true, initial: "" }),
        power: new fields.StringField({ required: true, initial: "" }),
        wealth: new fields.StringField({ required: true, initial: "" }),
      }),
      modifiers: new fields.SchemaField({
        defense: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        influence: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        lands: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        law: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        population: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        power: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        wealth: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
      playerChoice: new fields.BooleanField({ initial: false }),
      numberOfChoices: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      bonusToChoices: new fields.StringField({ required: true, initial: "" }),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    return super.migrateData(source);
  }
}

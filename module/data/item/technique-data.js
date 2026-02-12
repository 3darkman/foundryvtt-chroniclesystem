const fields = foundry.data.fields;

export default class TechniqueData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: new fields.StringField({ required: true, initial: "" }),
      description: new fields.StringField({ required: true, initial: "" }),
      learning: new fields.SchemaField({
        time: new fields.StringField({ required: true, initial: "" }),
        difficult: new fields.NumberField({
          required: true,
          initial: 9,
          integer: true,
        }),
      }),
      arts: new fields.ArrayField(new fields.ObjectField()),
      scales: new fields.StringField({ required: true, initial: "" }),
      works: new fields.ArrayField(new fields.ObjectField()),
    };
  }
}

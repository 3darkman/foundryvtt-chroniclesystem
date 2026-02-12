const fields = foundry.data.fields;

export default class HouseData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    // Helper for the 7 resource fields (defense, influence, lands, law, population, power, wealth)
    const resourceField = () =>
      new fields.SchemaField({
        startingValue: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        description: new fields.StringField({ required: true, initial: "" }),
        total: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      });

    return {
      realm: new fields.StringField({ required: true, initial: "" }),
      liege: new fields.StringField({ required: true, initial: "" }),
      defense: resourceField(),
      influence: resourceField(),
      lands: resourceField(),
      law: resourceField(),
      population: resourceField(),
      power: resourceField(),
      wealth: resourceField(),
      historicalEvents: new fields.ArrayField(new fields.ObjectField()),
      motto: new fields.StringField({ required: true, initial: "" }),
      members: new fields.SchemaField({
        head: new fields.StringField({ required: true, initial: "" }),
        steward: new fields.StringField({ required: true, initial: "" }),
        heirs: new fields.ArrayField(new fields.ObjectField()),
        family: new fields.ArrayField(new fields.ObjectField()),
        retainers: new fields.ArrayField(new fields.ObjectField()),
        servants: new fields.ArrayField(new fields.ObjectField()),
      }),
    };
  }
}

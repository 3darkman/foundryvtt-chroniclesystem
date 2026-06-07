const fields = foundry.data.fields;

export default class HouseData extends foundry.abstract.TypeDataModel {
  /** @override */
  static migrateData(source) {
    // head/steward were historically a mixed type: "" when empty and
    // {id, description} when set. A previous schema declared them as
    // StringField, which coerced stored objects to "[object Object]".
    // Normalize every legacy/corrupted value to the {id, description} shape.
    if (source.members && typeof source.members === "object") {
      for (const role of ["head", "steward"]) {
        const val = source.members[role];
        if (val === undefined) continue;
        if (typeof val === "string") {
          // "" (empty) and "[object Object]" (corrupted) carry no id;
          // any other string is a legacy bare actor id.
          const id = val === "" || val === "[object Object]" ? "" : val;
          source.members[role] = { id, description: "" };
        }
      }
    }
    return super.migrateData(source);
  }

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
        head: new fields.SchemaField({
          id: new fields.StringField({ required: true, initial: "" }),
          description: new fields.StringField({ required: true, initial: "" }),
        }),
        steward: new fields.SchemaField({
          id: new fields.StringField({ required: true, initial: "" }),
          description: new fields.StringField({ required: true, initial: "" }),
        }),
        heirs: new fields.ArrayField(new fields.ObjectField()),
        family: new fields.ArrayField(new fields.ObjectField()),
        retainers: new fields.ArrayField(new fields.ObjectField()),
        servants: new fields.ArrayField(new fields.ObjectField()),
      }),
    };
  }
}

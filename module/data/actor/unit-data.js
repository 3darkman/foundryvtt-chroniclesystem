const fields = foundry.data.fields;

export default class UnitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      owned: new fields.SchemaField({
        equipments: new fields.ArrayField(new fields.ObjectField()),
        weapons: new fields.ArrayField(new fields.ObjectField()),
        armors: new fields.ArrayField(new fields.ObjectField()),
        qualities: new fields.ArrayField(new fields.ObjectField()),
        drawbacks: new fields.ArrayField(new fields.ObjectField()),
        abilities: new fields.ArrayField(new fields.ObjectField()),
        powers: new fields.ArrayField(new fields.ObjectField()),
        benefits: new fields.ArrayField(new fields.ObjectField()),
      }),
      modifiers: new fields.ObjectField({ initial: {} }),
      penalties: new fields.ObjectField({ initial: {} }),
      derivedStats: new fields.SchemaField({
        combatDefense: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          modifier: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
        }),
        health: new fields.SchemaField({
          total: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          modifier: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          value: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          current: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
        }),
      }),
      description: new fields.StringField({ required: true, initial: "" }),
      types: new fields.ArrayField(new fields.ObjectField()),
      currentEquipmentIndex: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      isEquipmentUpgraded: new fields.BooleanField({ initial: false }),
      xp: new fields.SchemaField({
        value: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        max: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
      trainingLevel: new fields.SchemaField({
        base: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        modifier: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
      status: new fields.SchemaField({
        current: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
      disorganizedPenalties: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
    };
  }
}

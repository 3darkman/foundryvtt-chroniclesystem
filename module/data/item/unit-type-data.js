const fields = foundry.data.fields;

export default class UnitTypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const equipmentField = () =>
      new fields.SchemaField({
        armor: new fields.SchemaField({
          rating: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          penalty: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          bulk: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
        }),
        fightingDamage: new fields.StringField({ required: true, initial: "" }),
        marksmanshipDamage: new fields.StringField({
          required: true,
          initial: "",
        }),
        isCloseRange: new fields.BooleanField({ initial: false }),
        isLongRange: new fields.BooleanField({ initial: false }),
      });

    return {
      description: new fields.StringField({ required: true, initial: "" }),
      powerCost: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      hasAnotherCost: new fields.BooleanField({ initial: false }),
      anotherCost: new fields.SchemaField({
        keyResource: new fields.StringField({ required: true, initial: "" }),
        modifier: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        hasModifierByTraining: new fields.BooleanField({ initial: false }),
        modifierByTraining: new fields.ArrayField(
          new fields.SchemaField({
            training: new fields.StringField({ required: true, initial: "" }),
            modifier: new fields.NumberField({
              required: true,
              initial: 0,
              integer: true,
            }),
          })
        ),
      }),
      disciplineModifier: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      allowAnyAbility: new fields.BooleanField({ initial: false }),
      keyAbilities: new fields.ArrayField(
        new fields.StringField({ required: true, initial: "" })
      ),
      startingEquipment: equipmentField(),
      upgradedEquipment: equipmentField(),
    };
  }
}

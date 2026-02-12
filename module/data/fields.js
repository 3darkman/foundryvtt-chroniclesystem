const fields = foundry.data.fields;

/**
 * Physical item fields from template.json "physicalItem" template.
 * Used by: WeaponData, ArmorData
 */
export function physicalItemFields() {
  return {
    weight: new fields.NumberField({
      required: true,
      initial: 0,
      integer: true,
    }),
  };
}

/**
 * Equipment item fields from template.json "equipmentItem" template.
 * Used by: WeaponData, EquipmentData, PoisonData
 */
export function equipmentItemFields() {
  return {
    quantity: new fields.NumberField({
      required: true,
      initial: 1,
      integer: true,
    }),
    cost: new fields.StringField({ required: true, initial: "" }),
  };
}

/**
 * Item description fields from template.json "itemDescription" template.
 * Used by: WeaponData, ArmorData, AbilityData, BenefitData, DrawbackData, EquipmentData, PoisonData
 */
export function itemDescriptionFields() {
  return {
    description: new fields.StringField({ required: true, initial: "" }),
    type: new fields.StringField({ required: true, initial: "" }),
  };
}

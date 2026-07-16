const fields = foundry.data.fields;

// Every `unit` schema leaf is an `integer` NumberField, so a legacy value of
// null/NaN/string would fail v13/v14 validation. Coerce each numeric leaf to a
// finite integer before validation runs. `Number(null)===0`, `Number("")===0`;
// anything non-finite (NaN, "abc") floors to 0; `Math.trunc` guarantees integer.
const toInt = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);

// Recurse (≤2 levels) through a numeric sub-tree, coercing every leaf in place.
const coerceLeaves = (node) => {
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === "object") coerceLeaves(value);
    else node[key] = toInt(value);
  }
};

// The fully-numeric sub-trees and the two top-level numeric scalars of the
// schema. Non-numeric branches (owned, modifiers, penalties, description,
// types, isEquipmentUpgraded) are deliberately left untouched.
const NUMERIC_TREES = ["derivedStats", "xp", "trainingLevel", "status"];
const NUMERIC_SCALARS = ["currentEquipmentIndex", "disorganizedPenalties"];

export default class UnitData extends foundry.abstract.TypeDataModel {
  /** @override */
  static migrateData(source) {
    for (const tree of NUMERIC_TREES) {
      if (source[tree] && typeof source[tree] === "object")
        coerceLeaves(source[tree]);
    }
    for (const key of NUMERIC_SCALARS) {
      if (source[key] !== undefined) source[key] = toInt(source[key]);
    }
    return super.migrateData(source);
  }

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

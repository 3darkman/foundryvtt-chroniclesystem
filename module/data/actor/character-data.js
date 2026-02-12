const fields = foundry.data.fields;

export default class CharacterData extends foundry.abstract.TypeDataModel {
  /** @override */
  static migrateData(source) {
    if (source.derivedStats) {
      const stats = source.derivedStats;
      for (const key of Object.keys(stats)) {
        const stat = stats[key];
        if (stat && typeof stat === "object") {
          for (const field of Object.keys(stat)) {
            const val = stat[field];
            if (val !== null && val !== undefined && !Number.isFinite(val)) {
              stat[field] = Number(val) || 0;
            }
          }
        }
      }
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      // === common template ===
      age: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      destinyPoints: new fields.SchemaField({
        current: new fields.NumberField({
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
      sorceryPoints: new fields.SchemaField({
        current: new fields.NumberField({
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
      derivedStats: new fields.SchemaField({
        intrigueDefense: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        composure: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          current: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        frustration: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          current: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        combatDefense: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        health: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          current: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        fatigue: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          current: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
        armorRating: new fields.SchemaField({
          value: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: true,
            initial: 0,
          }),
        }),
      }),
      wounds: new fields.ArrayField(new fields.ObjectField()),
      injuries: new fields.ArrayField(new fields.ObjectField()),
      currentDisposition: new fields.NumberField({
        required: true,
        initial: 4,
        integer: true,
      }),
      modifiers: new fields.ObjectField({ initial: {} }),
      penalties: new fields.ObjectField({ initial: {} }),
      movement: new fields.SchemaField({
        base: new fields.NumberField({
          required: true,
          initial: 4,
          integer: true,
        }),
        runBonus: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        sprintMultiplier: new fields.NumberField({
          required: true,
          initial: 4,
          integer: true,
        }),
        bulk: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        modifier: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        total: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        sprintTotal: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),

      // === character-common template ===
      ancestries: new fields.ArrayField(new fields.ObjectField()),
      gender: new fields.StringField({ required: true, initial: "" }),
      house: new fields.StringField({ required: true, initial: "" }),
      height: new fields.StringField({ required: true, initial: "1.72" }),
      weight: new fields.StringField({ required: true, initial: "70" }),
      eyeColor: new fields.StringField({ required: true, initial: "" }),
      hairColor: new fields.StringField({ required: true, initial: "" }),
      mannerisms: new fields.StringField({ required: true, initial: "" }),
      distinguishingFeatures: new fields.StringField({
        required: true,
        initial: "",
      }),
      personalHistory: new fields.StringField({ required: true, initial: "" }),
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
      currentStress: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      allies: new fields.StringField({ required: true, initial: "" }),
      enemies: new fields.StringField({ required: true, initial: "" }),
      oaths: new fields.StringField({ required: true, initial: "" }),
      heraldry: new fields.StringField({ required: true, initial: "" }),
      portrait: new fields.StringField({ required: true, initial: "" }),
      motto: new fields.StringField({ required: true, initial: "" }),
      coins: new fields.SchemaField({
        coppers: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        silvers: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        golds: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
      glory: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      vice: new fields.StringField({ required: true, initial: "" }),
      virtue: new fields.StringField({ required: true, initial: "" }),
      motivation: new fields.StringField({ required: true, initial: "" }),
      goal: new fields.StringField({ required: true, initial: "" }),
      experience: new fields.SchemaField({
        spent: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        total: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
      }),
    };
  }
}

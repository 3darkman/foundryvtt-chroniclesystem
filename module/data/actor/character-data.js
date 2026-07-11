const fields = foundry.data.fields;

export default class CharacterData extends foundry.abstract.TypeDataModel {
  /** @override */
  static migrateData(source) {
    // ancestries was previously an ArrayField; the sheet binds it to a single
    // text input, so coerce legacy array data (e.g. [], [{}], ["Andal"]) to a string.
    if (
      source.ancestries !== undefined &&
      typeof source.ancestries !== "string"
    ) {
      const arr = Array.isArray(source.ancestries)
        ? source.ancestries
        : [source.ancestries];
      source.ancestries = arr
        .filter((v) => typeof v === "string" && v)
        .join(", ");
    }
    // injuries/wounds hold plain description strings; they were previously
    // ArrayField(ObjectField), which silently coerced every string to {}.
    // Coerce legacy entries back to strings, preserving array length
    // (injury/wound counts drive modifiers and penalties).
    for (const key of ["injuries", "wounds"]) {
      const val = source[key];
      if (val === undefined || val === null) continue;
      const arr = Array.isArray(val) ? val : Object.values(val);
      source[key] = arr.map((v) => (typeof v === "string" ? v : ""));
    }
    // Coerce legacy movement values (may contain null/NaN/strings).
    if (source.movement && typeof source.movement === "object") {
      const defaults = {
        base: 4,
        runBonus: 0,
        sprintMultiplier: 4,
        bulk: 0,
        modifier: 0,
        total: 0,
        sprintTotal: 0,
      };
      for (const [field, fallback] of Object.entries(defaults)) {
        const val = source.movement[field];
        if (val !== undefined && !Number.isFinite(val)) {
          source.movement[field] = Number(val) || fallback;
        }
      }
    }
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
    // spec 010: `size` is a new StringField (small/medium/large). Coerce any
    // present-but-invalid legacy value to the default so `choices` validation
    // never rejects a legacy actor (absent → the schema `initial` covers it).
    if (
      source.size !== undefined &&
      !["small", "medium", "large"].includes(source.size)
    ) {
      source.size = "medium";
    }
    // spec 012: `publicVisibility` is a new SchemaField (11 booleans, default
    // hidden). Defensive parity with the clauses above — if a legacy value is
    // present but not a plain object, drop it so the schema `initial` (all
    // false) applies (absent → the `initial` covers it, no migration needed).
    if (
      source.publicVisibility !== undefined &&
      (typeof source.publicVisibility !== "object" ||
        source.publicVisibility === null ||
        Array.isArray(source.publicVisibility))
    ) {
      delete source.publicVisibility;
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
      wounds: new fields.ArrayField(
        new fields.StringField({ required: true, initial: "" })
      ),
      injuries: new fields.ArrayField(
        new fields.StringField({ required: true, initial: "" })
      ),
      currentDisposition: new fields.NumberField({
        required: true,
        initial: 4,
        integer: true,
      }),
      // spec 010 (FR-014): the character's size feeds the target's Combat Defense
      // difficulty modifier at roll-time (stable slug; the stored Combat Defense
      // stays size-agnostic). No destructive migration — the default + migrateData
      // cover legacy actors.
      size: new fields.StringField({
        required: true,
        initial: "medium",
        choices: ["small", "medium", "large"],
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
      ancestries: new fields.StringField({ required: true, initial: "" }),
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

      // === spec 012: public-sheet visibility map ===
      // Eleven per-field flags (FR-007) gating what appears on the read-only
      // public sheet. Default `false` = hidden (FR-010, privacy-by-default;
      // overrides the design handoff's default-public). Single source of truth
      // shared by the public sheet (reader) and the standard sheet's configure
      // UI (writer), keyed by the exact identifiers in module/system/
      // public-visibility.js (FR-011). Owner/GM writes one key at a time via
      // `system.publicVisibility.<key>`.
      publicVisibility: new fields.SchemaField({
        house: new fields.BooleanField({ required: true, initial: false }),
        position: new fields.BooleanField({ required: true, initial: false }),
        identity: new fields.BooleanField({ required: true, initial: false }),
        concept: new fields.BooleanField({ required: true, initial: false }),
        mannerisms: new fields.BooleanField({ required: true, initial: false }),
        features: new fields.BooleanField({ required: true, initial: false }),
        history: new fields.BooleanField({ required: true, initial: false }),
        allies: new fields.BooleanField({ required: true, initial: false }),
        enemies: new fields.BooleanField({ required: true, initial: false }),
        oaths: new fields.BooleanField({ required: true, initial: false }),
        motto: new fields.BooleanField({ required: true, initial: false }),
      }),
    };
  }
}

import { itemDescriptionFields, normalizeSlugSource } from "../fields.js";

const fields = foundry.data.fields;

/**
 * QualityData — the GM's customization surface (spec 020, Decision 1). A Quality
 * is a first-class, reusable *definition* item: the GM authors a named quality,
 * its applicability (weapon/armor/both), its per-instance parameter shape, the
 * wielding behaviour it grants, and one or more structured rule effects. Weapons
 * and armour REFERENCE a Quality by stable slug (spec 008); the live effect
 * collector resolves the reference and routes each rule into the `cs.*` buffers.
 *
 * The rule effects are stored as a plain structured array (NOT Active Effects,
 * Decision 1) so they are a pure, Vitest-testable module and edit-once /
 * apply-everywhere (references resolve live at prepareData).
 * @extends {foundry.abstract.TypeDataModel}
 */
export default class QualityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...itemDescriptionFields(), // slug (identity) + description + type

      // Applicability (FR-001, FR-010) — which picker offers it and whether the
      // Empunhadura card shows (weapon-only wielding).
      applicability: new fields.StringField({
        required: true,
        initial: "both",
        choices: ["weapon", "armor", "both"],
      }),

      // Parameter definition (FR-001) — the "evaluation" a quality carries
      // (Piercing N, Reload Lesser/Greater). `options` is meaningful only when
      // kind==="choice". `blank:true` on the inner option string is required so a
      // freshly-added (empty) option row does not fail validation on submitOnChange.
      parameter: new fields.SchemaField({
        kind: new fields.StringField({
          required: true,
          initial: "none",
          choices: ["none", "number", "choice"],
        }),
        label: new fields.StringField({
          required: true,
          blank: true,
          initial: "",
        }),
        options: new fields.ArrayField(new fields.StringField({ blank: true })),
      }),

      // Wielding behaviour (FR-021/022/023) — booleans, read only for weapon/both
      // applicability. Feed the character-sheet hand-slot logic (by slug, US5).
      wielding: new fields.SchemaField({
        occupiesBothHands: new fields.BooleanField({ initial: false }), // Two-Handed
        offHandEligible: new fields.BooleanField({ initial: false }), // Off-hand
        adaptable: new fields.BooleanField({ initial: false }), // Adaptable
      }),

      // Effective range of a ranged-weapon quality (Close/Long Range, and any GM
      // homebrew). A DEDICATED numeric field — NOT a rule — expressed in the SCENE's
      // distance units (the GM's choice: 10/100 yards per the book, metres, etc.).
      // 0 = melee / not a ranged quality; the attack applies −1D per full increment
      // of this value beyond it. Resolved data-driven by `weaponRangeBand` (no
      // hardcoded close/long slug), so a custom ranged quality works identically.
      range: new fields.NumberField({
        required: false,
        initial: 0,
        nullable: true,
      }),

      // Rule effects (FR-002) — the authored levers. `lever` is `blank:true` so a
      // freshly-added row (lever not yet chosen) passes validation; the collector
      // treats a blank/unknown lever as inert (FR-005 authoring resilience).
      rules: new fields.ArrayField(
        new fields.SchemaField({
          lever: new fields.StringField({
            required: true,
            blank: true,
            initial: "",
          }),
          // Fixed ("+1"/"-2"/bare number) OR a parameter bind ("@param"/"-@param");
          // resolved at read time (reuses resolveEffectValue semantics).
          value: new fields.StringField({
            required: true,
            blank: true,
            initial: "",
          }),
          scope: new fields.StringField({
            required: true,
            initial: "passive",
            // spec 021 UI redesign — a condition rule is now identified by its
            // `lever:"applycondition"` (a real "What changes" choice), NOT by a
            // `scope:"target"` value. Legacy `target` scopes are rewritten to
            // `auto` in `migrateData` before this stricter choice set validates.
            choices: ["passive", "auto", "optional"],
          }),
          // Lever refinement (e.g. which stat/ability); usually blank.
          target: new fields.StringField({
            required: false,
            blank: true,
            initial: "",
          }),
          // spec 021 (D6, FR-003a) — optional distance gate in GRID SPACES; `null`
          // = ungated (fires always). Evaluated only at roll time when a measurable
          // distance exists; `dist == null` → the rule is omitted.
          maxDistance: new fields.NumberField({
            required: false,
            nullable: true,
            initial: null,
            min: 0,
          }),
          // spec 021 (D19, FR-010) — for a `scope:"target"` rule, the NAME of the
          // authored effect on this Quality to apply to the target. Blank on a
          // `target` rule → the rule is inert (no error; FR-014 resilience).
          effectRef: new fields.StringField({
            required: false,
            blank: true,
            initial: "",
          }),
          // spec 021 (D13, FR-007/FR-010) — degree/count gate, shared by US2 (result
          // card highlight) and US3 (apply-to-target gate). `kind:"none"` = ungated.
          // For `kind:"ones"` a null threshold falls back to the reference's
          // parameter at eval time (Treacherous uses its per-instance value).
          trigger: new fields.SchemaField({
            kind: new fields.StringField({
              required: true,
              initial: "none",
              choices: ["none", "degrees", "ones"],
            }),
            threshold: new fields.NumberField({
              required: false,
              nullable: true,
              initial: null,
            }),
          }),
        })
      ),

      // spec 021 (D4, FR-005) — component quality slugs this quality confers
      // (Longarm → Long Range/Slow/Two-Handed/Unwieldy). Expanded + deduped by
      // `effectiveWeaponQualityRefs`; an unknown slug resolves to null and is
      // skipped (never throws).
      confers: new fields.ArrayField(new fields.StringField({ blank: false })),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source); // sanitise a stored slug (a fresh type has no legacy data)
    // spec 021 UI redesign — migrate the pre-redesign condition-rule shape
    // (`scope:"target"` + blank lever) to the new canonical signal
    // (`lever:"applycondition"`, `scope:"auto"`). Runs BEFORE validation, so a
    // stored `"target"` scope never trips the now-stricter `choices`. Non-
    // destructive: `effectRef`/`trigger`/`maxDistance` are untouched, and rules
    // that already use the new shape (or are plain numeric levers) are left alone.
    // NOTE: the `"applycondition"` literal cannot be imported from
    // cs-effect-vocabulary.js here — the data layer MUST NOT depend on the effects
    // layer (constitution §IV, inward-only dependencies).
    const rules = Array.isArray(source?.rules) ? source.rules : [];
    for (const rule of rules) {
      if (rule?.scope !== "target") continue;
      if (!rule.lever) rule.lever = "applycondition";
      rule.scope = "auto";
    }
    return super.migrateData(source);
  }
}

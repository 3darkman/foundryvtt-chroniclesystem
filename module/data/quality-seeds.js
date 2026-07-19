// Deterministic quality seeds (spec 020, FR-017 / Decision 10). The FULL rulebook-
// grounded set of weapon qualities (34: SIFRP / Sword Chronicle Core feudal + Spark
// to Powder gunpowder) plus the one named armour quality (Proofed) — validated via
// the project's NotebookLM (research.md Appendix A). Qualities whose effect can be
// automated carry structured rules; the rest ship with empty rules and surface as
// adjudication notes on the attack result card (FR-018), so the GM has the complete
// catalog in the compendium to drag from, descriptive ones included.
//
// Shipped as a JS catalog; the world migration seeds the `chroniclesystem.qualities`
// compendium (upsert) and materialises referenced slugs into the world so the sync
// collector resolves them. Slugs are the canonical `slugify(name)` (e.g. "Two-Handed"
// → "two_handed"), so a migrated legacy `{name}` reference resolves straight to it.

const NONE = { kind: "none", label: "", options: [] };
const number = (label) => ({ kind: "number", label, options: [] });
const choice = (label, options) => ({ kind: "choice", label, options });
const wield = (f) => ({
  occupiesBothHands: false,
  offHandEligible: false,
  adaptable: false,
  ...f,
});

// spec 021 (US3, D18/D22) — condition-effect helpers. A condition quality carries an
// authored ActiveEffect TEMPLATE its `scope:"target"` rule applies to the TARGET on a
// qualifying hit. Durations use the V14 schema (system.json minimum bumped to 14, T001):
// "until removed" = {value:null}; "next turn" = {value:1, units:"rounds", expiry:"turnStart"}.
// `showIcon:2` = CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS (token icon, FR-024). Changes live
// under `system.changes` (v14) keyed by the `cs.*` vocabulary the target's collector reads.
const UNTIL_REMOVED = { value: null };
const NEXT_TURN = { value: 1, units: "rounds", expiry: "turnStart" };
const change = (key, value) => ({ key, value: String(value), type: "add" });
const condition = (name, img, changes, duration, slug) => ({
  name,
  img,
  transfer: false,
  showIcon: 2,
  duration,
  system: { changes },
  flags: { chroniclesystem: { conditionOrigin: slug } },
});
/** An "apply condition to target" rule referencing an authored condition by name
 *  (D19). The `applycondition` lever is the canonical signal (spec 021 UI redesign);
 *  scope is `auto` (the condition is offered on a qualifying hit). */
const targetRule = (
  effectRef,
  trigger = { kind: "none", threshold: null }
) => ({
  lever: "applycondition",
  value: "",
  scope: "auto",
  target: "",
  effectRef,
  trigger,
});
/**
 * @type {ReadonlyArray<{slug: string, name: string, applicability: "weapon"|"armor"|"both",
 *   description: string, parameter: object, wielding?: object, range?: number,
 *   rules: Array<{lever: string, value: string, scope: string, target?: string}>}>}
 */
export const SEED_QUALITIES = [
  /* ---- Feudal core — automated ---- */
  {
    slug: "adaptable",
    name: "Adaptable",
    applicability: "weapon",
    description:
      "When you wield this weapon in two hands, increase its damage by +1.",
    parameter: NONE,
    wielding: wield({ adaptable: true }),
    rules: [], // the +1 is applied by updateDamageValue from wielding.adaptable
  },
  {
    slug: "bulk",
    name: "Bulk",
    applicability: "weapon",
    description:
      "This weapon's Bulk rating counts toward your total Bulk, reducing Movement.",
    parameter: number("CS.quality.levers.bulk"),
    rules: [{ lever: "bulk", value: "@param", scope: "passive", target: "" }],
  },
  {
    slug: "two_handed",
    name: "Two-Handed",
    applicability: "weapon",
    description:
      "A large weapon needing both hands. Used one-handed, you take −2D on your Fighting test.",
    parameter: NONE,
    wielding: wield({ occupiesBothHands: true }),
    rules: [], // the −2D one-handed penalty is GM-adjudicated
  },
  {
    slug: "close_range",
    name: "Close Range",
    applicability: "weapon",
    description:
      "Effective range 10 yards; −1D for every 10 yards (or fraction) beyond it.",
    parameter: NONE,
    range: 10,
    rules: [],
  },
  {
    slug: "long_range",
    name: "Long Range",
    applicability: "weapon",
    description:
      "Effective range 100 yards; −1D for every 100 yards (or fraction) beyond it.",
    parameter: NONE,
    range: 100,
    rules: [],
  },
  {
    slug: "defensive",
    name: "Defensive",
    applicability: "weapon",
    description:
      "While armed with this weapon and NOT attacking with it, add its Defensive rating to your Combat Defense.",
    parameter: number("CS.quality.levers.defensewhilewielded"),
    rules: [
      {
        lever: "defensewhilewielded",
        value: "@param",
        scope: "passive",
        target: "",
      },
    ],
  },
  {
    slug: "piercing",
    name: "Piercing",
    applicability: "weapon",
    description:
      "On a hit, your damage ignores an amount of the target's Armor Rating equal to the listed value.",
    parameter: number("CS.quality.levers.armorbypass"),
    rules: [
      { lever: "armorbypass", value: "@param", scope: "auto", target: "" },
    ],
  },
  {
    slug: "penetration",
    name: "Penetration",
    applicability: "weapon",
    description:
      "Ignores the listed Armor Rating; loses 1 point for every 10 yards of range (decays automatically with distance).",
    parameter: number("CS.quality.levers.armorbypass"),
    // spec 021 (D1) — the decay increment: bypass loses 1 per full 10 scene units.
    range: 10,
    rules: [
      { lever: "armorbypass", value: "@param", scope: "auto", target: "" },
    ],
  },
  {
    slug: "off_hand",
    name: "Off-hand",
    applicability: "weapon",
    description:
      "Add your Off-hand modifier to your primary weapon's damage on a successful two-weapon attack.",
    parameter: number("CS.quality.levers.damage"),
    wielding: wield({ offHandEligible: true }),
    rules: [
      { lever: "damage", value: "@param", scope: "optional", target: "" },
    ],
  },
  {
    slug: "powerful",
    name: "Powerful",
    applicability: "weapon",
    description:
      "For every bonus die invested in Strength, increase this weapon's damage by +1 (declared on the roll).",
    parameter: number("CS.quality.levers.damage"),
    rules: [
      { lever: "damage", value: "@param", scope: "optional", target: "" },
    ],
  },
  {
    slug: "shattering",
    name: "Shattering",
    applicability: "weapon",
    description:
      "On a 2+-degree Fighting hit, reduce the foe's Defensive Bonus (first) or Armor Rating by the listed value; reducing it to 0 destroys it.",
    parameter: number("CS.quality.levers.armorbypass"),
    // spec 021 (D13/US3) — highlights on a 2+-degree hit and applies "Shattered"
    // (approximates the equipment-damage rule; full equipment mutation out of scope).
    rules: [targetRule("Shattered", { kind: "degrees", threshold: 2 })],
    effects: [
      condition(
        "Shattered",
        "icons/svg/downgrade.svg",
        [change("cs.derivedstat.combat_defense", -2)],
        UNTIL_REMOVED,
        "shattering"
      ),
    ],
  },
  {
    slug: "vicious",
    name: "Vicious",
    applicability: "weapon",
    description:
      "If you defeat a foe with a Vicious weapon, the consequence of defeat is death (a Destiny Point may avoid this fate).",
    parameter: NONE,
    rules: [],
  },

  /* ---- Feudal core — narrative reminders (FR-018) ---- */
  {
    slug: "reach",
    name: "Reach",
    applicability: "weapon",
    description:
      "Attack foes up to 3 yards away; −1D against a foe in an adjacent hex.",
    parameter: number("yards"),
    // spec 021 (D6) — −1 test-die penalty ONLY against an adjacent foe (within 1
    // grid space); the up-to-3-yards reach stays a narrative reminder (clarify Q2).
    rules: [
      {
        lever: "penalty",
        value: "1",
        scope: "auto",
        target: "",
        maxDistance: 1,
      },
    ],
  },
  {
    slug: "reload",
    name: "Reload",
    applicability: "weapon",
    description:
      "Requires a Lesser or Greater action to reload after each shot.",
    parameter: choice("action", ["Lesser", "Greater"]),
    rules: [],
  },
  {
    slug: "slow",
    name: "Slow",
    applicability: "weapon",
    description: "You may not make Divided Attacks with this weapon.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "staggering",
    name: "Staggering",
    applicability: "weapon",
    description:
      "On a 2+-degree hit, sacrifice one degree to deny the foe a Greater Action next turn.",
    parameter: NONE,
    // spec 021 (D13/US3) — highlights on a 2+-degree hit and applies "Staggered"
    // (a next-turn marker; the "deny a Greater Action" restriction is GM-adjudicated).
    rules: [targetRule("Staggered", { kind: "degrees", threshold: 2 })],
    effects: [
      condition("Staggered", "icons/svg/daze.svg", [], NEXT_TURN, "staggering"),
    ],
  },
  {
    slug: "impale",
    name: "Impale",
    applicability: "weapon",
    description:
      "On a 3+-degree hit, the foe is pinned (Athletics to free), with a risk of disarm.",
    parameter: NONE,
    // spec 021 (D13/US3) — highlights on a 3+-degree hit and applies "Impaled".
    rules: [targetRule("Impaled", { kind: "degrees", threshold: 3 })],
    effects: [
      condition(
        "Impaled",
        "icons/svg/blood.svg",
        [change("cs.derivedstat.combat_defense", -5)],
        UNTIL_REMOVED,
        "impale"
      ),
    ],
  },
  {
    slug: "entangling",
    name: "Entangling",
    applicability: "weapon",
    description:
      "On a hit, the target's Movement drops to 1 yard and it takes −5 on all tests until freed.",
    parameter: NONE,
    // spec 021 (US3) — applies "Entangled" (−5 all tests) to the target on any hit.
    rules: [targetRule("Entangled")],
    effects: [
      condition(
        "Entangled",
        "icons/svg/trap.svg",
        [change("cs.result.all", -5)],
        UNTIL_REMOVED,
        "entangling"
      ),
    ],
  },
  {
    slug: "grab",
    name: "Grab",
    applicability: "weapon",
    description:
      "On a hit beating the foe's passive Athletics, you pin them: −5 to their Combat Defense.",
    parameter: NONE,
    // spec 021 (US3) — applies "Grabbed" (−5 Combat Defense) to the target on any hit.
    rules: [targetRule("Grabbed")],
    effects: [
      condition(
        "Grabbed",
        "icons/svg/net.svg",
        [change("cs.derivedstat.combat_defense", -5)],
        UNTIL_REMOVED,
        "grab"
      ),
    ],
  },
  {
    slug: "fragile",
    name: "Fragile",
    applicability: "weapon",
    description: "The weapon breaks automatically on a 2+-degree hit.",
    parameter: NONE,
    // spec 021 (D13) — a pure US2 reminder rule (blank lever = no mechanical effect)
    // that highlights on a 2+-degree hit; the breakage itself is GM-adjudicated.
    rules: [
      {
        lever: "",
        value: "",
        scope: "passive",
        target: "",
        trigger: { kind: "degrees", threshold: 2 },
      },
    ],
  },
  {
    slug: "mounted",
    name: "Mounted",
    applicability: "weapon",
    description: "−2D on Fighting tests when used on foot.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "unwieldy",
    name: "Unwieldy",
    applicability: "weapon",
    description: "−2D on tests with this weapon while mounted.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "set_for_charge_only",
    name: "Set for Charge Only",
    applicability: "weapon",
    description:
      "Usable only with the Counterattack 'Setting for a Charge' variant.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "fast",
    name: "Fast",
    applicability: "weapon",
    description:
      "+1B on each test of a Divided Attack (may exceed the normal bonus-die limit).",
    parameter: NONE,
    rules: [],
  },

  /* ---- Gunpowder (Spark to Powder) — narrative reminders ---- */
  {
    slug: "inaccurate",
    name: "Inaccurate",
    applicability: "weapon",
    description: "Double the actual distance when computing the range penalty.",
    parameter: NONE,
    // spec 021 (D5) — ×2 the measured distance before the range penalty.
    rules: [
      { lever: "rangemultiplier", value: "2", scope: "auto", target: "" },
    ],
  },
  {
    slug: "longarm",
    name: "Longarm",
    applicability: "weapon",
    description:
      "Automatically grants Long Range, Slow, Two-Handed and Unwieldy.",
    parameter: NONE,
    // spec 021 (D4) — confers its component qualities (deduped by slug).
    confers: ["long_range", "slow", "two_handed", "unwieldy"],
    rules: [],
  },
  {
    slug: "penetrating",
    name: "Penetrating",
    applicability: "weapon",
    description:
      "The weapon ignores a portion of the target's Armor Rating (flat, mirrors Piercing).",
    // spec 021 (D3) — a pure seed change: identical shape to Piercing (flat bypass).
    parameter: number("CS.quality.levers.armorbypass"),
    rules: [
      { lever: "armorbypass", value: "@param", scope: "auto", target: "" },
    ],
  },
  {
    slug: "reliable",
    name: "Reliable",
    applicability: "weapon",
    description: "+2 on any non-attack test to operate or repair the weapon.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "smoke",
    name: "Smoke",
    applicability: "weapon",
    description:
      "Smoke lingers for the listed rounds: +5 Combat Defense to anyone inside it.",
    parameter: number("rounds"),
    rules: [],
  },
  {
    slug: "snaphance",
    name: "Snaphance",
    applicability: "weapon",
    description: "Firing-mechanism flavour affecting misfire/reload behaviour.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "snaplock",
    name: "Snaplock",
    applicability: "weapon",
    description: "Firing-mechanism flavour affecting misfire/reload behaviour.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "treacherous",
    name: "Treacherous",
    applicability: "weapon",
    description:
      "Explodes if the number of 1s rolled exceeds the listed value, harming everyone within 10 yards.",
    parameter: number("value"),
    // spec 021 (D13/D15) — a pure US2 reminder rule that highlights when the count
    // of 1s EXCEEDS the per-instance parameter (null threshold → uses `parameter`).
    rules: [
      {
        lever: "",
        value: "",
        scope: "passive",
        target: "",
        trigger: { kind: "ones", threshold: null },
      },
    ],
  },
  {
    slug: "vulnerable_to_wet",
    name: "Vulnerable to Wet",
    applicability: "weapon",
    description: "The weapon fails or degrades when wet.",
    parameter: NONE,
    rules: [],
  },
  {
    slug: "wheel_lock",
    name: "Wheel-Lock",
    applicability: "weapon",
    description: "Firing-mechanism flavour affecting misfire/reload behaviour.",
    parameter: NONE,
    rules: [],
  },

  /* ---- Weapon grades (spec 021, US6, FR-015) — ride US1's auto lever pass,
         scoped to THIS weapon's attack. "Common" is the unmarked default. ---- */
  {
    slug: "poor",
    name: "Poor",
    applicability: "weapon",
    description: "A poorly made weapon: −1 test die on its attack.",
    parameter: NONE,
    rules: [{ lever: "penalty", value: "1", scope: "auto", target: "" }],
  },
  {
    slug: "superior",
    name: "Superior",
    applicability: "weapon",
    description: "A superior weapon: +1 to its attack result.",
    parameter: NONE,
    rules: [{ lever: "result", value: "1", scope: "auto", target: "" }],
  },
  {
    slug: "extraordinary",
    name: "Extraordinary",
    applicability: "weapon",
    description:
      "An extraordinary weapon: +1 to its attack result and +1 base damage.",
    parameter: NONE,
    rules: [
      { lever: "result", value: "1", scope: "auto", target: "" },
      { lever: "damage", value: "1", scope: "auto", target: "" },
    ],
  },

  /* ---- Armour (Spark to Powder) ---- */
  {
    slug: "proofed",
    name: "Proofed",
    applicability: "armor",
    description:
      "Resistant to bullets (count the wearer as twice as far for penetration). Heavier and less flexible: +1 Bulk.",
    parameter: NONE,
    rules: [{ lever: "bulk", value: "+1", scope: "passive", target: "" }],
  },
];

/** slug → seed definition (SSOT lookup). */
export const SEED_BY_SLUG = Object.freeze(
  Object.fromEntries(SEED_QUALITIES.map((seed) => [seed.slug, seed]))
);

/**
 * Build the Item-creation data for a seed Quality (world/compendium import). `img`
 * matches the `createItem` hook default so a seed looks natively created.
 * @param {object} seed a SEED_QUALITIES entry
 * @returns {object} Item creation data
 */
export function buildSeedItemData(seed) {
  return {
    name: seed.name,
    type: "quality",
    img: "systems/chroniclesystem/assets/icons/quality.png",
    // spec 021 (D22) — authored condition templates (ActiveEffect) a condition
    // quality applies to the target. Flows through CREATE paths only (toCreate +
    // world materialisation); the sync seed fallback in qualityBySlug reads only
    // {name, system}, so it never carries effects (async resolution gets them).
    effects: seed.effects ?? [],
    system: {
      slug: seed.slug,
      description: seed.description ?? "",
      type: "",
      applicability: seed.applicability,
      parameter: seed.parameter ?? { kind: "none", label: "", options: [] },
      wielding: seed.wielding ?? {
        occupiesBothHands: false,
        offHandEligible: false,
        adaptable: false,
      },
      range: seed.range ?? 0,
      rules: seed.rules ?? [],
      // spec 021 (D4) — component quality slugs this seed confers (Longarm).
      confers: seed.confers ?? [],
    },
  };
}

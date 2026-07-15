import { describe, it, expect } from "vitest";
import { CSActor } from "../module/actors/csActor.js";
import { makeFakeActor, makeAbilityItem } from "./helpers/doubles.js";

// Group 3 — US3 / Contract 3.1-3.11. Pins the rule-derived stats (Health =
// Endurance×3, Composure = Will×3, Defenses as sums, Frustration/Fatigue,
// Movement) and guards the i18n constant trap + the missing-ability default.
// Production methods are exercised in place via prototype `.call` (FR-014).

const proto = CSActor.prototype;

describe("derived stats — endurance / will rules", () => {
  it("3.1 / 3.6 Health = Endurance × 3, Fatigue = Endurance", () => {
    const actor = makeFakeActor({ abilities: [makeAbilityItem("endurance", 4)] });
    proto.calculateDerivedValues.call(actor);
    const stats = actor.getCSData().derivedStats;
    expect(stats.health.value).toBe(12);
    expect(stats.fatigue.value).toBe(4);
  });

  it("3.2 / 3.5 Composure = Will × 3, Frustration = Will", () => {
    const actor = makeFakeActor({ abilities: [makeAbilityItem("will", 3)] });
    proto.calculateDerivedValues.call(actor);
    const stats = actor.getCSData().derivedStats;
    expect(stats.composure.value).toBe(9);
    expect(stats.frustration.value).toBe(3);
  });

  it("3.7 missing endurance falls back to the default 2 → Health 6 (no failure)", () => {
    const actor = makeFakeActor({ abilities: [] });
    proto.calculateDerivedValues.call(actor);
    expect(actor.getCSData().derivedStats.health.value).toBe(6);
  });
});

describe("derived stats — defenses", () => {
  it("3.3 Combat Defense = Awareness + Agility + Athletics (ASOIAF off)", () => {
    const actor = makeFakeActor({
      abilities: [
        makeAbilityItem("awareness", 2),
        makeAbilityItem("agility", 3),
        makeAbilityItem("athletics", 4),
      ],
    });
    expect(proto.calcCombatDefense.call(actor)).toBe(9);
  });

  it("3.4 Intrigue Defense = Awareness + Cunning + Status", () => {
    const actor = makeFakeActor({
      abilities: [
        makeAbilityItem("awareness", 2),
        makeAbilityItem("cunning", 5),
        makeAbilityItem("status", 1),
      ],
    });
    expect(proto.calcIntrigueDefense.call(actor)).toBe(8);
  });
});

describe("derived stats — i18n constant trap (localize reads en.json)", () => {
  it("3.11 a translated label resolves, the raw key does not", () => {
    // Item named with the TRANSLATED label "endurance" resolves through
    // localize(ENDURANCE) === "endurance" → Health 12.
    const translated = makeFakeActor({ abilities: [makeAbilityItem("endurance", 4)] });
    proto.calculateDerivedValues.call(translated);
    expect(translated.getCSData().derivedStats.health.value).toBe(12);

    // Item named with the RAW key (what a broken/no-op localize would leave)
    // does NOT match "endurance" → falls to default 2 → Health 6 (≠ 3N). This
    // is the regression a broken key→label wiring would produce.
    const rawKeyNamed = makeFakeActor({
      abilities: [makeAbilityItem("CS.constants.abilities.endurance", 4)],
    });
    proto.calculateDerivedValues.call(rawKeyNamed);
    expect(rawKeyNamed.getCSData().derivedStats.health.value).toBe(6);
  });
});

describe("derived stats — slug parity across mixed languages (E1, spec 008)", () => {
  it("3.12 resolves each ability by stable slug even when some are renamed", () => {
    // A sheet with one ability renamed (Agilidade, slug agility) and the rest in
    // English resolves every ability by slug → the same numbers as all-English.
    const mixed = makeFakeActor({
      abilities: [
        makeAbilityItem("Awareness", 2),
        makeAbilityItem("Agilidade", 3, { slug: "agility" }), // renamed
        makeAbilityItem("Athletics", 4),
        makeAbilityItem("Endurance", 5),
        makeAbilityItem("Will", 6),
        makeAbilityItem("Cunning", 1, { slug: "cunning" }),
        makeAbilityItem("Estado", 2, { slug: "status" }), // renamed
      ],
    });
    // Combat Defense = Awareness + Agility + Athletics = 2 + 3 + 4 = 9.
    expect(proto.calcCombatDefense.call(mixed)).toBe(9);
    // Intrigue Defense = Awareness + Cunning + Status = 2 + 1 + 2 = 5.
    expect(proto.calcIntrigueDefense.call(mixed)).toBe(5);
    proto.calculateDerivedValues.call(mixed);
    const stats = mixed.getCSData().derivedStats;
    expect(stats.health.value).toBe(15); // Endurance 5 × 3
    expect(stats.composure.value).toBe(18); // Will 6 × 3
  });

  it("3.13 a renamed Athletics keeps its Run specialty movement bonus", () => {
    // Movement runBonus reads Athletics:Run by scoped slug (athletics_run).
    const actor = makeFakeActor({
      abilities: [
        makeAbilityItem("Atletismo", 3, {
          slug: "athletics",
          specialties: {
            run: { name: "Corrida", slug: "athletics_run", rating: 4 },
          },
        }),
      ],
      data: { movement: { sprintMultiplier: 4, modifier: 0 } },
    });
    proto.calculateMovementData.call(actor);
    expect(actor.getCSData().movement.runBonus).toBe(2); // floor(4 / 2)
  });
});

describe("derived stats — movement (runBonus & bulk are DERIVED)", () => {
  it("3.8 / 3.9 total = max(base + runBonus − bulk + modifier, 1); sprint = total × mult − bulk", () => {
    // Athletics with a `run` specialty rating 4 → runBonus = floor(4/2) = 2.
    // modifiers.bulk total 2 → bulk = floor(2/2) = 1. base overridden to 4.
    const actor = makeFakeActor({
      abilities: [
        makeAbilityItem("athletics", 3, {
          specialties: { run: { name: "run", rating: 4, modifier: 0 } },
        }),
      ],
      modifiers: { bulk: 2 },
      data: { movement: { sprintMultiplier: 4, modifier: 0 } },
    });
    proto.calculateMovementData.call(actor);
    const m = actor.getCSData().movement;
    expect(m.runBonus).toBe(2);
    expect(m.bulk).toBe(1);
    expect(m.total).toBe(5); // max(4 + 2 − 1 + 0, 1)
    expect(m.sprintTotal).toBe(19); // 5 × 4 − 1
  });

  it("3.10 clamps total to a minimum of 1 (neutral actor, modifier −10)", () => {
    const actor = makeFakeActor({
      abilities: [],
      data: { movement: { modifier: -10 } },
    });
    proto.calculateMovementData.call(actor);
    const m = actor.getCSData().movement;
    expect(m.runBonus).toBe(0);
    expect(m.bulk).toBe(0);
    expect(m.total).toBe(1); // max(4 + 0 − 0 − 10, 1)
  });
});

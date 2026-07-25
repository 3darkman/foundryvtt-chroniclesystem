import { describe, it, expect } from "vitest";
import { CSActor } from "../module/actors/csActor.js";
import { canBeHero, canBeLeader } from "../module/actors/cs-unit-relations.js";
import {
  makeAbilityItem,
  makeFakeUnitActor,
  makeUnitTypeItem,
} from "./helpers/doubles.js";

// spec 025 (T026) — contracts/unit-relations.md C2/C4. The Leader / Attached
// Heroes / House links are PURELY relational (FR-012): no derived value may move
// because of them. That is asserted structurally, the same guard style spec 022
// used to keep disposition decoupled from intrigue.

const proto = CSActor.prototype;

const LEADER = "Actor.leader";
const HERO = "Actor.hero";

const deriveAll = (actor) => {
  proto.calculateDerivedValues.call(actor);
  proto.calculateUnitDerivedValues.call(actor);
  proto.calculateMovementData.call(actor);
  const data = actor.getCSData();
  return {
    powerCost: data.powerCost,
    healthMax: data.health.max,
    combatDefense: data.derivedStats.combatDefense.total,
    movement: data.movement.total,
    discipline: data.discipline,
    xp: { ...data.xp },
  };
};

const configuredUnit = (relations) =>
  makeFakeUnitActor({
    types: [
      makeUnitTypeItem({
        slug: "infantry",
        name: "Infantry",
        powerCost: 4,
        disciplineModifier: 2,
        startingEquipment: { armor: { rating: 3, penalty: -2, bulk: 1 } },
      }),
    ],
    abilities: [makeAbilityItem("Endurance", 4), makeAbilityItem("Fighting", 3)],
    data: { trainingLevel: "trained", primaryTypeSlug: "infantry", ...relations },
  });

describe("unit relations — parity guard (FR-012, C2)", () => {
  it("derives byte-identical values with and without a leader and heroes", () => {
    const bare = deriveAll(configuredUnit({}));
    const linked = deriveAll(
      configuredUnit({
        leader: { uuid: LEADER, role: "commander" },
        attachedHeroes: [{ uuid: HERO }],
        houseUuid: "Actor.house",
      })
    );
    expect(linked).toEqual(bare);
  });

  it("derives byte-identical values whichever leader role is selected", () => {
    const commander = deriveAll(
      configuredUnit({ leader: { uuid: LEADER, role: "commander" } })
    );
    const subcommander = deriveAll(
      configuredUnit({ leader: { uuid: LEADER, role: "subcommander" } })
    );
    expect(subcommander).toEqual(commander);
  });

  it("never counts an unresolvable reference and never throws", () => {
    const actor = configuredUnit({
      leader: { uuid: "Actor.deleted", role: "commander" },
      attachedHeroes: [{ uuid: "Actor.alsoDeleted" }],
      houseUuid: "Actor.goneHouse",
    });
    expect(() => deriveAll(actor)).not.toThrow();
    expect(deriveAll(actor)).toEqual(deriveAll(configuredUnit({})));
  });
});

describe("unit relations — mutual exclusion (FR-011a, C4)", () => {
  const withHero = { leader: { uuid: "", role: "commander" }, attachedHeroes: [{ uuid: HERO }] };
  const withLeader = { leader: { uuid: LEADER, role: "commander" }, attachedHeroes: [] };

  it("refuses a character who is already an attached hero as leader", () => {
    expect(canBeLeader(withHero, HERO)).toBe(false);
    expect(canBeLeader(withHero, LEADER)).toBe(true);
  });

  it("refuses the current leader as an attached hero", () => {
    expect(canBeHero(withLeader, LEADER)).toBe(false);
    expect(canBeHero(withLeader, HERO)).toBe(true);
  });

  it("refuses a character already attached as a hero twice", () => {
    expect(canBeHero(withHero, HERO)).toBe(false);
  });

  it("treats a blank uuid as never linkable", () => {
    expect(canBeLeader(withHero, "")).toBe(false);
    expect(canBeHero(withLeader, "")).toBe(false);
  });

  it("tolerates a Unit whose relation keys are missing entirely", () => {
    expect(canBeLeader({}, LEADER)).toBe(true);
    expect(canBeHero({}, HERO)).toBe(true);
  });
});

// Spec 024 (SC-002, D14) — the PARITY harness. It builds the same character
// twice — once OLD shape (`ability.system.specialties`) and once NEW shape
// (Specialty items) — and asserts the three funnels through `resolveTraitBase`
// produce identical numbers. A per-file fixture swap proves the new path works;
// only a side-by-side harness proves it produces THE SAME numbers.
//
// The old shape is still constructible because `AbilityData` keeps the field for
// exactly one release (D3); this file is deleted in the release that drops it.
//
// `getActorTestFormula` is exported as `ChronicleSystem.getActorAbilityFormula`.

import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import {
  makeFakeActor,
  makeAbilityItem,
  makeSpecialtyItem,
} from "./helpers/doubles.js";

/**
 * The OLD-shape actor: specialties embedded in the ability. It deliberately does
 * NOT get the new resolvers' benefit — it exercises the legacy array through the
 * SAME production methods, via a legacy resolver pair restored on the double.
 */
function oldShapeActor(abilities) {
  const actor = makeFakeActor({ abilities });
  // The pre-024 resolvers, verbatim, so the harness compares the OLD behaviour
  // against the new one rather than the new one against itself.
  actor.getAbilityBySpecialty = function (abilityName, specialtyName) {
    let specialty = null;
    const ability = this.items
      .filter(
        (item) =>
          item.type === "ability" &&
          item.name.toLowerCase() === abilityName.toString().toLowerCase()
      )
      .find((a) => {
        const data = a.getCSData();
        if (!data.specialties) return false;
        specialty = Object.values(data.specialties).find(
          (sp) =>
            sp.name.toLowerCase() === specialtyName.toString().toLowerCase()
        );
        return specialty !== undefined && specialty !== null;
      });
    return [ability, specialty];
  };
  actor.getAbilityBySpecialtySlug = function (specialtySlug) {
    let found;
    const ability = this.items.find((item) => {
      if (item.type !== "ability") return false;
      const data = item.getCSData?.() ?? {};
      const abilitySlug = data.slug || "";
      found = Object.values(data.specialties ?? {}).find(
        (sp) => (sp?.slug || `${abilitySlug}_${sp?.name?.toLowerCase()}`) === specialtySlug
      );
      return found !== undefined;
    });
    return [ability, found];
  };
  return actor;
}

/** The three funnels every parity case is measured through. */
function measure(actor, abilityName, specialtyName) {
  const effective = ChronicleSystem.getActorAbilityFormula(
    actor,
    abilityName,
    specialtyName
  );
  const raw = ChronicleSystem.getActorRawTestFormula(
    actor,
    abilityName,
    specialtyName
  );
  return {
    pool: effective.pool,
    bonusDice: effective.bonusDice,
    modifier: effective.modifier,
    dicePenalty: effective.dicePenalty,
    rawPool: raw.pool,
    rawBonusDice: raw.bonusDice,
    rawModifier: raw.modifier,
    passive: ChronicleSystem.getActorPassiveValue(
      actor,
      abilityName,
      specialtyName
    ),
  };
}

/**
 * One parity case: the same character described both ways.
 * @param {Array<{name, slug, rating, modifier, specialties}>} abilities
 */
function bothShapes(abilities) {
  const oldAbilities = abilities.map((a) =>
    makeAbilityItem(a.name, a.rating, {
      modifier: a.modifier ?? 0,
      slug: a.slug,
      specialties: Object.fromEntries(
        (a.specialties ?? []).map((s) => [
          s.name,
          { name: s.name, rating: s.rating, modifier: s.modifier ?? 0, slug: s.slug },
        ])
      ),
    })
  );
  const newAbilities = abilities.map((a) =>
    makeAbilityItem(a.name, a.rating, {
      modifier: a.modifier ?? 0,
      slug: a.slug,
      specialties: {},
    })
  );
  const specialtyItems = abilities.flatMap((a) =>
    (a.specialties ?? []).map((s) =>
      makeSpecialtyItem({
        name: s.name,
        slug: s.slug,
        abilitySlug: a.slug,
        rating: s.rating,
        modifier: s.modifier ?? 0,
      })
    )
  );
  return {
    old: oldShapeActor(oldAbilities),
    fresh: makeFakeActor({
      abilities: newAbilities,
      specialties: specialtyItems,
    }),
  };
}

const PERSUASION = {
  name: "Persuasion",
  slug: "persuasion",
  rating: 4,
  modifier: 1,
  specialties: [
    { name: "Convince", slug: "persuasion_convince", rating: 3, modifier: 2 },
    { name: "Charm", slug: "persuasion_charm", rating: 0 },
  ],
};
const FIGHTING = { name: "Fighting", slug: "fighting", rating: 3 };

describe("SC-002 — old shape and new shape produce identical numbers", () => {
  it("a rated specialty (Persuasion:Convince at 3)", () => {
    const { old, fresh } = bothShapes([PERSUASION]);
    expect(measure(fresh, "Persuasion", "Convince")).toEqual(
      measure(old, "Persuasion", "Convince")
    );
  });

  it("a specialty at rating 0 contributes no bonus die, identically", () => {
    const { old, fresh } = bothShapes([PERSUASION]);
    const result = measure(fresh, "Persuasion", "Charm");
    expect(result).toEqual(measure(old, "Persuasion", "Charm"));
    expect(result.bonusDice).toBe(0);
  });

  it("a specialty the character does NOT own (weapon 'Fighting:Axes', FR-024)", () => {
    const { old, fresh } = bothShapes([FIGHTING]);
    const result = measure(fresh, "Fighting", "Axes");
    expect(result).toEqual(measure(old, "Fighting", "Axes"));
    expect(result.pool).toBe(3);
    expect(result.bonusDice).toBe(0);
  });

  it("an ability the character does not own at all (untrained baseline)", () => {
    const { old, fresh } = bothShapes([PERSUASION]);
    expect(measure(fresh, "Stealth", "Sneak")).toEqual(
      measure(old, "Stealth", "Sneak")
    );
  });

  it("a renamed ability whose slug is unchanged (FR-005)", () => {
    const renamed = {
      ...PERSUASION,
      name: "Persuadir",
    };
    const { old, fresh } = bothShapes([renamed]);
    expect(measure(fresh, "Persuadir", "Convince")).toEqual(
      measure(old, "Persuadir", "Convince")
    );
  });

  it("the bare ability roll is untouched by the change", () => {
    const { old, fresh } = bothShapes([PERSUASION]);
    expect(measure(fresh, "Persuasion", null)).toEqual(
      measure(old, "Persuasion", null)
    );
  });

  it("a slug passed where a name is expected (calculateMovementData's 'athletics_run')", () => {
    const athletics = {
      name: "Athletics",
      slug: "athletics",
      rating: 4,
      specialties: [{ name: "Run", slug: "athletics_run", rating: 2 }],
    };
    const { old, fresh } = bothShapes([athletics]);
    expect(measure(fresh, "Athletics", "athletics_run")).toEqual(
      measure(old, "Athletics", "athletics_run")
    );
  });

  it("the roll chip id string is unchanged (FR-018)", () => {
    const { fresh } = bothShapes([PERSUASION]);
    const [, adapter] = fresh.getAbilityBySpecialty("Persuasion", "Convince");
    expect(`specialty:${adapter.name}:Persuasion`).toBe(
      "specialty:Convince:Persuasion"
    );
  });
});

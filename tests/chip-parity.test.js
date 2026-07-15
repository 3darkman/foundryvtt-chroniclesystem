import { describe, it, expect } from "vitest";
import {
  ChronicleSystem,
  _dispositionModifier,
} from "../module/system/ChronicleSystem.js";
import { DiceRollFormula } from "../module/diceRollFormula.js";

// Spec 017 — Roll-Chip ↔ Roll Parity (contracts/get-roll-chip.md).
//
// The single SSOT mechanism `ChronicleSystem.getRollChip(actor, rollId)` and the
// shared disposition-value helper `_dispositionModifier(actor, kind)`. Pure logic
// — a minimal actor stub is enough:
//   - the intrigue path (persuasion/deception) only needs
//     `getCSData().currentDisposition` (the base comes from `fromStr`);
//   - the ability/specialty path resolves a FIXED base so the folding decision is
//     isolated from the trait numbers (T10).
// Effect-channel getters are intentionally absent → optional-chained to 0 inside
// getActorAbilityFormula, so the base is deterministic.

/** Disposition ratings (ChronicleSystem.dispositions): Affectionate(1) … Malicious(7). */
const makeActor = (rating) => ({
  getCSData: () => ({ currentDisposition: rating }),
  // Deterministic ability/specialty base (Cunning 3 / Persuasion spec 2 → 3d6+2B).
  getAbility: () => [undefined, undefined],
  getAbilityBySpecialty: () => [
    {
      name: "Cunning",
      getCSData: () => ({ rating: 3, modifier: 0, slug: "cunning" }),
    },
    { name: "Persuasion", rating: 2, modifier: 0, slug: "cunning_persuasion" },
  ],
});

const dispAffectionate = makeActor(1); // deception -2 / persuasion +5
const dispIndifferent = makeActor(4); // deception  0 / persuasion  0
const dispMalicious = makeActor(7); // deception +3 / persuasion -6
const actorNoMatch = makeActor(99); // no disposition entry → 0

describe("_dispositionModifier — SSOT disposition-level value (C2)", () => {
  it("T6 returns the signed value per kind (Malicious persuasion −6 / deception +3)", () => {
    expect(_dispositionModifier(dispMalicious, "persuasion")).toBe(-6);
    expect(_dispositionModifier(dispMalicious, "deception")).toBe(3);
  });

  it("T7 returns 0 when currentDisposition matches no entry (G7)", () => {
    expect(_dispositionModifier(actorNoMatch, "persuasion")).toBe(0);
    expect(_dispositionModifier(actorNoMatch, "deception")).toBe(0);
  });
});

describe("getRollChip — id is the executed formula, verbatim (C1/G1)", () => {
  it("T5 returns id === rollId for every input (no double-count)", () => {
    const ids = [
      "persuasion:Charm:5|0|2|0|0",
      "deception:Bluff:4|0|0|0|0",
      "weapon-test:Sword:4|1|0|0|0",
    ];
    for (const r of ids) {
      expect(ChronicleSystem.getRollChip(dispMalicious, r).id).toBe(r);
    }
  });
});

describe("getRollChip — US1 intrigue chips fold the disposition level (G2/G3)", () => {
  it("T1 Malicious persuasion folds −6 into the label (base +2 → −4)", () => {
    expect(
      ChronicleSystem.getRollChip(dispMalicious, "persuasion:Charm:5|0|2|0|0")
    ).toEqual({ id: "persuasion:Charm:5|0|2|0|0", label: "5d6-4" });
  });

  it("T2 zero disposition level is a no-op (Indifferent persuasion → base 5d6+2)", () => {
    expect(
      ChronicleSystem.getRollChip(dispIndifferent, "persuasion:Charm:5|0|2|0|0")
        .label
    ).toBe("5d6+2");
  });

  it("T3 Affectionate deception folds −2 into the label (4d6 → 4d6-2)", () => {
    expect(
      ChronicleSystem.getRollChip(dispAffectionate, "deception:Bluff:4|0|0|0|0")
        .label
    ).toBe("4d6-2");
  });
});

describe("getRollChip — US2 non-intrigue kinds, one shared rule (G4/G5, FR-008)", () => {
  it("T4 weapon chip: id verbatim; label = parsed base, NO disposition", () => {
    const chip = ChronicleSystem.getRollChip(
      dispMalicious,
      "weapon-test:Sword:4|1|0|0|0"
    );
    expect(chip.id).toBe("weapon-test:Sword:4|1|0|0|0");
    // Label equals the base formula's compact string — disposition never folded
    // for a weapon kind, even on a Malicious actor.
    expect(chip.label).toBe(
      DiceRollFormula.fromStr("4|1|0|0|0").ToFormattedStr()
    );
    expect(chip.label).toBe("4d6+1B");
  });

  it("T8 determinism / cross-window: identical (actor, rollId) → deeply-equal descriptor", () => {
    const a = ChronicleSystem.getRollChip(
      dispMalicious,
      "weapon-test:Sword:4|1|0|0|0"
    );
    const b = ChronicleSystem.getRollChip(
      dispMalicious,
      "weapon-test:Sword:4|1|0|0|0"
    );
    expect(a).toEqual(b);
    // A pure function ⇒ the same roll renders the same formula in every window
    // (FR-008/SC-005). Independent actor instances at the same disposition agree.
    const c = ChronicleSystem.getRollChip(
      makeActor(7),
      "weapon-test:Sword:4|1|0|0|0"
    );
    expect(c).toEqual(a);
  });

  it("T10 raw specialty:* NEVER folds disposition — keys on prefix, not the name", () => {
    // Same specialty name "Persuasion", two disposition ratings: the label is
    // identical because getRollChip folds only on the persuasion/deception ROLL
    // KIND (roll_definition[0]), not on a specialty happening to be named
    // "Persuasion" (spec Edge Cases "same specialty, two roll kinds").
    const malicious = ChronicleSystem.getRollChip(
      dispMalicious,
      "specialty:Persuasion:Cunning"
    ).label;
    const affectionate = ChronicleSystem.getRollChip(
      dispAffectionate,
      "specialty:Persuasion:Cunning"
    ).label;
    expect(malicious).toBe(affectionate);
  });
});

describe("getRollChip — US3 boundary: conditional modifiers never on a chip (G4/FR-005)", () => {
  it("T9 weapon + intrigue labels exclude every target/optional modifier", () => {
    // getRollChip takes NO target and never reaches _deriveTargetConflict's
    // post-getUserTarget branch (range / prone / size / target-defense) nor the
    // dialog's optional effects. Structurally, the label is base (+ disposition
    // for intrigue) and NOTHING else — even on a Malicious actor with a
    // target-shaped rollId.
    const weapon = ChronicleSystem.getRollChip(
      dispMalicious,
      "weapon-test:Sword:4|1|0|0|0"
    );
    // Exactly the parsed base — no range/prone/size/target-defense could enter.
    expect(weapon.label).toBe(
      DiceRollFormula.fromStr("4|1|0|0|0").ToFormattedStr()
    );

    // Intrigue: base + the disposition always-on ONLY, no target modifiers.
    const base = DiceRollFormula.fromStr("5|0|2|0|0");
    base.modifier += _dispositionModifier(dispMalicious, "persuasion");
    const intrigue = ChronicleSystem.getRollChip(
      dispMalicious,
      "persuasion:Charm:5|0|2|0|0"
    );
    expect(intrigue.label).toBe(base.ToFormattedStr());
  });
});

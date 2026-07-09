import { describe, it, expect } from "vitest";
import {
  CANONICAL_DIFFICULTIES,
  CANONICAL_DIFFICULTY_SETTING,
  resolveVerdict,
  entryLabel,
  readDifficultyTable,
} from "../module/difficulty/cs-difficulty.js";

// US3 / Contract difficulty-table §Testes. The PURE surface of the difficulty
// module: the canonical factory table, the verdict/degree bands (both sides), and
// the read/sanitize clamp. No Foundry runtime (readDifficultyTable is fed a raw
// table so `game.settings` is never touched).

const D = (k) => `CS.difficulty.degree.${k}`;

describe("CANONICAL_DIFFICULTIES — the factory table (SSOT)", () => {
  it("has the 8 canonical levels with ascending targets", () => {
    expect(CANONICAL_DIFFICULTIES).toHaveLength(8);
    expect(CANONICAL_DIFFICULTIES.map((e) => e.target)).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21,
    ]);
    expect(CANONICAL_DIFFICULTIES.map((e) => e.labelKey)).toEqual([
      "CS.difficulty.automatic",
      "CS.difficulty.easy",
      "CS.difficulty.routine",
      "CS.difficulty.challenging",
      "CS.difficulty.formidable",
      "CS.difficulty.hard",
      "CS.difficulty.veryHard",
      "CS.difficulty.heroic",
    ]);
    // Factory entries carry no GM override literal.
    expect(CANONICAL_DIFFICULTIES.every((e) => e.label === null)).toBe(true);
  });

  it("wraps the entries with a 'no default' setting shape", () => {
    expect(CANONICAL_DIFFICULTY_SETTING.entries).toHaveLength(8);
    expect(CANONICAL_DIFFICULTY_SETTING.defaultIndex).toBe(-1);
  });
});

describe("resolveVerdict — degree bands (Sword Chronicle Core p.12)", () => {
  // margin = total - target. Drive each band boundary with target 10.
  const cases = [
    [-6, false, "criticalFailure"],
    [-5, false, "criticalFailure"], // ≤ −5
    [-4, false, "marginalFailure"], // −4 … −1
    [-1, false, "marginalFailure"],
    [0, true, "marginalSuccess"], // 0 … +4 (edge: equal → marginal success)
    [4, true, "marginalSuccess"],
    [5, true, "greatSuccess"], // +5 … +9
    [9, true, "greatSuccess"],
    [10, true, "incredibleSuccess"], // +10 … +14
    [14, true, "incredibleSuccess"],
    [15, true, "astoundingSuccess"], // ≥ +15
    [20, true, "astoundingSuccess"],
  ];
  for (const [margin, success, degree] of cases) {
    it(`margin ${margin} → ${
      success ? "success" : "failure"
    } / ${degree}`, () => {
      const target = 10;
      const total = target + margin;
      const v = resolveVerdict(total, target);
      expect(v.success).toBe(success);
      expect(v.margin).toBe(margin);
      expect(v.degreeKey).toBe(D(degree));
    });
  }

  it("treats total === target as a marginal success (the threshold)", () => {
    const v = resolveVerdict(6, 6);
    expect(v.success).toBe(true);
    expect(v.margin).toBe(0);
    expect(v.degreeKey).toBe(D("marginalSuccess"));
  });

  it("Heroic (target 21): 20 fails, 21 succeeds", () => {
    expect(resolveVerdict(20, 21).success).toBe(false);
    expect(resolveVerdict(21, 21).success).toBe(true);
  });
});

describe("entryLabel — GM literal wins over the canonical key", () => {
  it("returns the raw label when the GM set one", () => {
    expect(entryLabel({ label: "Nigh Impossible", labelKey: null })).toBe(
      "Nigh Impossible"
    );
  });

  it("falls back to the labelKey (localized by the caller when provided)", () => {
    expect(entryLabel({ label: null, labelKey: "CS.difficulty.easy" })).toBe(
      "CS.difficulty.easy"
    );
    expect(
      entryLabel({ label: null, labelKey: "CS.difficulty.easy" }, () => "Easy")
    ).toBe("Easy");
  });
});

describe("readDifficultyTable — sanitize + clamp defaultIndex", () => {
  it("clamps an out-of-range defaultIndex to -1", () => {
    const raw = { entries: CANONICAL_DIFFICULTIES, defaultIndex: 99 };
    expect(readDifficultyTable(raw).defaultIndex).toBe(-1);
    expect(readDifficultyTable({ ...raw, defaultIndex: -5 }).defaultIndex).toBe(
      -1
    );
  });

  it("keeps an in-range defaultIndex", () => {
    const raw = { entries: CANONICAL_DIFFICULTIES, defaultIndex: 2 };
    expect(readDifficultyTable(raw).defaultIndex).toBe(2);
  });

  it("coerces entry targets to integers and falls back to canonical on empty", () => {
    const sanitized = readDifficultyTable({
      entries: [{ labelKey: null, label: "X", target: "7" }],
      defaultIndex: 0,
    });
    expect(sanitized.entries[0].target).toBe(7);
    const empty = readDifficultyTable({ entries: [], defaultIndex: 0 });
    expect(empty.entries).toHaveLength(8); // fell back to the canonical set
    expect(empty.defaultIndex).toBe(-1);
  });
});

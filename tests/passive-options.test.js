import { describe, it, expect } from "vitest";
import {
  buildPassiveGroups,
  findPassiveOption,
  filterPassiveScopedRows,
} from "../module/rolls/cs-passive.js";

// Spec 023 / contract passive-options.md C4/C5 + data-model §1.3 invariants.
// The PURE grouping layer: keys, group and option ordering, per-entry masking,
// lookup, and the scoped-row filter. No Foundry runtime is involved.

const entry = (over) => ({
  kind: "ability",
  key: "cat:awareness",
  shortLabel: "Overall",
  groupLabel: "Awareness",
  value: 16,
  fromTarget: false,
  maskable: true,
  ...over,
});

const DIFFICULTIES = [
  entry({
    kind: "difficulty",
    key: "tbl:-1",
    shortLabel: "No difficulty",
    groupLabel: "Difficulties",
    value: 0,
    maskable: false,
  }),
  entry({
    kind: "difficulty",
    key: "tbl:3",
    shortLabel: "Challenging",
    groupLabel: "Difficulties",
    value: 9,
    maskable: false,
  }),
];

const DEFENSES = [
  entry({
    kind: "defense",
    key: "def:combat",
    shortLabel: "Combat Defense",
    groupLabel: "Defenses",
    value: 11,
    fromTarget: true,
  }),
  entry({
    kind: "defense",
    key: "def:intrigue",
    shortLabel: "Intrigue Defense",
    groupLabel: "Defenses",
    value: 7,
    fromTarget: true,
  }),
];

// Deliberately handed in NON-alphabetical order — the builder must sort them.
const ABILITIES = [
  entry({
    key: "own:ab-will",
    groupLabel: "Will",
    value: 12,
    fromTarget: true,
  }),
  entry({
    key: "own:ab-aware",
    groupLabel: "Awareness",
    value: 16,
    fromTarget: true,
  }),
  entry({
    kind: "specialty",
    key: "own:ab-aware:awareness_notice",
    shortLabel: "Notice",
    groupLabel: "Awareness",
    value: 18,
    fromTarget: true,
  }),
  entry({
    kind: "specialty",
    key: "own:ab-aware:awareness_empathy",
    shortLabel: "Empathy",
    groupLabel: "Awareness",
    value: 19,
    fromTarget: true,
  }),
];

const labels = (groups) => groups.map((g) => g.label);
const keys = (groups) => groups.flatMap((g) => g.options.map((o) => o.key));

describe("buildPassiveGroups — group order (C4.2)", () => {
  it("puts Difficulties first, then Defenses, then abilities alphabetically", () => {
    const groups = buildPassiveGroups([
      ...DIFFICULTIES,
      ...DEFENSES,
      ...ABILITIES,
    ]);
    expect(labels(groups)).toEqual([
      "Difficulties",
      "Defenses",
      "Awareness",
      "Will",
    ]);
  });

  it("omits the Difficulties group entirely when no level was supplied", () => {
    const groups = buildPassiveGroups([...DEFENSES, ...ABILITIES]);
    expect(labels(groups)).toEqual(["Defenses", "Awareness", "Will"]);
  });

  it("never sorts the fixed groups among the abilities", () => {
    // "Defenses" would sort between "Awareness" and "Will" alphabetically.
    const groups = buildPassiveGroups([...ABILITIES, ...DEFENSES]);
    expect(labels(groups)[0]).toBe("Defenses");
  });

  it("keeps two same-named abilities as DISTINCT groups (invariant 3)", () => {
    const groups = buildPassiveGroups([
      entry({ key: "own:ab-1", groupLabel: "Fighting", value: 12 }),
      entry({ key: "own:ab-2", groupLabel: "Fighting", value: 8 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.options[0].value)).toEqual([12, 8]);
  });
});

describe("buildPassiveGroups — option order and labels (C4.3/C4.4)", () => {
  const groups = buildPassiveGroups([...DEFENSES, ...ABILITIES]);
  const awareness = groups.find((g) => g.label === "Awareness");

  it("leads with the ability's own option, then specialties alphabetically", () => {
    expect(awareness.options.map((o) => o.key)).toEqual([
      "own:ab-aware",
      "own:ab-aware:awareness_empathy",
      "own:ab-aware:awareness_notice",
    ]);
  });

  it("labels an ability by its name and a specialty as '<Ability>: <Specialty>'", () => {
    expect(awareness.options[0].label).toBe("Awareness");
    expect(awareness.options[1].label).toBe("Awareness: Empathy");
  });

  it("labels a defense and a difficulty level by their own name", () => {
    const all = buildPassiveGroups([...DIFFICULTIES, ...DEFENSES]);
    expect(all[0].options[1].label).toBe("Challenging");
    expect(all[1].options[0].label).toBe("Combat Defense");
  });

  it("keeps the fixed groups in their authored option order", () => {
    const all = buildPassiveGroups([...DIFFICULTIES, ...DEFENSES]);
    expect(all[0].options.map((o) => o.key)).toEqual(["tbl:-1", "tbl:3"]);
    expect(all[1].options.map((o) => o.key)).toEqual([
      "def:combat",
      "def:intrigue",
    ]);
  });

  it("never truncates a long name (C4.7)", () => {
    const long = "A".repeat(120);
    const groups = buildPassiveGroups([
      entry({ kind: "specialty", key: "cat:x:y", shortLabel: long }),
    ]);
    expect(groups[0].options[0].optionText).toContain(long);
  });
});

describe("buildPassiveGroups — keys (C4.1 / invariant 4)", () => {
  it("carries every key through, unique across the whole list", () => {
    const all = keys(buildPassiveGroups([...DIFFICULTIES, ...DEFENSES, ...ABILITIES]));
    expect(new Set(all).size).toBe(all.length);
  });

  it("is stable — the same input yields the same keys in the same order", () => {
    const input = [...DIFFICULTIES, ...DEFENSES, ...ABILITIES];
    expect(keys(buildPassiveGroups(input))).toEqual(
      keys(buildPassiveGroups(input))
    );
  });

  it("returns [] for an empty or missing entry list", () => {
    expect(buildPassiveGroups([])).toEqual([]);
    expect(buildPassiveGroups(undefined)).toEqual([]);
  });
});

describe("buildPassiveGroups — PER-ENTRY masking (C4.5, FR-023a)", () => {
  const masked = buildPassiveGroups([...DIFFICULTIES, ...DEFENSES, ...ABILITIES], {
    showValues: false,
  });

  it("hides the value of a target-derived entry (def/own/cat)", () => {
    const defenses = masked.find((g) => g.label === "Defenses");
    expect(defenses.options[0].optionText).toBe("Combat Defense");
    const awareness = masked.find((g) => g.label === "Awareness");
    expect(awareness.options[0].optionText).toBe("Overall");
  });

  it("KEEPS the value of a difficulty level — a table level is public", () => {
    const difficulties = masked.find((g) => g.label === "Difficulties");
    expect(difficulties.options[1].optionText).toBe("Challenging · 9");
  });

  it("still carries the true value on every option (display-only mask)", () => {
    const defenses = masked.find((g) => g.label === "Defenses");
    expect(defenses.options[0].value).toBe(11);
    expect(defenses.options[0].maskable).toBe(true);
    const difficulties = masked.find((g) => g.label === "Difficulties");
    expect(difficulties.options[1].maskable).toBe(false);
  });

  it("shows every value when showValues is on (the default)", () => {
    const visible = buildPassiveGroups([...DEFENSES]);
    expect(visible[0].options[0].optionText).toBe("Combat Defense · 11");
  });
});

describe("findPassiveOption (C5)", () => {
  const groups = buildPassiveGroups([...DEFENSES, ...ABILITIES]);

  it("finds an option anywhere in the list", () => {
    expect(findPassiveOption(groups, "own:ab-aware:awareness_empathy").value).toBe(
      19
    );
    expect(findPassiveOption(groups, "def:intrigue").value).toBe(7);
  });

  it("returns null for an unknown, empty or missing key", () => {
    expect(findPassiveOption(groups, "own:gone")).toBeNull();
    expect(findPassiveOption(groups, undefined)).toBeNull();
    expect(findPassiveOption(undefined, "def:combat")).toBeNull();
  });
});

describe("filterPassiveScopedRows (D9, C4.6)", () => {
  const rows = [
    { label: "Range", value: -2 },
    { label: "Size", value: 2, passiveScope: "def:combat" },
    { label: "Prone", value: -1 },
  ];

  it("keeps a scoped row when its scope IS the selected key", () => {
    expect(filterPassiveScopedRows(rows, "def:combat")).toHaveLength(3);
  });

  it("drops a scoped row when another passive is picked", () => {
    const kept = filterPassiveScopedRows(rows, "own:ab-aware");
    expect(kept.map((r) => r.label)).toEqual(["Range", "Prone"]);
  });

  it("keeps every unscoped row regardless of the selection", () => {
    expect(filterPassiveScopedRows(rows, undefined).map((r) => r.label)).toEqual(
      ["Range", "Prone"]
    );
  });

  it("tolerates a missing row list", () => {
    expect(filterPassiveScopedRows(undefined, "def:combat")).toEqual([]);
  });
});

// Legacy + already-valid migration fixtures (data-model §B). Each is a FACTORY
// returning a FRESH object: migrateData mutates its argument in place, so a
// shared literal would bleed between tests and break determinism (FR-011).

// A messy legacy character world: array ancestries, ObjectField-coerced
// injuries, already-string wounds, null/NaN/string movement, and a derivedStats
// slice mixing a preserved null with a coercible "NaN".
export const makeLegacyCharacter = () => ({
  ancestries: ["Andal", "First Men"],
  injuries: [{}, {}],
  wounds: ["cut", "burn"],
  movement: { base: null, total: NaN, sprintMultiplier: "4" },
  derivedStats: { health: { value: null, modifier: "NaN" } },
});

// A character already in the current shape (used for idempotency).
export const makeValidCharacter = () => ({
  ancestries: "Andal, First Men",
  injuries: ["cut"],
  wounds: [],
  movement: { base: 4, total: 5, sprintMultiplier: 4 },
  derivedStats: { health: { value: 12, modifier: 0 } },
});

// A legacy house: head corrupted to "[object Object]", steward a bare actor id.
export const makeLegacyHouse = () => ({
  members: { head: "[object Object]", steward: "actorId123" },
});

// A house already in the current {id, description} shape (idempotency).
export const makeValidHouse = () => ({
  members: {
    head: { id: "abc", description: "Lord Stark" },
    steward: { id: "", description: "" },
  },
});

// A messy legacy unit (spec 018): null/NaN/string numerics scattered across the
// numeric sub-trees, plus valid non-numeric branches (description/types) that
// must survive the coercion sweep intact.
export const makeLegacyUnit = () => ({
  derivedStats: {
    combatDefense: { value: "5", modifier: null },
    health: { total: NaN, modifier: "0", value: null, current: "3" },
  },
  xp: { value: "3.5", max: null },
  trainingLevel: { base: "2", modifier: NaN },
  status: { current: null },
  currentEquipmentIndex: "1",
  disorganizedPenalties: "abc",
  description: "Cavalaria",
  types: [{}],
});

// A unit already in the current shape (used for idempotency).
export const makeValidUnit = () => ({
  derivedStats: {
    combatDefense: { value: 5, modifier: 0 },
    health: { total: 9, modifier: 0, value: 9, current: 3 },
  },
  xp: { value: 3, max: 10 },
  trainingLevel: { base: 2, modifier: 0 },
  status: { current: 0 },
  currentEquipmentIndex: 1,
  disorganizedPenalties: 0,
  description: "Cavalaria",
  types: [],
});

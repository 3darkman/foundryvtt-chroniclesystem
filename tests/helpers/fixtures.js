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

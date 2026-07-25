/**
 * spec 025 (contract unit-relations.md C4, FR-011a) — the mutual-exclusion rule
 * between a Unit's Leader and its Attached Heroes, as two pure predicates. Both
 * write sites consult them and the render context filters on the same rule, so a
 * character can never be both on the same Unit. Foundry-free and unit-tested.
 */

function heroUuids(system) {
  return (system?.attachedHeroes ?? [])
    .map((hero) => hero?.uuid)
    .filter(Boolean);
}

/**
 * @param {object} system the Unit's system data
 * @param {string} uuid the candidate character's uuid
 * @returns {boolean} false when that character is already an attached hero
 */
export function canBeLeader(system, uuid) {
  if (!uuid) return false;
  return !heroUuids(system).includes(uuid);
}

/**
 * @param {object} system the Unit's system data
 * @param {string} uuid the candidate character's uuid
 * @returns {boolean} false when that character already leads the Unit, or is
 *   already attached to it
 */
export function canBeHero(system, uuid) {
  if (!uuid) return false;
  if (system?.leader?.uuid === uuid) return false;
  return !heroUuids(system).includes(uuid);
}

import { slugify } from "../effects/cs-slugify.js";

export const TRAINING_LEVELS = ["green", "trained", "veteran", "elite"];

export const TRAINING_POWER_COST = {
  green: 1,
  trained: 3,
  veteran: 5,
  elite: 7,
};

export const DISCIPLINE_BY_TRAINING = {
  green: 9,
  trained: 6,
  veteran: 3,
  elite: 0,
};

export const TRAINING_XP_TOTAL = {
  green: 20,
  trained: 60,
  veteran: 100,
  elite: 140,
};

export const XP_PER_RANK_STEP = 20;

export const ABILITY_BASE_RANK = 2;

export const UNIT_BASE_MOVEMENT = 40;

export const BULK_YARDS_PER_POINT = 10;

export const LEADER_ROLES = ["commander", "subcommander"];

const DEFAULT_TRAINING_LEVEL = TRAINING_LEVELS[0];

function normalizedTrainingLevel(trainingLevel) {
  return TRAINING_LEVELS.includes(trainingLevel)
    ? trainingLevel
    : DEFAULT_TRAINING_LEVEL;
}

function sumOfNumbers(values) {
  let total = 0;
  for (const value of values ?? []) total += Number(value) || 0;
  return total;
}

export function powerCostFor(trainingLevel, typePowerCosts = []) {
  return (
    TRAINING_POWER_COST[normalizedTrainingLevel(trainingLevel)] +
    sumOfNumbers(typePowerCosts)
  );
}

export function disciplineFor(trainingLevel, typeDisciplineMods = []) {
  const base = DISCIPLINE_BY_TRAINING[normalizedTrainingLevel(trainingLevel)];
  return Math.max(base + sumOfNumbers(typeDisciplineMods), 0);
}

export function computeXp(trainingLevel, ratings = []) {
  const total = TRAINING_XP_TOTAL[normalizedTrainingLevel(trainingLevel)];
  let steps = 0;
  for (const rating of ratings) {
    steps += Math.max((Number(rating) || 0) - ABILITY_BASE_RANK, 0);
  }
  const spent = XP_PER_RANK_STEP * steps;
  return { total, spent, free: total - spent };
}

export function unitTypeSlug(item) {
  const stored = item?.system?.slug ?? item?.getCSData?.()?.slug;
  return stored || slugify(item?.name ?? "");
}

export function pickEffectivePrimaryType(types = [], primarySlug = "") {
  if (!types.length) return undefined;
  if (primarySlug) {
    const designated = types.find((type) => type.slug === primarySlug);
    if (designated) return designated;
  }
  let oldest = types[0];
  for (const type of types.slice(1)) {
    if (Number(type.createdTime) < Number(oldest.createdTime)) oldest = type;
  }
  return oldest;
}

/**
 * spec 025 (design handoff §2 "Equipamento") — the equipment a Unit actually
 * fields, resolved ASPECT BY ASPECT: armour, fighting and marksmanship each read
 * the primary type's Equipment Upgrades when that aspect is evolved, and its
 * Starting Equipment otherwise. Evolving the armour therefore changes AR,
 * Penalty and Bulk together — and, because Bulk feeds Movement, the unit's
 * Movement follows.
 *
 * ONE home for that decision: the sheet renders what this returns and the
 * modifier collector derives from the same call, so the numbers on the Overview
 * tab and the numbers in the derivation can never disagree. Pure — data in,
 * data out.
 *
 * @param {object} typeData the primary Unit Type's system data
 * @param {{armor?: boolean, fighting?: boolean, marksmanship?: boolean}} evolved
 * @returns {{armor: object, fighting: {damage: string, qualities: Array},
 *   marksmanship: {damage: string, qualities: Array}}}
 */
export function effectiveEquipment(typeData, evolved = {}) {
  const starting = typeData?.startingEquipment ?? {};
  const upgraded = typeData?.upgradedEquipment ?? {};
  const setFor = (aspect) => (evolved?.[aspect] ? upgraded : starting);
  return {
    armor: setFor("armor").armor ?? {},
    fighting: {
      damage: setFor("fighting").fightingDamage ?? "",
      qualities: setFor("fighting").fightingQualities ?? [],
    },
    marksmanship: {
      damage: setFor("marksmanship").marksmanshipDamage ?? "",
      qualities: setFor("marksmanship").marksmanshipQualities ?? [],
    },
  };
}

export function movementProfileFor(bulkTotal = 0) {
  return {
    base: UNIT_BASE_MOVEMENT,
    runBonus: 0,
    bulkPenalty: BULK_YARDS_PER_POINT * (Number(bulkTotal) || 0),
  };
}

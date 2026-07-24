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

export const UNIT_CATEGORIES = ["infantry", "cavalry", "naval"];

export const UNIT_BASE_MOVEMENT = 40;

export const MOVEMENT_BY_CATEGORY_SIFRP = {
  infantry: 40,
  cavalry: 80,
  naval: 60,
};

export const BULK_YARDS_PER_POINT = 10;

export const LEADER_ROLES = ["commander", "subcommander"];

const DEFAULT_TRAINING_LEVEL = TRAINING_LEVELS[0];

const DEFAULT_UNIT_CATEGORY = UNIT_CATEGORIES[0];

function normalizedTrainingLevel(trainingLevel) {
  return TRAINING_LEVELS.includes(trainingLevel)
    ? trainingLevel
    : DEFAULT_TRAINING_LEVEL;
}

function normalizedCategory(category) {
  return UNIT_CATEGORIES.includes(category) ? category : DEFAULT_UNIT_CATEGORY;
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

export function movementProfileFor(
  category,
  bulkTotal = 0,
  sifrpStyle = false
) {
  const base = sifrpStyle
    ? MOVEMENT_BY_CATEGORY_SIFRP[normalizedCategory(category)]
    : UNIT_BASE_MOVEMENT;
  return {
    base,
    runBonus: 0,
    bulkPenalty: BULK_YARDS_PER_POINT * (Number(bulkTotal) || 0),
  };
}

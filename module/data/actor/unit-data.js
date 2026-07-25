import { TRAINING_LEVELS, LEADER_ROLES } from "../../vocabulary/cs-warfare.js";

const fields = foundry.data.fields;

const DEFAULT_TRAINING_LEVEL = TRAINING_LEVELS[0];

const integerField = () =>
  new fields.NumberField({ required: true, initial: 0, integer: true });

const blankStringField = () =>
  new fields.StringField({ required: false, blank: true, initial: "" });

const NUMERIC_TREES = [
  "derivedStats",
  "movement",
  "health",
  "discipline",
  "powerCost",
];

function coercedIntegerLeaves(node) {
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === "object") coercedIntegerLeaves(value);
    else node[key] = Number.isFinite(Number(value)) ? Math.trunc(value) : 0;
  }
}

function migratedNumericTrees(source) {
  for (const tree of NUMERIC_TREES) {
    if (source[tree] === undefined) continue;
    // A scalar where the schema now wants an adjustment block (a world that
    // somehow persisted the old derived number) is dropped so `initial` applies.
    if (!source[tree] || typeof source[tree] !== "object") {
      delete source[tree];
      continue;
    }
    coercedIntegerLeaves(source[tree]);
  }
}

function migratedTrainingLevel(source) {
  const legacy = source.trainingLevel;
  if (typeof legacy === "string") {
    source.trainingLevel = TRAINING_LEVELS.includes(legacy)
      ? legacy
      : DEFAULT_TRAINING_LEVEL;
    return;
  }
  if (legacy && typeof legacy === "object") {
    const band = TRAINING_LEVELS[Math.trunc(Number(legacy.base))];
    source.trainingLevel = band ?? DEFAULT_TRAINING_LEVEL;
    return;
  }
  if (legacy !== undefined) source.trainingLevel = DEFAULT_TRAINING_LEVEL;
}

function migratedHealth(source) {
  if (source.health !== undefined) return;
  const legacy = source.derivedStats?.health;
  if (!legacy || typeof legacy !== "object") return;
  const current = Number(legacy.current);
  const max = Number(legacy.total ?? legacy.value);
  source.health = {
    value: Number.isFinite(current) ? Math.trunc(current) : 0,
    max: Number.isFinite(max) ? Math.trunc(max) : 0,
  };
}

function migratedEvolvedEquipment(source) {
  if (source.evolvedEquipment !== undefined) return;
  if (source.isEquipmentUpgraded !== true) return;
  source.evolvedEquipment = {
    armor: true,
    fighting: true,
    marksmanship: true,
  };
}

function migratedAttachedHeroes(source) {
  if (source.attachedHeroes === undefined) return;
  if (!Array.isArray(source.attachedHeroes)) {
    delete source.attachedHeroes;
    return;
  }
  source.attachedHeroes = source.attachedHeroes
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      uuid: typeof entry.uuid === "string" ? entry.uuid : "",
    }));
}

function blankCoercedReferences(source) {
  for (const key of ["primaryTypeSlug", "houseUuid"]) {
    if (source[key] !== undefined && typeof source[key] !== "string")
      source[key] = "";
  }
  if (source.leader && typeof source.leader === "object") {
    // Each key is coerced ONLY when it is actually present. `migrateData` also
    // runs over the CHANGES of an update (DataModel#updateSource cleans with
    // `migrate: true, partial: true`), so writing a key the caller did not send
    // silently widens that update: `{"system.leader.role": "subcommander"}`
    // arrives here as `{leader: {role}}`, and adding `uuid: ""` to it unlinked
    // the leader every time the owner switched Commander ⇄ Sub-commander.
    if ("uuid" in source.leader && typeof source.leader.uuid !== "string")
      source.leader.uuid = "";
    if ("role" in source.leader && !LEADER_ROLES.includes(source.leader.role))
      source.leader.role = LEADER_ROLES[0];
  } else if (source.leader !== undefined) {
    delete source.leader;
  }
}

export default class UnitData extends foundry.abstract.TypeDataModel {
  /** @override */
  static migrateData(source) {
    migratedTrainingLevel(source);
    migratedHealth(source);
    migratedNumericTrees(source);
    migratedEvolvedEquipment(source);
    migratedAttachedHeroes(source);
    blankCoercedReferences(source);
    delete source.xp;
    delete source.types;
    delete source.owned;
    delete source.status;
    delete source.currentEquipmentIndex;
    delete source.isEquipmentUpgraded;
    delete source.disorganizedPenalties;
    if (source.derivedStats && typeof source.derivedStats === "object")
      delete source.derivedStats.health;
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      trainingLevel: new fields.StringField({
        required: true,
        choices: TRAINING_LEVELS,
        initial: DEFAULT_TRAINING_LEVEL,
      }),
      primaryTypeSlug: blankStringField(),
      health: new fields.SchemaField({
        value: integerField(),
        max: integerField(),
      }),
      derivedStats: new fields.SchemaField({
        combatDefense: new fields.SchemaField({
          value: integerField(),
          modifier: integerField(),
        }),
      }),
      movement: new fields.SchemaField({
        modifier: integerField(),
        base: integerField(),
        bulk: integerField(),
        total: integerField(),
      }),
      // The layout gives Discipline and Power Cost the same
      // `base + owner adjustment = total` treatment as Defence and Movement, so
      // each one needs a persisted adjustment of its own. Owner-editable — the
      // adjustment belongs to whoever owns the unit, GM or player alike.
      discipline: new fields.SchemaField({ modifier: integerField() }),
      powerCost: new fields.SchemaField({ modifier: integerField() }),
      evolvedEquipment: new fields.SchemaField({
        armor: new fields.BooleanField({ initial: false }),
        fighting: new fields.BooleanField({ initial: false }),
        marksmanship: new fields.BooleanField({ initial: false }),
      }),
      leader: new fields.SchemaField({
        uuid: blankStringField(),
        role: new fields.StringField({
          required: true,
          choices: LEADER_ROLES,
          initial: LEADER_ROLES[0],
        }),
      }),
      attachedHeroes: new fields.ArrayField(
        new fields.SchemaField({ uuid: blankStringField() })
      ),
      houseUuid: blankStringField(),
      description: new fields.StringField({ required: true, initial: "" }),
      modifiers: new fields.ObjectField({ initial: {} }),
      penalties: new fields.ObjectField({ initial: {} }),
    };
  }
}

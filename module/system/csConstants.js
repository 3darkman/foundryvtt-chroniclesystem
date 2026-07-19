export const CSConstants = {};

CSConstants.HouseRoles = {
  HEAD: "CS.sheets.house.character.roles.head",
  STEWARD: "CS.sheets.house.character.roles.steward",
  HEIR: "CS.sheets.house.character.roles.heir",
  FAMILY: "CS.sheets.house.character.roles.family",
  RETAINER: "CS.sheets.house.character.roles.retainer",
  SERVANT: "CS.sheets.house.character.roles.servant",
};

CSConstants.Templates = {
  Dialogs: {
    CHARACTER_ROLE_IN_HOUSE:
      "systems/chroniclesystem/templates/dialogs/characterRoleInHouse.html",
    HOUSE_RESOURCE_EDITOR:
      "systems/chroniclesystem/templates/dialogs/houseResourceEditor.html",
    ADDING_HOUSE_EVENT:
      "systems/chroniclesystem/templates/dialogs/addingHouseEvent.html",
    INITIATIVE_SELECTOR:
      "systems/chroniclesystem/templates/dialogs/initiative-selector.hbs",
    ROLL_MODIFIER:
      "systems/chroniclesystem/templates/dialogs/roll-modifier.hbs",
  },
  Chat: {
    CONFLICT_RESULT:
      "systems/chroniclesystem/templates/chat/cs-conflict-result.hbs",
  },
};

CSConstants.Settings = {
  SYSTEM_NAME: "chroniclesystem",
  ASOIAF_DEFENSE_STYLE: "asoiafDefenseStyle",
  TRACE_LOGS: "traceLogs",
  DEBUG_LOGS: "debugLogs",
  CURRENT_VERSION: "version",
  MODIFIER_DIALOG_AS_DEFAULT: "isModifierDialogDefault",
  SLUG_REVIEW: "slugReview",
  DIFFICULTY_TABLE: "difficultyTable",
  // spec 021 (US5, FR-021) — gates the optional SIFRP weapon Training rule.
  WEAPON_TRAINING_RULE: "weaponTrainingRule",
};

CSConstants.HouseResources = {
  DEFENSE: "CS.sheets.house.resources.defense",
  INFLUENCE: "CS.sheets.house.resources.influence",
  LANDS: "CS.sheets.house.resources.lands",
  LAW: "CS.sheets.house.resources.law",
  POPULATION: "CS.sheets.house.resources.population",
  POWER: "CS.sheets.house.resources.power",
  WEALTH: "CS.sheets.house.resources.wealth",
};

CSConstants.InitiativeTypes = {
  COMBAT: "CS.dialogs.initiativeSelector.combat", //"specialty:quickness:agility",
  INTRIGUE: "CS.dialogs.initiativeSelector.intrigue", //"specialty:reputation:status",
  WARFARE: "CS.dialogs.initiativeSelector.warfare", //"specialty:strategy:warfare"
};

// Roll definitions use the canonical SCOPED specialty slug (spec 008) so
// initiative resolves by stable identity — surviving a rename to any language.
// Format: `specialty:<specialtySlug>:<abilitySlug>`.
CSConstants.InitiativeTypeRolls = {
  COMBAT: "specialty:agility_quickness:agility",
  INTRIGUE: "specialty:status_reputation:status",
  WARFARE: "specialty:warfare_strategy:warfare",
};

CSConstants.TechniqueType = {
  SPELL: "CS.sheets.techniqueItem.types.spell",
  RITUAL: "CS.sheets.techniqueItem.types.ritual",
};

CSConstants.TechniqueCost = {
  NONE: "CS.sheets.generalLabels.none",
  SPEND_DESTINY: "CS.sheets.techniqueItem.costs.destinySpent",
  BURN_DESTINY: "CS.sheets.techniqueItem.costs.destinyBurnt",
  INVEST_DESTINY: "CS.sheets.techniqueItem.costs.destinyInvested",
  INJURY: "CS.sheets.character.injury",
  WOUND: "CS.sheets.character.wound",
  OTHER: "CS.sheets.generalLabels.others",
};

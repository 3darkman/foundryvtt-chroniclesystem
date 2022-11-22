export const CSConstants ={}

CSConstants.HouseRoles = {
    HEAD: "CS.sheets.house.character.roles.head",
    STEWARD: "CS.sheets.house.character.roles.steward",
    HEIR: "CS.sheets.house.character.roles.heir",
    FAMILY: "CS.sheets.house.character.roles.family",
    RETAINER: "CS.sheets.house.character.roles.retainer",
    SERVANT: "CS.sheets.house.character.roles.servant"
}

CSConstants.Templates = {
    Dialogs: {
        CHARACTER_ROLE_IN_HOUSE: "systems/chroniclesystem/templates/dialogs/characterRoleInHouse.html",
        HOUSE_RESOURCE_EDITOR: "systems/chroniclesystem/templates/dialogs/houseResourceEditor.html",
        ADDING_HOUSE_EVENT: "systems/chroniclesystem/templates/dialogs/addingHouseEvent.html",
        INITIATIVE_SELECTOR: "systems/chroniclesystem/templates/dialogs/initiative-selector.hbs",
        ROLL_MODIFIER: "systems/chroniclesystem/templates/dialogs/roll-modifier.hbs"
    }
}

CSConstants.Settings = {
    SYSTEM_NAME: "chroniclesystem",
    ASOIAF_DEFENSE_STYLE: "asoiafDefenseStyle",
    TRACE_LOGS: "traceLogs",
    DEBUG_LOGS: "debugLogs",
    CURRENT_VERSION: "version",
    MODIFIER_DIALOG_AS_DEFAULT: "isModifierDialogDefault"
}

CSConstants.HouseResources = {
    DEFENSE: "CS.sheets.house.resources.defense",
    INFLUENCE: "CS.sheets.house.resources.influence",
    LANDS: "CS.sheets.house.resources.lands",
    LAW: "CS.sheets.house.resources.law",
    POPULATION: "CS.sheets.house.resources.population",
    POWER: "CS.sheets.house.resources.power",
    WEALTH: "CS.sheets.house.resources.wealth"
}

CSConstants.InitiativeTypes = {
    COMBAT: "CS.dialogs.initiativeSelector.combat",//"specialty:quickness:agility",
    INTRIGUE: "CS.dialogs.initiativeSelector.intrigue",//"specialty:reputation:status",
    WARFARE: "CS.dialogs.initiativeSelector.warfare"//"specialty:strategy:warfare"
}

CSConstants.InitiativeTypeRolls = {
    COMBAT: "specialty:quickness:agility",
    INTRIGUE: "specialty:reputation:status",
    WARFARE: "specialty:strategy:warfare"
}

CSConstants.TechniqueType = {
    SPELL: "CS.sheets.techniqueItem.types.spell",
    RITUAL: "CS.sheets.techniqueItem.types.ritual"
}

CSConstants.TechniqueCost = {
    NONE: "CS.sheets.generalLabels.none",
    SPEND_DESTINY: "CS.sheets.techniqueItem.costs.destinySpent",
    BURN_DESTINY: "CS.sheets.techniqueItem.costs.destinyBurnt",
    INVEST_DESTINY: "CS.sheets.techniqueItem.costs.destinyInvested",
    INJURY: "CS.sheets.character.injury",
    WOUND: "CS.sheets.character.wound",
    OTHER: "CS.sheets.generalLabels.others"
}

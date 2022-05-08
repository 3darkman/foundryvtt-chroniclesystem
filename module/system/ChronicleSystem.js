import {doRoll} from "../dieroll.js";
import {DiceRollFormula} from "../diceRollFormula.js";
import {Disposition} from "../disposition.js";
import LOGGER from "../utils/logger.js";

export const ChronicleSystem ={}

window.ChronicleSystem = ChronicleSystem;

ChronicleSystem.LastActor = null;

ChronicleSystem.SetLastActor = function (actor) {
    if (actor !== ChronicleSystem.LastActor)
        LOGGER.debug(`Setting Last Actor: ${actor?.name}`);
    ChronicleSystem.LastActor = actor
}

ChronicleSystem.ClearLastActor = function (actor) {
    if (ChronicleSystem.LastActor === actor) {
        LOGGER.debug(`Clearing Last Actor: ${ChronicleSystem.LastActor?.name}`);
        ChronicleSystem.LastActor = null
        ChronicleSystem.LastActorName = null
        const tokens = canvas.tokens
        if (tokens && tokens.controlled.length > 0) {
            ChronicleSystem.SetLastActor(tokens.controlled[0].actor)
        } // There may still be tokens selected... if so, select one of them
    }
}

function escapeUnicode(str) {
    return str.replace(/[^\0-~]/g, function (ch) {
        return '&#x' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4) + ';'
    })
}

function trim(s) {
    return s.replace(/^\s*$(?:\r\n?|\n)/gm, '').trim() // /^\s*[\r\n]/gm
}

ChronicleSystem.trim = trim
ChronicleSystem.escapeUnicode = escapeUnicode

async function handleRoll(event, actor) {
    event.preventDefault();
    if (event.ctrlKey)
        LOGGER.debug("ctrl holding");
    const rollType = event.currentTarget.id;
    const roll_definition = rollType.split(':');
    if (roll_definition.length < 2)
        return;
    let formula = new DiceRollFormula();

    switch (roll_definition[0]){
        case 'ability':
            formula = ChronicleSystem.getActorAbilityFormula(actor, roll_definition[1]);
            break;
        case 'specialty':
            formula = ChronicleSystem.getActorAbilityFormula(actor, roll_definition[2], roll_definition[1]);
            break;
        case 'weapon-test':
            formula = DiceRollFormula.fromStr(roll_definition[2]);
            break;
        case 'persuasion':
        case 'deception':
        case 'formula':
            formula = DiceRollFormula.fromStr(roll_definition[2]);
            break;
    }

    await doRoll(actor,formula, roll_definition[1]);
}

function adjustFormulaByWeapon (actor, formula, weapon) {
    if (!weapon.data.training)
        return formula;

    let poolModifier = formula.bonusDice - weapon.data.training;

    if (poolModifier <= 0) {
        formula.pool += poolModifier;
        formula.bonusDice = 0;
    } else {
        formula.bonusDice = poolModifier;
    }

    return formula;
}

function getActorTestFormula(actor, abilityName, specialtyName = null) {
    console.assert(actor, "actor is invalid!");
    console.assert(abilityName, "ability name is invalid!");
    let ability;
    let specialty;
    if (specialtyName === null) {
        [ability, specialty] = actor.getAbility(abilityName);
    } else {
        [ability, specialty] = actor.getAbilityBySpecialty(abilityName, specialtyName);
        if (ability === undefined) {
            [ability, specialty] = actor.getAbility(abilityName);
        }
    }
    let formula = new DiceRollFormula();
    if (ability !== undefined) {
        let specValue = 0;
        let specModifier = 0;
        if (specialty !== undefined) {
            specValue = specialty.rating;
            specModifier = specialty.modifier;
        }
        let penalties = actor.getPenalty(ability.name.toLowerCase(), false, true);
        formula.pool = ability.data.data.rating;
        formula.dicePenalty = penalties.total;

        let modifiers = actor.getModifier(ability.name.toLowerCase(),false, true);
        formula.modifier = ability.data.data.modifier + specModifier + modifiers.total;
        formula.bonusDice = specValue;
    }

    return formula;
}

ChronicleSystem.adjustFormulaByWeapon = adjustFormulaByWeapon;
ChronicleSystem.handleRoll = handleRoll;
ChronicleSystem.getActorAbilityFormula = getActorTestFormula;

ChronicleSystem.dispositions = [
    new Disposition("CS.sheets.character.dispositions.affectionate", 1, -2, 5),
    new Disposition("CS.sheets.character.dispositions.friendly", 2, -1, 3),
    new Disposition("CS.sheets.character.dispositions.amiable", 3, 0, 1),
    new Disposition("CS.sheets.character.dispositions.indifferent", 4, 0, 0),
    new Disposition("CS.sheets.character.dispositions.dislike", 5, 1, -2),
    new Disposition("CS.sheets.character.dispositions.unfriendly", 6, 2, -4),
    new Disposition("CS.sheets.character.dispositions.malicious", 7, 3, -6),
];

ChronicleSystem.equippedConstants = {
    IS_NOT_EQUIPPED: 0,
    WEARING: 1,
    MAIN_HAND: 2,
    OFFHAND: 3,
    BOTH_HANDS: 4
};

ChronicleSystem.defaultMovement = 4;

ChronicleSystem.modifiersConstants = {
    ALL: "all",
    PENALTY: "penalty",

    AGILITY: "agility",
    AWARENESS: "awareness",
    CUNNING: "cunning",
    DECEPTION: "deception",
    PERSUASION: "persuasion",
    STATUS: "status",

    BULK: "bulk",
    DAMAGE_TAKEN: "damage_taken",
    COMBAT_DEFENSE: "combat_defense"
}

ChronicleSystem.keyConstants = {
    AGILITY: "CS.constants.abilities.agility",
    ATHLETICS: "CS.constants.abilities.athletics",
    AWARENESS: "CS.constants.abilities.awareness",
    CUNNING: "CS.constants.abilities.cunning",
    DECEPTION: "CS.constants.abilities.deception",
    PERSUASION: "CS.constants.abilities.persuasion",
    ENDURANCE: "CS.constants.abilities.endurance",
    STATUS: "CS.constants.abilities.status",
    WILL: "CS.constants.abilities.will",

    RUN: "CS.constants.specialties.run",
    BLUFF: "CS.constants.specialties.bluff",
    ACT: "CS.constants.specialties.act",
    BARGAIN: "CS.constants.specialties.bargain",
    CHARM: "CS.constants.specialties.charm",
    CONVINCE: "CS.constants.specialties.convince",
    INCITE: "CS.constants.specialties.incite",
    INTIMIDATE: "CS.constants.specialties.intimidate",
    SEDUCE: "CS.constants.specialties.seduce",
    TAUNT: "CS.constants.specialties.taunt",
    STEWARDSHIP: "CS.constants.specialties.stewardship",

    BULK: "CS.constants.qualities.bulk",

    WOUNDS: "CS.constants.others.wounds",
    INJURY: "CS.constants.others.injuries",
    FRUSTRATION: "CS.constants.others.frustrations",
    STRESS: "CS.constants.others.stress",
    FATIGUE: "CS.constants.others.fatigue"

}

ChronicleSystem.lawModifiers = [
    {min: 0, mod: -20},
    {min: 1, mod: -10},
    {min: 11, mod: -5},
    {min: 21, mod: -2},
    {min: 31, mod: -1},
    {min: 41, mod: 0},
    {min: 51, mod: 1},
    {min: 61, mod: 2},
    {min: 71, mod: 5}
]

ChronicleSystem.populationModifiers = [
    {min: 0, mod: -10},
    {min: 1, mod: -5},
    {min: 11, mod: 0},
    {min: 21, mod: 1},
    {min: 31, mod: 3},
    {min: 41, mod: 1},
    {min: 51, mod: 0},
    {min: 61, mod: -5},
    {min: 71, mod: -10}
]

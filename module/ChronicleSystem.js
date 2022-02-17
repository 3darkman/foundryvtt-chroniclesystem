import {doRoll} from "./dieroll.js";
import {DiceRollFormula} from "./diceRollFormula.js";

export const ChronicleSystem ={}

window.ChronicleSystem = ChronicleSystem;

ChronicleSystem.LastActor = null;

ChronicleSystem.SetLastActor = function (actor) {
    if (actor !== ChronicleSystem.LastActor) console.log('Setting Last Actor:' + actor?.name)
    ChronicleSystem.LastActor = actor
}

ChronicleSystem.ClearLastActor = function (actor) {
    if (ChronicleSystem.LastActor === actor) {
        console.log('Clearing Last Actor:' + ChronicleSystem.LastActor?.name)
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
        console.log("ctrl holding");
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
    let ability = undefined;
    let specialty = undefined;
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
        formula.pool = ability.data.data.rating;
        formula.modifier = ability.data.data.modifier + specModifier;
        formula.bonusDice = specValue;
    }

    return formula;
}

ChronicleSystem.adjustFormulaByWeapon = adjustFormulaByWeapon;
ChronicleSystem.handleRoll = handleRoll;
ChronicleSystem.getActorAbilityFormula = getActorTestFormula;

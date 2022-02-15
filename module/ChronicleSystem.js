import {doRoll} from "./dieroll.js";

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

// function findAbility(actor, abilityName) {
//     var t
//     if (!actor) return t
//     if (actor instanceof GurpsActor) actor = actor.getChronicleSystemActorData()
//     sname = makeRegexPatternFrom(sname, false)
//     let regex = new RegExp(sname, 'i')
//     recurselist(actor.ads, s => {
//         if (s.name.match(regex)) {
//             t = s
//         }
//     })
//     return t
// }

async function handleRoll(event, actor, targets) {
    event.preventDefault();
    if (event.ctrlKey)
        console.log("ctrl holding");
    const rollType = event.currentTarget.id;
    const roll_definition = rollType.split(':');
    if (roll_definition.length < 2)
        return;
    let formula = {
        pool: 0,
        modifier: 0,
        bonusDice: 0,
        drawback: 0,
        reroll: 0
    };
    switch (roll_definition[0]){
        case 'ability':
            let ability = actor.getAbility(roll_definition[1]);

            formula.pool += ability.data.data.rating;
            formula.modifier += ability.data.data.modifier;
            break;
        case 'specialty':
            let specialtyAbility = actor.getAbilityBySpecialty(roll_definition[1]);
            if (specialtyAbility[0] === null || specialtyAbility[0] === undefined) {
                console.error("current actor does not contain the specialty" +
                    " {0}", roll_definition[1]);
                return;
            }
            let specialty = specialtyAbility[1];
            formula.pool += specialtyAbility[0].data.data.rating;
            formula.modifier += specialtyAbility[0].data.data.modifier + specialty.modifier;
            formula.bonusDice += specialty.rating;
            break;
    }
    doRoll(actor,formula, roll_definition[1]);
}

ChronicleSystem.handleRoll = handleRoll
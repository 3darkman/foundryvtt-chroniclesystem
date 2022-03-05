/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { ChronicleSystemItemSheet } from "../item-sheet.js";
import { preloadHandlebarsTemplates } from "./preloadTemplates.js";
import { registerCustomHelpers } from "./handlebarsHelpers.js";
import actorConstructor from "../actors/actorConstructor.js";
import registerSystemSettings from "./settings.js";
import {CSCharacterActorSheet} from "../actors/sheets/csCharacterActorSheet.js";
import {CSHouseActorSheet} from "../actors/sheets/csHouseActorSheet.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import itemConstructor from "../items/itemConstructor.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function() {
    LOGGER.log(`Initializing Chronicle System`);

	/**
	 * Set an initiative formula for the system
	 * @type {String}
	 */
	CONFIG.Combat.initiative = {
	    formula: "1d20",
        decimals: 2
    };

    registerCustomHelpers();

	// Define custom Entity classes
    CONFIG.Actor.documentClass = actorConstructor;
    CONFIG.Item.documentClass = itemConstructor;

    // Register sheet application classes
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("chroniclesystem", CSCharacterActorSheet,
        { label: SystemUtils.localize("CS.sheets.characterSheet"), types: ["character"], makeDefault: true });
    Actors.registerSheet("chroniclesystem", CSHouseActorSheet,
        { label: SystemUtils.localize("CS.sheets.houseSheet"), types: ["house"], makeDefault: true });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("chroniclesystem", ChronicleSystemItemSheet, {makeDefault: true});

    registerSystemSettings();
    await preloadHandlebarsTemplates();
});

Hooks.on('preCreateItem', (item, data) => {
    item.data.update({
        img: `systems/chroniclesystem/assets/icons/${data.type}.png`
    },{diff:true});
});

// Hooks.on('createActor', async (actor, options, userId) => {
//     if (actor.data.type === 'character' && options.renderSheet) {
//         const abilitiesToFind = [
//             'Athletics',
//             'Common Knowledge',
//             'Notice',
//             'Persuasion',
//             'Stealth',
//             'Untrained',
//         ];
//         const abilityIndex = (await game.packs
//             .get('chroniclesystem.abilities')
//             .getContent());
//         actor.createEmbeddedEntity('OwnedItem', abilityIndex.filter((i) => abilitiesToFind.includes(i.data.name)));
//     }
// });
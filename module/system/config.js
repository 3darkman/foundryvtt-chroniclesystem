/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { CSItemSheet } from "../items/sheets/csItemSheet.js";
import { preloadHandlebarsTemplates } from "./preloadTemplates.js";
import { registerCustomHelpers } from "./handlebarsHelpers.js";
import actorConstructor from "../actors/actorConstructor.js";
import registerSystemSettings from "./settings.js";
import {CSCharacterActorSheet} from "../actors/sheets/csCharacterActorSheet.js";
import {CSHouseActorSheet} from "../actors/sheets/csHouseActorSheet.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import itemConstructor from "../items/itemConstructor.js";
import {CSAbilityItemSheet} from "../items/sheets/csAbilityItemSheet.js";
import {CSEventItemSheet} from "../items/sheets/csEventItemSheet.js";
import {CSHoldingItemSheet} from "../items/sheets/csHoldingItemSheet.js";
import {CSTechniqueItemSheet} from "../items/sheets/cs-technique-item-sheet.js";
import {migrateData} from "../migrations/migration.js";
import {CsCombat} from "../combat/cs-combat.js";
import {CsCombatant} from "../combat/cs-combatant.js";
import {CsHouseUnitTypeItemSheet} from "../items/sheets/cs-house-unit-type-item-sheet.js";
import {CsHouseUnitActorSheet} from "../actors/sheets/cs-house-unit-actor-sheet.js";

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
    CONFIG.Combat.documentClass = CsCombat;
    CONFIG.Combatant.documentClass = CsCombatant;

    // Register sheet application classes
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("chroniclesystem", CSCharacterActorSheet,
        { label: SystemUtils.localize("CS.sheets.characterSheet"), types: ["character"], makeDefault: true });
    Actors.registerSheet("chroniclesystem", CSHouseActorSheet,
        { label: SystemUtils.localize("CS.sheets.houseSheet"), types: ["house"], makeDefault: true });
    Actors.registerSheet("chroniclesystem", CsHouseUnitActorSheet,
        { label: SystemUtils.localize("CS.sheets.houseUnitSheet"), types: ["unit"], makeDefault: true });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("chroniclesystem", CSItemSheet,
        { label: SystemUtils.localize("CS.sheets.itemSheet"), types: ["armor", "weapon", "equipment", "benefit", "drawback"], makeDefault: true });
    Items.registerSheet("chroniclesystem", CSAbilityItemSheet,
        { label: SystemUtils.localize("CS.sheets.abilityItemSheet"), types: ["ability"], makeDefault: true });
    Items.registerSheet("chroniclesystem", CSEventItemSheet,
        { label: SystemUtils.localize("CS.sheets.eventItemSheet"), types: ["event"], makeDefault: true });
    Items.registerSheet("chroniclesystem", CSHoldingItemSheet,
        { label: SystemUtils.localize("CS.sheets.holdingItemSheet"), types: ["holding"], makeDefault: true });
    Items.registerSheet("chroniclesystem", CSTechniqueItemSheet,
        { label: SystemUtils.localize("CS.sheets.techniqueItemSheet"), types: ["technique"], makeDefault: true });
    Items.registerSheet("chroniclesystem", CsHouseUnitTypeItemSheet,
        { label: SystemUtils.localize("CS.sheets.unitTypeItemSheet"), types: ["unitType"], makeDefault: true });

    registerSystemSettings();
    await preloadHandlebarsTemplates();
});

Hooks.once("ready", async () => {
    await migrateData();
});

Hooks.on('createItem', (item, data) => {
    if (!item.isOwned) {
        item.img = `systems/chroniclesystem/assets/icons/${item.type}.png`;
    }
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

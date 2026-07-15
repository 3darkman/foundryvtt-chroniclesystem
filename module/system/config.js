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
import { CSCharacterActorSheet } from "../actors/sheets/csCharacterActorSheet.js";
import { CSPublicCharacterSheet } from "../actors/sheets/csPublicCharacterSheet.js";
import { CSHouseActorSheet } from "../actors/sheets/csHouseActorSheet.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import { CSItem } from "../items/csItem.js";
import { CSAbilityItemSheet } from "../items/sheets/csAbilityItemSheet.js";
import { CSEventItemSheet } from "../items/sheets/csEventItemSheet.js";
import { CSHoldingItemSheet } from "../items/sheets/csHoldingItemSheet.js";
import { CSTechniqueItemSheet } from "../items/sheets/cs-technique-item-sheet.js";
import { migrateData } from "../migrations/migration.js";
import { showSlugReviewAlert } from "../migrations/slug-review-alert.js";
import { CsCombat } from "../combat/cs-combat.js";
import { CsCombatant } from "../combat/cs-combatant.js";
import {
  CSActiveEffect,
  canUserModifyEffect,
  effectBlockMessageKey,
} from "../effects/cs-active-effect.js";
import { registerEffectConfigEnhancements } from "../effects/cs-active-effect-config.js";
import { registerEffectConfigSheet } from "../effects/cs-effect-config-sheet.js";
import { registerSlugLifecycleHooks } from "../data/slug-lifecycle.js";
import {
  registerApplyQuery,
  applyResourceDelta,
} from "../combat/cs-conflict-apply.js";

// TypeDataModel classes
import CharacterData from "../data/actor/character-data.js";
import HouseData from "../data/actor/house-data.js";
import UnitData from "../data/actor/unit-data.js";
import WeaponData from "../data/item/weapon-data.js";
import ArmorData from "../data/item/armor-data.js";
import AbilityData from "../data/item/ability-data.js";
import BenefitData from "../data/item/benefit-data.js";
import DrawbackData from "../data/item/drawback-data.js";
import EquipmentData from "../data/item/equipment-data.js";
import EventData from "../data/item/event-data.js";
import HoldingData from "../data/item/holding-data.js";
import PoisonData from "../data/item/poison-data.js";
import TechniqueData from "../data/item/technique-data.js";
import UnitTypeData from "../data/item/unit-type-data.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  LOGGER.log(`Initializing Chronicle System`);

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2,
  };

  registerCustomHelpers();

  // Define custom Document classes
  CONFIG.Actor.documentClass = actorConstructor;
  CONFIG.Item.documentClass = CSItem;
  CONFIG.Combat.documentClass = CsCombat;
  CONFIG.Combatant.documentClass = CsCombatant;
  // ActiveEffect is resolved directly from CONFIG (no Factory Proxy needed —
  // the core has no isSubclass(documentClass, ActiveEffect) check). The collector
  // reads `effect.system.changes` directly in CSCharacterActor#applyActiveEffects,
  // so no `applyActiveEffect` hook is registered (that hook only fires for
  // `type: "custom"` changes — confirmed against the v14 bundle).
  CONFIG.ActiveEffect.documentClass = CSActiveEffect;

  // Register TypeDataModel schemas
  CONFIG.Actor.dataModels = {
    character: CharacterData,
    house: HouseData,
    unit: UnitData,
  };
  CONFIG.Item.dataModels = {
    weapon: WeaponData,
    armor: ArmorData,
    ability: AbilityData,
    benefit: BenefitData,
    drawback: DrawbackData,
    equipment: EquipmentData,
    event: EventData,
    holding: HoldingData,
    poison: PoisonData,
    technique: TechniqueData,
    unitType: UnitTypeData,
  };

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet(
    "core",
    foundry.appv1.sheets.ActorSheet
  );
  foundry.documents.collections.Actors.registerSheet(
    "chroniclesystem",
    CSCharacterActorSheet,
    {
      label: SystemUtils.localize("CS.sheets.characterSheet"),
      types: ["character"],
      makeDefault: true,
    }
  );
  // spec 012: the read-only public sheet. Registered so the framework knows it,
  // but never user-selectable or default — routing is done directly by
  // CSCharacterActor#_getSheetClass (canBeDefault/canConfigure false keeps the
  // standard sheet the sole configurable default). Per contracts/sheet-routing.md.
  foundry.documents.collections.Actors.registerSheet(
    "chroniclesystem",
    CSPublicCharacterSheet,
    {
      label: SystemUtils.localize("CS.sheets.publicCharacterSheet"),
      types: ["character"],
      makeDefault: false,
      canBeDefault: false,
      canConfigure: false,
    }
  );
  foundry.documents.collections.Actors.registerSheet(
    "chroniclesystem",
    CSHouseActorSheet,
    {
      label: SystemUtils.localize("CS.sheets.houseSheet"),
      types: ["house"],
      makeDefault: true,
    }
  );
  foundry.documents.collections.Actors.registerSheet(
    "chroniclesystem",
    CSCharacterActorSheet,
    {
      label: SystemUtils.localize("CS.sheets.unitSheet"),
      types: ["unit"],
      makeDefault: true,
    }
  );

  foundry.documents.collections.Items.unregisterSheet(
    "core",
    foundry.appv1.sheets.ItemSheet
  );
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.itemSheet"),
      types: ["armor", "weapon", "equipment", "benefit", "drawback", "poison"],
      makeDefault: true,
    }
  );
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSAbilityItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.abilityItemSheet"),
      types: ["ability"],
      makeDefault: true,
    }
  );
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSEventItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.eventItemSheet"),
      types: ["event"],
      makeDefault: true,
    }
  );
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSHoldingItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.holdingItemSheet"),
      types: ["holding"],
      makeDefault: true,
    }
  );
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSTechniqueItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.techniqueItemSheet"),
      types: ["technique"],
      makeDefault: true,
    }
  );

  registerSystemSettings();
  // Cascade authoring sheet (Wave 5) on v14+; the datalist enhancement stays as
  // the v13 fallback (and is harmless under the custom sheet — no .key input).
  registerEffectConfigSheet();
  registerEffectConfigEnhancements();
  // Derive the stable slug from the name on item create/rename (spec 008, US2).
  registerSlugLifecycleHooks();
  // spec 010 (FR-019): the resource-apply query handler, so a non-owner's card
  // click can delegate the Health/Composure update to the active GM's client.
  registerApplyQuery();
  await preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Conflict card — apply damage/influence      */
/*  (spec 010, FR-019). renderChatMessageHTML    */
/*  passes an HTMLElement (renderChatMessage is  */
/*  deprecated v13→removed v15).                 */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const btn = html.querySelector("[data-action='cs-apply-resource']");
  if (!btn) return;
  const apply = message.getFlag("chroniclesystem", "apply");
  if (!apply) return;
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const actor = await fromUuid(apply.targetUuid);
    await applyResourceDelta(actor, apply.path, apply.delta);
  });
});

/* -------------------------------------------- */
/*  Active Effect permission guards (FR-021)    */
/*  Authoritative data-layer enforcement; the   */
/*  sheet UI mirrors these as a convenience.    */
/* -------------------------------------------- */

Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  const user = game.users?.get(userId);
  if (!user || user.isGM) return; // GM-authored effects default to origin "item"
  // Stamp player authorship so the permission rule lets them manage their own.
  if (!effect.getFlag("chroniclesystem", "origin")) {
    effect.updateSource({
      "flags.chroniclesystem.origin": "player",
      "flags.chroniclesystem.authorId": userId,
    });
  }
});

Hooks.on("preUpdateActiveEffect", (effect, changes, options, userId) => {
  const user = game.users?.get(userId);
  if (canUserModifyEffect(user, effect)) return;
  ui.notifications?.warn(SystemUtils.localize(effectBlockMessageKey(effect)));
  return false; // cancel
});

Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  const user = game.users?.get(userId);
  if (canUserModifyEffect(user, effect)) return;
  ui.notifications?.warn(SystemUtils.localize(effectBlockMessageKey(effect)));
  return false; // cancel
});

Hooks.once("ready", async () => {
  await migrateData();
  // spec 008 (FR-014): surface the actionable slug-review list, if any.
  showSlugReviewAlert();
});

Hooks.on("createItem", (item) => {
  if (!item.isEmbedded) {
    item.img = `systems/chroniclesystem/assets/icons/${item.type}.png`;
  }
});

/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { CSItemSheet } from "../items/sheets/csItemSheet.js";
import { preloadHandlebarsTemplates } from "./preloadTemplates.js";
import { registerCustomHelpers } from "./handlebarsHelpers.js";
import { CSActor } from "../actors/csActor.js";
import registerSystemSettings from "./settings.js";
import { CSCharacterActorSheet } from "../actors/sheets/csCharacterActorSheet.js";
import { CSPublicCharacterSheet } from "../actors/sheets/csPublicCharacterSheet.js";
import { CSHouseActorSheet } from "../actors/sheets/csHouseActorSheet.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import { CSItem } from "../items/csItem.js";
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
  applyConditionToTarget,
} from "../combat/cs-conflict-apply.js";
import { invalidatePassiveCatalog } from "../rolls/cs-passive-catalog.js";
import { shouldMaskPassive } from "../rolls/cs-passive.js";
import { passiveValuesVisible } from "./settings.js";

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
import QualityData from "../data/item/quality-data.js";

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
  CONFIG.Actor.documentClass = CSActor;
  CONFIG.Item.documentClass = CSItem;
  CONFIG.Combat.documentClass = CsCombat;
  CONFIG.Combatant.documentClass = CsCombatant;
  // ActiveEffect is resolved directly from CONFIG (no Factory Proxy needed —
  // the core has no isSubclass(documentClass, ActiveEffect) check). The collector
  // reads `effect.system.changes` directly in CSActor#applyActiveEffects,
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
    quality: QualityData,
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
  // CSActor#_getSheetClass (canBeDefault/canConfigure false keeps the
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
  // spec 019: one unified sheet for all 10 handoff types (the 4 per-type subclasses
  // are folded into CSItemSheet). `unitType` is intentionally omitted (out of scope,
  // FR-018 — its latent open-crash is deferred to the Warfare epic).
  foundry.documents.collections.Items.registerSheet(
    "chroniclesystem",
    CSItemSheet,
    {
      label: SystemUtils.localize("CS.sheets.itemSheet"),
      types: [
        "armor",
        "weapon",
        "equipment",
        "benefit",
        "drawback",
        "poison",
        "ability",
        "event",
        "holding",
        "technique",
        "quality",
      ],
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
  // spec 023 (US3, FR-027) — presentation-only masking, applied PER USER and per
  // render (so a reload or a re-opened chat log re-applies it, and flipping the
  // setting changes the next render with no data rewrite). The setting is read
  // HERE, inside the hook, and `isGM` is the VIEWER's. Messages without the flag
  // are never touched, so table-difficulty rolls and every pre-existing card
  // render exactly as before. This runs strictly after the verdict/degrees/
  // damage were computed and stored — the math never sees a masked value.
  if (
    shouldMaskPassive({
      isGM: game.user.isGM,
      valuesVisible: passiveValuesVisible(),
      isPassiveDifficulty: message.getFlag(
        "chroniclesystem",
        "passiveDifficulty"
      ),
    })
  ) {
    const mask = SystemUtils.localize("CS.dialogs.rollModifier.passiveMasked");
    for (const el of html.querySelectorAll(".cs-rc-maskable"))
      el.textContent = mask;
  }

  // Apply damage/influence (spec 010).
  const btn = html.querySelector("[data-action='cs-apply-resource']");
  const apply = message.getFlag("chroniclesystem", "apply");
  if (btn && apply) {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const actor = await fromUuid(apply.targetUuid);
      await applyResourceDelta(actor, apply.path, apply.delta);
    });
  }

  // spec 021 (US3) — apply an authored condition to the TARGET (one button per
  // triggered scope:"target" rule, discriminated by data-cond-index). Reads the
  // per-index entry from the flag; `if (!entry) return` guards a deleted effect
  // (FR-014). Never the wielder — the target uuid comes from the flag entry.
  const conditions = message.getFlag("chroniclesystem", "applyConditions");
  if (Array.isArray(conditions)) {
    for (const condBtn of html.querySelectorAll(
      "[data-action='cs-apply-condition']"
    )) {
      const entry = conditions[Number(condBtn.dataset.condIndex)];
      if (!entry) continue;
      condBtn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const target = await fromUuid(entry.targetUuid);
        await applyConditionToTarget(target, entry.effectData);
      });
    }
  }
});

/* -------------------------------------------- */
/*  Active Effect permission guards (FR-021)    */
/*  Authoritative data-layer enforcement; the   */
/*  sheet UI mirrors these as a convenience.    */
/* -------------------------------------------- */

Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  // spec 021 (D17/FR-012) — a QUALITY's effects are target-only condition templates
  // that NEVER transfer to the wielder; force transfer off at the data layer.
  if (effect.parent?.type === "quality" && effect.transfer !== false) {
    effect.updateSource({ transfer: false });
  }
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
  // spec 021 (D17) — never let a quality's effect be flipped back to transfer:true.
  if (effect.parent?.type === "quality" && changes.transfer === true) {
    changes.transfer = false;
  }
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

/* -------------------------------------------- */
/*  spec 020 (Decision 8) — purge transient     */
/*  Defensive-spent markers when combat ends so  */
/*  they don't linger (expiryAction "update"     */
/*  never deletes them). Active GM only.         */
/* -------------------------------------------- */

Hooks.on("deleteCombat", async (combat) => {
  if (game.users?.activeGM !== game.user) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const stale = actor.effects
      .filter((e) => e.getFlag("chroniclesystem", "defensiveSpent"))
      .map((e) => e.id);
    if (stale.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    }
  }
});

Hooks.on("createItem", (item) => {
  if (!item.isEmbedded) {
    item.img = `systems/chroniclesystem/assets/icons/${item.type}.png`;
  }
});

/* -------------------------------------------- */
/*  spec 023 (FR-014f) — the passive picker's   */
/*  world ability catalogue is memoized; drop    */
/*  the memo whenever an ability item changes so */
/*  the next dialog open sees it (no reload).    */
/* -------------------------------------------- */

for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, (item) => {
    if (item?.type !== "ability") return;
    invalidatePassiveCatalog();
  });
}

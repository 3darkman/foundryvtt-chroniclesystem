import { ChronicleSystem } from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";
import {
  weaponTypeSlug,
  slugify,
  weaponWieldingFlags,
} from "../effects/cs-effect-vocabulary.js";

// Evaluate the arithmetic tail of a damage formula over integers. Never uses
// eval; never throws. Any malformed/incomplete tail → the bare `base` value.
function applyDamageOperator(base, operator, operand) {
  if (operand === "") return base; // bare @Ability, or operator with no operand
  const rhs = Number(operand); // operand is a non-empty [0-9]* match
  switch (operator) {
    case "+":
      return base + rhs;
    case "-":
      return base - rhs;
    case "*":
      return base * rhs;
    case "/":
      return base / rhs; // exact float — no new rounding
    default:
      return base; // operand w/ no operator, or malformed run ("++", "*/")
  }
}

/**
 * spec 025 (contract unit-derivation.md C9) — the ONE parser for the
 * `@Ability` damage grammar (an optional operator plus a number), extracted from
 * `updateDamageValue` so the
 * Unit's equipment damage total and the weapon item's own total read the same
 * formula the same way (constitution §III). Returns `null` when the string
 * carries no `@Ability` token at all, which is how `updateDamageValue` keeps its
 * legacy "leave the previous value untouched" behaviour.
 * @param {object} actor  resolves the `@Ability` token by stable slug (spec 008)
 * @param {string} formulaStr
 * @returns {number|null}
 */
export function damageTotalFromFormula(actor, formulaStr) {
  const matches = String(formulaStr ?? "").match(
    "@([a-zsA-Z]*)([-+/*]*)([0-9]*)"
  );
  if (!matches || matches.length !== 4) return null;
  const ability = actor?.getAbilityValueBySlug?.(slugify(matches[1])) ?? 0;
  return applyDamageOperator(ability, matches[2], matches[3]);
}

/**
 * The single registered Item document class (spec 016). Every item `type`
 * (`armor`, `weapon`, `ability`, `equipment`, `benefit`, `drawback`, `event`,
 * `holding`, `technique`, `unitType`, `poison`) instantiates as `CSItem`; the
 * correct `system` DataModel is attached by core per `type` (CONFIG.Item.dataModels).
 *
 * No `this.type` dispatch is needed (research Decision 3): the type-specific
 * leaf methods below are type-disjoint and only ever called on the right type,
 * and the four lifecycle hooks are no-ops on every type (the AE-unification of
 * spec 007 made the collector read item data live). The former per-type
 * subclasses (CSWeaponItem/CSArmorItem/CSAbilityItem/CSEventItem/CSHoldingItem/
 * CSTechniqueItem) folded up here and were deleted.
 * @extends {Item}
 */
export class CSItem extends Item {
  /* ---------------------------------------------- */
  /*  Shared / base                                 */
  /* ---------------------------------------------- */

  getCSData() {
    return this.system;
  }

  prepareData() {
    super.prepareData();
  }

  /**
   * @override — spec 024 (US3, D6 / contract specialty-provisioning.md C1).
   * Gaining an Ability provisions its specialties. This hangs off the document
   * lifecycle, NOT the sheet's `_onDropItem`, because it must fire on EVERY
   * creation path: a drag, "Create Item" on the actor, a compendium import, a
   * migration's `createEmbeddedDocuments`.
   *
   * The `userId` guard is NOT optional: `_onCreate` runs on every connected
   * client that receives the socket broadcast, so without it N clients would
   * each race to create the same specialty set. `game.users.activeGM` is the
   * wrong guard — a player raising an ability on their own PC with no GM online
   * must still be provisioned.
   *
   * Fire-and-forget with a `catch`: `_onCreate` is synchronous in core, and a
   * rejected promise must never surface as an unhandled rejection nor block the
   * ability from being added.
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.type !== "ability") return;
    if (game.user?.id !== userId) return;
    const actor = this.actor;
    if (actor?.type !== "character") return; // FR-021 — houses/units provision nothing
    import("../actors/cs-specialty-provisioning.js")
      .then(({ provisionSpecialties }) => provisionSpecialties(actor, this))
      .catch((err) =>
        console.warn("chroniclesystem | specialty provisioning skipped:", err)
      );
  }

  // Item lifecycle hooks. No-ops since the AE-unification (spec 007): the
  // collector (`cs-effect-modifiers.js`) reads item data + equipped state live
  // on every prepareData, so obtain/equip/discard need no imperative callback.
  // They must stay callable — the sheets still invoke them (passing the actor
  // and, for equip, the equipped state) on obtain/equip/unequip.
  onEquippedChanged() {}

  onObtained() {}

  onDiscardedFromActor() {}

  _onArmorEquippedChanged() {}

  /* ---------------------------------------------- */
  /*  weapon                                        */
  /* ---------------------------------------------- */

  /**
   * Weapon damage is no longer applied imperatively: the modifier collector
   * (`cs-effect-modifiers.js`) reads the `bulk` quality live from this item's
   * data on every prepareData. `updateDamageValue` (a transient display
   * computation, not a modifier) also folds in any authored `damage` Active
   * Effects for this weapon's type (Wave 4).
   */
  updateDamageValue(actor) {
    // spec 025 — the `@Ability±n` parse lives in `damageTotalFromFormula` now
    // (one home, shared with the Unit's equipment damage). `null` = no token,
    // which keeps the legacy "leave damageValue untouched" behaviour.
    const base = damageTotalFromFormula(actor, this.getCSData().damage);
    if (base === null) return;
    this.damageValue = base;
    // Adaptable: +1 damage when wielded two-handed. Resolve the referenced
    // quality's definition by slug (spec 020, FR-022 SSOT — was a name match) and
    // read the SAME `equipped` wielding state the hand-slot logic uses.
    if (
      weaponWieldingFlags(this).adaptable &&
      this.getCSData().equipped === ChronicleSystem.equippedConstants.BOTH_HANDS
    ) {
      this.damageValue += 1;
    }
    // Wave 4: authored `damage` effects targeting this weapon's type (its
    // combat specialty) or all weapons. Optional-chained so the unit tests'
    // bare actor double (no getWeaponDamageBonus) simply contributes 0.
    this.damageValue +=
      actor.getWeaponDamageBonus?.(
        weaponTypeSlug(this.getCSData().specialty)
      ) ?? 0;
  }

  /* ---------------------------------------------- */
  /*  event                                         */
  /* ---------------------------------------------- */

  async generateModifiers(choices) {
    LOGGER.trace("generate historical event modifiers | CSEventItem.cs");
    let data = this.getCSData();

    if (data.playerChoice) {
      for (const choice of choices) {
        await this._generateModifier(choice.toLowerCase(), data);
      }
    } else {
      await this._generateModifier("defense", data);
      await this._generateModifier("influence", data);
      await this._generateModifier("lands", data);
      await this._generateModifier("law", data);
      await this._generateModifier("population", data);
      await this._generateModifier("power", data);
      await this._generateModifier("wealth", data);
    }
    this.update({ "system.modifiers": data.modifiers });
  }

  async _generateModifier(resource, data) {
    LOGGER.trace(`generate the modifier to ${resource} | CSEventItem.js`);

    let formula = data.playerChoice
      ? data.bonusToChoices
      : data.formulas[resource];

    if (!formula) {
      LOGGER.debug(
        `there is no modifier for the resource ${resource} | CSEventItem.js`
      );
      return;
    }

    let roll = new Roll(formula);
    await roll.evaluate();
    data.modifiers[resource] = roll.total;
  }

  /* ---------------------------------------------- */
  /*  holding                                       */
  /* ---------------------------------------------- */

  getTotalInvested() {
    LOGGER.trace(`Get Total Invested | CSHoldingItem | csHoldingItem.js`);
    let data = this.getCSData();

    let total = parseInt(data.investment);
    let features = Object.keys(data.features).map((key) => data.features[key]);
    features.forEach((feature) => {
      total += parseInt(feature.cost);
    });
    LOGGER.debug(
      `total invested on ${this.name}: ${total} | CSHoldingItem | csHoldingItem.js`
    );
    return total;
  }
}

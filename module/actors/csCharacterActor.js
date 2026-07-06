import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { CSActor } from "./csActor.js";
import SystemUtils from "../utils/systemUtils.js";
import { CSConstants } from "../system/csConstants.js";
import {
  collectEffectModifiers,
  applyOwnedItemEffects,
} from "../effects/cs-effect-modifiers.js";
import { DERIVED_STATS } from "../effects/cs-effect-vocabulary.js";

/**
 * Read-side aggregation of one buffer — the inverse of the collector. Sums the
 * entries keyed by `type`, plus the global ALL bucket when `includeGlobal`.
 * Module-level so the five getters (modifier/penalty/test dice/bonus dice/reroll)
 * share one implementation (DRY, constitution §III) and stay testable.
 * @returns {{total: number, detail: Array<{docName: string, mod: number}>}}
 */
function collectFromBuffer(
  buffer,
  type,
  includeDetail,
  includeGlobal,
  resolveDoc
) {
  let total = 0;
  const detail = [];
  const accumulate = (entries) => {
    entries.forEach((entry) => {
      total += entry.mod;
      if (includeDetail) {
        let tempItem = entry._id;
        if (entry.isDocument) tempItem = resolveDoc(entry._id);
        if (tempItem) detail.push({ docName: tempItem.name, mod: entry.mod });
      }
    });
  };
  if (buffer[type]) accumulate(buffer[type]);
  const ALL = ChronicleSystem.modifiersConstants.ALL;
  if (includeGlobal && buffer[ALL]) accumulate(buffer[ALL]);
  return { total, detail };
}

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {CSActor}
 */
export class CSCharacterActor extends CSActor {
  // Transient roll-channel buffers, recomputed each prepareData by the collector
  // and read by getModifier/getPenalty/getTestDice/getBonusDice/getReRoll.
  modifiers;
  penalties;
  testDice;
  bonusDice;
  reRolls;
  // Wave 4 non-roll buffers: derived-stat deltas (read by getDerivedStatBonus in
  // calculateDerivedValues), weapon damage (read by getWeaponDamageBonus in
  // updateDamageValue), and granted weapon qualities (applied by
  // applyOwnedItemEffects in prepareDerivedData).
  derivedStats;
  weaponDamage;
  weaponQuality;

  prepareData() {
    super.prepareData();
    this.calculateMovementData();
  }

  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.calculateDerivedValues();
    // Transient owned-item pass (Wave 4): grant qualities to weapons and apply
    // each armour's own armorrating to its rating. Items are already prepared at
    // this point; the writes are transient and reset next cycle.
    applyOwnedItemEffects(this);
  }

  /** @override */
  getRollData() {
    return super.getRollData();
  }

  /**
   * Run the modifier collector as the single writer of the transient buffer.
   * v14 calls this with phase "initial"/"final"; v13 calls it once (undefined).
   * The collector runs in the "initial" phase — before prepareDerivedData reads
   * getModifier/getPenalty (counters/equipment are base data, available then).
   * The buffer is recomputed from scratch each cycle and never persisted.
   * @override
   */
  applyActiveEffects(phase) {
    super.applyActiveEffects(phase);
    if (phase === "initial" || phase === undefined) {
      const collected = collectEffectModifiers(this);
      this.modifiers = collected.modifiers;
      this.penalties = collected.penalties;
      this.testDice = collected.testDice;
      this.bonusDice = collected.bonusDice;
      this.reRolls = collected.reRolls;
      this.derivedStats = collected.derivedStats;
      this.weaponDamage = collected.weaponDamage;
      this.weaponQuality = collected.weaponQuality;
    }
  }

  calculateDerivedValues() {
    let data = this.getCSData();

    // Combat defense and health exist on both character and unit data models
    if (data.derivedStats?.combatDefense) {
      data.derivedStats.combatDefense.value = this.calcCombatDefense() || 0;
      data.derivedStats.combatDefense.total =
        data.derivedStats.combatDefense.value +
        (Number(data.derivedStats.combatDefense.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.COMBAT_DEFENSE);
    }
    if (data.derivedStats?.health) {
      data.derivedStats.health.value =
        (this.getAbilityValue(
          SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)
        ) || 0) * 3;
      data.derivedStats.health.total =
        data.derivedStats.health.value +
        (Number(data.derivedStats.health.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.HEALTH);
    }

    // Intrigue, composure, frustration, and fatigue only exist on character data model
    if (data.derivedStats?.intrigueDefense) {
      data.derivedStats.intrigueDefense.value = this.calcIntrigueDefense() || 0;
      data.derivedStats.intrigueDefense.total =
        data.derivedStats.intrigueDefense.value +
        (Number(data.derivedStats.intrigueDefense.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.INTRIGUE_DEFENSE);
    }
    if (data.derivedStats?.composure) {
      data.derivedStats.composure.value =
        (this.getAbilityValue(
          SystemUtils.localize(ChronicleSystem.keyConstants.WILL)
        ) || 0) * 3;
      data.derivedStats.composure.total =
        data.derivedStats.composure.value +
        (Number(data.derivedStats.composure.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.COMPOSURE);
    }
    if (data.derivedStats?.frustration) {
      data.derivedStats.frustration.value =
        this.getAbilityValue(
          SystemUtils.localize(ChronicleSystem.keyConstants.WILL)
        ) || 0;
      data.derivedStats.frustration.total =
        data.derivedStats.frustration.value +
        (Number(data.derivedStats.frustration.modifier) || 0);
    }
    if (data.derivedStats?.fatigue) {
      data.derivedStats.fatigue.value =
        this.getAbilityValue(
          SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)
        ) || 0;
      data.derivedStats.fatigue.total =
        data.derivedStats.fatigue.value +
        (Number(data.derivedStats.fatigue.modifier) || 0);
    }
  }

  getAbilities() {
    let items = this.items;
    return items.filter((item) => item.type === "ability");
  }

  getAbility(abilityName) {
    let items = this.items;
    const ability = items.find(
      (item) =>
        item.name.toLowerCase() === abilityName.toString().toLowerCase() &&
        item.type === "ability"
    );
    return [ability, undefined];
  }

  getAbilityBySpecialty(abilityName, specialtyName) {
    let items = this.items;
    let specialty = null;
    const ability = items
      .filter(
        (item) =>
          item.type === "ability" &&
          item.name.toLowerCase() === abilityName.toString().toLowerCase()
      )
      .find(function (ability) {
        let data = ability.getCSData();
        if (data.specialties === undefined) return false;

        // convert specialties list to array
        let specialties = data.specialties;
        let specialtiesArray = Object.keys(specialties).map(
          (key) => specialties[key]
        );

        specialty = specialtiesArray.find(
          (specialty) =>
            specialty.name.toLowerCase() ===
            specialtyName.toString().toLowerCase()
        );
        if (specialty !== null && specialty !== undefined) {
          return true;
        }
      });

    return [ability, specialty];
  }

  getModifier(type, includeDetail = false, includeModifierGlobal = false) {
    this.updateTempModifiers();
    return collectFromBuffer(
      this.modifiers,
      type,
      includeDetail,
      includeModifierGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    );
  }

  getPenalty(type, includeDetail = false, includeModifierGlobal = false) {
    this.updateTempPenalties();
    return collectFromBuffer(
      this.penalties,
      type,
      includeDetail,
      includeModifierGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    );
  }

  getTestDice(type, includeDetail = false, includeModifierGlobal = false) {
    if (!this.testDice) this.testDice = {};
    return collectFromBuffer(
      this.testDice,
      type,
      includeDetail,
      includeModifierGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    );
  }

  getBonusDice(type, includeDetail = false, includeModifierGlobal = false) {
    if (!this.bonusDice) this.bonusDice = {};
    return collectFromBuffer(
      this.bonusDice,
      type,
      includeDetail,
      includeModifierGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    );
  }

  getReRoll(type, includeDetail = false, includeModifierGlobal = false) {
    if (!this.reRolls) this.reRolls = {};
    return collectFromBuffer(
      this.reRolls,
      type,
      includeDetail,
      includeModifierGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    );
  }

  /**
   * Authored `derivedstat` AE total for one stat slug (Wave 4). Separate buffer
   * from `modifiers`, so it never double-counts the armour penalty the ASOIAF
   * combat-defense path reads via getModifier(COMBAT_DEFENSE).
   * @param {string} statSlug e.g. DERIVED_STATS.COMBAT_DEFENSE
   * @returns {number}
   */
  getDerivedStatBonus(statSlug) {
    if (!this.derivedStats) this.derivedStats = {};
    return collectFromBuffer(this.derivedStats, statSlug, false, false, (id) =>
      this.getEmbeddedDocument("Item", id)
    ).total;
  }

  /**
   * Authored `damage` AE total for a weapon type (Wave 4): the type bucket plus
   * the global ALL (all-weapons) bucket. Read by `updateDamageValue` at render.
   * @param {string} typeSlug the weapon's specialty-derived type slug
   * @returns {number}
   */
  getWeaponDamageBonus(typeSlug) {
    if (!this.weaponDamage) this.weaponDamage = {};
    // Skip the global merge when the type slug IS the ALL bucket, so a weapon
    // whose specialty slugs to "all" doesn't count the all-weapons damage twice
    // (mirrors the guard in grantWeaponQualities).
    const includeGlobal = typeSlug !== ChronicleSystem.modifiersConstants.ALL;
    return collectFromBuffer(
      this.weaponDamage,
      typeSlug,
      false,
      includeGlobal,
      (id) => this.getEmbeddedDocument("Item", id)
    ).total;
  }

  /**
   * Finds the House (if any) that lists this character among its members and
   * returns its localized role label. House membership is stored only on the
   * House actor (system.members.*), so this is a reverse lookup across
   * game.actors rather than a stored field on the character.
   * @returns {{houseId: string, houseName: string, role: string, description: string} | null}
   */
  getHouseRole() {
    const roleLabelKeys = {
      head: "CS.sheets.house.character.roles.head",
      steward: "CS.sheets.house.character.roles.steward",
      heirs: "CS.sheets.house.character.roles.heir",
      family: "CS.sheets.house.character.roles.family",
      retainers: "CS.sheets.house.character.roles.retainer",
      servants: "CS.sheets.house.character.roles.servant",
    };
    for (const house of game.actors.filter((a) => a.type === "house")) {
      const members = house.getCSData().members;
      if (!members) continue;
      for (const [key, labelKey] of Object.entries(roleLabelKeys)) {
        const value = members[key];
        const member = Array.isArray(value)
          ? value.find((m) => m.id === this.id)
          : value?.id === this.id
          ? value
          : null;
        if (member) {
          const roleLabel = SystemUtils.localize(labelKey);
          // The member's own title (e.g. "Captain") shown as Role/Title; skip it
          // when it just repeats the role label (the HEAD default description).
          const description =
            member.description && member.description !== roleLabel
              ? member.description
              : "";
          return {
            houseId: house.id,
            houseName: house.name,
            role: roleLabel,
            description,
          };
        }
      }
    }
    return null;
  }

  getMaxInjuries() {
    return this.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)
    );
  }

  getMaxWounds() {
    return this.getAbilityValue(
      SystemUtils.localize(ChronicleSystem.keyConstants.ENDURANCE)
    );
  }

  getAbilityValue(abilityName) {
    const [ability] = this.getAbility(abilityName);
    return ability !== undefined ? ability.getCSData().rating : 2;
  }

  calcIntrigueDefense() {
    return (
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)
      ) +
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.CUNNING)
      ) +
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.STATUS)
      )
    );
  }

  calcCombatDefense() {
    let value =
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.AWARENESS)
      ) +
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.AGILITY)
      ) +
      this.getAbilityValue(
        SystemUtils.localize(ChronicleSystem.keyConstants.ATHLETICS)
      );

    if (
      game.settings.get(
        CSConstants.Settings.SYSTEM_NAME,
        CSConstants.Settings.ASOIAF_DEFENSE_STYLE
      )
    ) {
      let mod = this.getModifier(
        ChronicleSystem.modifiersConstants.COMBAT_DEFENSE
      );
      value += mod.total;
    }

    return value;
  }

  calculateMovementData() {
    let data = this.getCSData();
    // Movement only exists on the character data model, not on units
    if (!data.movement) return;
    data.movement.base = ChronicleSystem.defaultMovement;
    let runFormula = ChronicleSystem.getActorAbilityFormula(
      this,
      SystemUtils.localize(ChronicleSystem.keyConstants.ATHLETICS),
      SystemUtils.localize(ChronicleSystem.keyConstants.RUN)
    );
    data.movement.runBonus = Math.floor(runFormula.bonusDice / 2);
    let bulkMod = this.getModifier(
      SystemUtils.localize(ChronicleSystem.modifiersConstants.BULK)
    );
    data.movement.bulk = Math.floor(bulkMod.total / 2);
    data.movement.total = Math.max(
      data.movement.base +
        data.movement.runBonus -
        data.movement.bulk +
        (parseInt(data.movement.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.MOVEMENT),
      1
    );
    data.movement.sprintTotal =
      data.movement.total * (Number(data.movement.sprintMultiplier) || 4) -
      data.movement.bulk;
  }

  // Item lifecycle (onObtained/onEquippedChanged/onDiscardedFromActor) and the
  // persisted modifier map are gone: the collector recomputes the buffer from
  // owned items + counters on every prepareData, so embedded-document changes
  // (create/update/delete, equip/unequip) are picked up automatically by the
  // re-render. No _on*DescendantDocuments overrides are needed.

  // Kept for the read-side: getModifier/getPenalty call these at their start.
  // The collector owns the buffer (populated in applyActiveEffects); these only
  // guarantee the maps exist and never reload from a persisted source.
  updateTempModifiers() {
    if (!this.modifiers) this.modifiers = {};
  }

  updateTempPenalties() {
    if (!this.penalties) this.penalties = {};
  }
}

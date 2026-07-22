import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { CSPublicCharacterSheet } from "./sheets/csPublicCharacterSheet.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";
import { CSConstants } from "../system/csConstants.js";
import {
  collectEffectModifiers,
  applyOwnedItemEffects,
} from "../effects/cs-effect-modifiers.js";
import { DERIVED_STATS, slugify } from "../effects/cs-effect-vocabulary.js";
import { scopedSpecialtySlug } from "../vocabulary/cs-canonical-abilities.js";
import { renderAndSave, canUpload } from "../coat-of-arms/cs-coa-render.js";

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
 * The single registered Actor document class (spec 016). Every actor `type`
 * (`character`, `house`, `unit`) instantiates as `CSActor`; the correct `system`
 * DataModel is attached by core per `type` (CONFIG.Actor.dataModels).
 *
 * Only the core-invoked lifecycle methods branch on `this.type`; the type-
 * specific "leaf" methods below coexist and are only ever called on the correct
 * type (the callers already know the type — the street-fighter idiom). The
 * former per-type subclasses CSCharacterActor (character/unit) and CSHouseActor
 * (house) folded up here and were deleted.
 * @extends {Actor}
 */
export class CSActor extends Actor {
  // Transient roll-channel buffers (character/unit), recomputed each prepareData
  // by the collector and read by getModifier/getPenalty/getTestDice/getBonusDice/
  // getReRoll.
  modifiers;
  penalties;
  testDice;
  bonusDice;
  reRolls;
  // spec 023 — the passive channel: a trait-targeted buffer read ONLY by the
  // passive derivation (getActorPassiveValue), never by a rolled test.
  passives;
  // Wave 4 non-roll buffers: derived-stat deltas (read by getDerivedStatBonus in
  // calculateDerivedValues), weapon damage (read by getWeaponDamageBonus in
  // updateDamageValue), and granted weapon qualities (applied by
  // applyOwnedItemEffects in prepareDerivedData).
  derivedStats;
  weaponDamage;
  weaponQuality;
  // US4 intrigue buffers: disposition delta (persuasion/deception) and per-
  // technique influence, read by the sheet's _calculateIntrigueTechniques.
  dispositionDelta;
  influence;

  // House role → members key map (house type only; harmless on other types).
  roleMap = {
    HEAD: "head",
    STEWARD: "steward",
    HEIR: "heirs",
    FAMILY: "family",
    RETAINER: "retainers",
    SERVANT: "servants",
  };

  getCSData() {
    return this.system;
  }

  /* -------------------------------------------------------------- */
  /*  Core-invoked lifecycle — branch on this.type (Entity C)       */
  /* -------------------------------------------------------------- */

  prepareData() {
    super.prepareData();
    if (this.type === "character" || this.type === "unit") {
      this.calculateMovementData();
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.type === "character" || this.type === "unit") {
      this.calculateDerivedValues();
      // Transient owned-item pass (Wave 4): grant qualities to weapons and apply
      // each armour's own armorrating to its rating. Items are already prepared
      // at this point; the writes are transient and reset next cycle.
      applyOwnedItemEffects(this);
    }
  }

  /**
   * Run the modifier collector as the single writer of the transient buffer.
   * v14 calls this with phase "initial"/"final"; v13 calls it once (undefined).
   * The collector runs in the "initial" phase — before prepareDerivedData reads
   * getModifier/getPenalty (counters/equipment are base data, available then).
   * The buffer is recomputed from scratch each cycle and never persisted.
   * Character/unit only; house keeps the base behavior it has today.
   * @override
   */
  applyActiveEffects(phase) {
    super.applyActiveEffects(phase);
    if (
      (this.type === "character" || this.type === "unit") &&
      (phase === "initial" || phase === undefined)
    ) {
      const collected = collectEffectModifiers(this);
      this.modifiers = collected.modifiers;
      this.penalties = collected.penalties;
      this.testDice = collected.testDice;
      this.bonusDice = collected.bonusDice;
      this.reRolls = collected.reRolls;
      this.passives = collected.passives;
      this.derivedStats = collected.derivedStats;
      this.weaponDamage = collected.weaponDamage;
      this.weaponQuality = collected.weaponQuality;
      this.dispositionDelta = collected.dispositionDelta;
      this.influence = collected.influence;
    }
  }

  /**
   * spec 012 — route a user whose ownership is exactly Limited to the read-only
   * public sheet (FR-001, contracts/sheet-routing.md). `this.limited` is core's
   * exact-LIMITED test, so Observer/Owner/GM all fall through to the standard
   * sheet. The `type === "character"` guard protects `unit` actors (which share
   * this class) and `house`, keeping their normal sheet. Intercepting at
   * `_getSheetClass` covers every open path (directory, token, chat portrait,
   * `actor.sheet.render`).
   * @override
   */
  _getSheetClass() {
    if (this.type === "character" && this.limited)
      return CSPublicCharacterSheet;
    return super._getSheetClass();
  }

  // House only: keep the resource-total recompute when an `event` embedded item
  // changes. Character/unit fall through to base after `super` (they had no
  // override before). The inner `type === "event"` guard is preserved as-is.
  _onCreateDescendantDocuments(
    parent,
    collection,
    documents,
    data,
    options,
    userId
  ) {
    super._onCreateDescendantDocuments(
      parent,
      collection,
      documents,
      data,
      options,
      userId
    );

    if (this.type !== "house") return;

    let isToUpdate = documents.find((doc) => doc.type === "event");

    if (isToUpdate) this._updateAllResourcesTotal();
  }

  _onUpdateDescendantDocuments(
    parent,
    collection,
    documents,
    changes,
    options,
    userId
  ) {
    super._onUpdateDescendantDocuments(
      parent,
      collection,
      documents,
      changes,
      options,
      userId
    );

    if (this.type !== "house") return;

    let isToUpdate = documents.find((doc) => doc.type === "event");

    if (isToUpdate) this._updateAllResourcesTotal();
  }

  _onDeleteDescendantDocuments(
    parent,
    collection,
    documents,
    ids,
    options,
    userId
  ) {
    super._onDeleteDescendantDocuments(
      parent,
      collection,
      documents,
      ids,
      options,
      userId
    );

    if (this.type !== "house") return;

    let isToUpdate = documents.find((doc) => doc.type === "event");

    if (isToUpdate) this._updateAllResourcesTotal();
  }

  /* -------------------------------------------------------------- */
  /*  — character/unit —                                            */
  /* -------------------------------------------------------------- */

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
        (this.getAbilityValueBySlug("endurance") || 0) * 3;
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
        (this.getAbilityValueBySlug("will") || 0) * 3;
      data.derivedStats.composure.total =
        data.derivedStats.composure.value +
        (Number(data.derivedStats.composure.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.COMPOSURE);
    }
    if (data.derivedStats?.frustration) {
      data.derivedStats.frustration.value =
        this.getAbilityValueBySlug("will") || 0;
      data.derivedStats.frustration.total =
        data.derivedStats.frustration.value +
        (Number(data.derivedStats.frustration.modifier) || 0);
    }
    if (data.derivedStats?.fatigue) {
      data.derivedStats.fatigue.value =
        this.getAbilityValueBySlug("endurance") || 0;
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

  /**
   * Resolve an ability by its STABLE slug (`system.slug || slugify(name)`) —
   * language-independent, unlike {@link getAbility} (which matches the display
   * name). The internal read-side consumers key by slug so a renamed ability
   * still resolves. Returns `[ability|undefined, undefined]`.
   * @param {string} slug
   */
  getAbilityBySlug(slug) {
    const ability = this.items.find(
      (item) =>
        item.type === "ability" &&
        (item.getCSData?.().slug || slugify(item.name)) === slug
    );
    return [ability, undefined];
  }

  /**
   * Ability rating by canonical slug; default 2 when absent (silent no-op
   * parity). Slug variant of {@link getAbilityValue} used by the derived stats.
   * @param {string} slug
   * @returns {number}
   */
  getAbilityValueBySlug(slug) {
    const [ability] = this.getAbilityBySlug(slug);
    return ability !== undefined ? ability.getCSData().rating : 2;
  }

  /**
   * Resolve a specialty by its SCOPED slug (`<abilitySlug>_<spec>`) inside any
   * ability the actor owns. Slug variant of {@link getAbilityBySpecialty}.
   * Returns `[ability|undefined, specialty|undefined]`.
   * @param {string} specialtySlug
   */
  getAbilityBySpecialtySlug(specialtySlug) {
    let foundSpecialty;
    const ability = this.items.find((item) => {
      if (item.type !== "ability") return false;
      const data = item.getCSData?.() ?? {};
      const abilitySlug = data.slug || slugify(item.name);
      const specialties = data.specialties ?? {};
      foundSpecialty = Object.values(specialties).find(
        (sp) =>
          (sp?.slug || scopedSpecialtySlug(abilitySlug, sp?.name)) ===
          specialtySlug
      );
      return foundSpecialty !== undefined;
    });
    return [ability, foundSpecialty];
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
   * spec 023 — the `cs.passive.*` channel total for one trait slug. Same shape as
   * the dice getters (they share `collectFromBuffer`); read only by the passive
   * derivation, so it can never reach a rolled test.
   */
  getPassive(type, includeDetail = false, includeModifierGlobal = false) {
    if (!this.passives) this.passives = {};
    return collectFromBuffer(
      this.passives,
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
    return this.getAbilityValueBySlug("endurance");
  }

  getMaxWounds() {
    return this.getAbilityValueBySlug("endurance");
  }

  getAbilityValue(abilityName) {
    const [ability] = this.getAbility(abilityName);
    return ability !== undefined ? ability.getCSData().rating : 2;
  }

  calcIntrigueDefense() {
    return (
      this.getAbilityValueBySlug("awareness") +
      this.getAbilityValueBySlug("cunning") +
      this.getAbilityValueBySlug("status")
    );
  }

  calcCombatDefense() {
    let value =
      this.getAbilityValueBySlug("awareness") +
      this.getAbilityValueBySlug("agility") +
      this.getAbilityValueBySlug("athletics");

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
    // Resolve Athletics:Run by canonical slug (scoped specialty) so movement
    // survives a rename; getActorAbilityFormula accepts a slug or a display name.
    let runFormula = ChronicleSystem.getActorAbilityFormula(
      this,
      "athletics",
      "athletics_run"
    );
    data.movement.runBonus = Math.floor(runFormula.bonusDice / 2);
    let bulkMod = this.getModifier(ChronicleSystem.modifiersConstants.BULK);
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

  // Kept for the read-side: getModifier/getPenalty call these at their start.
  // The collector owns the buffer (populated in applyActiveEffects); these only
  // guarantee the maps exist and never reload from a persisted source.
  updateTempModifiers() {
    if (!this.modifiers) this.modifiers = {};
  }

  updateTempPenalties() {
    if (!this.penalties) this.penalties = {};
  }

  /* -------------------------------------------------------------- */
  /*  — house —                                                     */
  /* -------------------------------------------------------------- */

  /** Does this house have a re-editable Coat of Arms definition? */
  hasCoaDefinition() {
    return !foundry.utils.isEmpty(this.system.coa);
  }

  /**
   * Re-render the saved COA definition into an image (FR-010). MANUAL only — never
   * automatic. Rendering is 100% local now; the only failure mode is the file
   * upload. No-op unless the definition exists, the user owns the house and can
   * upload files. On failure the definition is left untouched.
   */
  async reRenderCoa() {
    if (!this.hasCoaDefinition() || !this.isOwner || !canUpload()) return;
    try {
      await renderAndSave(this, this.system.coa, { size: 500 });
    } catch (err) {
      LOGGER.warn(`CoA re-render failed for ${this.name}: ${err}`);
      ui.notifications?.warn(
        SystemUtils.localize("CS.coa.warnings.savedWithoutImage")
      );
    }
  }

  removeCharacterFromHouse(
    actorId,
    role = undefined,
    ignoreRoles = ["STEWARD"]
  ) {
    if (role) {
      let result = this.characterHasRole(actorId, role);
      if (result.hasRole)
        this._removeCharacterFromRole(role, actorId, result.index);
    } else {
      Object.entries(this.roleMap).forEach((item) => {
        if (!ignoreRoles.includes(item[0])) {
          let result = this.characterHasRole(actorId, item[0]);
          if (result.hasRole)
            this._removeCharacterFromRole(item[0], actorId, result.index);
        }
      });
    }
  }

  async regenerateAllStartingResources() {
    let data = this.getCSData();
    await this._regenerateResource(data, "defense");
    await this._regenerateResource(data, "influence");
    await this._regenerateResource(data, "lands");
    await this._regenerateResource(data, "law");
    await this._regenerateResource(data, "population");
    await this._regenerateResource(data, "power");
    await this._regenerateResource(data, "wealth");

    this._updateAllResourcesTotal(data);
  }

  async _regenerateResource(data, resource) {
    let roll = new Roll("8d6-2d6");
    await roll.evaluate();
    data[resource].startingValue = roll.total;
  }

  characterHasRole(actorId, role) {
    LOGGER.trace(
      `Check if the Character has the Role ${role} | CSHouseActor | csHouseActor.js`
    );
    let result = {
      hasRole: false,
      index: -1,
    };
    switch (role) {
      case "STEWARD":
      case "HEAD":
        if (this.getCSData().members[this.roleMap[role]].id === actorId) {
          result.hasRole = true;
        }
        break;
      case "HEIR":
      case "FAMILY":
      case "RETAINER":
      case "SERVANT": {
        let index = this._getMemberIndexIfExists(role, actorId);
        if (index >= 0) {
          result.hasRole = true;
          result.index = index;
        }
        break;
      }
    }
    if (result.hasRole) LOGGER.debug(`actor ${actorId} is founded as ${role}`);
    return result;
  }

  _getMemberIndexIfExists(role, id, list = undefined) {
    if (!list) list = this.getCSData().members[this.roleMap[role]];
    let index = list.findIndex((member) => member.id === id);
    return index;
  }

  _removeCharacterFromRole(role, actorId, index = -1) {
    LOGGER.trace(
      "Remove the Character from a Role | CSHouseActor |" + " csHouseActor.js"
    );
    let founded = false;
    switch (role) {
      case "STEWARD":
      case "HEAD":
        if (this.getCSData().members[this.roleMap[role]].id === actorId) {
          let key = `system.members.${[this.roleMap[role]]}`;
          this.update({ [key]: { id: "", description: "" } });
          founded = true;
        }
        break;
      case "HEIR":
      case "FAMILY":
      case "RETAINER":
      case "SERVANT": {
        let list = this.getCSData().members[this.roleMap[role]];
        if (index < 0)
          index = this._getMemberIndexIfExists(role, actorId, list);
        if (index >= 0) {
          list.splice(index, 1);
          let key = `system.members.${[this.roleMap[role]]}`;
          this.update({
            [key]: list,
          });
          founded = true;
        }
        break;
      }
    }

    if (founded) LOGGER.debug(`actor ${actorId} removed from ${role}`);
  }

  changeResource(resourceId, startingValue, description) {
    let data = this.getCSData();
    data[resourceId].startingValue = parseInt(startingValue);
    data[resourceId].description = description;
    data[resourceId].total = this._updateResourceTotal(data, resourceId);
    let key = `system.${resourceId}`;
    this.update({ [key]: data[resourceId] });
  }

  addCharacterToHouse(actorId, role, description) {
    LOGGER.trace("Add Character to House | CSHouseActor | csHouseActor.js");
    let result = this.characterHasRole(actorId, role);
    if (result.hasRole) {
      return;
    }
    if (role !== "STEWARD") {
      this.removeCharacterFromHouse(actorId);
    }
    switch (role) {
      case "HEAD":
        if (!description) {
          description = SystemUtils.localize("CS.sheets.house.labels.head");
        }
      // falls through
      case "STEWARD": {
        let key = `system.members.${[this.roleMap[role]]}`;
        this.update({
          [key]: { id: actorId, description: description },
        });
        break;
      }
      case "HEIR":
      case "FAMILY":
      case "RETAINER":
      case "SERVANT": {
        let list = this.getCSData().members[this.roleMap[role]];
        if (this._getMemberIndexIfExists(role, actorId, list) < 0) {
          list.push({ id: actorId, description: description });
          let key = `system.members.${[this.roleMap[role]]}`;
          this.update({
            [key]: list,
          });
        } else {
          LOGGER.debug(
            `actor is already part of the house ${this.roleMap[role]}`
          );
        }
        break;
      }
    }
  }

  getCharactersFromRole(role) {
    LOGGER.trace(
      `get Characters from Role ${role} | CSHouseActor | csActorHouse.js`
    );
    let membersData = this.getCSData().members[role];
    let members = [];
    if (Array.isArray(membersData)) {
      membersData.forEach((member) => {
        let actor = this._getCharacterDataById(member.id);
        members.push({
          name: actor.name,
          age: actor.age,
          id: member.id,
          description: member.description,
        });
      });
    } else {
      let actor = this._getCharacterDataById(membersData.id);
      members = {
        name: actor.name,
        age: actor.age,
        id: membersData.id,
        description: membersData.description,
      };
    }
    return members;
  }

  _getCharacterDataById(id) {
    if (!id) {
      return {
        name: SystemUtils.localize("CS.messages.nobodyHasBeenChosen"),
        age: 0,
      };
    }
    let actor = game.actors.get(id);
    let name = SystemUtils.localize("CS.messages.actorDoesntExists");
    let age = 0;
    if (actor) {
      name = actor.name;
      age = actor.getCSData().age;
    }
    return { name: name, age: age };
  }

  _updateResourceTotal(data, resource) {
    data[resource].total =
      data[resource].startingValue + this._getAllEventModifiers(resource);
    LOGGER.debug(`the resource ${resource} total is: ${data[resource].total}`);
    return data[resource].total;
  }

  _updateAllResourcesTotal(data = undefined) {
    if (!data) data = this.getCSData();

    this._updateResourceTotal(data, "defense");
    this._updateResourceTotal(data, "influence");
    this._updateResourceTotal(data, "lands");
    this._updateResourceTotal(data, "law");
    this._updateResourceTotal(data, "population");
    this._updateResourceTotal(data, "power");
    this._updateResourceTotal(data, "wealth");

    this.update({
      "system.defense": data.defense,
      "system.influence": data.influence,
      "system.lands": data.lands,
      "system.law": data.law,
      "system.population": data.population,
      "system.power": data.power,
      "system.wealth": data.wealth,
    });
  }

  _getAllEventModifiers(resource) {
    let items = this.items.contents;
    let events = items.filter((item) => item.type === "event");
    let modifier = 0;
    events.forEach((event) => {
      modifier += event.getCSData().modifiers[resource];
    });
    return modifier;
  }

  getPopulationModifier() {
    let data = this.getCSData();
    let lastMod;
    ChronicleSystem.populationModifiers.forEach((mod) => {
      if (data.population.total >= mod.min) {
        lastMod = mod.mod;
      }
    });
    return lastMod;
  }

  getLawModifier() {
    let data = this.getCSData();
    let lastMod;
    ChronicleSystem.lawModifiers.forEach((mod) => {
      if (data.law.total >= mod.min) {
        lastMod = mod.mod;
      }
    });
    return lastMod;
  }

  getHoldingsDice() {
    let holdings = this.items.contents.filter(
      (item) => item.type === "holding"
    );
    let modifier = 0;
    holdings
      .filter(
        (holding) =>
          !!holding.system.fortuneDice &&
          !isNaN(holding.system.fortuneDice.split(/[d|D]/)[0])
      )
      .forEach((holding) => {
        modifier += +holding.system.fortuneDice.split(/[d|D]/)[0];
      });
    return modifier;
  }

  getHoldingsModifier() {
    let holdings = this.items.contents.filter(
      (item) => item.type === "holding"
    );
    let modifier = 0;
    holdings
      .filter(
        (holding) =>
          !!holding.system.fortuneModifier &&
          !isNaN(holding.system.fortuneModifier)
      )
      .forEach((holding) => {
        modifier += +holding.system.fortuneModifier;
      });
    return modifier;
  }
}

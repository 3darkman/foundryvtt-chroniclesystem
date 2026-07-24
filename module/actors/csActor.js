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
import {
  computeXp,
  disciplineFor,
  movementProfileFor,
  pickEffectivePrimaryType,
  powerCostFor,
  unitTypeSlug,
} from "../vocabulary/cs-warfare.js";
import { warfareMovementStyle } from "../system/settings.js";

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
    // spec 025 (US1) — the Unit's rule-derived Health/Power Cost/Discipline/XP.
    if (this.type === "unit") this.calculateUnitDerivedValues();
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

  /**
   * @override — spec 024 (post-implement fix). `CSItem#_onCreate` provisions a
   * gained Ability's specialties, but it fires ONLY when the Item goes through
   * its OWN creation pipeline (`actor.createEmbeddedDocuments("Item", …)`).
   * When an Actor is instead created with its `items` supplied INLINE in the
   * actor's own creation payload — a compendium Actor drag-in, the sidebar's
   * "Duplicate", a JSON actor import, any `Actor.create({..., items: […]})` —
   * those embedded items are constructed as part of the ACTOR's own data model
   * and never run their individual `_preCreate`/`_onCreate` (verified against
   * the installed v14 bundle: `ClientDatabaseBackend#preCreateDocumentArray` /
   * `#handleCreateDocuments`, `foundry.mjs:80359-80479` — that pipeline, and the
   * `_dispatchDescendantDocumentEvents("onCreate", …)` cascade it feeds, only
   * run for documents created through their OWN class's `createDocuments`, not
   * for embedded data nested in a PARENT's create payload). Without this, an
   * actor arriving via any of those bulk paths keeps abilities with zero
   * specialties, permanently — there is no other trigger that would ever
   * provision them.
   *
   * Same guards as `CSItem#_onCreate`: `userId`-gated (this fires on every
   * connected client), character-only (FR-021). Idempotent per ability
   * (`provisionSpecialties` skips owned slugs), so this is a safe no-op for the
   * common case where the items DID arrive through the per-item hook already.
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.type !== "character") return;
    if (game.user?.id !== userId) return;
    for (const item of this.items) {
      if (item.type !== "ability") continue;
      import("./cs-specialty-provisioning.js")
        .then(({ provisionSpecialties }) => provisionSpecialties(this, item))
        .catch((err) =>
          console.warn(
            "chroniclesystem | specialty provisioning (actor create) skipped:",
            err
          )
        );
    }
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

    // spec 025 (contract unit-type-assignment.md C5) — removing a Unit Type
    // withdraws the abilities IT granted. Runs on one client only (`_onDelete*`
    // fires on every client that receives the broadcast).
    if (this.type === "unit") {
      if (game.user?.id === userId) this._removeGrantedAbilities(documents);
      return;
    }

    if (this.type !== "house") return;

    let isToUpdate = documents.find((doc) => doc.type === "event");

    if (isToUpdate) this._updateAllResourcesTotal();
  }

  /**
   * spec 025 (FR-003b) — drop the removed Unit Types' slugs from every granted
   * ability's provenance flag; delete the ability only once NO surviving type
   * grants it. An ability the GM dropped by hand carries no flag and is
   * therefore never touched. Freed XP re-derives on the next preparation.
   * @param {object[]} deletedDocuments the documents `_onDelete*` reported
   */
  async _removeGrantedAbilities(deletedDocuments) {
    const removedSlugs = deletedDocuments
      .filter((doc) => doc.type === "unitType")
      .map((doc) => unitTypeSlug(doc));
    if (!removedSlugs.length) return;

    const survivingSlugs = new Set(
      this.items
        .filter((item) => item.type === "unitType")
        .map((item) => unitTypeSlug(item))
    );

    const toUpdate = [];
    const toDelete = [];
    for (const ability of this.items.filter((i) => i.type === "ability")) {
      const grantedBy = ability.getFlag("chroniclesystem", "grantedBy") ?? [];
      if (!grantedBy.some((slug) => removedSlugs.includes(slug))) continue;
      const kept = grantedBy.filter((slug) => survivingSlugs.has(slug));
      if (kept.length) {
        toUpdate.push({
          _id: ability.id,
          "flags.chroniclesystem.grantedBy": kept,
        });
      } else {
        toDelete.push(ability.id);
      }
    }

    if (toUpdate.length) await this.updateEmbeddedDocuments("Item", toUpdate);
    if (toDelete.length) await this.deleteEmbeddedDocuments("Item", toDelete);
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
      data.derivedStats.health.value = this.calcHealthBase();
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

  /**
   * spec 025 (contract unit-derivation.md C1) — the rulebook Health base,
   * `Endurance × 3`. One home for the formula: the character writes it into
   * `derivedStats.health.value`, the unit into `system.health.max`.
   * @returns {number}
   */
  calcHealthBase() {
    return (this.getAbilityValueBySlug("endurance") || 0) * 3;
  }

  /**
   * spec 025 (contract unit-type-assignment.md C2) — the Unit Type whose
   * equipment the unit actually uses: the designated `primaryTypeSlug` while it
   * still matches an assigned type, else the oldest assigned type. A pure
   * derivation — nothing is persisted from a preparation path.
   * @returns {object|undefined} the embedded `unitType` item
   */
  effectivePrimaryType() {
    const entries = [];
    for (const item of this.items) {
      if (item.type !== "unitType") continue;
      entries.push({
        item,
        slug: unitTypeSlug(item),
        createdTime: item._stats?.createdTime,
      });
    }
    return pickEffectivePrimaryType(entries, this.getCSData().primaryTypeSlug)
      ?.item;
  }

  /**
   * spec 025 (contract unit-derivation.md C4/C4b/C8) — the Unit's rule-derived
   * values. Every one of them is computed, never stored: Health max from
   * Endurance, Power Cost and Discipline from the Training Level plus EVERY
   * assigned type, XP from the Training Level minus the ranks bought above the
   * base on the unit's own ability items.
   */
  calculateUnitDerivedValues() {
    const data = this.getCSData();
    const assignedTypes = this.items.filter((item) => item.type === "unitType");
    const abilities = this.items.filter((item) => item.type === "ability");

    data.health.max = Math.max(
      this.calcHealthBase() + this.getDerivedStatBonus(DERIVED_STATS.HEALTH),
      0
    );
    data.powerCost = powerCostFor(
      data.trainingLevel,
      assignedTypes.map((type) => type.getCSData().powerCost)
    );
    data.discipline = disciplineFor(
      data.trainingLevel,
      assignedTypes.map((type) => type.getCSData().disciplineModifier)
    );
    data.xp = computeXp(
      data.trainingLevel,
      abilities.map((ability) => ability.getCSData().rating)
    );
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

  /**
   * The read-side view of a Specialty item (spec 024, D2 / contract C2) — a
   * PLAIN object carrying exactly the four keys `resolveTraitBase` reads, never
   * the document itself (so nothing downstream can mutate a persisted item, and
   * `item.rating` — which lives under `item.system` — is never read as undefined).
   * One helper for both resolvers, so they can never disagree.
   * @param {object} item        a `type === "specialty"` item
   * @param {string} abilitySlug the owning ability's slug, for the slug fallback
   * @returns {{name: string, rating: number, modifier: number, slug: string}}
   */
  static specialtyAdapter(item, abilitySlug) {
    const data = item.getCSData?.() ?? item.system ?? {};
    return {
      name: item.name,
      rating: Number(data.rating) || 0,
      modifier: Number(data.modifier) || 0,
      slug: data.slug || scopedSpecialtySlug(abilitySlug, item.name),
    };
  }

  /**
   * Resolve `[ability, specialtyAdapter]` from an ability DISPLAY NAME and a
   * specialty display name — the pair the name-based roll chips carry
   * (`specialty:<specialty>:<ability>`), which is why name matching must survive.
   *
   * The `abilitySlug` scope is mandatory: "Charm" is both an Animal Handling and
   * a Persuasion specialty, and an unscoped name match would return the wrong one.
   *
   * When the specialty does NOT resolve, this returns `[undefined, undefined]`
   * even if the ability itself is owned — the pre-024 behaviour, kept verbatim
   * because `resolveTraitBase` only falls through to `getAbilityBySpecialtySlug`
   * while `ability === undefined` (`ChronicleSystem.js:1205`). Returning the
   * ability here would swallow that fallback and, for instance, stop
   * `calculateMovementData`'s `"athletics_run"` from resolving — a silent SC-002
   * parity break. The ability is re-resolved by the caller's own
   * `getAbility(abilityName)` step, so nothing is lost (contract C1 over C3.4).
   * @param {string} abilityName
   * @param {string} specialtyName
   */
  getAbilityBySpecialty(abilityName, specialtyName) {
    const wantedAbility = abilityName?.toString().toLowerCase();
    const ability = this.items.find(
      (item) =>
        item.type === "ability" && item.name.toLowerCase() === wantedAbility
    );
    if (!ability) return [undefined, undefined];

    const abilityData = ability.getCSData?.() ?? ability.system ?? {};
    const abilitySlug = abilityData.slug || slugify(ability.name);
    const wantedSpecialty = specialtyName?.toString().toLowerCase();
    const item = this.items.find(
      (candidate) =>
        candidate.type === "specialty" &&
        (candidate.getCSData?.() ?? candidate.system ?? {}).abilitySlug ===
          abilitySlug &&
        candidate.name?.toLowerCase() === wantedSpecialty
    );

    if (!item) return [undefined, undefined];
    return [ability, CSActor.specialtyAdapter(item, abilitySlug)];
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
   * Resolve a specialty by its SCOPED slug (`<abilitySlug>_<spec>`) — a FLAT scan
   * over the actor's Specialty items (spec 024, C4). The owning ability is
   * resolved AFTER, from the found item's own `abilitySlug`, so an ORPHAN (a
   * specialty whose ability the actor no longer owns) still resolves its value
   * and `resolveTraitBase` falls back to its untrained baseline, exactly as it
   * does today for an unowned ability.
   * @param {string} specialtySlug
   * @returns {[object|undefined, object|undefined]}
   */
  getAbilityBySpecialtySlug(specialtySlug) {
    const item = this.items.find((candidate) => {
      if (candidate.type !== "specialty") return false;
      const data = candidate.getCSData?.() ?? candidate.system ?? {};
      const slug =
        data.slug ||
        scopedSpecialtySlug(data.abilitySlug ?? "", candidate.name);
      return slug === specialtySlug;
    });
    if (!item) return [undefined, undefined];

    const abilitySlug =
      (item.getCSData?.() ?? item.system ?? {}).abilitySlug ?? "";
    const [ability] = this.getAbilityBySlug(abilitySlug);
    return [ability, CSActor.specialtyAdapter(item, abilitySlug)];
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

  /**
   * spec 025 (contract unit-derivation.md C5) — the per-type movement profile
   * the single arithmetic body below consumes. The character keeps its own base
   * + Athletics:Run bonus + halved bulk; a unit reads the edition setting and
   * delegates to the pure `movementProfileFor`. `null` means "no movement to
   * compute": a house has no movement block, a unit with no assigned type has no
   * equipment to move with.
   * @returns {{base: number, runBonus: number, bulkPenalty: number}|null}
   */
  movementProfile() {
    const data = this.getCSData();
    if (!data.movement) return null;
    const bulkTotal = this.getModifier(
      ChronicleSystem.modifiersConstants.BULK
    ).total;

    if (this.type === "unit") {
      const primaryType = this.effectivePrimaryType();
      if (!primaryType) return null;
      return movementProfileFor(
        primaryType.getCSData().category,
        bulkTotal,
        warfareMovementStyle()
      );
    }

    // Resolve Athletics:Run by canonical slug (scoped specialty) so movement
    // survives a rename; getActorAbilityFormula accepts a slug or a display name.
    const runFormula = ChronicleSystem.getActorAbilityFormula(
      this,
      "athletics",
      "athletics_run"
    );
    return {
      base: ChronicleSystem.defaultMovement,
      runBonus: Math.floor(runFormula.bonusDice / 2),
      bulkPenalty: Math.floor(bulkTotal / 2),
    };
  }

  calculateMovementData() {
    let data = this.getCSData();
    const profile = this.movementProfile();
    if (!profile) return;
    data.movement.base = profile.base;
    data.movement.runBonus = profile.runBonus;
    data.movement.bulk = profile.bulkPenalty;
    data.movement.total = Math.max(
      profile.base +
        profile.runBonus -
        profile.bulkPenalty +
        (parseInt(data.movement.modifier) || 0) +
        this.getDerivedStatBonus(DERIVED_STATS.MOVEMENT),
      1
    );
    // Sprint is a character concept; the unit's Sprint is an order action left to
    // the combat phase (spec 025 FR-008, Out of Scope).
    if (this.type === "unit") return;
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

  /**
   * spec 025 (contract house-power-allocation.md C1, FR-016) — the Power this
   * House's Units consume. A reverse scan over `game.actors` (the `getHouseRole`
   * precedent): the affiliation lives on the Unit alone, so the House stores no
   * back-reference (constitution §II). EVERY linked Unit counts — Phase 1 has no
   * active/inactive state — and a deleted Unit leaves the sum by simply not
   * being there. `Number(...) || 0` keeps a not-yet-derived Unit from poisoning
   * the total with NaN.
   * @returns {{allocated: number, units: Array<{id: string, name: string, powerCost: number}>}}
   */
  getUnitsPowerAllocated() {
    const units = [];
    let allocated = 0;
    for (const actor of game.actors ?? []) {
      if (actor.type !== "unit") continue;
      if (actor.system?.houseUuid !== this.uuid) continue;
      const powerCost = Number(actor.system.powerCost) || 0;
      allocated += powerCost;
      units.push({ id: actor.id, name: actor.name, powerCost });
    }
    return { allocated, units };
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

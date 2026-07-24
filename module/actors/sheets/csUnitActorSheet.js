import { CSActorSheet } from "./csActorSheet.js";
import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import SystemUtils from "../../utils/systemUtils.js";
import {
  LEADER_ROLES,
  TRAINING_LEVELS,
  unitTypeSlug,
} from "../../vocabulary/cs-warfare.js";
import { abilityBySlug } from "../../vocabulary/cs-specialty-catalog.js";
import { grantTypeAbilities } from "../cs-unit-type-provisioning.js";
import { canBeHero, canBeLeader } from "../cs-unit-relations.js";
import { pickWildcardAbilities } from "../../dialogs/cs-wildcard-abilities-dialog.js";
import { pickAttachRole } from "../../dialogs/cs-attach-character-dialog.js";
import { damageTotalFromFormula } from "../../items/csItem.js";
import {
  qualityDefinitionResolver,
  qualityRefRows,
} from "../../items/cs-quality-ref-rows.js";

const EQUIPMENT_WEAPONS = [
  {
    key: "fighting",
    abilitySlug: "fighting",
    damageKey: "fightingDamage",
    qualitiesKey: "fightingQualities",
    labelKey: "CS.sheets.unit.fightingDamage",
  },
  {
    key: "marksmanship",
    abilitySlug: "marksmanship",
    damageKey: "marksmanshipDamage",
    qualitiesKey: "marksmanshipQualities",
    labelKey: "CS.sheets.unit.marksmanshipDamage",
  },
];

export class CSUnitActorSheet extends CSActorSheet {
  itemTypesPermitted = ["unitType", "ability"];

  static DEFAULT_OPTIONS = {
    // `cs-v2` is what unlocks the SHARED component layer (cs-components.css:
    // cards, list rows, field grids, switches, chips, segmented controls — all
    // scoped `.cs-v2 …`). Without it only the tokens and the `.cs-sheet-v2`
    // shell resolve, and every card/list on this sheet renders unstyled.
    // CLAUDE.md, "Design System (v2)": give the window root
    // ["chroniclesystem", "cs-v2", "<window-name>"].
    classes: ["chroniclesystem", "unit", "sheet", "actor", "cs-v2"],
    position: { width: 897, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      setPrimaryType: CSUnitActorSheet._onSetPrimaryType,
      setLeaderRole: CSUnitActorSheet._onSetLeaderRole,
      clearLeader: CSUnitActorSheet._onClearLeader,
      removeHero: CSUnitActorSheet._onRemoveHero,
      clearHouse: CSUnitActorSheet._onClearHouse,
      openLinkedActor: CSUnitActorSheet._onOpenLinkedActor,
    },
  };

  static PARTS = {
    form: {
      template: "systems/chroniclesystem/templates/actors/units/unit-sheet.hbs",
      scrollable: [".sheet-body"],
    },
  };

  static TABS = {
    primary: {
      tabs: ["overview", "composition", "command", "description", "effects"],
      initial: "overview",
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.actor = actor;
    context.items = Array.from(actor.items);
    context.owner = actor.isOwner;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;

    const tokenSrc = actor.prototypeToken?.texture?.src;
    context.tokenImg =
      !tokenSrc || tokenSrc === CONST.DEFAULT_TOKEN ? actor.img : tokenSrc;

    const unit = actor.getCSData();
    context.unit = unit;
    context.trainingLabel = `CS.sheets.unit.trainingLevels.${unit.trainingLevel}`;
    context.trainingChoices = Object.fromEntries(
      TRAINING_LEVELS.map((level) => [
        level,
        `CS.sheets.unit.trainingLevels.${level}`,
      ])
    );

    context.powerCost = unit.powerCost ?? 0;
    context.discipline = unit.discipline ?? 0;
    context.xp = unit.xp ?? { total: 0, spent: 0, free: 0 };
    context.xpOverSpent = context.xp.free < 0;
    context.combatDefense = unit.derivedStats.combatDefense;
    context.hasMovement = !!actor.effectivePrimaryType();

    await this._prepareEquipmentContext(context, actor);
    this._prepareCompositionContext(context, actor);
    this._prepareCommandContext(context, actor);

    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    context.enrichedDescription = await TextEditorImpl.enrichHTML(
      unit.description || "",
      { async: true, relativeTo: actor }
    );

    this._prepareEffectsContext(context);
    context.tabs = this._getTabs();

    return context;
  }

  /**
   * spec 025 (contract unit-derivation.md C6/C9) — the Overview tab's Equipment
   * block, sourced from the EFFECTIVE PRIMARY Unit Type. Each weapon renders a
   * live roll chip (the ability test) plus the INTEGER damage total parsed from
   * the type's `@Ability±n` formula — never the raw formula string. Phase 1 reads
   * the STARTING equipment regardless of the evolve flags (they are inert).
   */
  async _prepareEquipmentContext(context, actor) {
    const primaryType = actor.effectivePrimaryType();
    if (!primaryType) {
      context.equipment = null;
      return;
    }

    const equipment = primaryType.getCSData().startingEquipment;
    const resolve = await qualityDefinitionResolver();
    const weapons = EQUIPMENT_WEAPONS.map((weapon) => {
      const [owned] = actor.getAbilityBySlug(weapon.abilitySlug);
      const abilityName =
        owned?.name ?? abilityBySlug(weapon.abilitySlug)?.name ?? "";
      return {
        key: weapon.key,
        label: weapon.labelKey,
        chip: abilityName
          ? ChronicleSystem.getRollChip(actor, `ability:${abilityName}`)
          : null,
        total: damageTotalFromFormula(actor, equipment[weapon.damageKey]),
        evolved: actor.getCSData().evolvedEquipment[weapon.key],
        // No list path: on the Unit sheet these chips are READ-ONLY. The list is
        // authored on the Unit Type item, and a bound input here would try to
        // write the type's data into the actor's own submit.
        qualities: qualityRefRows(equipment[weapon.qualitiesKey], resolve, ""),
      };
    });

    context.equipment = {
      typeName: primaryType.name,
      armor: equipment.armor,
      armorEvolved: actor.getCSData().evolvedEquipment.armor,
      weapons,
    };
  }

  /**
   * spec 025 — the Composition tab: the assigned Unit Types (the effective
   * primary marked, each listing what it grants) and the Unit's own abilities.
   * Both are read live from the embedded items — nothing is snapshotted.
   */
  _prepareCompositionContext(context, actor) {
    const primaryType = actor.effectivePrimaryType();
    context.unitTypes = actor.items
      .filter((item) => item.type === "unitType")
      .map((item) => ({
        id: item.id,
        name: item.name,
        slug: unitTypeSlug(item),
        isPrimary: item.id === primaryType?.id,
        powerCost: item.getCSData().powerCost,
        disciplineModifier: item.getCSData().disciplineModifier,
        grantedNames: (item.getCSData().grantedAbilities ?? [])
          .map((granted) => granted.name || granted.slug)
          .filter(Boolean),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    context.unitAbilities = actor.items
      .filter((item) => item.type === "ability")
      .map((item) => ({
        id: item.id,
        name: item.name,
        rating: item.getCSData().rating,
        chip: ChronicleSystem.getRollChip(actor, `ability:${item.name}`),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _getTabs() {
    const tabGroup = this.constructor.TABS.primary;
    const activeTab = this.tabGroups?.primary ?? tabGroup.initial;
    return tabGroup.tabs.reduce((tabs, tab) => {
      tabs[tab] = { active: tab === activeTab };
      return tabs;
    }, {});
  }

  /**
   * spec 025 (contract unit-relations.md C2/C3/C5) — the Command tab. Every
   * reference is a stored uuid resolved LIVE, so a rename shows immediately and
   * a deleted actor simply stops resolving (never an error, never a broken row).
   * Heroes are sorted by their live name and a hero whose uuid equals the
   * leader's is filtered out, so a pre-existing conflicting pair can never even
   * display as both.
   */
  _prepareCommandContext(context, actor) {
    const unit = actor.getCSData();
    const resolve = (uuid) =>
      uuid ? foundry.utils.fromUuidSync(uuid) ?? null : null;

    const leaderActor = resolve(unit.leader.uuid);
    context.leader = leaderActor
      ? {
          uuid: unit.leader.uuid,
          name: leaderActor.name,
          img: leaderActor.img,
          role: unit.leader.role,
          roleLabel: `CS.sheets.unit.leaderRoles.${unit.leader.role}`,
        }
      : null;
    context.leaderRoles = LEADER_ROLES.map((role) => ({
      role,
      label: `CS.sheets.unit.leaderRoles.${role}`,
      selected: unit.leader.role === role,
    }));

    context.attachedHeroes = (unit.attachedHeroes ?? [])
      .filter((hero) => hero.uuid && hero.uuid !== unit.leader.uuid)
      .map((hero) => ({ uuid: hero.uuid, actor: resolve(hero.uuid) }))
      .filter((hero) => hero.actor)
      .map((hero) => ({
        uuid: hero.uuid,
        name: hero.actor.name,
        img: hero.actor.img,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );

    const houseActor = resolve(unit.houseUuid);
    context.house = houseActor
      ? { uuid: unit.houseUuid, name: houseActor.name, img: houseActor.img }
      : null;
  }

  isItemPermitted(type) {
    return this.itemTypesPermitted.includes(type);
  }

  /**
   * @override — the Composition tab's rating inputs carry NO `name`, so
   * `FormDataExtended` skips them and the ACTOR's submit never sees them (V2 has
   * no native way to route a field to an embedded document). One delegated
   * `change` listener routes each edit to its own Ability item, which re-renders
   * the sheet and re-derives the XP economy. `stopPropagation` prevents the
   * form's own listener from firing a redundant `update({})` on the actor.
   */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    htmlElement.addEventListener("change", (event) => {
      const input = event.target?.closest?.(
        ".cs-unit-ability-rating[data-item-id]"
      );
      if (!input) return;
      event.stopPropagation();
      if (!this.actor.isOwner || !this.isEditable) return;
      const ability = this.actor.items.get(input.dataset.itemId);
      if (!ability) return;
      ability.update({
        "system.rating": Math.max(Math.trunc(Number(input.value) || 0), 0),
      });
    });
  }

  /**
   * @override — spec 025 (contract unit-type-assignment.md C3). A Unit Type is
   * deduped by its STABLE SLUG, not by name (the inherited guard), so the same
   * type can never be assigned twice and its Power Cost never counted twice.
   * The wildcard picker runs BEFORE the item is minted, so cancelling it aborts
   * the whole assignment and leaves nothing behind. Assigning the first type
   * also designates it as primary.
   */
  async _onDropItem(event, item) {
    if (item?.type !== "unitType") return super._onDropItem(event, item);
    if (!this.actor.isOwner || !this.isEditable) return null;

    const slug = unitTypeSlug(item);
    const alreadyAssigned = this.actor.items.some(
      (owned) => owned.type === "unitType" && unitTypeSlug(owned) === slug
    );
    if (alreadyAssigned) return null;

    let wildcardSlugs = [];
    const wildcardCount = Number(item.system?.wildcardAbilityCount) || 0;
    if (wildcardCount > 0) {
      wildcardSlugs = await pickWildcardAbilities(wildcardCount);
      if (wildcardSlugs === null) return null;
    }

    const created = await super._onDropItem(event, item);
    if (!this.actor.system.primaryTypeSlug) {
      await this.actor.update({ "system.primaryTypeSlug": slug });
    }
    await grantTypeAbilities(
      this.actor,
      slug,
      item.system?.grantedAbilities ?? [],
      wildcardSlugs
    );
    return created;
  }

  /**
   * @override — spec 025 (contract unit-relations.md C6). No visible drop zone:
   * routing is by the dropped actor's TYPE. A character opens the attach dialog
   * (Leader vs Attached Hero); a house fills the single House slot; anything
   * else is a no-op. Both character paths re-check the mutual-exclusion rule at
   * the write site — the dialog is convenience, the guard is the invariant.
   */
  async _onDropActor(event, actor) {
    if (!this.actor.isOwner || !this.isEditable) return null;

    if (actor?.type === "house") {
      await this.actor.update({ "system.houseUuid": actor.uuid });
      return actor;
    }
    if (actor?.type !== "character") return null;

    const role = await pickAttachRole(actor);
    if (role === "leader") return this._setLeader(actor);
    if (role === "hero") return this._addHero(actor);
    return null;
  }

  async _setLeader(actor) {
    if (!canBeLeader(this.actor.system, actor.uuid)) {
      ui.notifications?.warn(
        SystemUtils.localize("CS.sheets.unit.warnings.alreadyHero")
      );
      return null;
    }
    await this.actor.update({
      "system.leader": {
        uuid: actor.uuid,
        role: this.actor.system.leader.role,
      },
    });
    return actor;
  }

  async _addHero(actor) {
    if (!canBeHero(this.actor.system, actor.uuid)) {
      ui.notifications?.warn(
        SystemUtils.localize("CS.sheets.unit.warnings.alreadyLeader")
      );
      return null;
    }
    const heroes = foundry.utils.deepClone(
      this.actor.system.attachedHeroes ?? []
    );
    heroes.push({ uuid: actor.uuid });
    await this.actor.update({ "system.attachedHeroes": heroes });
    return actor;
  }

  /** Action: switch the leader between Commander and Sub-commander. */
  static async _onSetLeaderRole(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner || !this.isEditable) return;
    const role = target.dataset.role;
    if (!LEADER_ROLES.includes(role)) return;
    await this.actor.update({ "system.leader.role": role });
  }

  /** Action: unlink the leader, leaving the Unit with none (a valid state). */
  // eslint-disable-next-line no-unused-vars
  static async _onClearLeader(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner || !this.isEditable) return;
    await this.actor.update({
      "system.leader": { uuid: "", role: LEADER_ROLES[0] },
    });
  }

  /** Action: detach one hero. The WHOLE array is replaced (ArrayField has no
   *  indexed sub-path update). */
  static async _onRemoveHero(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner || !this.isEditable) return;
    const uuid = target.dataset.uuid;
    const heroes = (this.actor.system.attachedHeroes ?? []).filter(
      (hero) => hero.uuid !== uuid
    );
    await this.actor.update({ "system.attachedHeroes": heroes });
  }

  /** Action: unaffiliate the Unit from its House (a valid, permanent state). */
  // eslint-disable-next-line no-unused-vars
  static async _onClearHouse(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner || !this.isEditable) return;
    await this.actor.update({ "system.houseUuid": "" });
  }

  /** Action: open a linked actor's sheet. Viewing — not owner-gated. An
   *  unresolvable uuid is an inert link, never an error. */
  static async _onOpenLinkedActor(event, target) {
    event.preventDefault();
    const linked = target.dataset.uuid
      ? foundry.utils.fromUuidSync(target.dataset.uuid)
      : null;
    linked?.sheet?.render({ force: true });
  }

  /**
   * Action: designate an assigned Unit Type as the primary one (contract C4).
   * The single update re-derives the actor, so equipment, Defence and Movement
   * follow within the same interaction. A stale click (a slug the Unit no longer
   * owns) is ignored.
   * @param {Event} event
   * @param {HTMLElement} target carries data-type-slug
   */
  static async _onSetPrimaryType(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner || !this.isEditable) return;
    const slug = target.dataset.typeSlug;
    const owned = this.actor.items.some(
      (item) => item.type === "unitType" && unitTypeSlug(item) === slug
    );
    if (!owned) return;
    await this.actor.update({ "system.primaryTypeSlug": slug });
  }
}

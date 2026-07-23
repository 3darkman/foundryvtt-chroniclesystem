import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import LOGGER from "../../utils/logger.js";
import {
  buildEffectContext,
  buildNewEffectData,
  canUserModifyEffect,
} from "../../effects/cs-active-effect.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class CSActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["chroniclesystem", "sheet", "actor"],
    form: {
      submitOnChange: true,
    },
    actions: {
      editItem: CSActorSheet._onEditItem,
      rollDice: CSActorSheet._onRollDice,
      toggleDescription: CSActorSheet._onToggleDescription,
      effectCreate: CSActorSheet._onEffectCreate,
      effectEdit: CSActorSheet._onEffectEdit,
      effectDelete: CSActorSheet._onEffectDelete,
      effectToggle: CSActorSheet._onEffectToggle,
    },
  };

  /**
   * Populate `context.effects` for the shared effects tab. Lists ALL applied
   * effects — the actor's own AND those transferred from owned items — so the
   * "Source" column can show the real origin (design §7). Item-borne effects are
   * read-only here for non-GMs (lock icon); they are edited on the item.
   */
  _prepareEffectsContext(context) {
    // allApplicableEffects (NOT appliedEffects) so DISABLED and suppressed effects
    // still show — appliedEffects drops inactive ones, which would make a toggled-
    // off effect vanish with no way to re-enable it. The collector uses
    // appliedEffects (it must skip inactive); the UI must list all of them.
    context.effects = Array.from(this.actor.allApplicableEffects()).map((e) =>
      buildEffectContext(e, game.user, this.actor)
    );
    return context;
  }

  /** Resolve an effect by id across the actor's own + transferred (item) effects. */
  _resolveEffect(id) {
    return (
      this.actor.effects.get(id) ??
      Array.from(this.actor.allApplicableEffects()).find((e) => e.id === id) ??
      null
    );
  }

  /** Action: create a new Active Effect on this actor. */
  // eslint-disable-next-line no-unused-vars
  static async _onEffectCreate(event, target) {
    await this.actor.createEmbeddedDocuments("ActiveEffect", [
      buildNewEffectData(this.actor, game.user),
    ]);
  }

  /** Action: open an effect's config sheet (own or transferred). */
  static _onEffectEdit(event, target) {
    const effect = this._resolveEffect(target.dataset.effectId);
    if (effect) effect.sheet.render(true);
  }

  /** Action: delete an effect (permission-guarded; operates on its real parent). */
  static async _onEffectDelete(event, target) {
    const effect = this._resolveEffect(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) await effect.delete();
  }

  /** Action: toggle an effect's disabled state (permission-guarded). */
  static async _onEffectToggle(event, target) {
    const effect = this._resolveEffect(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) {
      await effect.update({ disabled: !effect.disabled });
    }
  }

  static PARTS = {};

  // Remembers the `.sheet-body` scroll offset across re-renders. `submitOnChange`
  // re-renders the whole part on every field edit; the native `scrollable`
  // part-state sync restores scroll *inside* _replaceHTML — before _onRender
  // re-activates the tab — and re-activating the tab changes the body height,
  // which clamps the freshly-restored offset back to 0. So we track it ourselves
  // and restore it AFTER changeTab, once the active tab is visible and measured.
  #bodyScrollTop = 0;

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Re-apply active tab state after each render
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      this.changeTab(tab, group, { force: true, updatePosition: false });
    }
    // Restore the body scroll now that the active tab is laid out, then keep
    // tracking it. Setting scrollTop before attaching the listener avoids the
    // assignment feeding a clamped value straight back into #bodyScrollTop.
    const body = this.element?.querySelector(".sheet-body");
    if (body) {
      body.scrollTop = this.#bodyScrollTop;
      body.addEventListener("scroll", () => {
        this.#bodyScrollTop = body.scrollTop;
      });
    }
  }

  // eslint-disable-next-line no-unused-vars
  async _onDropActor(event, actor) {
    LOGGER.trace("On Drop Actor | CSActorSheet | csActorSheet.js");
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
  }

  static _onToggleDescription(event, target) {
    event.preventDefault();
    const description = target.closest(".item").querySelector(".description");
    if (description) description.classList.toggle("hidden");
  }

  static _onEditItem(event, target) {
    event.preventDefault();
    const item = this.actor.items.get(target.closest(".item").dataset.itemId);
    if (item) item.sheet.render({ force: true });
  }

  static async _onRollDice(event, target) {
    event.preventDefault();
    let showModifierDialog = false;
    if (event.shiftKey) {
      showModifierDialog = true;
    }
    const rollType = target.id;
    // spec 010: thread the weapon/technique context (data-* on the chip) so the
    // roll can derive the target's difficulty/modifiers. Absent → an ordinary
    // roll (kind null), retrocompatible with every non-conflict chip.
    const rollContext = {
      kind: target.dataset.rollKind ?? null,
      itemId: target.dataset.itemId ?? null,
      techniqueSlug: target.dataset.technique ?? null,
      influenceValue:
        target.dataset.influence != null
          ? Number(target.dataset.influence)
          : null,
    };
    await ChronicleSystem.handleRollAsync(
      rollType,
      this.actor,
      showModifierDialog,
      rollContext
    );
  }

  // eslint-disable-next-line no-unused-vars
  isItemPermitted(type) {
    return true;
  }

  splitItemsByType(data) {
    data.itemsByType = {};
    for (const item of this.actor.getEmbeddedCollection("Item")) {
      let list = data.itemsByType[item.type];
      if (!list) {
        list = [];
        data.itemsByType[item.type] = list;
      }
      list.push(item);
    }
  }

  _checkNull(items) {
    if (items && items.length) {
      return items;
    }
    return [];
  }

  async _onDropItem(event, item) {
    if (!this.actor.isOwner) return null;

    // If the item already belongs to this actor, handle sorting
    if (this.actor.uuid === item.parent?.uuid) {
      return this._onSortItem(event, item);
    }

    // Check for duplicate items by name AND type. Weapons are allowed to stack
    // as separate items, so a second weapon of the same name is not merged into
    // the existing one.
    //
    // The `type` half is spec 024 (D9): the guard used to match by name ACROSS
    // types, so dropping the Persuasion "Charm" onto a character who already
    // owned anything named "Charm" (the Animal Handling specialty, a technique,
    // a benefit) silently returned that item instead of creating the specialty.
    // With 76 specialties and deliberate cross-ability name reuse, that stops
    // being a corner case.
    //
    // `type` alone is NOT enough for a specialty: two DIFFERENT specialties can
    // share both a name AND the type "specialty" — the very "Charm" example
    // above is itself type-identical on both sides (Animal Handling's Charm vs
    // Persuasion's Charm). Post-024 a fully-provisioned character owns BOTH, so
    // this is not a corner case either — it must also match `abilitySlug` when
    // the dropped item is a specialty.
    const existingItem = this.actor.items.find((i) => {
      if (i.name !== item.name || i.type !== item.type) return false;
      if (item.type === "specialty") {
        return i.system?.abilitySlug === item.system?.abilitySlug;
      }
      return true;
    });
    if (existingItem && item.type !== "weapon") {
      return existingItem;
    }

    // Check if item type is permitted
    if (!this.isItemPermitted(item.type)) return null;

    // Create the embedded item
    const created = await this.actor.createEmbeddedDocuments("Item", [
      item.toObject(),
    ]);
    if (created && created.length > 0) {
      created.forEach((createdItem) => {
        createdItem.onObtained(createdItem.actor);
      });
    }

    return created;
  }
}

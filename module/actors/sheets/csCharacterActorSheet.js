/**
 * Extend the basic ActorSheetV2 with character-specific modifications
 * @extends {CSActorSheet}
 */
import { ChronicleSystem } from "../../system/ChronicleSystem.js";
import { Technique } from "../../technique.js";
import { CSActorSheet } from "./csActorSheet.js";
import LOGGER from "../../utils/logger.js";
import SystemUtils from "../../utils/systemUtils.js";
import { CSConstants } from "../../system/csConstants.js";
import { INTRIGUE_TECHNIQUES } from "../../vocabulary/cs-intrigue-techniques.js";
import {
  influenceFor,
  weaponHasQualityLever,
} from "../../effects/cs-effect-modifiers.js";
import { weaponWieldingFlags } from "../../effects/cs-effect-vocabulary.js";
import { CSPublicCharacterSheet } from "./csPublicCharacterSheet.js";
import {
  PUBLIC_VISIBILITY_FIELDS,
  PUBLIC_VISIBILITY_KEYS,
} from "../../system/public-visibility.js";

// spec 022 (FR-022) — the one-line relationship-note preview budget, in
// characters. A named constant, not a magic number (Clean Code §I).
const NOTE_PREVIEW_MAX = 82;

export class CSCharacterActorSheet extends CSActorSheet {
  itemTypesPermitted = [
    "ability",
    "weapon",
    "armor",
    "equipment",
    "benefit",
    "drawback",
    "technique",
    "unitType",
  ];

  // spec 012 (US2): transient "configure public sheet" mode — UI-only, never
  // persisted, off on each open (FR-018). Flipped by the togglePubMode action.
  _pubMode = false;

  // spec 022 (US3, L-2): MutationObserver enforcing one open relationship-note
  // editor at a time. The <prose-mirror> `open` event does NOT bubble (core
  // bug), so single-open is coordinated by observing the reflected `open`
  // attribute instead of event delegation. Reconnected each render.
  #relNoteObserver = null;

  static DEFAULT_OPTIONS = {
    classes: ["chroniclesystem", "character", "sheet", "actor"],
    position: { width: 750, height: 900 },
    window: { resizable: true },
    actions: {
      changeDisposition: CSCharacterActorSheet._onDispositionChanged,
      toggleEquipped: CSCharacterActorSheet._onEquippedStateChanged,
      defensiveStance: CSCharacterActorSheet._onDefensiveStance, // spec 020 (FR-030)
      createInjury: CSCharacterActorSheet._onClickInjuryCreate,
      deleteInjury: CSCharacterActorSheet._onClickInjuryDelete,
      createWound: CSCharacterActorSheet._onClickWoundCreate,
      deleteWound: CSCharacterActorSheet._onClickWoundDelete,
      clickSquare: CSCharacterActorSheet._onClickSquare,
      openHouse: CSCharacterActorSheet._onOpenHouse,
      viewPublicSheet: CSCharacterActorSheet._onViewPublicSheet,
      togglePubMode: CSCharacterActorSheet._onTogglePubMode,
      toggleFieldVisibility: CSCharacterActorSheet._onToggleFieldVisibility,
      // spec 022 — Relationships tab (US1/US2)
      openRelationshipSheet: CSCharacterActorSheet._onOpenRelationshipSheet,
      removeRelationship: CSCharacterActorSheet._onRemoveRelationship,
      setRelDisposition: CSCharacterActorSheet._onSetRelDisposition,
      // NOTE: `editImage` (portrait) and `configurePrototypeToken` (header
      // avatar) are inherited from DocumentSheetV2/ActorSheetV2 and merged in
      // additively — no need to redeclare them here.
    },
  };

  static PARTS = {
    form: {
      template:
        "systems/chroniclesystem/templates/actors/characters/character-sheet.hbs",
      // The scroll container is `.sheet-body` (the only overflow-y:auto element),
      // a descendant of the part. An empty selector targets the part root — the
      // `[data-application-part]` wrapper, which is overflow:hidden — so its
      // scrollTop is always 0 and nothing gets restored, resetting the scroll to
      // the top on every submitOnChange re-render. Point it at the real scroller.
      scrollable: [".sheet-body"],
    },
  };

  static TABS = {
    primary: {
      tabs: [
        "abilities",
        "combat-and-intrigue",
        "qualities",
        "sorcery",
        "equipments",
        "actor-description",
        "relationships",
        "effects",
      ],
      initial: "abilities",
    },
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dtypes = ["String", "Number", "Boolean"];

    // Provide backward-compatible template variables
    const actor = this.document;
    context.actor = actor;
    context.items = Array.from(actor.items);
    context.owner = actor.isOwner;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;

    // Header avatar shows the prototype token art (falls back to the portrait
    // when the token is still the default mystery-man); clicking it opens the
    // prototype token config (inherited `configurePrototypeToken` action).
    const tokenSrc = actor.prototypeToken?.texture?.src;
    context.tokenImg =
      !tokenSrc || tokenSrc === CONST.DEFAULT_TOKEN ? actor.img : tokenSrc;

    // Split items by type (reuse base class helper)
    this.splitItemsByType(context);

    let character = actor.getCSData();

    character.owned.equipments = this._checkNull(
      context.itemsByType["equipment"]
    );
    character.owned.weapons = this._checkNull(context.itemsByType["weapon"]);
    character.owned.armors = this._checkNull(context.itemsByType["armor"]);
    character.owned.benefits = this._checkNull(context.itemsByType["benefit"]);
    character.owned.drawbacks = this._checkNull(
      context.itemsByType["drawback"]
    );
    character.owned.abilities = this._checkNull(
      context.itemsByType["ability"]
    ).sort((a, b) => a.name.localeCompare(b.name));
    character.owned.techniques = this._checkNull(
      context.itemsByType["technique"]
    ).sort((a, b) => a.name.localeCompare(b.name));

    context.dispositions = ChronicleSystem.dispositions;

    context.notEquipped = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED;

    context.techniquesTypes = CSConstants.TechniqueType;
    context.techniquesCosts = CSConstants.TechniqueCost;

    character.owned.weapons.forEach((weapon) => {
      let weaponData = weapon.system;
      let info = weaponData.specialty.split(":");
      if (info.length < 2) return "";
      let formula = ChronicleSystem.getActorAbilityFormula(
        actor,
        info[0],
        info[1]
      );
      formula = ChronicleSystem.adjustFormulaByWeapon(actor, formula, weapon);
      weapon.updateDamageValue(this.actor);
      // spec 017 (US2): the weapon test chip through the SSOT utility, using the
      // SAME rollId string the Combat + Equipments templates built — so the same
      // weapon renders an identical formula in both windows (FR-008).
      weapon.weaponChip = ChronicleSystem.getRollChip(
        actor,
        `weapon-test:${weapon.name}:${formula.toStr()}`
      );
      // spec 020 — the out-of-combat Defensive stance toggle (FR-030). Stance is
      // ON unless the flag is exactly `false`. Narrative reminders are NOT repeated
      // here: the quality chip already shows the name; the reminder note surfaces on
      // the roll RESULT card instead (FR-018).
      weapon.hasDefensive = weaponHasQualityLever(
        weapon,
        "defensewhilewielded"
      );
      weapon.stanceActive =
        weapon.getFlag("chroniclesystem", "defensiveStance") !== false;
    });

    // spec 017 (US2): the ability + specialty chips through the one SSOT utility
    // (getRollChip), so every chip's DISPLAYED formula equals its effective quick
    // roll (paridade chip↔jogada, FR-001/SC-001). The rollId strings match what
    // the abilities template built (`ability:{name}` / `specialty:{spec}:{ability}`).
    // spec 023 (US1): the PASSIVE value rides the SAME loop — no second
    // traversal (D3). Transient, read-only, never submitted (no `name`) and
    // never rollable (no `data-action`); recomputed on every render like the
    // chips beside it.
    character.owned.abilities.forEach((ability) => {
      ability.abilityChip = ChronicleSystem.getRollChip(
        actor,
        `ability:${ability.name}`
      );
      ability.passive = ChronicleSystem.getActorPassiveValue(
        actor,
        ability.name
      );
      for (const specialty of Object.values(ability.system.specialties ?? {})) {
        if (!specialty.rating) continue;
        specialty.specialtyChip = ChronicleSystem.getRollChip(
          actor,
          `specialty:${specialty.name}:${ability.name}`
        );
        specialty.passive = ChronicleSystem.getActorPassiveValue(
          actor,
          ability.name,
          specialty.name
        );
      }
    });

    // spec 017 (US2): each sorcery-work test chip through the SSOT utility. The
    // rollId is `formula:{ability}:{toStr}` — the SAME string the sorcery template
    // built — so the displayed formula equals the effective quick roll.
    // spec 021 (US4, D21) — a sorcery test value is now an `Ability` or
    // `Ability:Specialty` dropdown value; split it (mirrors the weapon path) so the
    // specialty feeds the formula. The rollId's title segment must be colon-free
    // (the id is `:`-split), so a specialty value is shown space-joined; the
    // executed formula string is unchanged.
    const sorceryChip = (value) => {
      const [ability, specialty = null] = String(value ?? "").split(":");
      const f = ChronicleSystem.getActorAbilityFormula(
        actor,
        ability,
        specialty ?? null
      );
      const title = specialty ? `${ability} ${specialty}` : ability;
      return ChronicleSystem.getRollChip(
        actor,
        `formula:${title}:${f.toStr()}`
      );
    };
    character.owned.techniques.forEach((technique) => {
      let techniqueData = technique.system;
      let works = (context.currentInjuries = Object.values(
        techniqueData.works
      ));
      works.forEach((work) => {
        if (work.type === "SPELL") {
          work.test.spellcastingChip = sorceryChip(work.test.spellcasting);
        } else {
          work.test.alignmentChip = sorceryChip(work.test.alignment);
          work.test.invocationChip = sorceryChip(work.test.invocation);
          work.test.unleashingChip = sorceryChip(work.test.unleashing);
        }
      });
    });

    this._calculateIntrigueTechniques(context, actor);

    context.currentInjuries = character.injuries
      ? Object.values(character.injuries).length
      : 0;
    context.currentWounds = character.wounds
      ? Object.values(character.wounds).length
      : 0;
    context.maxInjuries = this.actor.getMaxInjuries();
    context.maxWounds = this.actor.getMaxWounds();
    context.houseRole = this.actor.getHouseRole();
    context.character = character;

    // spec 012 (US2/US3): owner-gated configure-public-sheet controls. `_pubMode`
    // is transient UI state (never persisted, off on each open — FR-018). The
    // per-field map drives the clickable eye (config mode) and the passive HIDDEN
    // indicator (outside it). Non-owners receive none of this (FR-015), keyed by
    // the shared eleven-field list (FR-011, module/system/public-visibility.js).
    if (actor.isOwner) {
      const pubMode = this._pubMode === true;
      const pv = character.publicVisibility ?? {};
      const pub = {};
      for (const field of PUBLIC_VISIBILITY_FIELDS) {
        const on = pv[field.key] === true;
        pub[field.key] = {
          on,
          hidden: !on,
          showBtn: pubMode,
          showPill: !pubMode && !on,
          word: SystemUtils.localize(
            on
              ? "CS.sheets.character.visibility.public"
              : "CS.sheets.character.visibility.hidden"
          ),
        };
      }
      context.pub = pub;
      context.pubMode = pubMode;
      context.pubLabel = SystemUtils.localize(
        pubMode
          ? "CS.sheets.character.visibility.done"
          : "CS.sheets.character.visibility.configure"
      );
    }

    // Pre-enrich HTML descriptions for benefit and drawback items
    const rollData = this.actor.getRollData();
    const enrichOpts = { async: true, rollData };
    for (const item of [
      ...character.owned.benefits,
      ...character.owned.drawbacks,
    ]) {
      if (item.system.description) {
        item.system.description =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            item.system.description,
            enrichOpts
          );
      }
    }

    // Pre-enrich HTML descriptions for technique works
    for (const technique of character.owned.techniques) {
      const works = Object.values(technique.system.works);
      for (const work of works) {
        if (work.description) {
          work.description =
            await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              work.description,
              enrichOpts
            );
        }
      }
    }

    // Pre-enrich editor fields for the description tab
    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    context.enrichedPersonalHistory = await TextEditorImpl.enrichHTML(
      character.personalHistory || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedAllies = await TextEditorImpl.enrichHTML(
      character.allies || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedEnemies = await TextEditorImpl.enrichHTML(
      character.enemies || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedOaths = await TextEditorImpl.enrichHTML(
      character.oaths || "",
      { async: true, relativeTo: actor }
    );
    context.enrichedMotto = await TextEditorImpl.enrichHTML(
      character.motto || "",
      { async: true, relativeTo: actor }
    );

    // spec 022 — Relationships tab card projection. Identity/subtitle/order are
    // DERIVED live every render from the resolved target (SSOT, FR-003/011/032);
    // nothing derived is stored. References resolve orphan-safe (null guard,
    // FR-014, SC-006) — NEVER the House sheet's unguarded crash. `disp` is read
    // here ONLY for display; no roll/intrigue path reads it (FR-020, D-4).
    await this._prepareRelationshipsContext(context, actor, TextEditorImpl);

    // Effects tab (shared across all actor types)
    this._prepareEffectsContext(context);

    // Prepare tab state
    context.tabs = this._getTabs();

    return context;
  }

  /**
   * Prepare tabs data for template rendering.
   * @returns {object} Tab group configuration with active states.
   */
  _getTabs() {
    const tabGroup = this.constructor.TABS.primary;
    const activeTab = this.tabGroups?.primary ?? tabGroup.initial;
    return tabGroup.tabs.reduce((tabs, tab) => {
      tabs[tab] = { active: tab === activeTab };
      return tabs;
    }, {});
  }

  /**
   * spec 022 — build the Relationships tab render context: section flags + the
   * per-card view-models (identity/subtitle/note derived live from the resolved
   * target). See contracts/relationship-card-context.md.
   * @param {object} context   the render context being populated
   * @param {Actor} actor      this sheet's actor
   * @param {object} TextEditorImpl  foundry.applications.ux.TextEditor.implementation
   */
  async _prepareRelationshipsContext(context, actor, TextEditorImpl) {
    const rawRels = actor.system.relationships ?? [];
    context.relCount = rawRels.length; // FULL count, filter-independent (FR-015)
    context.relHasAny = context.relCount > 0; // gates the search field (FR-026)
    // The 7-level ladder for the dropdown — rating + localized name only; colors
    // live in CSS keyed by data-disp (no color in JS, R-CTX-6).
    context.dispositionLevels = ChronicleSystem.dispositions.map((d) => ({
      rating: d.rating,
      name: SystemUtils.localize(d.name),
    }));

    const brokenLabel = SystemUtils.localize(
      "CS.sheets.character.relationships.brokenRef"
    );
    const noNote = SystemUtils.localize(
      "CS.sheets.character.relationships.noNote"
    );

    const cards = await Promise.all(
      rawRels.map(async (entry, index) => {
        const target = entry.uuid
          ? foundry.utils.fromUuidSync(entry.uuid)
          : null;
        const broken = !target;

        // Subtitle: the target's house + position, each visibility-gated
        // (FR-013). Observer+ sees both; otherwise only the fields the target
        // flagged public. Empty when neither is visible/present.
        let subtitle = "";
        if (target) {
          const canSee = target.testUserPermission(game.user, "OBSERVER");
          const pv = target.system.publicVisibility ?? {};
          const role = target.getHouseRole();
          if (role) {
            const parts = [];
            if (canSee || pv.house === true) parts.push(role.houseName);
            if (canSee || pv.position === true) {
              const pos = role.description
                ? `${role.role}/${role.description}`
                : role.role;
              if (pos) parts.push(pos);
            }
            subtitle = parts.join(" · ");
          }
        }

        // Disposition (US2): rating + localized level name; CSS colors by
        // data-disp. A garbage rating falls back to indifferent for the label.
        const disp = Number.isFinite(entry.disp) ? entry.disp : 4;
        const level = ChronicleSystem.dispositions.find(
          (d) => d.rating === disp
        );
        const dispName = SystemUtils.localize(
          level ? level.name : "CS.sheets.character.dispositions.indifferent"
        );

        // Note (US3): enriched HTML for display + a PLAIN-TEXT projection driving
        // the one-line preview, the tooltip, and search — never the raw HTML, so
        // tags/links can't leak into the preview or match a search (FR-021/022).
        const note = entry.note ?? "";
        const hasNote = note.trim().length > 0;
        const enrichedNote = hasNote
          ? await TextEditorImpl.enrichHTML(note, {
              async: true,
              relativeTo: actor,
            })
          : "";
        const notePlain =
          new DOMParser().parseFromString(note, "text/html").body.textContent ??
          "";
        const noteShort = hasNote
          ? TextEditorImpl.truncateText(notePlain, {
              maxLength: NOTE_PREVIEW_MAX,
              splitWords: true,
            })
          : noNote;

        const name = broken ? brokenLabel : target.name;
        // Pre-lowercased searchable text — VISIBLE subtitle only (never a hidden
        // field) + the plain-text note, so search matches content not tags and
        // never leaks a hidden subtitle portion (FR-027).
        const search = `${name} ${subtitle} ${notePlain}`.toLowerCase();

        return {
          index,
          uuid: entry.uuid,
          broken,
          name,
          img: broken ? CONST.DEFAULT_TOKEN : target.img,
          subtitle,
          disp,
          dispName,
          note,
          hasNote,
          enrichedNote,
          notePlain,
          noteShort,
          noteTitle: notePlain,
          search,
        };
      })
    );

    // Sort by live name, case-insensitive (FR-032); orphans by fallback label.
    // Re-sorts automatically on a target rename because `name` is derived.
    cards.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    context.relationships = cards;
  }

  /* -------------------------------------------- */

  /**
   * spec 022 (US1, FR-006/007/008/009/029) — add a relationship by dragging a
   * character actor onto the sheet. ActorSheetV2 supplies the drag-drop plumbing
   * and hands over an ALREADY-RESOLVED Actor document (not raw data), so this
   * override just guards and appends. Every write replaces the WHOLE array
   * (whole-array persistence — no indexed sub-path survives ArrayField._cast).
   * @param {DragEvent} event
   * @param {Actor} actor  the resolved dropped actor
   * @returns {Promise<Actor|null>}
   * @override
   */
  async _onDropActor(event, actor) {
    if (!this.actor.isOwner || !this.isEditable) return null; // FR-029
    if (actor?.type !== "character") return null; // FR-009 (ignore house/unit/non-actor)
    if (actor.uuid === this.actor.uuid) return null; // FR-008 (no self)
    const rels = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    if (rels.some((r) => r.uuid === actor.uuid)) return null; // FR-007 (no duplicate)
    rels.push({ uuid: actor.uuid, disp: 4, note: "" }); // FR-006 (default indifferent)
    await this.actor.update({ "system.relationships": rels });
    return actor;
  }

  _calculateIntrigueTechniques(data, actor) {
    // US4: the disposition delta + per-technique influence buffers written by the
    // collector — applied WITHOUT changing the selected disposition level
    // (FR-017/FR-018). Names + influence bases come from the canonical technique
    // source (SSOT), so the sheet and the effect authoring share ONE set of names.
    const dispositionDelta = actor.dispositionDelta ?? {
      persuasion: 0,
      deception: 0,
    };
    const influence = actor.influence ?? {};

    // Deception side (bluff/act) — shared by several techniques.
    const bluffFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      "deception",
      "deception_bluff"
    );
    const actFormula = ChronicleSystem.getActorAbilityFormula(
      actor,
      "deception",
      "deception_act"
    );
    const intimidateDeceptionFormula =
      actFormula.bonusDice + actFormula.modifier >
      bluffFormula.bonusDice + bluffFormula.modifier
        ? actFormula
        : bluffFormula;

    // The deception formula each technique pairs with (a Chronicle System rule
    // mapping, not part of the canonical technique source — kept local).
    const deceptionByTechnique = {
      bargain: bluffFormula,
      charm: actFormula,
      convince: actFormula,
      incite: bluffFormula,
      intimidate: intimidateDeceptionFormula,
      seduce: bluffFormula,
      taunt: bluffFormula,
    };

    // Disposition (spec 010, FR-013): only the authored delta (spec 009 pseudo-
    // channel) is folded into the technique's base formula here. The LEVEL
    // modifier (from the selected disposition) is NO LONGER folded — it is
    // itemized at roll-time by handleRollAsync as an "character"-origin modifier,
    // so the sheet's base stays disposition-level-agnostic while the roll total
    // is preserved (base + itemized level = the previous total).
    bluffFormula.modifier += dispositionDelta.deception;
    actFormula.modifier += dispositionDelta.deception;

    // One row per canonical technique: localized name + effective influence
    // (base ability rating + technique/ALL influence delta) + the persuasion
    // formula with the disposition modifier folded in.
    data.techniques = {};
    for (const entry of INTRIGUE_TECHNIQUES) {
      const persuasionFormula = ChronicleSystem.getActorAbilityFormula(
        actor,
        "persuasion",
        entry.specialtySlug
      );
      persuasionFormula.modifier += dispositionDelta.persuasion;
      const influenceValue =
        actor.getAbilityValueBySlug(entry.influenceAbilitySlug) +
        influenceFor(influence, entry.slug);
      const name = SystemUtils.localize(entry.nameKey);
      const deceptionFormula = deceptionByTechnique[entry.slug];
      const technique = new Technique(
        name,
        influenceValue,
        persuasionFormula,
        deceptionFormula
      );
      // spec 017 (US1): route both intrigue chips through the SSOT so their
      // DISPLAYED formula folds the disposition-level modifier (matching the
      // effective quick roll), while the executed id stays byte-identical. The
      // rollId strings are the SAME the template built from this.name / this
      // formulas, so the roll is unchanged (no double-count, FR-004).
      technique.persuasionChip = ChronicleSystem.getRollChip(
        actor,
        `persuasion:${name}:${persuasionFormula.toStr()}`
      );
      technique.deceptionChip = ChronicleSystem.getRollChip(
        actor,
        `deception:${name}:${deceptionFormula.toStr()}`
      );
      data.techniques[entry.slug] = technique;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._wireRelationshipsTab();
  }

  /**
   * spec 022 — DOM-only transient listeners for the Relationships tab (never
   * persisted, R8). The `.relationships-tab` DOM is replaced on every render, so
   * element-scoped listeners are discarded with the old DOM (no leak); only the
   * MutationObserver is a persistent handle, disconnected before re-observing.
   * - L-1 disposition dropdown: open/close, single-open, outside-click/Escape.
   * - L-2 note editor: one open at a time (observe the reflected `open`
   *   attribute — the native `open` event does not bubble); the read preview OR
   *   the top-row edit pencil opens it (the collapsed native editor is hidden).
   * - L-3 live search: filter by name + visible subtitle + plain note; the count
   *   badge is never touched (FR-015).
   */
  _wireRelationshipsTab() {
    const tab = this.element?.querySelector(".relationships-tab");
    if (!tab) return;

    // ---- L-1 disposition dropdown ---------------------------------------
    const closeAllDisp = (except = null) => {
      tab.querySelectorAll(".cs2-rel-disp.is-open").forEach((d) => {
        if (d !== except) d.classList.remove("is-open");
      });
    };
    tab.querySelectorAll("button.cs2-rel-disp-chip").forEach((chip) => {
      chip.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const wrap = chip.closest(".cs2-rel-disp");
        const wasOpen = wrap.classList.contains("is-open");
        closeAllDisp();
        if (!wasOpen) wrap.classList.add("is-open"); // FR-019 (one at a time)
      });
    });
    tab.addEventListener("click", (ev) => {
      if (!ev.target.closest(".cs2-rel-disp")) closeAllDisp();
    });
    tab.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeAllDisp();
    });

    // ---- L-2 note editor single-open ------------------------------------
    const editors = () => Array.from(tab.querySelectorAll("prose-mirror"));
    const closeOtherEditors = (except) => {
      editors().forEach((pm) => {
        if (pm !== except && pm.hasAttribute("open")) pm.open = false;
      });
    };
    this.#relNoteObserver?.disconnect();
    this.#relNoteObserver = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (el.matches?.("prose-mirror") && el.hasAttribute("open")) {
          closeOtherEditors(el); // FR-025
        }
      }
    });
    this.#relNoteObserver.observe(tab, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    // Open the editor from the read preview OR the top-row edit pencil; the
    // collapsed native editor is hidden by CSS, so these are the affordances
    // (pm.open=true reveals it; the observer collapses+saves any other, FR-023/025).
    tab
      .querySelectorAll(".cs2-rel-note-preview, .cs2-rel-edit")
      .forEach((opener) => {
        opener.addEventListener("click", (ev) => {
          ev.preventDefault();
          const pm = opener
            .closest(".cs2-rel-card")
            ?.querySelector("prose-mirror");
          if (pm) pm.open = true;
        });
      });

    // ---- L-3 live search ------------------------------------------------
    const input = tab.querySelector(".cs2-rel-search-input");
    const noResults = tab.querySelector(".cs2-rel-noresults");
    if (input) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        const cards = tab.querySelectorAll(".cs2-rel-card");
        let visible = 0;
        cards.forEach((card) => {
          const hit = !q || (card.dataset.search ?? "").includes(q);
          card.classList.toggle("is-hidden", !hit); // FR-027
          if (hit) visible++;
        });
        if (noResults) {
          const show = cards.length > 0 && visible === 0; // FR-028
          noResults.classList.toggle("is-hidden", !show);
          if (show) {
            noResults.textContent = game.i18n.format(
              "CS.sheets.character.relationships.noResults",
              { query: input.value.trim() }
            );
          }
        }
      });
    }
  }

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // V2 action handlers (changeDisposition, toggleEquipped, createInjury,
    // deleteInjury, createWound, deleteWound, clickSquare) are registered
    // in DEFAULT_OPTIONS.actions and dispatched automatically by the
    // framework for elements with data-action attributes.
    // No manual event listeners needed here.
  }

  // The dynamic conditions only update their COUNTER; the modifier collector
  // (cs-effect-modifiers.js) reads that counter live and applies the D1
  // channel/sign mapping on the next prepareData. No imperative add/removePenalty.

  async setFrustrationValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.frustration) return;
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.frustration.total
      ),
      0
    );
    this.actor.update({
      "system.derivedStats.frustration.current": value,
    });
  }

  async setFatigueValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.fatigue) return;
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.fatigue.total
      ),
      0
    );
    this.actor.update({
      "system.derivedStats.fatigue.current": value,
    });
  }

  async setStressValue(newValue) {
    if (!this.actor.getCSData().derivedStats?.frustration) return;
    // Parity note: legacy caps stress at `frustration.total` (a known
    // pre-existing bug). Replicated as-is; the oracle is the legacy output.
    let value = Math.max(
      Math.min(
        parseInt(newValue),
        this.actor.getCSData().derivedStats.frustration.total
      ),
      0
    );
    this.actor.update({
      "system.currentStress": value,
    });
  }

  /**
   * Static action handler for clicking fatigue/frustration/stress squares.
   * Called from data-action="clickSquare" or via _attachPartListeners.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickSquare(event, target) {
    event.preventDefault();
    let method = `set${target.dataset.type}Value`;
    await this[method](target.id);
  }

  /**
   * Static action handler for creating a wound.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onClickWoundCreate(event, target) {
    event.preventDefault();
    const data = this.actor.getCSData();
    if (!data.wounds) return;
    let wounds = Object.values(data.wounds);
    if (wounds.length >= this.actor.getMaxWounds()) return;
    wounds.push("");
    this.actor.update({ "system.wounds": wounds });
  }

  /**
   * Static action handler for wound delete (via data-action="deleteWound").
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickWoundDelete(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.id);

    const data = this.actor.getCSData();
    if (!data.wounds) return;
    let wounds = Object.values(data.wounds);
    wounds.splice(index, 1);
    this.actor.update({ "system.wounds": wounds });
  }

  /**
   * Static action handler for creating an injury.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onClickInjuryCreate(event, target) {
    event.preventDefault();
    const data = this.actor.getCSData();
    if (!data.injuries) return;
    let injuries = Object.values(data.injuries);
    if (injuries.length >= this.actor.getMaxInjuries()) return;
    injuries.push("");
    this.actor.update({ "system.injuries": injuries });
  }

  /**
   * Static action handler for injury delete (via data-action="deleteInjury").
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onClickInjuryDelete(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.id);

    const data = this.actor.getCSData();
    if (!data.injuries) return;
    let injuries = Object.values(data.injuries);
    injuries.splice(index, 1);
    this.actor.update({ "system.injuries": injuries });
  }

  /**
   * spec 020 (FR-030) — toggle a weapon's out-of-combat Defensive stance. The
   * collector reads a flag of exactly `false` as "bonus dropped" (default ON). In
   * combat the per-turn marker governs Defensive instead; this is the fallback.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onDefensiveStance(event, target) {
    event.preventDefault();
    const item = this.actor.getEmbeddedDocument("Item", target.dataset.itemId);
    if (!item) return;
    const active = item.getFlag("chroniclesystem", "defensiveStance") !== false;
    await item.setFlag("chroniclesystem", "defensiveStance", !active);
  }

  /**
   * Static action handler for equipped state changes.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onEquippedStateChanged(event, target) {
    event.preventDefault();
    const eventData = target.dataset;
    let currentItem = this.actor.getEmbeddedDocument("Item", eventData.itemId);
    let collection = [];

    let isArmor =
      parseInt(eventData.hand) === ChronicleSystem.equippedConstants.WEARING;
    let isUnequipping = parseInt(eventData.hand) === 0;

    if (isUnequipping) {
      // spec 020 — resolve wielding by the referenced Quality's definition (by
      // slug, FR-022 SSOT), replacing the old `quality.name === "adaptable"` match.
      const isAdaptable = weaponWieldingFlags(currentItem).adaptable;
      if (
        isAdaptable &&
        parseInt(eventData.hand) ===
          ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED &&
        currentItem.getCSData().equipped !==
          ChronicleSystem.equippedConstants.BOTH_HANDS
      ) {
        collection = this.UnequipsAllItemsInTheSlots(
          [
            ChronicleSystem.equippedConstants.MAIN_HAND,
            ChronicleSystem.equippedConstants.OFFHAND,
            ChronicleSystem.equippedConstants.BOTH_HANDS,
          ],
          collection
        );
        collection = this.ChangeItemEquippedStatus(
          collection,
          currentItem,
          ChronicleSystem.equippedConstants.BOTH_HANDS
        );
      } else {
        collection = this.ChangeItemEquippedStatus(collection, currentItem);
      }
    } else {
      if (isArmor) {
        collection = this.UnequipsAllItemsInTheSlots(
          [ChronicleSystem.equippedConstants.WEARING],
          collection
        );
        collection = this.ChangeItemEquippedStatus(
          collection,
          currentItem,
          ChronicleSystem.equippedConstants.WEARING
        );
      } else {
        // spec 020 — Two-Handed occupies both hands, resolved from the referenced
        // Quality's `wielding.occupiesBothHands` (by slug, was a name match).
        if (weaponWieldingFlags(currentItem).occupiesBothHands) {
          collection = this.UnequipsAllItemsInTheSlots(
            [
              ChronicleSystem.equippedConstants.MAIN_HAND,
              ChronicleSystem.equippedConstants.OFFHAND,
              ChronicleSystem.equippedConstants.BOTH_HANDS,
            ],
            collection
          );
          collection = this.ChangeItemEquippedStatus(
            collection,
            currentItem,
            ChronicleSystem.equippedConstants.BOTH_HANDS
          );
        } else {
          collection = this.UnequipsAllItemsInTheSlots(
            [
              parseInt(eventData.hand),
              ChronicleSystem.equippedConstants.BOTH_HANDS,
            ],
            collection
          );
          collection = this.ChangeItemEquippedStatus(
            collection,
            currentItem,
            parseInt(eventData.hand)
          );
        }
      }
    }

    this.actor.updateEmbeddedDocuments("Item", collection);
  }

  UnequipsAllItemsInTheSlots(slots = [], collection = []) {
    let tempCollection = this.actor
      .getEmbeddedCollection("Item")
      .filter((item) => slots.includes(item.getCSData().equipped));

    tempCollection.forEach((item) => {
      collection.push({
        _id: item._id,
        "system.equipped": ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED,
      });
      item.onEquippedChanged(this.actor, false);
    });

    return collection;
  }

  ChangeItemEquippedStatus(
    collection = [],
    item,
    equippedStatus = ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED
  ) {
    item.getCSData().equipped = equippedStatus;

    collection.push({
      _id: item._id,
      "system.equipped": item.getCSData().equipped,
    });

    item.onEquippedChanged(this.actor, equippedStatus > 0);

    return collection;
  }

  /**
   * Static action handler for disposition changes.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onDispositionChanged(event, target) {
    event.preventDefault();
    if (
      !ChronicleSystem.dispositions.find(
        (disposition) => disposition.rating === parseInt(target.dataset.id)
      )
    ) {
      LOGGER.warn("the informed disposition does not exist.");
      return;
    }
    this.actor.update({
      "system.currentDisposition": parseInt(target.dataset.id),
    });
  }

  /**
   * Static action handler: open the linked House actor's sheet from the header
   * House label. The house id comes from `getHouseRole()` (data-actor-id).
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static _onOpenHouse(event, target) {
    event.preventDefault();
    const house = game.actors.get(target.dataset.actorId);
    if (house) house.sheet.render({ force: true });
  }

  /**
   * Open the read-only Public Character Sheet of THIS actor as a preview, so the
   * owner/GM can see exactly what a Limited player sees. A Limited user is routed
   * to that sheet automatically (`CSActor#_getSheetClass`); this button
   * lets a non-Limited user (owner/GM) open the same sheet on demand, alongside
   * the standard sheet. The two sheets carry distinct application ids (the id
   * embeds the class name), so they coexist without collision. Reuses the already-
   * open preview if present (its id is deterministic) instead of stacking a
   * duplicate window.
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onViewPublicSheet(event, target) {
    event.preventDefault();
    const existing = Object.values(this.actor.apps).find(
      (app) => app instanceof CSPublicCharacterSheet
    );
    const preview =
      existing ?? new CSPublicCharacterSheet({ document: this.actor });
    preview.render({ force: true });
  }

  /**
   * spec 012 (US2): toggle the transient configure-public-sheet mode and re-render
   * so the per-field eye controls appear/disappear (FR-018, transient UI state).
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  // eslint-disable-next-line no-unused-vars
  static async _onTogglePubMode(event, target) {
    event.preventDefault();
    this._pubMode = !this._pubMode;
    this.render();
  }

  /**
   * spec 012 (US2): flip one field's public/hidden flag, persisted immediately
   * and in isolation — only this key changes, the field's content is untouched
   * (FR-017/FR-019). The document update re-renders every open app, so a watching
   * Limited player's public sheet updates within a cycle (FR-004).
   * @param {Event} event    The originating click event
   * @param {HTMLElement} target  The element that was clicked
   */
  static async _onToggleFieldVisibility(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!PUBLIC_VISIBILITY_KEYS.includes(key)) return;
    const current = this.actor.system.publicVisibility?.[key] === true;
    await this.actor.update({ ["system.publicVisibility." + key]: !current });
  }

  /* ---------------------------------------------------- spec 022 actions -- */

  /**
   * spec 022 (US1, A-4/FR-012) — open the target's sheet from a card's
   * portrait/name. Routed by the VIEWER's permission via the target's own
   * `_getSheetClass` (spec 012): GM / Owner / Observer get the full sheet, a
   * Limited-only user gets the read-only public sheet — so the GM/owner sees the
   * complete sheet, not the public one. `actor.sheet` is the core-cached
   * singleton, so this also reuses an already-open window. Not owner-gated
   * (viewing). Orphan-safe: an unresolved uuid is an inert link (no-op).
   * @param {Event} event
   * @param {HTMLElement} target  carries data-uuid
   */
  static async _onOpenRelationshipSheet(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid) return; // blank reference — inert orphan link (SC-006)
    const targetActor = foundry.utils.fromUuidSync(uuid);
    if (!targetActor) return; // deleted target — inert (SC-006)
    targetActor.sheet.render({ force: true });
  }

  /**
   * spec 022 (US1, A-3/FR-030) — remove a relationship card. Owner-gated;
   * immediate, NO confirmation; NEVER touches the referenced actor. Whole-array
   * write (no indexed sub-path survives ArrayField._cast).
   * @param {Event} event
   * @param {HTMLElement} target  carries data-index
   */
  static async _onRemoveRelationship(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return; // FR-029 (defense-in-depth)
    const index = Number(target.dataset.index);
    const rels = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    if (index < 0 || index >= rels.length) return;
    rels.splice(index, 1);
    await this.actor.update({ "system.relationships": rels });
  }

  /**
   * spec 022 (US2, A-2/FR-016/018/020) — set a relationship's disposition rating.
   * Owner-gated; validates the rating against the ladder (mirrors
   * `_onDispositionChanged`); persists `disp` ONLY — never
   * `system.currentDisposition`, never a roll path (decoupling invariant, D-4).
   * Whole-array write.
   * @param {Event} event
   * @param {HTMLElement} target  carries data-index + data-rating
   */
  static async _onSetRelDisposition(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return; // FR-029 (defense-in-depth)
    const rating = Number(target.dataset.rating);
    if (!ChronicleSystem.dispositions.find((d) => d.rating === rating)) {
      LOGGER.warn("the informed disposition does not exist.");
      return;
    }
    const index = Number(target.dataset.index);
    const rels = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    if (index < 0 || index >= rels.length) return;
    rels[index].disp = rating;
    await this.actor.update({ "system.relationships": rels });
  }

  /* -------------------------------------------- */

  isItemPermitted(type) {
    return this.itemTypesPermitted.includes(type);
  }
}

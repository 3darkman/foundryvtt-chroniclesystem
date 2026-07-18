import {
  buildEffectContext,
  buildNewEffectData,
  canUserModifyEffect,
} from "../../effects/cs-active-effect.js";
import { CSConstants } from "../../system/csConstants.js";
import {
  QUALITY_LEVERS,
  getQualityLeverLabel,
  qualityAppliesTo,
  qualityBySlug,
  slugify,
} from "../../effects/cs-effect-vocabulary.js";

// The 7 House resources, in handoff order — the Evento "Recursos da Casa" table
// rows and the Propriedade Resource select choices (spec 019, D6).
const HOUSE_RESOURCES = [
  "defense",
  "influence",
  "lands",
  "law",
  "population",
  "power",
  "wealth",
];

// The Técnica `system.type` stays a free-text StringField (existing user data like
// "Ritual, Spell") — the sheet presents it as interactive multi-chips via this
// converter, so NO schema change / migration is needed. `parse` detects each type
// by a case-insensitive root match; `join` re-emits a canonical, language-
// independent "Spell, Ritual" (order follows the TechniqueType key order).
function parseTechniqueTypeSet(str) {
  const lower = String(str ?? "").toLowerCase();
  const set = new Set();
  for (const key of Object.keys(CSConstants.TechniqueType)) {
    if (lower.includes(key.toLowerCase())) set.add(key);
  }
  return set;
}

function joinTechniqueTypes(set) {
  return Object.keys(CSConstants.TechniqueType)
    .filter((key) => set.has(key))
    .map((key) => key.charAt(0) + key.slice(1).toLowerCase())
    .join(", ");
}

/**
 * The single presentation class for all 10 item types (spec 019, D1). It carries
 * NO per-type branching in its handlers — every per-type concern is expressed as
 * data: the mechanical body is one swapped PART (`_configureRenderParts`),
 * repeatable-list CRUD is two generic actions driven by `LIST_ELEMENT_FACTORIES`,
 * and per-type option lists come from a context descriptor. Adopts native AppV2
 * mechanics: declarative `static TABS` + `tab-navigation.hbs` (no manual
 * `changeTab`), native `editImage`, ownership via `!!item.actor` (correct for
 * unlinked tokens), and `<prose-mirror>` rich text.
 * @extends {ItemSheetV2}
 */
export class CSItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2
) {
  static DEFAULT_OPTIONS = {
    // `cs-v2` unlocks the shared `--csv2-*` tokens + `.csv2-*` component layer;
    // `cs-item-v2` scopes item-only layout.
    classes: [
      "worldbuilding",
      "chroniclesystem",
      "sheet",
      "item",
      "cs-v2",
      "cs-item-v2",
    ],
    position: { width: 840, height: 600 },
    form: { submitOnChange: true },
    actions: {
      // native (inherited, NOT re-registered): editImage, tab
      deleteItem: CSItemSheet._onDeleteItem,
      listAdd: CSItemSheet._onListAdd,
      listDelete: CSItemSheet._onListDelete,
      toggleCollapse: CSItemSheet._onToggleCollapse,
      toggleTechniqueType: CSItemSheet._onToggleTechniqueType,
      effectCreate: CSItemSheet._onEffectCreate,
      effectEdit: CSItemSheet._onEffectEdit,
      effectDelete: CSItemSheet._onEffectDelete,
      effectToggle: CSItemSheet._onEffectToggle,
    },
  };

  static PARTS = {
    header: {
      template: "systems/chroniclesystem/templates/items/parts/header.hbs",
    },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: {
      template: "systems/chroniclesystem/templates/items/parts/details.hbs",
    },
    // Swapped per type in _configureRenderParts; generic.hbs is the fallback.
    system: {
      template: "systems/chroniclesystem/templates/items/system/generic.hbs",
    },
    effects: {
      template: "systems/chroniclesystem/templates/components/effects-tab.hbs",
    },
  };

  // Fixed 3-tab bar for every type: Detalhes · Sistema · Efeitos. Single group →
  // `context.tabs` is auto-injected by ApplicationV2._prepareContext.
  // No tab icons — the handoff tabs are text-only (label from `labelPrefix`).
  static TABS = {
    primary: {
      tabs: [{ id: "details" }, { id: "system" }, { id: "effects" }],
      initial: "details",
      labelPrefix: "CS.sheets.item.tabs",
    },
  };

  // SSOT for each repeatable list's new-row shape (D1/D6) — mirrors the element
  // shapes the deleted per-type create-handlers wrote, now centralized.
  static LIST_ELEMENT_FACTORIES = {
    // spec 020 — weapon/armour `system.qualities` are slug references added by
    // dragging a Quality onto the sheet (not the generic blank-row listAdd) — no
    // factory here. Rows are removed via the generic listDelete action.
    // A Quality's authored rule rows (blank lever = not-yet-chosen,
    // inert in the collector) and its parameter-choice options (plain strings).
    "system.rules": () => ({
      lever: "",
      value: "",
      scope: "passive",
      target: "",
    }),
    "system.parameter.options": () => "",
    "system.specialties": () => ({ name: "", rating: 0, modifier: 0 }),
    "system.features": () => ({ name: "", rating: 0, modifier: 0 }),
    "system.arts": () => ({ name: "" }),
    "system.works": () => ({
      name: "",
      type: "",
      description: "",
      test: { alignment: "", invocation: "", unleashing: "", spellcasting: "" },
      cost: "",
      resonance: "",
    }),
  };

  // Ephemeral Técnica Works open/closed state, keyed by work index. Read back in
  // _prepareContext so a submitOnChange re-render restores it (never persisted).
  #collapsed = {};

  /* -------------------------------------------- */

  /** @override — swap only the mechanical body per type; header/details/effects
   *  are the same shared file for all 10 types. */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.system.template = `systems/chroniclesystem/templates/items/system/${this.document.type}.hbs`;
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    // `!!item.actor` — a synthetic ActorDelta actor (unlinked token) IS an Actor,
    // so this is correct for unlinked-token items (NOT item.isOwner, which is a
    // user-permission flag unrelated to embedding).
    context.isEmbedded = !!item.actor;
    context.editable = this.isEditable;

    // Pre-enrich rich text (separate context vars so the raw stored value is never
    // corrupted). Each rich-text-field renders the enriched HTML but saves the raw.
    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    const enrich = (html) =>
      html ? TextEditorImpl.enrichHTML(html, { relativeTo: item }) : "";
    context.enrichedDescription = await enrich(system?.description);
    context.enrichedEffects = await enrich(system?.effects);
    context.enrichedRecovery = await enrich(system?.recovery);

    // Effects tab — pass the item as the viewing doc so its OWN effects show "—"
    // as origin (shared table, reused not rebuilt — FR-007).
    context.effects = Array.from(item.effects).map((e) =>
      buildEffectContext(e, game.user, item)
    );

    await this._prepareTypeContext(context, item, system);

    return context;
  }

  /**
   * Per-type render context (data, not branching): option lists, owner-aware list
   * columns, list Add/lock flags, and enriched/collapsed Works.
   */
  async _prepareTypeContext(context, item, system) {
    const isEmbedded = context.isEmbedded;

    // Option lists: the 7 House resources as a select map (UI-enforced; the schema
    // has no `choices`), and the Técnica Type/Cost sets from the constants (SSOT).
    context.typeDescriptor = {
      resourceChoices: Object.fromEntries(
        HOUSE_RESOURCES.map((r) => [r, `CS.sheets.house.resources.${r}`])
      ),
      techniqueTypes: CSConstants.TechniqueType,
      techniqueCosts: CSConstants.TechniqueCost,
    };

    // Evento "Recursos da Casa" — fixed 7 rows in handoff order.
    context.houseResources = HOUSE_RESOURCES;

    // Repeatable-list gating (FR-011/FR-012): non-owner-gated lists (Qualities /
    // Specialties / Arts / Works) add whenever editable; Propriedade Features are
    // owner-gated → the empty-state note replaces the table when unowned.
    context.canEditLists = context.editable;
    context.featuresLocked = item.type === "holding" && !isEmbedded;
    context.canAddFeatures = context.editable && isEmbedded;

    // Habilidade Specialties columns — the owned-only Rating/Modifier columns drop
    // out entirely when unowned (no sparse holes; the whole cell is omitted).
    context.specialtyColumns = [
      {
        key: "name",
        label: "CS.sheets.item.fields.name",
        inputType: "text",
        dtype: "String",
      },
      ...(isEmbedded
        ? [
            {
              key: "rating",
              label: "CS.sheets.item.fields.rating",
              inputType: "text",
              dtype: "Number",
              cssClass: "is-mono",
            },
            {
              key: "modifier",
              label: "CS.sheets.item.fields.modifier",
              inputType: "text",
              dtype: "Number",
              cssClass: "is-mono",
            },
          ]
        : []),
    ];

    // spec 020 — weapon/armour Qualities are slug references added by DRAG-DROP
    // (no picker): resolve each reference against the world + the compendium.
    if (item.type === "weapon" || item.type === "armor") {
      await this._prepareQualityReferences(context, item, system);
    }
    context.artColumns = [
      {
        key: "name",
        label: "CS.sheets.item.fields.name",
        inputType: "text",
        dtype: "String",
      },
    ];
    // Propriedade Feature Cost binds to `.cost` — the key csItem.js reads for the
    // investment total (D5). The factory writes {name,rating,modifier}; the cost vs
    // rating/modifier mismatch is flagged for the schema owner, not fixed here.
    context.featureColumns = [
      {
        key: "name",
        label: "CS.sheets.item.fields.name",
        inputType: "text",
        dtype: "String",
      },
      {
        key: "cost",
        label: "CS.sheets.item.fields.cost",
        inputType: "text",
        dtype: "Number",
        cssClass: "is-mono",
      },
    ];

    // Técnica Works — enrich each description and pre-compute the Type flags so the
    // works-card template needs no "SPELL"/"RITUAL" string literals.
    if (item.type === "technique") {
      // Interactive multi-chips over the free-text `system.type` (SSOT converter).
      const selectedTypes = parseTechniqueTypeSet(system.type);
      context.techniqueTypeChips = Object.keys(CSConstants.TechniqueType).map(
        (key) => ({
          key,
          label: CSConstants.TechniqueType[key],
          selected: selectedTypes.has(key),
        })
      );

      const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
      const works = Object.values(system.works ?? {});
      context.works = await Promise.all(
        works.map(async (w, i) => ({
          ...w,
          index: i,
          collapsed: !!this.#collapsed[i],
          isSpell: w.type === "SPELL",
          isRitual: w.type === "RITUAL",
          enrichedDescription: w.description
            ? await TextEditorImpl.enrichHTML(w.description, {
                relativeTo: item,
              })
            : "",
        }))
      );
    }

    // spec 020 — Quality authoring dropdowns, all sourced from the shared SSOT
    // constants (QUALITY_LEVERS / the schema `choices`). Empunhadura shows only
    // when the applicability includes weapon (FR-001). Values are i18n keys so the
    // `selectOptions … localize=true` helper renders the localized labels.
    if (item.type === "quality") {
      context.qualityShowWielding = system.applicability !== "armor";
      context.qualityDescriptor = {
        applicabilityOptions: {
          weapon: "CS.quality.applicability.weapon",
          armor: "CS.quality.applicability.armor",
          both: "CS.quality.applicability.both",
        },
        parameterKinds: {
          none: "CS.quality.parameterKinds.none",
          number: "CS.quality.parameterKinds.number",
          choice: "CS.quality.parameterKinds.choice",
        },
        scopeOptions: {
          passive: "CS.quality.scopes.passive",
          auto: "CS.quality.scopes.auto",
          optional: "CS.quality.scopes.optional",
        },
        leverOptions: Object.fromEntries([
          ["", getQualityLeverLabel("none")],
          ...QUALITY_LEVERS.map((lever) => [
            lever.id,
            getQualityLeverLabel(lever.id),
          ]),
        ]),
      };
    }
  }

  /**
   * spec 020 — build the weapon/armour Quality reference rows. Each reference is a
   * stable slug; it resolves LIVE against the world (a real Quality item) and, as a
   * fallback, the quality compendium index (async — sheet render only, never the
   * synchronous collector). Resolved → the real name + the per-instance parameter
   * control the definition declares (number input vs option select). Unresolved (no
   * item with that slug in world OR compendium) → a "<slug> missing item" chip that
   * stays removable; the reference is NEVER discarded (FR-012).
   */
  async _prepareQualityReferences(context, item, system) {
    const refs = Array.isArray(system?.qualities) ? system.qualities : [];

    // Compendium fallback: slug → {name, parameter} from each Item pack's index
    // (world items are resolved directly via qualityBySlug, below).
    const packDefs = new Map();
    for (const pack of game.packs ?? []) {
      if (pack.metadata?.type !== "Item") continue;
      let index;
      try {
        index = await pack.getIndex({
          fields: [
            "system.slug",
            "system.description",
            "system.parameter.kind",
            "system.parameter.label",
            "system.parameter.options",
          ],
        });
      } catch {
        continue;
      }
      for (const entry of index) {
        if (entry.type !== "quality") continue;
        const slug = entry.system?.slug || slugify(entry.name);
        if (slug && !packDefs.has(slug)) {
          packDefs.set(slug, {
            name: entry.name,
            description: entry.system?.description ?? "",
            parameter: entry.system?.parameter ?? { kind: "none" },
          });
        }
      }
    }

    // World first (full item), then the compendium fallback; null when unresolved.
    const resolve = (slug) => {
      const world = qualityBySlug(slug);
      if (world) {
        return {
          name: world.name,
          description: world.system?.description ?? "",
          parameter: world.system?.parameter ?? { kind: "none" },
        };
      }
      return packDefs.get(slug) ?? null;
    };

    context.qualityRefs = refs.map((ref, index) => {
      const slug = ref.slug ?? "";
      const def = slug ? resolve(slug) : null;
      const paramKind = def?.parameter?.kind ?? "none";
      return {
        index,
        slug,
        parameter: ref.parameter ?? "",
        name: def?.name ?? slug,
        description: def?.description ?? "",
        missing: !def,
        showParam: paramKind === "number" || paramKind === "choice",
        isChoice: paramKind === "choice",
        paramLabel: def?.parameter?.label ?? "",
        paramOptions:
          paramKind === "choice"
            ? Object.fromEntries(
                (def.parameter.options ?? []).filter(Boolean).map((o) => [o, o])
              )
            : {},
      };
    });
  }

  /** @override — the core convention: hand each tab-body part its own tab state so
   *  its root can bind `{{#if tab.active}}active{{/if}}`. */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  /* -------------------------------------------- */
  /*  Generic repeatable-list + collapse handlers */
  /* -------------------------------------------- */

  /** Action: append a new row to a repeatable list. `data-list` = system path;
   *  the row shape comes from LIST_ELEMENT_FACTORIES (SSOT). */
  static _onListAdd(event, target) {
    const path = target.dataset.list;
    const factory = CSItemSheet.LIST_ELEMENT_FACTORIES[path];
    if (!factory) return;
    const arr = foundry.utils.deepClone(
      foundry.utils.getProperty(this.item, path) ?? []
    );
    arr.push(factory());
    return this.item.update({ [path]: arr });
  }

  /** Action: remove one row from a repeatable list (splice re-densifies indices so
   *  no sparse hole is left in the fully-replaced array). */
  static _onListDelete(event, target) {
    const path = target.dataset.list;
    const i = Number(target.dataset.index);
    const arr = foundry.utils.deepClone(
      foundry.utils.getProperty(this.item, path) ?? []
    );
    arr.splice(i, 1);
    return this.item.update({ [path]: arr });
  }

  /* -------------------------------------------- */
  /*  Quality references — drag-drop only         */
  /* -------------------------------------------- */

  /**
   * @override — accept a dropped **Quality** Item as a slug reference on a
   * weapon/armour sheet (spec 020, contract C10a). The whole sheet is the drop
   * target (inherited; no dropSelector). Wrong type / applicability / duplicate are
   * silently ignored; everything else falls through to the core handler (which
   * preserves the inherited ActiveEffect drop).
   */
  async _onDropDocument(event, document) {
    if (document?.documentName === "Item" && document.type === "quality") {
      if (!this.isEditable) return null;
      if (!["weapon", "armor"].includes(this.item.type)) return null;
      if (!qualityAppliesTo(document, this.item.type)) return null;
      const slug = document.system?.slug || slugify(document.name);
      const arr = foundry.utils.deepClone(this.item.system.qualities ?? []);
      if (arr.some((q) => q.slug === slug)) return null; // dedupe
      if (document.pack && !qualityBySlug(slug)) {
        await CONFIG.Item.documentClass.create(document.toObject());
      }
      arr.push({ slug, parameter: "" });
      await this.item.update({ "system.qualities": arr });
      return document;
    }
    return super._onDropDocument(event, document);
  }

  /** Action: toggle a Técnica Work card open/closed (ephemeral UI state). */
  static _onToggleCollapse(event, target) {
    const i = Number(target.dataset.index);
    this.#collapsed[i] = !this.#collapsed[i];
    this.render();
  }

  /** Action: toggle one Técnica Type chip. `system.type` stays a free-text
   *  StringField — parse → toggle → re-emit the canonical joined string (no schema
   *  change, existing "Ritual, Spell" data preserved). */
  // eslint-disable-next-line no-unused-vars
  static _onToggleTechniqueType(event, target) {
    if (!this.isEditable) return;
    const key = target.dataset.type;
    if (!(key in CSConstants.TechniqueType)) return;
    const set = parseTechniqueTypeSet(this.item.system.type);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    return this.item.update({ "system.type": joinTechniqueTypes(set) });
  }

  /* -------------------------------------------- */
  /*  Active Effects handlers (unchanged)         */
  /* -------------------------------------------- */

  /** Action: create a new Active Effect on this item. */
  // eslint-disable-next-line no-unused-vars
  static async _onEffectCreate(event, target) {
    const item = this.document;
    await item.createEmbeddedDocuments("ActiveEffect", [
      buildNewEffectData(item, game.user),
    ]);
  }

  /** Action: open an effect's config sheet. */
  static _onEffectEdit(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect) effect.sheet.render(true);
  }

  /** Action: delete an effect (permission-guarded). */
  static async _onEffectDelete(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) await effect.delete();
  }

  /** Action: toggle an effect's disabled state (permission-guarded). */
  static async _onEffectToggle(event, target) {
    const effect = this.document.effects.get(target.dataset.effectId);
    if (effect && canUserModifyEffect(game.user, effect)) {
      await effect.update({ disabled: !effect.disabled });
    }
  }

  /* -------------------------------------------- */

  /** Action: delete this item from its parent actor (owned only; the header
   *  button is owner-gated). */
  // eslint-disable-next-line no-unused-vars
  static _onDeleteItem(event, target) {
    const item = this.document;
    if (item.actor) {
      item.actor.deleteEmbeddedDocuments("Item", [item._id]);
    }
  }
}

import SystemUtils from "../../utils/systemUtils.js";
import { PUBLIC_VISIBILITY_KEYS } from "../../system/public-visibility.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * spec 012 — the read-only **Public Character Sheet**. Opens automatically for a
 * user whose ownership of a character is exactly Limited (routed by
 * `CSCharacterActor#_getSheetClass`, contracts/sheet-routing.md). It renders
 * ONLY description/roleplay content filtered by `system.publicVisibility` — never
 * any mechanical data (FR-002/FR-006/SC-001). Read-only is guaranteed twice over:
 * a Limited user is not an OWNER so ApplicationV2 forces `editable=false` (and
 * disables any form control), AND the template ships zero editable controls,
 * rollables, or mutating actions (FR-003, G2).
 *
 * Holds no persistent state — the whole render context is a projection of
 * `actor.system`, `actor.getHouseRole()`, and enriched rich-text, recomputed each
 * render (contracts/public-sheet-context.md).
 *
 * @extends {ActorSheetV2}
 */
export class CSPublicCharacterSheet extends HandlebarsApplicationMixin(
  ActorSheetV2
) {
  static DEFAULT_OPTIONS = {
    // `cs-v2` unlocks the shared `--csv2-*` tokens + generic `.csv2-card`
    // component layer; `cs-public-sheet` scopes this sheet's own layout (R6/R7).
    classes: ["chroniclesystem", "cs-v2", "cs-public-sheet"],
    position: { width: 680, height: 820 },
    window: { resizable: true },
    // Read-only: never submit, never close-on-submit. No mutating `actions`.
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  static PARTS = {
    form: {
      template:
        "systems/chroniclesystem/templates/actors/characters/public-character-sheet.hbs",
    },
  };

  /**
   * Always read-only. A Limited user is not an OWNER, so this is already false
   * on the auto-routed path — but the owner/GM "View public sheet" preview
   * (csCharacterActorSheet) renders this same sheet for an OWNER, where the base
   * getter would return true. Forcing false keeps the preview a faithful, non-
   * editable projection (and would disable any control were one ever added).
   * @override
   */
  get isEditable() {
    return false;
  }

  /**
   * Compute a 1–2 letter avatar monogram from the actor name: first letter of the
   * first word + first letter of the last word (single word → its first two
   * letters), uppercased. Empty name → "?". A deterministic, locale-agnostic
   * heuristic (no honorific list — Simplicity First).
   * @param {string} name
   * @returns {string}
   */
  static _computeInitials(name) {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    // --- always-public identity ---
    context.name = actor.name;
    context.initials = this.constructor._computeInitials(actor.name);

    // Portrait: explicit portrait → actor img → prototype token; the shared
    // mystery-man default counts as "no portrait" so the template shows the
    // neutral placeholder instead (FR-005, R-CTX-6, Edge "Portrait absent").
    const DEFAULT_IMG = CONST.DEFAULT_TOKEN;
    const img = [
      (sys.portrait || "").trim(),
      actor.img,
      actor.prototypeToken?.texture?.src,
    ].find((src) => src && src !== DEFAULT_IMG);
    context.img = img || "";
    context.hasPortrait = Boolean(img);

    // --- the visibility map (all 11 booleans, never undefined — R-CTX-1) ---
    const pv = sys.publicVisibility ?? {};
    const vis = {};
    for (const key of PUBLIC_VISIBILITY_KEYS) vis[key] = pv[key] === true;
    context.vis = vis;

    // --- header meta (template gates each on its flag) ---
    // House display mirrors the standard sheet header: the linked House actor's
    // name when the character is a member of one (system.house is usually blank
    // in that case), else the free-text system.house.
    const houseRole = actor.getHouseRole();
    context.house = houseRole?.houseName || sys.house;
    context.position = houseRole
      ? { role: houseRole.role, description: houseRole.description }
      : null;
    // Whether the header meta line renders at all — House public AND a house
    // name exists, or Position public AND an actual house role exists (Edge
    // "Position without a house role"). Gates the whole row so it never leaves
    // an empty gap.
    context.showHeaderMeta =
      (vis.house && !!context.house) ||
      (vis.position && context.position != null);

    const L = (key) =>
      SystemUtils.localize(`CS.sheets.character.publicSheet.${key}`);

    // --- always-public Appearance (physical descriptors only; NO glory/XP — FR-006) ---
    context.appearance = [
      { label: L("height"), value: sys.height },
      { label: L("weight"), value: sys.weight },
      { label: L("eyeColor"), value: sys.eyeColor },
      { label: L("hairColor"), value: sys.hairColor },
    ];

    // --- toggled composite sections (values present; template gates on vis.*) ---
    context.identity = [
      { label: L("ancestry"), value: sys.ancestries },
      { label: L("gender"), value: sys.gender },
      { label: L("age"), value: sys.age },
    ];
    context.concept = [
      { label: L("vice"), value: sys.vice },
      { label: L("virtue"), value: sys.virtue },
      { label: L("goal"), value: sys.goal },
      { label: L("motivation"), value: sys.motivation },
    ];
    context.mannerisms = sys.mannerisms;
    context.features = sys.distinguishingFeatures;

    // --- rich-text: enriched with secrets:false so GM secrets never reach a
    //     Limited reader (R-CTX-4). Only enrich a field that is actually public,
    //     so hidden content is never even processed (defense-in-depth). ---
    const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
    const enrich = (html) =>
      TextEditorImpl.enrichHTML(html || "", {
        secrets: false,
        relativeTo: actor,
      });
    context.enrichedHistory = vis.history
      ? await enrich(sys.personalHistory)
      : "";
    context.enrichedAllies = vis.allies ? await enrich(sys.allies) : "";
    context.enrichedEnemies = vis.enemies ? await enrich(sys.enemies) : "";
    context.enrichedOaths = vis.oaths ? await enrich(sys.oaths) : "";
    context.enrichedMotto = vis.motto ? await enrich(sys.motto) : "";

    // --- derived row wrappers for FR-013 collapse (R-CTX-3) ---
    context.showTraitRow = vis.mannerisms || vis.features;
    context.showBondRow = vis.allies || vis.enemies || vis.oaths || vis.motto;

    return context;
  }
}

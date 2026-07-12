// Coat of Arms editor — a standalone ApplicationV2 window (D1). Composes a COA
// object in memory (source of truth while editing), previews it live by building
// the SVG LOCALLY on every edit (synchronous, no network, no debounce — SC-003),
// and on Save renders + persists the SVG (sheet) + PNG (token) as the house
// identity. Layout + tokens follow the hifi design handoff: 3 columns 270/300/1fr,
// dark title bar, blue section headers, colored layer type-icons.
//
// ApplicationV2 note: the base has NO `document` getter — the live actor lives in
// `this.options.document` (captured here as `#actor`).

import { CATALOG, chargeInfo } from "./cs-armoria-catalog.js";
import { label, searchCharges } from "./cs-coa-labels.js";
import { buildCoaSvg } from "./render/cs-coa-svg.js";
import { buildPattern } from "./render/cs-coa-patterns.js";
import { getViewBox } from "./render/cs-coa-geometry.js";
import { validate } from "./cs-coa-validation.js";
import {
  renderAndSave,
  saveDefinitionOnly,
  canUpload,
} from "./cs-coa-render.js";
import { resolveImport } from "./cs-coa-import.js";
import { randomCoa } from "./cs-coa-random.js";
import SystemUtils from "../utils/systemUtils.js";

const TP = "systems/chroniclesystem/templates/apps";
const CHARGE_THUMB_DIR = "systems/chroniclesystem/assets/armoria/charges";
const SAVE_SIZE = 500;

// Canonical tincture swatch palette (design handoff). Sending the KEY renders
// with Armoria's own hex; the swatch is the brand palette. Editing the hex sends
// that hex instead (D9).
const TINCTURE_SWATCH = Object.freeze({
  or: "#e2b93b",
  argent: "#e6e8ea",
  azure: "#2166ab",
  gules: "#c02231",
  sable: "#2b2728",
  vert: "#2f7d4f",
  purpure: "#7a2f7a",
  murrey: "#7a1b3d",
  sanguine: "#5e1a30",
  tenne: "#b5651d",
});

// Per-layer-type glyph (sprite symbol id) + human "kind" (localised key).
const LAYER_META = Object.freeze({
  shield: { glyph: "gl-shield", kind: "CS.coa.kinds.shield" },
  field: { glyph: "gl-field", kind: "CS.coa.kinds.field" },
  division: { glyph: "gl-division", kind: "CS.coa.kinds.division" },
  ordinary: { glyph: "gl-ord", kind: "CS.coa.kinds.ordinary" },
  charge: { glyph: "gl-charge", kind: "CS.coa.kinds.charge" },
});

const { HandlebarsApplicationMixin, ApplicationV2 } =
  foundry.applications?.api ?? {};
const CoaEditorBase = ApplicationV2
  ? HandlebarsApplicationMixin(ApplicationV2)
  : class {};

/** Fresh default COA (a plain argent heater with no charges). */
function defaultCoa() {
  return { shield: "heater", t1: "argent", ordinaries: [], charges: [] };
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Pattern/semy size keywords in ascending visual order (Armoria's catalog order is
// extraction-order, not semantic). "standard" is the default — it writes NO size
// suffix and is the selection when a value carries no explicit size.
const SIZE_ORDER = [
  "smallest",
  "smaller",
  "small",
  "standard",
  "big",
  "bigger",
];

// The FULL tincture vocabulary the renderer can paint (tinctureColors is the SSOT).
// CATALOG.tinctures is only the 10 brand-swatch subset — classifying against it
// made carnation / celeste / cendree read as "patterns" (and render grey). Every
// tincture control classifies, swatches and lists against this complete set.
const TINCTURE_KEYS = Object.keys(CATALOG.tinctureColors ?? {});
const KNOWN_TINCTURE = new Set(
  TINCTURE_KEYS.length ? TINCTURE_KEYS : CATALOG.tinctures
);
/** Swatch colour for a tincture key: brand palette first, else the render hex. */
const swatchColor = (k) =>
  TINCTURE_SWATCH[k] ?? CATALOG.tinctureColors?.[k] ?? "#888888";

/**
 * The ONE shield-silhouette SVG — shared by the shield picker AND the charge
 * position map (DRY: never hand-build a second shield svg). `inner` is extra markup
 * drawn over the shield (e.g. a position dot). Sized via the `.coa-shield-svg` class
 * (CSS beats Foundry core's `svg` rule — width/height ATTRS get overridden). viewBox
 * = the render's getViewBox, so overlaid coords (100 + posX, 100 + posY) line up with
 * where a charge actually sits.
 */
function shieldSvg(shield, inner = "") {
  const viewBox = getViewBox(shield, CATALOG.shieldPaths);
  const path = CATALOG.shieldPaths[shield]?.path;
  const shape = path
    ? `<path d="${path}" fill="#c9d3e4" stroke="#5a6b86" stroke-width="4"/>`
    : `<rect x="0" y="0" width="200" height="200" fill="#c9d3e4"/>`;
  return `<svg class="coa-shield-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${shape}${inner}</svg>`;
}

/**
 * The ONE square cell-preview SVG — shared by the division / ordinary / pattern
 * pickers (DRY). Sized via the `.coa-cell-svg` class, i.e. on the svg ELEMENT (like
 * shieldSvg) — CSS beats Foundry core's `svg` rule; a `width:100%` on a wrapper span
 * was unreliable (the svg overflowed/clipped). `inner` fills the 0-200 square.
 */
function cellSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="coa-cell-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/**
 * SVG string → `data:` URI for an `<img src>`. Loaded as an image, the SVG lives in
 * its OWN isolated document, so `fill="url(#id)"` paint-server refs resolve (they do
 * NOT when SVG with `<pattern>` is parsed in AppV2's detached part subtree and then
 * re-parented — Chromium drops the binding) and pattern ids can never collide across
 * swatches. Idiomatic for many SVG thumbnails (foundry-api-expert). `#` MUST be
 * percent-encoded or the URI truncates at the fragment — encodeURIComponent covers it.
 */
function svgToDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export class CoatOfArmsEditor extends CoaEditorBase {
  /** Live actor (ApplicationV2 has no `document` getter — use this). */
  #actor;
  /** In-memory COA definition (source of truth while the window is open). */
  #coa;
  /** Transient UI state — never persisted (data-model §Estado de UI). */
  #ui;

  constructor(options = {}) {
    super(options);
    this.#actor = options.document;
    this.#coa = this.#hydrate(this.#actor?.system?.coa);
    this.#ui = {
      selected: { type: "field", index: null },
      advanced: false,
      importOpen: false,
      catalogOpen: false,
      catalogSelection: null,
      catalogMode: "add", // "add" (new charge) | "swap" (replace) | "semy" (semy fill)
      semyPath: null, // when catalogMode === "semy": the tincture path being edited
      tinctMode: {}, // path -> "tintura" | "padrao" | "semy"
    };
  }

  static DEFAULT_OPTIONS = {
    id: "cs-coa-editor",
    tag: "div",
    classes: ["chroniclesystem", "cs-v2", "cs-coa-editor"],
    position: { width: 1010, height: "auto" },
    window: {
      title: "CS.coa.title",
      icon: "fa-solid fa-shield-halved",
      resizable: true,
    },
    actions: {
      selectLayer: CoatOfArmsEditor.#onSelectLayer,
      selectShield: CoatOfArmsEditor.#onSelectShield,
      selectDivision: CoatOfArmsEditor.#onSelectDivision,
      selectOrdinary: CoatOfArmsEditor.#onSelectOrdinary,
      selectLine: CoatOfArmsEditor.#onSelectLine,
      addDivision: CoatOfArmsEditor.#onAddDivision,
      addOrdinary: CoatOfArmsEditor.#onAddOrdinary,
      addCharge: CoatOfArmsEditor.#onAddCharge,
      removeLayer: CoatOfArmsEditor.#onRemoveLayer,
      moveLayer: CoatOfArmsEditor.#onMoveLayer,
      setTincture: CoatOfArmsEditor.#onSetTincture,
      setTinctMode: CoatOfArmsEditor.#onSetTinctMode,
      selectPatternHead: CoatOfArmsEditor.#onSelectPatternHead,
      setPatternColor: CoatOfArmsEditor.#onSetPatternColor,
      openSemyCatalog: CoatOfArmsEditor.#onOpenSemyCatalog,
      restoreTincture: CoatOfArmsEditor.#onRestoreTincture,
      setPosition: CoatOfArmsEditor.#onSetPosition,
      toggleAdvanced: CoatOfArmsEditor.#onToggleAdvanced,
      toggleImport: CoatOfArmsEditor.#onToggleImport,
      loadImport: CoatOfArmsEditor.#onLoadImport,
      openCatalog: CoatOfArmsEditor.#onOpenCatalog,
      closeCatalog: CoatOfArmsEditor.#onCloseCatalog,
      pickCatalog: CoatOfArmsEditor.#onPickCatalog,
      useCatalog: CoatOfArmsEditor.#onUseCatalog,
      randomCoa: CoatOfArmsEditor.#onRandom,
      save: CoatOfArmsEditor.#onSave,
      close: CoatOfArmsEditor.#onClose,
    },
  };

  static PARTS = {
    main: {
      template: `${TP}/coat-of-arms-editor.hbs`,
      // Preserve each column's scroll position across re-renders (AppV2) — clicking
      // an option in the inspector no longer jumps the scrollbar back to the top.
      scrollable: [".coa-insp-body", ".coa-layer-list", ".coa-col-preview"],
      templates: [
        `${TP}/partials/coa-preview.hbs`,
        `${TP}/partials/coa-layers.hbs`,
        `${TP}/partials/coa-import.hbs`,
        `${TP}/partials/coa-inspector.hbs`,
        `${TP}/partials/coa-tincture.hbs`,
        `${TP}/partials/coa-inspector-shield.hbs`,
        `${TP}/partials/coa-inspector-field.hbs`,
        `${TP}/partials/coa-inspector-division.hbs`,
        `${TP}/partials/coa-inspector-ordinary.hbs`,
        `${TP}/partials/coa-inspector-charge.hbs`,
        `${TP}/partials/coa-charge-catalog.hbs`,
        `${TP}/partials/coa-footer.hbs`,
      ],
    },
  };

  /** ApplicationV2 has no document getter — expose the captured actor. */
  get document() {
    return this.#actor;
  }

  /** @override — window title carries the house name. */
  get title() {
    return SystemUtils.format("CS.coa.title", {
      name: this.#actor?.name ?? "",
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Context                                                            */
  /* ------------------------------------------------------------------ */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const coa = this.#coa;
    const ui = this.#ui;

    return {
      ...context,
      coa,
      ui,
      layers: this.#buildLayers(),
      inspectorHeader: this.#inspectorHeader(),
      inspector: this.#buildInspector(),
      preview: { caption: SystemUtils.localize("CS.coa.preview.live") },
      background: {
        on: !!(coa.background && coa.background !== "none"),
        color: HEX_RE.test(coa.background)
          ? coa.background.toLowerCase()
          : "#ffffff",
      },
      catalog: ui.catalogOpen ? this.#buildCatalog() : null,
      canUpload: canUpload(),
    };
  }

  /** Middle-column layer rows (top = front for charges). */
  #buildLayers() {
    const coa = this.#coa;
    const sel = this.#ui.selected;
    const rows = [];
    let z = 0;

    const push = (row) => {
      const on =
        sel.type === row.type &&
        (row.index === undefined ? true : sel.index === row.index);
      rows.push({
        ...row,
        selected: on,
        glyph: LAYER_META[row.type].glyph,
        iconBg: on ? "#015ea6" : "#ffffff",
        iconFg: on ? "#ffffff" : "#7a8494",
        accent: on ? "#015ea6" : "transparent",
        rowBg: on ? "#dfe5f3" : z++ % 2 ? "#e6e6e8" : "#ffffff",
        nameColor: on ? "#013f70" : "#242021",
        hasTinct: !!row.tinctHex,
      });
    };

    push({
      type: "shield",
      name: SystemUtils.localize("CS.coa.layers.shield"),
      detail: label("shields", coa.shield ?? "heater"),
      locked: true,
    });
    push({
      type: "field",
      name: SystemUtils.localize("CS.coa.layers.field"),
      detail: `t1 · ${this.#tinctureLabel(coa.t1)}`,
      tinctHex: this.#swatchHex(coa.t1),
      locked: true,
    });
    push({
      type: "division",
      name: SystemUtils.localize("CS.coa.layers.division"),
      detail: coa.division?.division
        ? label("divisions", coa.division.division)
        : "—",
      tinctHex: coa.division?.t ? this.#swatchHex(coa.division.t) : null,
      locked: true,
    });
    (coa.ordinaries ?? []).forEach((o, index) => {
      push({
        type: "ordinary",
        index,
        hasIndex: true,
        name: label("ordinaries", o.ordinary),
        detail: `${SystemUtils.localize(
          "CS.coa.layers.ordinary"
        )} · ${this.#tinctureLabel(o.t)}`,
        tinctHex: this.#swatchHex(o.t),
        canMoveUp: index > 0,
        canMoveDown: index < coa.ordinaries.length - 1,
      });
    });
    (coa.charges ?? []).forEach((ch, index) => {
      push({
        type: "charge",
        index,
        hasIndex: true,
        name: label("charges", ch.charge),
        detail: `${SystemUtils.localize(
          "CS.coa.layers.charge"
        )} · ${this.#tinctureLabel(ch.t)}`,
        tinctHex: this.#swatchHex(ch.t),
        canMoveUp: index > 0,
        canMoveDown: index < coa.charges.length - 1,
      });
    });
    return rows;
  }

  /** Inspector column header (icon + name + kind). */
  #inspectorHeader() {
    const sel = this.#ui.selected;
    const coa = this.#coa;
    const meta = LAYER_META[sel.type] ?? LAYER_META.field;
    let name = SystemUtils.localize(`CS.coa.layers.${sel.type}`);
    if (sel.type === "ordinary") {
      name = label("ordinaries", coa.ordinaries?.[sel.index]?.ordinary);
    } else if (sel.type === "charge") {
      name = label("charges", coa.charges?.[sel.index]?.charge);
    }
    return {
      glyph: meta.glyph,
      name,
      kind: SystemUtils.localize(meta.kind),
    };
  }

  /** Right-column inspector BODY context for the selected layer. */
  #buildInspector() {
    const sel = this.#ui.selected;
    const coa = this.#coa;
    const base = { advanced: this.#ui.advanced };

    switch (sel.type) {
      case "shield": {
        const current = coa.shield ?? "heater";
        return {
          ...base,
          isShield: true,
          shields: CATALOG.shields.map((k) => ({
            key: k,
            label: label("shields", k),
            selected: current === k,
            svg: shieldSvg(k), // shared component (DRY) — same as the position map
          })),
        };
      }
      case "field":
        return {
          ...base,
          isField: true,
          tincture: this.#tinctureControl(
            "t1",
            coa.t1,
            "CS.coa.fields.fieldTincture",
            true
          ),
        };
      case "division": {
        const d = coa.division ?? {};
        return {
          ...base,
          isDivision: true,
          hasDivision: !!d.division,
          lined: CATALOG.linedDivisions.includes(d.division),
          divisionCells: this.#divisionCells(d.division),
          lineCells: this.#lineCells(d.line),
          tincture: this.#tinctureControl(
            "division.t",
            d.t,
            "CS.coa.fields.secondHalfTincture",
            true
          ),
        };
      }
      case "ordinary": {
        const o = coa.ordinaries?.[sel.index];
        if (!o) return { isEmpty: true };
        const lined = CATALOG.linedOrdinaries.includes(o.ordinary);
        return {
          ...base,
          isOrdinary: true,
          index: sel.index,
          ordinaryCells: this.#ordinaryCells(o.ordinary),
          lined,
          lineCells: lined ? this.#lineCells(o.line) : null,
          tincture: this.#tinctureControl(
            `ordinaries.${sel.index}.t`,
            o.t,
            "CS.coa.fields.tincture",
            false
          ),
          tincture2: this.#tinctureControl(
            `ordinaries.${sel.index}.t2`,
            o.t2,
            "CS.coa.fields.secondColor",
            false
          ),
          o,
        };
      }
      case "charge": {
        const ch = coa.charges?.[sel.index];
        if (!ch) return { isEmpty: true };
        const info = chargeInfo(ch.charge);
        const colors = info.colors ?? 1;
        return {
          ...base,
          isCharge: true,
          index: sel.index,
          chargeLabel: label("charges", ch.charge),
          thumb: this.#chargeThumb(ch.charge),
          positions: this.#positionCells(ch.p),
          // "Divisor" — how the charge interacts with the field division. Only
          // meaningful when a division exists (Armoria).
          dividedOptions: this.#dividedOptions(ch.divided),
          tincture: this.#tinctureControl(
            `charges.${sel.index}.t`,
            ch.t,
            "CS.coa.fields.chargeColor",
            false
          ),
          tincture2:
            colors >= 2
              ? this.#tinctureControl(
                  `charges.${sel.index}.t2`,
                  ch.t2,
                  "CS.coa.fields.secondColor",
                  false
                )
              : null,
          tincture3:
            colors >= 3
              ? this.#tinctureControl(
                  `charges.${sel.index}.t3`,
                  ch.t3,
                  "CS.coa.fields.thirdColor",
                  false
                )
              : null,
          allowSinister: !!info.sinister,
          allowReversed: !!info.reversed,
          allowLayered: !!info.layered,
          // Outline (charge.stroke is a COLOR — "none" hides it; default is black).
          strokeOn: ch.stroke !== "none",
          strokeColor: HEX_RE.test(ch.stroke) ? ch.stroke : "#000000",
          ch,
        };
      }
      default:
        return { isEmpty: true };
    }
  }

  /** Parse a pattern/semy tincture string into its parts (or null). */
  #parseTincture(value) {
    if (typeof value !== "string") return null;
    const isSemy = value.startsWith("semy_of_");
    const body = isSemy ? value.slice("semy_of_".length) : value;
    const parts = body.split("-");
    if (parts.length < 3 || parts.length > 4) return null;
    return { head: parts[0], t1: parts[1], t2: parts[2], size: parts[3] ?? "" };
  }

  /** A tincture control descriptor for the reusable partial. */
  #tinctureControl(path, value, labelKey, advanced) {
    const isHex = typeof value === "string" && HEX_RE.test(value);
    const isKey = KNOWN_TINCTURE.has(value);
    // Mode: explicit UI choice, else derived from the value shape.
    let mode = this.#ui.tinctMode[path];
    if (!mode) {
      if (typeof value === "string" && value.startsWith("semy_of_"))
        mode = "semy";
      else if (!isKey && !isHex && value) mode = "padrao";
      else mode = "tintura";
    }
    const swatchHex = this.#swatchHex(value);
    const parsed = this.#parseTincture(value) ?? {};
    // Colour options span the full renderer vocabulary (13), not the 10-swatch set.
    // Rendered as swatches (same `.csv2-swatch` as tintura mode) — not dropdowns.
    const tinctOpt = (current) =>
      [...KNOWN_TINCTURE].map((k) => ({
        key: k,
        label: label("tinctures", k),
        color: swatchColor(k),
        selected: current === k,
      }));
    const semyKey = mode === "semy" ? parsed.head : null;
    return {
      path,
      label: SystemUtils.localize(labelKey),
      advanced,
      mode,
      isTintura: mode === "tintura",
      isPadrao: mode === "padrao",
      isSemy: mode === "semy",
      isPatternish: mode !== "tintura",
      segTintura: mode === "tintura",
      segPadrao: mode === "padrao",
      segSemy: mode === "semy",
      isHex,
      hex: isHex ? value.toUpperCase() : swatchHex.toUpperCase(),
      // Lowercase 6-digit hex for the native <input type="color"> (it rejects
      // uppercase / short hex and would fall back to black).
      colorHex: (isHex ? value : swatchHex).toLowerCase(),
      selLabel: this.#tinctureLabel(value),
      swatches: [...KNOWN_TINCTURE].map((k) => ({
        key: k,
        label: label("tinctures", k),
        color: swatchColor(k),
        selected: value === k,
      })),
      headLabel: SystemUtils.localize(
        mode === "semy"
          ? "CS.coa.fields.semyPicker"
          : "CS.coa.fields.patternPicker"
      ),
      // Pattern shape grid (padrão) — visual, like the division / ordinary grids.
      patternCells: mode === "padrao" ? this.#patternCells(parsed.head) : null,
      // Semy charge (semy) — a symbol button that opens the shared charge catalog.
      semyThumb: semyKey ? this.#chargeThumb(semyKey) : null,
      semyChargeLabel: semyKey
        ? label("charges", semyKey)
        : SystemUtils.localize("CS.coa.fields.semyPickCharge"),
      color1: tinctOpt(parsed.t1),
      color2: tinctOpt(parsed.t2),
      // Ascending size order; no "—" option — "standard" IS the default (selected
      // when the value carries no explicit size).
      sizeOptions: SIZE_ORDER.map((k) => ({
        key: k,
        label: label("sizes", k),
        selected: (parsed.size || "standard") === k,
      })),
    };
  }

  /** The swatch hex for a tincture value (key → palette, hex → itself). */
  #swatchHex(value) {
    if (typeof value === "string" && HEX_RE.test(value)) return value;
    if (KNOWN_TINCTURE.has(value)) return swatchColor(value);
    return "#8a8688";
  }

  #tinctureLabel(value) {
    if (!value) return "—";
    if (KNOWN_TINCTURE.has(value)) return label("tinctures", value);
    return value; // hex or pattern string
  }

  #chargeThumb(chargeKey) {
    return CATALOG.chargeThumbs?.includes(chargeKey)
      ? `${CHARGE_THUMB_DIR}/${chargeKey}.svg`
      : null;
  }

  /** Pattern picker cells: each pattern rendered as a two-tone swatch (same neutral
   *  palette as the division / ordinary grids). Patterns fill via `url(#id)`, which
   *  only paints when the SVG is an isolated `<img>` document (AppV2's detached part
   *  parse drops paint-server refs) — so these are data-URI images, not inline SVG.
   *  `current` = the selected head, if any. */
  #patternCells(current) {
    const A = "#c9d3e4"; // metal tone
    const B = "#5a6b86"; // colour tone
    const resolveKey = (k) => (k === "p2" ? B : A);
    return CATALOG.patterns.map((key) => {
      // Fixed placeholder tokens p1/p2 → the two neutral tones (shape preview only;
      // real colours are chosen in the colour swatches below).
      const pid = `${key}-p1-p2`;
      const pat = buildPattern(pid, {
        patternGeom: CATALOG.patternGeom,
        resolveKey,
      });
      const svg = pat
        ? cellSvg(
            `<defs>${pat}</defs><rect width="200" height="200" fill="url(#${pid})"/>`
          )
        : cellSvg(`<rect width="200" height="200" fill="${A}"/>`);
      return {
        key,
        label: label("patterns", key),
        img: svgToDataUri(svg),
        selected: current === key,
      };
    });
  }

  /** Division picker cells with an inline SVG preview of each partition (+ a
   *  "none" cell to clear). Two-tone (field vs division region) like the shield grid. */
  #divisionCells(current) {
    const A = "#c9d3e4"; // field tone (matches shield-grid palette)
    const B = "#5a6b86"; // division-region tone
    const cells = [
      {
        key: "",
        label: SystemUtils.localize("CS.coa.fields.noDivision"),
        svg: cellSvg(`<rect width="200" height="200" fill="${A}"/>`),
        selected: !current,
      },
    ];
    for (const key of CATALOG.divisions) {
      const tmpl = CATALOG.divisionGeom?.[key]?.template ?? "";
      cells.push({
        key,
        label: label("divisions", key),
        svg: cellSvg(
          `<rect width="200" height="200" fill="${A}"/><g fill="${B}">${tmpl}</g>`
        ),
        selected: current === key,
      });
    }
    return cells;
  }

  /** Charge "Divisor" options (how it interacts with the field division): none |
   *  field (behind the division) | division (clipped to it) | counter
   *  (counterchanged). Null when the COA has no division (control is hidden). */
  #dividedOptions(current) {
    const d = this.#coa.division;
    if (!d || !d.division || d.division === "no") return null;
    return ["", "field", "division", "counter"].map((key) => ({
      key,
      label: SystemUtils.localize(
        `CS.coa.fields.divided${
          key ? key[0].toUpperCase() + key.slice(1) : "None"
        }`
      ),
      selected: (current ?? "") === key,
    }));
  }

  /** Ordinary picker cells with an inline preview of each ordinary on the field
   *  (from ordinaryGeom; bordure/orle drawn as the shield outline, like the render). */
  #ordinaryCells(current) {
    const A = "#c9d3e4"; // field tone
    const B = "#5a6b86"; // ordinary tone
    const shieldPath =
      CATALOG.shieldPaths?.[this.#coa.shield ?? "heater"]?.path;
    return CATALOG.ordinaries.map((key) => {
      let inner;
      if ((key === "bordure" || key === "orle") && shieldPath) {
        const w = key === "bordure" ? 33.3 : 10;
        const tf =
          key === "orle" ? ` transform="translate(15 15) scale(.85)"` : "";
        inner = `<path d="${shieldPath}" fill="none" stroke="${B}" stroke-width="${w}"${tf}/>`;
      } else {
        inner = `<g fill="${B}">${
          CATALOG.ordinaryGeom?.[key]?.template ?? ""
        }</g>`;
      }
      return {
        key,
        label: label("ordinaries", key),
        svg: cellSvg(`<rect width="200" height="200" fill="${A}"/>${inner}`),
        selected: current === key,
      };
    });
  }

  /** Line-style picker cells with an inline preview of each edge (from lineData).
   *  An unset line renders as "straight". */
  #lineCells(current) {
    const sel = current || "straight";
    return CATALOG.lines.map((key) => {
      const path = CATALOG.lineData?.[key] ?? "";
      return {
        key,
        label: label("lines", key),
        svg: `<svg class="coa-line-svg" viewBox="0 76 200 60" preserveAspectRatio="xMidYMid meet"><path d="${path}" fill="none" stroke="#5a6b86" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
        selected: sel === key,
      };
    });
  }

  /** Position map: EVERY valid position for the current shield as a mini-shield-
   *  with-dot cell (covers all of Armoria's positions, not just a 3×3, so an
   *  imported / complex position can always be re-selected). `current` = ch.p,
   *  which may hold several codes — each contained code is highlighted. A charge at
   *  code p (size 1) sits at (100 + posX, 100 + posY) — see getElTransform. */
  #positionCells(current) {
    const shield = this.#coa.shield ?? "heater";
    const coords =
      CATALOG.positionCoords[shield] ?? CATALOG.positionCoords.spanish ?? {};
    const on = String(current ?? "");
    // Reuse the shared shieldSvg() component (DRY) and just overlay a bold dot at the
    // exact spot the charge sits (100 + posX, 100 + posY). The IMAGE is the point —
    // players can't read Armoria's letter codes, so no text label.
    return Object.entries(coords).map(([code, [px, py]]) => {
      const selected = on.includes(code);
      const dot = `<circle cx="${100 + px}" cy="${100 + py}" r="${
        selected ? 27 : 21
      }" fill="${
        selected ? "#015ea6" : "#c02231"
      }" stroke="#fff" stroke-width="5"/>`;
      return { code, selected, svg: shieldSvg(shield, dot) };
    });
  }

  /** Full charge catalog (rendered once; searched client-side). */
  #buildCatalog() {
    const items = searchCharges("").map((row) => ({
      key: row.key,
      label: row.label,
      thumb: this.#chargeThumb(row.key),
      selected: this.#ui.catalogSelection === row.key,
    }));
    return {
      items,
      count: SystemUtils.format("CS.coa.catalog.count", {
        shown: items.length,
        total: CATALOG.charges.length,
      }),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Listeners (re-attached on every render)                            */
  /* ------------------------------------------------------------------ */

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    htmlElement.addEventListener("input", this.#onFormInput.bind(this));
    htmlElement.addEventListener("change", this.#onFormChange.bind(this));

    if (this.#ui.catalogOpen) {
      const search = htmlElement.querySelector(".coa-catalog-search");
      if (search) {
        search.addEventListener("input", () => {
          const keys = new Set(searchCharges(search.value).map((r) => r.key));
          for (const el of htmlElement.querySelectorAll(".coa-catalog-item")) {
            el.classList.toggle("is-hidden", !keys.has(el.dataset.charge));
          }
        });
      }
      // Backdrop click closes; clicks inside the panel do not.
      const overlay = htmlElement.querySelector(".coa-catalog-overlay");
      overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) {
          this.#ui.catalogOpen = false;
          this.render();
        }
      });
    }

    this.#updatePreview();
  }

  #onFormInput(event) {
    const el = event.target;
    if (el?.dataset?.tinctPart !== undefined) {
      this.#rebuildPattern(el);
      return;
    }
    if (!el?.dataset?.coa) return;
    this.#applyInput(el);
    this.#updatePreview();
  }

  #onFormChange(event) {
    const el = event.target;
    if (el?.dataset?.tinctPart !== undefined) {
      this.#rebuildPattern(el);
      return;
    }
    // Outline toggle: checked → outline in the chosen colour; unchecked → "none"
    // (charge.stroke is a colour string in the render — "none" hides the outline).
    if (el?.dataset?.strokeToggle !== undefined) {
      const index = Number(el.dataset.index);
      const ch = this.#coa.charges?.[index];
      if (ch) {
        if (el.checked) {
          const colorEl = this.element?.querySelector(
            `[data-stroke-color][data-index="${index}"]`
          );
          ch.stroke = colorEl?.value || "#000000";
        } else {
          ch.stroke = "none";
        }
      }
      this.render(); // re-render to enable/disable the colour input
      return;
    }
    // Background toggle: checked → fill behind the shield; unchecked → transparent.
    if (el?.dataset?.bgToggle !== undefined) {
      if (el.checked) {
        const colorEl = this.element?.querySelector("[data-bg-color]");
        this.#coa.background = colorEl?.value || "#ffffff";
      } else {
        delete this.#coa.background;
      }
      this.render();
      return;
    }
    if (!el?.dataset?.coa) return;
    this.#applyInput(el);
    if (el.dataset.rerender !== undefined) this.render();
    else this.#updatePreview();
  }

  /** Read a control's value into the in-memory COA. */
  #applyInput(el) {
    const path = el.dataset.coa;
    const dtype = el.dataset.dtype;
    let value;
    if (el.type === "checkbox") value = el.checked;
    else if (dtype === "Number")
      value = el.value === "" ? undefined : Number(el.value);
    else value = el.value;

    const optional = el.dataset.optional !== undefined;
    if (optional && (value === "" || value === undefined || value === false)) {
      foundry.utils.deleteProperty(this.#coa, path);
    } else {
      foundry.utils.setProperty(this.#coa, path, value);
    }
  }

  /**
   * SSOT for the pattern/semy composite tincture string. Merges `patch`
   * ({head, t1, t2, size, semy}) over the current value's parsed parts and writes
   * `<head>-<t1>-<t2>[-size]` (pattern) or `semy_of_<charge>-<t1>-<t2>[-size]` (semy)
   * to `path`. Returns false when there is no head yet (nothing to compose).
   */
  #composeTincture(path, patch = {}) {
    const cur = foundry.utils.getProperty(this.#coa, path);
    const parsed = this.#parseTincture(cur) ?? {};
    const isSemy =
      patch.semy ?? (typeof cur === "string" && cur.startsWith("semy_of_"));
    const head = patch.head ?? parsed.head;
    if (!head) return false;
    const t1 = patch.t1 ?? parsed.t1 ?? "argent";
    const t2 = patch.t2 ?? parsed.t2 ?? (isSemy ? "sable" : "azure");
    const size = patch.size ?? parsed.size ?? "";
    const prefix = isSemy ? `semy_of_${head}` : head;
    const suffix = size && size !== "standard" ? `-${size}` : "";
    foundry.utils.setProperty(
      this.#coa,
      path,
      `${prefix}-${t1}-${t2}${suffix}`
    );
    return true;
  }

  /** Size select change (the only remaining pattern/semy part select) — colour and
   *  head are chosen via swatches / grid, so just patch the size. */
  #rebuildPattern(el) {
    const container = el.closest("[data-tinct-path]");
    if (!container) return;
    this.#composeTincture(container.dataset.tinctPath, { size: el.value });
    this.#updatePreview();
  }

  /* ------------------------------------------------------------------ */
  /*  Preview (DOM only — no re-render, no network, synchronous)         */
  /* ------------------------------------------------------------------ */

  /** Rebuild the SVG locally and inject it inline — <100 ms, no flicker (D10). */
  #updatePreview() {
    const host = this.element?.querySelector(".coa-preview-svg");
    if (!host) return;
    const { svg } = buildCoaSvg(this.#coa, { size: SAVE_SIZE });
    // Trusted, self-authored SVG (no cleanHTML — it would strip svg/path/g).
    host.innerHTML = svg;
  }

  /* ------------------------------------------------------------------ */
  /*  COA hydration (US2/US3/US4 share this)                             */
  /* ------------------------------------------------------------------ */

  #hydrate(saved) {
    if (!saved || foundry.utils.isEmpty(saved)) return defaultCoa();
    const coa = foundry.utils.deepClone(saved);
    coa.shield ??= "heater";
    coa.t1 ??= "argent";
    coa.ordinaries = Array.isArray(coa.ordinaries) ? coa.ordinaries : [];
    coa.charges = Array.isArray(coa.charges) ? coa.charges : [];
    return coa;
  }

  #loadCoa(coa) {
    this.#coa = this.#hydrate(coa);
    this.#ui.selected = { type: "field", index: null };
    this.#ui.catalogOpen = false;
    this.#ui.tinctMode = {};
    this.render();
  }

  /* ------------------------------------------------------------------ */
  /*  Action handlers (this = instance; args = event, target)            */
  /* ------------------------------------------------------------------ */

  static #onSelectLayer(event, target) {
    const type = target.dataset.layerType;
    const index =
      target.dataset.index !== undefined ? Number(target.dataset.index) : null;
    this.#ui.selected = { type, index };
    this.render();
  }

  static #onSelectShield(event, target) {
    this.#coa.shield = target.dataset.shield;
    this.render();
  }

  /** Pick a division from the visual grid. Empty key clears the division; a real
   *  type keeps the existing tincture/line (or defaults) so the render is complete. */
  static #onSelectDivision(event, target) {
    const key = target.dataset.division;
    if (!key) {
      delete this.#coa.division;
    } else {
      this.#coa.division = {
        division: key,
        t: this.#coa.division?.t ?? "argent",
        ...(this.#coa.division?.line ? { line: this.#coa.division.line } : {}),
      };
    }
    this.render();
  }

  /** Pick an ordinary type from the visual grid (for the selected ordinary). */
  static #onSelectOrdinary(event, target) {
    const sel = this.#ui.selected;
    if (sel.type !== "ordinary" || !this.#coa.ordinaries?.[sel.index]) return;
    this.#coa.ordinaries[sel.index].ordinary = target.dataset.ordinary;
    this.render(); // lined-ness may change → the line grid appears/disappears
  }

  /** Pick a line style from the visual grid — for the division or the ordinary. */
  static #onSelectLine(event, target) {
    const sel = this.#ui.selected;
    const line = target.dataset.line;
    if (sel.type === "division" && this.#coa.division) {
      this.#coa.division.line = line;
    } else if (sel.type === "ordinary" && this.#coa.ordinaries?.[sel.index]) {
      this.#coa.ordinaries[sel.index].line = line;
    }
    this.render();
  }

  static #onAddDivision() {
    this.#coa.division = { division: CATALOG.divisions[0], t: "argent" };
    this.#ui.selected = { type: "division", index: null };
    this.render();
  }

  static #onAddOrdinary() {
    this.#coa.ordinaries ??= [];
    this.#coa.ordinaries.push({ ordinary: CATALOG.ordinaries[0], t: "or" });
    this.#ui.selected = {
      type: "ordinary",
      index: this.#coa.ordinaries.length - 1,
    };
    this.render();
  }

  static #onAddCharge() {
    this.#ui.catalogOpen = true;
    this.#ui.catalogSelection = null;
    this.#ui.catalogMode = "add"; // always append, even with a charge selected
    this.render();
  }

  static #onRemoveLayer(event, target) {
    const type = target.dataset.layerType;
    const index =
      target.dataset.index !== undefined ? Number(target.dataset.index) : null;
    if (type === "division") delete this.#coa.division;
    else if (type === "ordinary") this.#coa.ordinaries.splice(index, 1);
    else if (type === "charge") this.#coa.charges.splice(index, 1);
    this.#ui.selected = { type: "field", index: null };
    this.render();
  }

  static #onMoveLayer(event, target) {
    const type = target.dataset.layerType;
    const index = Number(target.dataset.index);
    const dir = target.dataset.dir === "up" ? -1 : 1;
    const list = type === "charge" ? this.#coa.charges : this.#coa.ordinaries;
    const to = index + dir;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    this.#ui.selected = { type, index: to };
    this.render();
  }

  static #onSetTincture(event, target) {
    const path = target.dataset.path;
    const key = target.dataset.tincture;
    this.#ui.tinctMode[path] = "tintura";
    foundry.utils.setProperty(this.#coa, path, key);
    this.render();
  }

  static #onSetTinctMode(event, target) {
    const path = target.dataset.path;
    const mode = target.dataset.mode;
    this.#ui.tinctMode[path] = mode;
    // Switching back to solid removes any pattern/semy value (it has no solid
    // meaning) — this is the "remove pattern/charge" affordance.
    if (mode === "tintura") {
      const val = foundry.utils.getProperty(this.#coa, path);
      if (typeof val === "string" && val.includes("-") && !HEX_RE.test(val)) {
        foundry.utils.setProperty(this.#coa, path, "argent");
      }
    }
    this.render();
  }

  static #onRestoreTincture(event, target) {
    const path = target.dataset.path;
    this.#ui.tinctMode[path] = "tintura";
    foundry.utils.setProperty(this.#coa, path, "argent");
    this.render();
  }

  /** Pick a pattern shape from the grid (padrão). Keeps the current colours/size. */
  static #onSelectPatternHead(event, target) {
    const path = target.dataset.path;
    this.#ui.tinctMode[path] = "padrao";
    this.#composeTincture(path, { head: target.dataset.head, semy: false });
    this.render();
  }

  /** Pick colour 1 / colour 2 of a pattern/semy from a swatch (same swatches as
   *  tintura mode). No-ops until a pattern/charge head is chosen. */
  static #onSetPatternColor(event, target) {
    const path = target.dataset.path;
    this.#composeTincture(path, {
      [target.dataset.part]: target.dataset.tincture,
    });
    this.render();
  }

  /** Open the shared charge catalog to choose the semy charge for a tincture. */
  static #onOpenSemyCatalog(event, target) {
    this.#ui.catalogOpen = true;
    this.#ui.catalogSelection = null;
    this.#ui.catalogMode = "semy";
    this.#ui.semyPath = target.dataset.path;
    this.render();
  }

  static #onSetPosition(event, target) {
    const index = Number(target.dataset.index);
    if (this.#coa.charges?.[index]) {
      this.#coa.charges[index].p = target.dataset.code;
      this.render();
    }
  }

  static #onToggleAdvanced() {
    this.#ui.advanced = !this.#ui.advanced;
    this.render();
  }

  static #onToggleImport() {
    this.#ui.importOpen = !this.#ui.importOpen;
    this.render();
  }

  static async #onLoadImport() {
    const textarea = this.element?.querySelector(".coa-import-text");
    const text = textarea?.value ?? "";
    // resolveImport is local for COA strings / embedded links; a seed link makes
    // ONE explicit fetch (US4/FR-008). On any error the layers stay intact (AC4.3).
    const result = await resolveImport(text, CATALOG);
    if (result.error) {
      const key =
        result.error === "invalid"
          ? "CS.coa.warnings.unknownVocabulary"
          : "CS.coa.errors.importFailed";
      ui.notifications?.warn(SystemUtils.localize(key));
      return;
    }
    // Armoria's edit link never carries the shield shape (it lives in a separate
    // store there). Keep the shield already chosen so importing content doesn't
    // silently reset it to the default — the panel note tells the user to set it.
    if (!result.coa.shield) result.coa.shield = this.#coa.shield ?? "heater";
    this.#loadCoa(result.coa);
  }

  static #onOpenCatalog() {
    this.#ui.catalogOpen = true;
    this.#ui.catalogMode = "swap"; // replace the selected charge's symbol
    this.render();
  }

  static #onCloseCatalog() {
    this.#ui.catalogOpen = false;
    this.render();
  }

  static #onPickCatalog(event, target) {
    this.#ui.catalogSelection = target.dataset.charge;
    for (const el of this.element.querySelectorAll(".coa-catalog-item")) {
      el.classList.toggle(
        "is-selected",
        el.dataset.charge === target.dataset.charge
      );
    }
  }

  static #onUseCatalog() {
    const key = this.#ui.catalogSelection;
    if (!key) return;
    // Semy: the catalog was opened from a tincture control to choose the charge
    // strewn across the field — build the semy_of_<charge>-<t1>-<t2>[-size] string.
    if (this.#ui.catalogMode === "semy" && this.#ui.semyPath) {
      const path = this.#ui.semyPath;
      this.#ui.tinctMode[path] = "semy";
      this.#composeTincture(path, { head: key, semy: true });
      this.#ui.catalogOpen = false;
      this.#ui.semyPath = null;
      this.render();
      return;
    }
    // Swap ONLY when the catalog was opened to change a selected charge's symbol
    // ("swap"); the "+ charge" button ("add") always appends a new charge, even
    // while a charge is selected.
    const sel = this.#ui.selected;
    if (
      this.#ui.catalogMode === "swap" &&
      sel.type === "charge" &&
      this.#coa.charges?.[sel.index]
    ) {
      this.#coa.charges[sel.index].charge = key;
    } else {
      this.#coa.charges ??= [];
      this.#coa.charges.push({ charge: key, t: "sable", p: "e" });
      this.#ui.selected = {
        type: "charge",
        index: this.#coa.charges.length - 1,
      };
    }
    this.#ui.catalogOpen = false;
    this.render();
  }

  static #onRandom() {
    this.#loadCoa(randomCoa(CATALOG));
  }

  static async #onSave() {
    const coa = this.#coa;
    const result = validate(coa, CATALOG);
    if (!result.ok) {
      const first = result.errors[0];
      ui.notifications?.error(SystemUtils.format(first.key, first.data ?? {}));
      return;
    }

    if (!canUpload()) {
      await saveDefinitionOnly(this.#actor, coa);
      ui.notifications?.warn(
        SystemUtils.localize("CS.coa.warnings.noUploadPermission")
      );
      return this.close();
    }

    try {
      await renderAndSave(this.#actor, coa, { size: SAVE_SIZE });
      this.close();
    } catch (err) {
      console.warn(
        "Chronicle | CoA render failed, saving definition only:",
        err
      );
      await saveDefinitionOnly(this.#actor, coa);
      ui.notifications?.warn(
        SystemUtils.localize("CS.coa.warnings.savedWithoutImage")
      );
      this.close();
    }
  }

  static #onClose() {
    this.close();
  }
}

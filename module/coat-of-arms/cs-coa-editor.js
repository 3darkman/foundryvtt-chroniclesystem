// Coat of Arms editor — a standalone ApplicationV2 window (D1). Composes a COA
// object in memory (source of truth while editing), previews it live via the
// Armoria API (debounced), gates on the complexity budget, and on Save renders +
// persists the image as the house identity. Layout + tokens follow the hifi design
// handoff (docs/design_handoff_coat_of_arms): 3 columns 270/300/1fr, dark title
// bar, blue section headers, complexity meter bar, colored layer type-icons.
//
// ApplicationV2 note: the base has NO `document` getter — the live actor lives in
// `this.options.document` (captured here as `#actor`).

import { CATALOG, shieldPositions, chargeInfo } from "./cs-armoria-catalog.js";
import { label, searchCharges } from "./cs-coa-labels.js";
import { buildUrl, CANONICAL_FORMAT, URL_BUDGET } from "./cs-armoria-url.js";
import { validate, budget } from "./cs-coa-validation.js";
import {
  renderAndSave,
  saveDefinitionOnly,
  canUpload,
} from "./cs-coa-render.js";
import { parseImport } from "./cs-coa-import.js";
import { randomCoa } from "./cs-coa-random.js";
import SystemUtils from "../utils/systemUtils.js";

const TP = "systems/chroniclesystem/templates/apps";
const CHARGE_THUMB_DIR = "systems/chroniclesystem/assets/armoria/charges";
const PREVIEW_DEBOUNCE_MS = 400;
const DEFAULT_PREVIEW_SIZE = 250;
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

export class CoatOfArmsEditor extends CoaEditorBase {
  /** Live actor (ApplicationV2 has no `document` getter — use this). */
  #actor;
  /** In-memory COA definition (source of truth while the window is open). */
  #coa;
  /** Transient UI state — never persisted (data-model §Estado de UI). */
  #ui;
  /** Debounce handle for the live preview. */
  #previewTimer = null;

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
      tinctMode: {}, // path -> "tintura" | "padrao" | "semy"
      format: "svg",
      size: DEFAULT_PREVIEW_SIZE,
      imgFailed: false,
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
      addDivision: CoatOfArmsEditor.#onAddDivision,
      addOrdinary: CoatOfArmsEditor.#onAddOrdinary,
      addCharge: CoatOfArmsEditor.#onAddCharge,
      removeLayer: CoatOfArmsEditor.#onRemoveLayer,
      moveLayer: CoatOfArmsEditor.#onMoveLayer,
      setTincture: CoatOfArmsEditor.#onSetTincture,
      setTinctMode: CoatOfArmsEditor.#onSetTinctMode,
      restoreTincture: CoatOfArmsEditor.#onRestoreTincture,
      setPosition: CoatOfArmsEditor.#onSetPosition,
      setPreviewFormat: CoatOfArmsEditor.#onSetPreviewFormat,
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
      preview: this.#buildPreview(),
      meter: this.#buildMeter(),
      catalog: ui.catalogOpen ? this.#buildCatalog() : null,
      canUpload: canUpload(),
    };
  }

  #buildPreview() {
    const ui = this.#ui;
    return {
      url: buildUrl(this.#coa, { format: ui.format, size: ui.size }).url,
      size: ui.size,
      caption: ui.imgFailed
        ? SystemUtils.localize("CS.coa.preview.unavailable")
        : SystemUtils.localize("CS.coa.preview.live"),
      formats: [
        { value: "svg", label: "SVG", active: ui.format === "svg" },
        { value: "png", label: "PNG", active: ui.format === "png" },
      ],
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
          shields: CATALOG.shields.map((k) => {
            const shape = CATALOG.shieldPaths?.[k];
            return {
              key: k,
              label: label("shields", k),
              selected: current === k,
              path: shape?.path ?? null,
              box: shape?.box ?? "0 0 200 200",
            };
          }),
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
          divisions: this.#options("divisions", d.division, true),
          lines: this.#options("lines", d.line, true),
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
          ordinaries: this.#options("ordinaries", o.ordinary),
          lined,
          lines: lined ? this.#options("lines", o.line, true) : null,
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
          positions: this.#positionGrid(ch.p),
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
    const isKey = CATALOG.tinctures.includes(value);
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
    const opt = (axis, current) =>
      CATALOG[axis].map((k) => ({
        key: k,
        label: label(axis, k),
        selected: current === k,
      }));
    const headAxis = mode === "semy" ? "charges" : "patterns";
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
      selLabel: this.#tinctureLabel(value),
      swatches: CATALOG.tinctures.map((k) => ({
        key: k,
        label: label("tinctures", k),
        color: TINCTURE_SWATCH[k] ?? "#888888",
        selected: value === k,
      })),
      headLabel: SystemUtils.localize(
        mode === "semy"
          ? "CS.coa.fields.semyPicker"
          : "CS.coa.fields.patternPicker"
      ),
      headOptions: opt(headAxis, parsed.head),
      color1: opt("tinctures", parsed.t1),
      color2: opt("tinctures", parsed.t2),
      sizeOptions: [
        { key: "", label: "—", selected: !parsed.size },
        ...opt("sizes", parsed.size),
      ],
    };
  }

  /** The swatch hex for a tincture value (key → palette, hex → itself). */
  #swatchHex(value) {
    if (typeof value === "string" && HEX_RE.test(value)) return value;
    if (CATALOG.tinctures.includes(value)) return TINCTURE_SWATCH[value];
    return "#8a8688";
  }

  #tinctureLabel(value) {
    if (!value) return "—";
    if (CATALOG.tinctures.includes(value)) return label("tinctures", value);
    return value; // hex or pattern string
  }

  #chargeThumb(chargeKey) {
    return CATALOG.chargeThumbs?.includes(chargeKey)
      ? `${CHARGE_THUMB_DIR}/${chargeKey}.svg`
      : null;
  }

  /** Select options with a selected flag; `withNone` prepends an empty option. */
  #options(axis, current, withNone = false) {
    const opts = CATALOG[axis].map((k) => ({
      key: k,
      label: label(axis, k),
      selected: current === k,
    }));
    if (withNone) {
      opts.unshift({ key: "", label: "—", selected: current == null });
    }
    return opts;
  }

  /** 3×3 position grid (a–i) with invalid cells disabled per shield. */
  #positionGrid(current) {
    const valid = shieldPositions(this.#coa.shield ?? "heater");
    const codes = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    return codes.map((code) => ({
      code,
      enabled: valid.includes(code),
      selected: current === code,
    }));
  }

  /** Complexity meter descriptor from the SAVED (canonical) URL length. */
  #buildMeter() {
    const coa = this.#coa;
    const length = buildUrl(coa, {
      format: CANONICAL_FORMAT,
      size: SAVE_SIZE,
    }).length;
    const state = budget(length);
    const key = { OK: "ok", WARN: "warn", BLOCK: "block" }[state];
    const chips = {
      ok: { bg: "#e6efe9", fg: "#2f7d4f", color: "#2f7d4f" },
      warn: { bg: "#fbf4e6", fg: "#a5761b", color: "#c98a1e" },
      block: { bg: "#fbeeee", fg: "#b04a4a", color: "#b04a4a" },
    };
    const nCharges = coa.charges?.length ?? 0;
    const nOrd = coa.ordinaries?.length ?? 0;
    return {
      state,
      cssClass: `is-${key}`,
      badge: SystemUtils.localize(`CS.coa.meter.${key}`),
      pct: Math.min(100, (length / URL_BUDGET.BLOCK) * 100).toFixed(1),
      color: chips[key].color,
      chipBg: chips[key].bg,
      chipFg: chips[key].fg,
      text: SystemUtils.format("CS.coa.meter.text", {
        length,
        max: URL_BUDGET.BLOCK,
      }),
      loads: SystemUtils.format("CS.coa.meter.loads", {
        charges: nCharges,
        ordinaries: nOrd,
      }),
      blocked: state === "BLOCK",
    };
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

    const img = htmlElement.querySelector(".coa-preview-img");
    if (img) {
      img.addEventListener("error", () => this.#setImgFailed(true));
      img.addEventListener("load", () => this.#setImgFailed(false));
    }

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

    this.element?.classList.toggle("is-img-failed", this.#ui.imgFailed);
    this.#updatePreview();
  }

  #onFormInput(event) {
    const el = event.target;
    if (el?.dataset?.tinctPart !== undefined) {
      this.#rebuildPattern(el);
      return;
    }
    // Division-type selects are owned by the change handler (special-cased).
    if (el?.dataset?.divisionType !== undefined) return;
    if (!el?.dataset?.coa) return;
    this.#applyInput(el);
    this.#schedulePreview();
  }

  #onFormChange(event) {
    const el = event.target;
    if (el?.dataset?.previewSize !== undefined) {
      const v = Math.max(16, parseInt(el.value, 10) || DEFAULT_PREVIEW_SIZE);
      this.#ui.size = v;
      this.#updatePreview();
      return;
    }
    if (el?.dataset?.tinctPart !== undefined) {
      this.#rebuildPattern(el);
      return;
    }
    // Division type select: "" clears the whole division; a real type ensures a
    // default tincture so the render never gets a half-formed division.
    if (el?.dataset?.divisionType !== undefined) {
      if (!el.value) delete this.#coa.division;
      else {
        this.#coa.division = {
          division: el.value,
          t: this.#coa.division?.t ?? "argent",
          ...(this.#coa.division?.line
            ? { line: this.#coa.division.line }
            : {}),
        };
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

  /** Rebuild a pattern/semy composite tincture string from its part selects. */
  #rebuildPattern(el) {
    const container = el.closest("[data-tinct-path]");
    if (!container) return;
    const path = container.dataset.tinctPath;
    const mode = container.dataset.tinctMode;
    const get = (part) =>
      container.querySelector(`[data-tinct-part="${part}"]`)?.value ?? "";
    const head = get("head");
    const t1 = get("t1");
    const t2 = get("t2");
    const size = get("size");
    if (!head || !t1 || !t2) return;
    const prefix = mode === "semy" ? `semy_of_${head}` : head;
    const suffix = size && size !== "standard" ? `-${size}` : "";
    foundry.utils.setProperty(
      this.#coa,
      path,
      `${prefix}-${t1}-${t2}${suffix}`
    );
    this.#schedulePreview();
  }

  /* ------------------------------------------------------------------ */
  /*  Preview (DOM only — no re-render)                                  */
  /* ------------------------------------------------------------------ */

  #schedulePreview() {
    if (this.#previewTimer) clearTimeout(this.#previewTimer);
    this.#previewTimer = setTimeout(
      () => this.#updatePreview(),
      PREVIEW_DEBOUNCE_MS
    );
  }

  #updatePreview() {
    const root = this.element;
    if (!root) return;
    const coa = this.#coa;

    const img = root.querySelector(".coa-preview-img");
    if (img) {
      const { url } = buildUrl(coa, {
        format: this.#ui.format,
        size: this.#ui.size,
      });
      if (img.getAttribute("src") !== url) img.setAttribute("src", url);
    }

    const length = buildUrl(coa, {
      format: CANONICAL_FORMAT,
      size: SAVE_SIZE,
    }).length;
    const state = budget(length);
    const key = { OK: "ok", WARN: "warn", BLOCK: "block" }[state];
    const colors = { ok: "#2f7d4f", warn: "#c98a1e", block: "#b04a4a" };

    const meter = root.querySelector(".coa-meter");
    if (meter) {
      meter.classList.remove("is-ok", "is-warn", "is-block");
      meter.classList.add(`is-${key}`);
      const fill = meter.querySelector(".coa-meter-fill");
      if (fill) {
        fill.style.width = `${Math.min(
          100,
          (length / URL_BUDGET.BLOCK) * 100
        ).toFixed(1)}%`;
        fill.style.background = colors[key];
      }
      const chip = meter.querySelector(".coa-meter-chip");
      if (chip) chip.textContent = SystemUtils.localize(`CS.coa.meter.${key}`);
      const text = meter.querySelector(".coa-meter-text");
      if (text) {
        text.textContent = SystemUtils.format("CS.coa.meter.text", {
          length,
          max: URL_BUDGET.BLOCK,
        });
      }
    }

    const save = root.querySelector('[data-action="save"]');
    if (save) save.disabled = state === "BLOCK";
  }

  #setImgFailed(failed) {
    this.#ui.imgFailed = failed;
    this.element?.classList.toggle("is-img-failed", failed);
    const cap = this.element?.querySelector(".coa-preview-caption");
    if (cap) {
      cap.textContent = SystemUtils.localize(
        failed ? "CS.coa.preview.unavailable" : "CS.coa.preview.live"
      );
    }
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
    this.#ui.tinctMode[path] = target.dataset.mode;
    this.render();
  }

  static #onRestoreTincture(event, target) {
    const path = target.dataset.path;
    this.#ui.tinctMode[path] = "tintura";
    foundry.utils.setProperty(this.#coa, path, "argent");
    this.render();
  }

  static #onSetPosition(event, target) {
    const index = Number(target.dataset.index);
    if (this.#coa.charges?.[index]) {
      this.#coa.charges[index].p = target.dataset.code;
      this.render();
    }
  }

  static #onSetPreviewFormat(event, target) {
    this.#ui.format = target.dataset.format === "png" ? "png" : "svg";
    this.#ui.imgFailed = false;
    this.render();
  }

  static #onToggleAdvanced() {
    this.#ui.advanced = !this.#ui.advanced;
    this.render();
  }

  static #onToggleImport() {
    this.#ui.importOpen = !this.#ui.importOpen;
    this.render();
  }

  static #onLoadImport() {
    const textarea = this.element?.querySelector(".coa-import-text");
    const text = textarea?.value ?? "";
    const result = parseImport(text, CATALOG);
    if (result.error) {
      ui.notifications?.warn(
        SystemUtils.localize("CS.coa.errors.importFailed")
      );
      return;
    }
    this.#loadCoa(result.coa);
  }

  static #onOpenCatalog() {
    this.#ui.catalogOpen = true;
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
    // If a charge layer is selected, swap its charge; else append a new one.
    const sel = this.#ui.selected;
    if (sel.type === "charge" && this.#coa.charges?.[sel.index]) {
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
    const length = buildUrl(coa, {
      format: CANONICAL_FORMAT,
      size: SAVE_SIZE,
    }).length;
    if (budget(length) === "BLOCK") {
      ui.notifications?.error(SystemUtils.localize("CS.coa.errors.blocked"));
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

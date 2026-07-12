// DEV-ONLY helper for scripts/extract-armoria-catalog.mjs — NOT loaded by Foundry.
//
// Computes, fully offline (no browser, no getBBox), the real drawn bounding box
// of a charge SVG's `<g id=name>` subtree, and returns the inlinable group markup
// + preserved license metadata. Used to pre-compute geometry for the embedded
// renderer's charge centering (FR-006a, D4) — see contracts/catalog-geometry.md
// §"Módulo de arte de carga".
//
// Approach: parse with @xmldom/xmldom, walk the group accumulating SVG transforms,
// convert every primitive (rect/circle/ellipse/polygon/polyline/line) to a path
// `d`, apply the accumulated transform via `svgpath`, and union each element bbox
// via `svg-path-bbox` (exact for curves/arcs). `<use>` is resolved within the file.

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { svgPathBbox } from "svg-path-bbox";
import svgpathMod from "svgpath";

const svgpath = svgpathMod.default || svgpathMod;

const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Split a `points="x,y x,y ..."` attribute into a path `d` (open or closed). */
function pointsToPath(points, close) {
  const nums = String(points ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length < 4) return null;
  let d = `M ${nums[0]} ${nums[1]}`;
  for (let i = 2; i + 1 < nums.length; i += 2)
    d += ` L ${nums[i]} ${nums[i + 1]}`;
  return close ? `${d} Z` : d;
}

/** Convert a drawable element to an equivalent path `d` (bbox-faithful). */
function elementToPath(el) {
  const tag = el.tagName;
  const a = (name, def) => num(el.getAttribute(name), def);
  switch (tag) {
    case "path":
      return el.getAttribute("d") || null;
    case "rect": {
      const x = a("x", 0);
      const y = a("y", 0);
      const w = a("width", 0);
      const h = a("height", 0);
      if (w <= 0 || h <= 0) return null;
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${
        y + h
      } Z`;
    }
    case "circle": {
      const cx = a("cx", 0);
      const cy = a("cy", 0);
      const r = a("r", 0);
      if (r <= 0) return null;
      return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${
        2 * r
      } 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    }
    case "ellipse": {
      const cx = a("cx", 0);
      const cy = a("cy", 0);
      const rx = a("rx", 0);
      const ry = a("ry", 0);
      if (rx <= 0 || ry <= 0) return null;
      return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${
        2 * rx
      } 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
    }
    case "polygon":
      return pointsToPath(el.getAttribute("points"), true);
    case "polyline":
      return pointsToPath(el.getAttribute("points"), false);
    case "line":
      return `M ${a("x1", 0)} ${a("y1", 0)} L ${a("x2", 0)} ${a("y2", 0)}`;
    default:
      return null;
  }
}

const DRAWABLE = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
]);

const href = (el) =>
  el.getAttribute("href") || el.getAttribute("xlink:href") || "";

/** Index every id → element in the document (for <use> resolution). */
function indexIds(root, map) {
  if (root.nodeType !== 1) return;
  const id = root.getAttribute?.("id");
  if (id && !map.has(id)) map.set(id, root);
  for (const child of Array.from(root.childNodes)) indexIds(child, map);
}

/**
 * Accumulate each drawable element's bbox under `el`, applying `transform`
 * (the accumulated ancestor transform string). Pushes [minX,minY,maxX,maxY].
 */
function collect(el, transform, ids, out, seen) {
  if (el.nodeType !== 1) return;
  const own = el.getAttribute("transform");
  const t = own ? `${transform} ${own}`.trim() : transform;
  const tag = el.tagName;

  if (tag === "use") {
    const id = href(el).replace(/^#/, "");
    if (!id || seen.has(id)) return; // guard self-reference cycles
    const target = ids.get(id);
    if (!target) return;
    const ux = num(el.getAttribute("x"), 0);
    const uy = num(el.getAttribute("y"), 0);
    const ut = ux || uy ? `${t} translate(${ux} ${uy})`.trim() : t;
    collect(target, ut, ids, out, new Set([...seen, id]));
    return;
  }

  if (DRAWABLE.has(tag)) {
    const d = elementToPath(el);
    if (d) {
      try {
        const transformed = t ? svgpath(d).transform(t).toString() : d;
        const [x0, y0, x1, y1] = svgPathBbox(transformed);
        if ([x0, y0, x1, y1].every(Number.isFinite)) out.push([x0, y0, x1, y1]);
      } catch {
        /* unparseable path — skip, do not abort the charge */
      }
    }
  }

  for (const child of Array.from(el.childNodes))
    collect(child, t, ids, out, seen);
}

/**
 * Compute the charge art from a source charge SVG.
 * @param {string} svgText  full `<svg>…</svg>` file text
 * @param {string} name     canonical charge key (expected `<g id>`)
 * @returns {{ innerG: string, bbox: {x,y,w,h}, license: object } | null}
 */
export function computeChargeArt(svgText, name) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg) return null;

  // The renderer inlines the first <g> verbatim (getters.js el.querySelector("g")).
  const groups = svg.getElementsByTagName("g");
  const g = groups && groups[0];
  if (!g) return null;

  // Preserve <metadata source license> onto the group, matching Armoria's
  // fetchCharge (renderer-pipeline invariant 4). Keep a structured copy too.
  const meta = svg.getElementsByTagName("metadata")[0];
  const license = {};
  if (meta) {
    for (const key of ["author", "source", "license"]) {
      const val = meta.getAttribute(key);
      if (val) {
        license[key] = val;
        if (!g.getAttribute(key)) g.setAttribute(key, val);
      }
    }
  }
  // Force the id to the canonical key so `<use href="#name">` resolves.
  g.setAttribute("id", name);

  // Real drawn bbox under the group (root transform included, as <use> applies it).
  const ids = new Map();
  indexIds(svg, ids);
  const boxes = [];
  collect(g, "", ids, boxes, new Set());
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b[0]));
  const minY = Math.min(...boxes.map((b) => b[1]));
  const maxX = Math.max(...boxes.map((b) => b[2]));
  const maxY = Math.max(...boxes.map((b) => b[3]));
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) || !(h > 0)) return null;

  const round = (n) => Math.round(n * 1000) / 1000;
  const innerG = new XMLSerializer().serializeToString(g);
  return {
    innerG,
    bbox: { x: round(minX), y: round(minY), w: round(w), h: round(h) },
    license,
  };
}

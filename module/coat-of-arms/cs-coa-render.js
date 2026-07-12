// Render + persist the coat of arms 100% offline (spec 014, D8/D9). Builds the SVG
// locally (buildCoaSvg — no network), rasterises it to PNG via canvas, uploads BOTH
// files to a deterministic per-house path, then persists the definition (source of
// truth) + both paths in a single actor.update. The sheet shows the SVG (crisp) and
// the token uses the PNG (PIXI blurs SVG at scale). This is the HAPPY path — it
// throws on upload failure; callers own the degraded fallback (FR-011). Every step
// is local: DISPLAY never depends on any external service (SC-005/SC-006).

import { buildCoaSvg } from "./render/cs-coa-svg.js";
import { svgToPngBlob } from "./render/cs-coa-rasterize.js";
import SystemUtils from "../utils/systemUtils.js";

/** Storage source + per-world directory for saved coats of arms. */
const STORAGE_SOURCE = "data";
const coaDir = () => `worlds/${game.world.id}/coats-of-arms`;

/** The current user may write files (FR-011). */
export function canUpload() {
  return !!game.user?.hasPermission?.("FILES_UPLOAD");
}

/**
 * Render the COA locally and save it as the house identity (SVG sheet + PNG token).
 * @param {Actor} actor
 * @param {object} coa
 * @param {object} [opts]
 * @param {number} [opts.size=500]  saved raster size
 * @returns {Promise<{ svgPath: string, pngPath: string }>}
 * @throws if the upload fails
 */
export async function renderAndSave(actor, coa, { size = 500 } = {}) {
  const { svg, warnings } = buildCoaSvg(coa, { size });
  for (const w of warnings) {
    ui.notifications?.warn(SystemUtils.format(w.key, w.data ?? {}));
  }

  // Rasterise locally (canvas, no network, no PIXI). Requires a 100%-inline SVG.
  const pngBlob = await svgToPngBlob(svg, size);

  const FP = foundry.applications.apps.FilePicker.implementation;
  const dir = coaDir();
  // createDirectory throws if the dir already exists — the world dir always does,
  // so only the last level is created. Ignore the "exists" throw (confirmed API).
  try {
    await FP.createDirectory(STORAGE_SOURCE, dir);
  } catch (_e) {
    /* already exists */
  }

  // Two files per house, canonical extensions, overwritten in place (D3/D9).
  const svgFile = new File([svg], `${actor.id}.svg`, { type: "image/svg+xml" });
  const pngFile = new File([pngBlob], `${actor.id}.png`, { type: "image/png" });
  // upload() returns the server response on success ({ path, … }) but false /
  // undefined / {} on failure — guard on res?.path, never destructure blindly.
  const svgRes = await FP.upload(
    STORAGE_SOURCE,
    dir,
    svgFile,
    {},
    { notify: false }
  );
  const pngRes = await FP.upload(
    STORAGE_SOURCE,
    dir,
    pngFile,
    {},
    { notify: false }
  );
  const svgPath = svgRes?.path;
  const pngPath = pngRes?.path;
  if (!svgPath || !pngPath)
    throw new Error("CoA image upload returned no path");

  // Sheet reads the SVG (crisp), token reads the PNG. Setting BOTH img and
  // prototypeToken.texture.src explicitly disables the core img→token auto-link
  // (Actor#_preUpdate only propagates when the token src is empty). Cache-bust with
  // ?t= — getCacheBustURL returns false for same-origin files (confirmed, v14).
  const bust = `?t=${Date.now()}`;
  await actor.update({
    img: `${svgPath}${bust}`,
    "prototypeToken.texture.src": `${pngPath}${bust}`,
    "system.coaImg": pngPath,
    "system.coaSvg": svgPath,
    "system.coa": coa,
  });
  return { svgPath, pngPath };
}

/**
 * Degraded save (FR-011): persist the definition with NO image (no upload
 * permission). The image is never automated — re-render stays manual.
 * @param {Actor} actor
 * @param {object} coa
 */
export async function saveDefinitionOnly(actor, coa) {
  await actor.update({
    "system.coa": coa,
    "system.coaImg": "",
    "system.coaSvg": "",
  });
}

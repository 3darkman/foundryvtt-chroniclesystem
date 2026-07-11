// Render + persist the coat of arms (D2–D4). Fetches the Armoria image, uploads
// it to a deterministic per-house path (one file, overwritten in place), and
// persists the COA definition (source of truth) + the image path + actor.img
// (with a cache-busting query so the token/sheet refresh). The saved image makes
// the DISPLAY independent of the service at runtime (SC-005). This is the HAPPY
// path — it throws on fetch/upload failure; callers own the degraded fallback
// (persist the definition with an empty image — FR-020). See research §D2–D5.

import { buildUrl, CANONICAL_FORMAT } from "./cs-armoria-url.js";

/** Storage source + per-world directory for saved coats of arms. */
const STORAGE_SOURCE = "data";
const coaDir = () => `worlds/${game.world.id}/coats-of-arms`;

/** The current user may write files (FR-015/FR-020). */
export function canUpload() {
  return !!game.user?.hasPermission?.("FILES_UPLOAD");
}

/**
 * Render the COA via Armoria and save it as the house identity.
 * @param {Actor} actor
 * @param {object} coa
 * @param {object} [opts]
 * @param {number|string} [opts.size=500]  saved raster size
 * @returns {Promise<{ path: string, img: string }>}
 * @throws if the render service is unreachable or the upload fails
 */
export async function renderAndSave(actor, coa, { size = 500 } = {}) {
  const { url } = buildUrl(coa, { format: CANONICAL_FORMAT, size });
  const fetchRes = await fetch(url);
  if (!fetchRes.ok) {
    throw new Error(`Armoria render failed: HTTP ${fetchRes.status}`);
  }
  const blob = await fetchRes.blob();

  const FP = foundry.applications.apps.FilePicker.implementation;
  const dir = coaDir();
  // createDirectory throws if the dir already exists — the world dir always does,
  // so only the last level is created (research V4). Ignore the "exists" throw.
  try {
    await FP.createDirectory(STORAGE_SOURCE, dir);
  } catch (_e) {
    /* already exists */
  }

  // Fixed canonical extension → one file per house, overwritten in place (D3).
  const file = new File([blob], `${actor.id}.png`, { type: "image/png" });
  // upload() returns the full server response (or false/undefined on failure) —
  // guard on res.path, never destructure blindly.
  const res = await FP.upload(STORAGE_SOURCE, dir, file, {}, { notify: false });
  const path = res?.path;
  if (!path) throw new Error("Armoria image upload returned no path");

  // Cache-bust actor.img so the token/sheet re-read the texture (D4). coaImg keeps
  // the clean canonical path; actor.img carries the ?t=.
  const img = `${path}?t=${Date.now()}`;
  await actor.update({ img, "system.coaImg": path, "system.coa": coa });
  return { path, img };
}

/**
 * Degraded save (FR-020): persist the definition with NO image (service down or
 * no upload permission). The image is never automated — re-render stays manual.
 * @param {Actor} actor
 * @param {object} coa
 */
export async function saveDefinitionOnly(actor, coa) {
  await actor.update({ "system.coa": coa, "system.coaImg": "" });
}

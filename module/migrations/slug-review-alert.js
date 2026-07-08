// Actionable post-migration alert (spec 008, US3 / FR-014). When the 0.9.0
// backfill flags core items whose derived slug isn't canonical, a NON-blocking,
// PERSISTENT warning is shown on `ready`. Opening the review lists those items
// with clickable rows that jump straight to the item sheet so the GM can correct
// the slug. NOTHING is rewritten automatically (FR-014).

import { CSConstants } from "../system/csConstants.js";

/** Escape a value for safe HTML interpolation (never throws). */
function esc(value) {
  const escaper = foundry.utils?.escapeHTML;
  if (typeof escaper === "function") return escaper(String(value ?? ""));
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

/**
 * Open the actionable review dialog: one clickable row per flagged core item,
 * opening its sheet on click (via `fromUuid`). Read-only — never edits a slug.
 * @param {Array<{uuid: string, name: string, derivedSlug: string, kind: string}>} review
 */
export async function openSlugReview(review) {
  const rows = (review ?? [])
    .map(
      (e) =>
        `<li class="cs-slug-row" data-uuid="${esc(
          e.uuid
        )}" style="cursor:pointer">
           <strong>${esc(e.name)}</strong> — <code>${esc(e.derivedSlug)}</code>
           <em>(${esc(e.kind)})</em>
         </li>`
    )
    .join("");
  await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("CS.migration.slugReviewTitle") },
    content:
      `<p>${game.i18n.localize("CS.migration.slugReviewIntro")}</p>` +
      `<ul class="cs-slug-report">${rows}</ul>`,
    ok: { label: game.i18n.localize("CS.migration.slugReviewClose") },
    render: (_event, dialog) => {
      dialog.element?.querySelectorAll(".cs-slug-row").forEach((li) =>
        li.addEventListener("click", async () => {
          const doc = await fromUuid(li.dataset.uuid);
          doc?.sheet?.render(true);
        })
      );
    },
  });
}

/**
 * On `ready`: if the migration flagged any core item, show a permanent,
 * non-blocking warning and expose `ChronicleSystem.openSlugReview()` (plus a
 * best-effort click on the notification) to open the actionable dialog.
 */
export function showSlugReviewAlert() {
  const review = game.settings.get(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.SLUG_REVIEW
  );
  if (!review?.length) return;

  const open = () => openSlugReview(review);
  // Macro/console entry point (always available).
  if (window.ChronicleSystem) window.ChronicleSystem.openSlugReview = open;

  const notification = ui.notifications.warn("CS.migration.slugReview", {
    permanent: true,
    localize: true,
  });
  // Best-effort: make the notification itself open the review on click.
  try {
    const element =
      notification?.element ??
      (notification instanceof HTMLElement ? notification : null);
    element?.addEventListener("click", open);
  } catch (err) {
    console.warn("chroniclesystem | slug-review notification wiring:", err);
  }
}

import { CSConstants } from "../system/csConstants.js";
import { migrateWorldToAE } from "./task080-ae-unification.js";
import { migrateWorldSlugs } from "./task090-slug-identity.js";
import { migrateHouseCoa } from "./task100-house-coa.js";
import { migrateHouseCoaSvg } from "./task110-house-coa-svg.js";
import {
  ensureQualityCompendium,
  migrateReferencedQualities,
  repairEmptyQualityRefs,
} from "./task120-qualities.js";
import {
  ensureAbilityCompendium,
  ensureSpecialtyCompendium,
  migrateSpecialtyItems,
} from "./task140-specialty-items.js";

export async function migrateData() {
  if (!game.user?.isGM) {
    // players can't do this stuff anyhow.
    return;
  }
  // spec 020 — always ensure the Qualities compendium is populated (idempotent,
  // not version-gated: a fresh system install must be seeded too).
  await ensureQualityCompendium();
  // spec 024 — same contract for the Ability/Specialty catalogues: unversioned
  // and idempotent, and BEFORE the versioned tasks so the conversion's backfill
  // can read them.
  await ensureAbilityCompendium();
  await ensureSpecialtyCompendium();
  const latest = game.system.version;
  const recentVersion =
    game.settings.get(
      CSConstants.Settings.SYSTEM_NAME,
      CSConstants.Settings.CURRENT_VERSION
    ) || "0.0.0";
  await game.settings.set(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.CURRENT_VERSION,
    latest
  );
  const patchVersions = Object.keys(migrationRoutines);
  for (const version of patchVersions) {
    if (foundry.utils.isNewerVersion(version, recentVersion)) {
      // we need to do some updates.
      ui.notifications?.notify(`Beginning ${version} data migration.`, "info");
      await migrationRoutines[version]();
      ui.notifications?.notify(`Applied ${version} data migration.`, "info");
    }
  }
}
let migrationRoutines;
export function registerTask(version, task) {
  if (!migrationRoutines) {
    migrationRoutines = {};
  }
  migrationRoutines[version] = task;
}

// task030 (combat-defense → persisted map) is retired: the persisted map no
// longer exists, and its imperative writers (addModifier/saveModifiers) were
// removed. The 0.8.0 task strips the residual map and unifies on the collector.
registerTask("0.8.0", migrateWorldToAE);
// spec 008 — backfill the stable slug identity + collect the FR-014 review list.
registerTask("0.9.0", migrateWorldSlugs);
// spec 013 — initialise house Coat of Arms (system.coa / system.coaImg).
registerTask("0.12.0", migrateHouseCoa);
// spec 014 — initialise house Coat of Arms SVG path (system.coaSvg). No re-render.
registerTask("0.13.0", migrateHouseCoaSvg);
// spec 020 — materialise each REFERENCED seed Quality as a world Item so the
// synchronous collector resolves it (legacy {name}→{slug} refs are converted per-
// document by the schema migrateData). Registered at 0.15.0 so it re-runs after the
// blank:true corruption fix — weapons that were invalid at 0.14.0 (and thus absent
// from game.items) are now visible again and get their referenced qualities seeded.
registerTask("0.15.0", migrateReferencedQualities);
// spec 020 — strip empty-slug quality refs ("(empty) missing item") that a data
// mishap left on weapons/armour, so the GM isn't stuck with un-clearable chips.
registerTask("0.16.0", repairEmptyQualityRefs);
// spec 024 — convert every legacy `ability.system.specialties` row into a real
// Specialty item and backfill the canonical set. Non-destructive: the legacy
// array is never written, so an interrupted run can be re-run.
registerTask("0.17.0", migrateSpecialtyItems);

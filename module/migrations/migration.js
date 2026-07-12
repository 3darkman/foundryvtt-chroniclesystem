import { CSConstants } from "../system/csConstants.js";
import { migrateWorldToAE } from "./task080-ae-unification.js";
import { migrateWorldSlugs } from "./task090-slug-identity.js";
import { migrateHouseCoa } from "./task100-house-coa.js";
import { migrateHouseCoaSvg } from "./task110-house-coa-svg.js";

export async function migrateData() {
  if (!game.user?.isGM) {
    // players can't do this stuff anyhow.
    return;
  }
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

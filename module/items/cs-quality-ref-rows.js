import { qualityBySlug, slugify } from "../effects/cs-effect-vocabulary.js";

const INDEX_FIELDS = [
  "system.slug",
  "system.description",
  "system.parameter.kind",
  "system.parameter.label",
  "system.parameter.options",
];

/**
 * spec 020 (C10a), shared by spec 025 — the world ∪ compendium Quality-definition
 * lookup behind every reference list: a weapon/armour's single `qualities`, and a
 * Unit Type's four per-weapon lists. Async (it reads pack indices), so it belongs
 * to the render path only, never the synchronous collector.
 * @returns {Promise<(slug: string) => {name: string, description: string, parameter: object}|null>}
 */
export async function qualityDefinitionResolver() {
  const packDefs = new Map();
  for (const pack of game.packs ?? []) {
    if (pack.metadata?.type !== "Item") continue;
    let index;
    try {
      index = await pack.getIndex({ fields: INDEX_FIELDS });
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

  return (slug) => {
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
}

/**
 * Project one stored reference list into removable chip rows. An unresolved slug
 * yields a "missing item" row — the reference is rendered, never discarded
 * (spec 020 FR-012). `listPath` rides each row so the shared partial can bind its
 * inputs and its delete action to whichever list produced it.
 * @param {Array<{slug: string, parameter: string}>} refs
 * @param {(slug: string) => object|null} resolve
 * @param {string} listPath
 * @returns {object[]}
 */
export function qualityRefRows(refs, resolve, listPath) {
  const stored = Array.isArray(refs) ? refs : [];
  return stored.map((ref, index) => {
    const slug = ref.slug ?? "";
    const definition = slug ? resolve(slug) : null;
    const parameterKind = definition?.parameter?.kind ?? "none";
    return {
      index,
      listPath,
      slug,
      parameter: ref.parameter ?? "",
      name: definition?.name ?? slug,
      description: definition?.description ?? "",
      missing: !definition,
      showParam: parameterKind === "number" || parameterKind === "choice",
      isChoice: parameterKind === "choice",
      paramLabel: definition?.parameter?.label ?? "",
      paramOptions:
        parameterKind === "choice"
          ? Object.fromEntries(
              (definition.parameter.options ?? [])
                .filter(Boolean)
                .map((option) => [option, option])
            )
          : {},
    };
  });
}

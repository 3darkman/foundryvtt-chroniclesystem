import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSItem } from "../module/items/csItem.js";

// The per-type item icon is a NAMING CONTRACT between three places that cannot
// check each other: the type keys in system.json, the files in assets/icons and
// `CSItem.getDefaultArtwork`. A file named for the label instead of the key
// ("unit type.png" for the `unitType` type) is invisible — no error anywhere,
// the item just wears the generic bag. These tests are that check.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = path.join(ROOT, "assets", "icons");
const ITEM_TYPES = Object.keys(
  JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"))
    .documentTypes.Item
);

describe("CSItem.getDefaultArtwork", () => {
  it("A1 answers with the icon named after the type KEY", () => {
    expect(CSItem.getDefaultArtwork({ type: "unitType" })).toEqual({
      img: "systems/chroniclesystem/assets/icons/unitType.png",
    });
  });

  it("A2 leaves a typeless item to core's own default", () => {
    expect(CSItem.getDefaultArtwork({}).img).toBe("icons/svg/item-bag.svg");
    expect(CSItem.getDefaultArtwork({ type: "base" }).img).toBe(
      "icons/svg/item-bag.svg"
    );
  });

  it("A3 every declared item type resolves to a file that exists", () => {
    const missing = ITEM_TYPES.filter((type) => {
      const img = CSItem.getDefaultArtwork({ type }).img;
      return !fs.existsSync(
        path.join(ROOT, img.replace(/^systems\/chroniclesystem\//, ""))
      );
    });
    expect(missing).toEqual([]);
  });

  it("A4 no icon file is stranded under a name no type asks for", () => {
    const stranded = fs
      .readdirSync(ICONS)
      .filter((file) => file.endsWith(".png"))
      .map((file) => path.basename(file, ".png"))
      .filter((name) => !ITEM_TYPES.includes(name));
    expect(stranded).toEqual([]);
  });
});

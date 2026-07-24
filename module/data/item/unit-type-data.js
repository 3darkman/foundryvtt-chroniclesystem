import {
  identityField,
  normalizeSlugSource,
  qualityRefField,
  migrateQualityRefs,
} from "../fields.js";
import { UNIT_CATEGORIES } from "../../vocabulary/cs-warfare.js";
import { slugify } from "../../effects/cs-slugify.js";

const fields = foundry.data.fields;

const DEFAULT_UNIT_CATEGORY = UNIT_CATEGORIES[0];

const EQUIPMENT_KEYS = ["startingEquipment", "upgradedEquipment"];
const WEAPON_QUALITY_KEYS = ["fightingQualities", "marksmanshipQualities"];

export default class UnitTypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const equipmentField = () =>
      new fields.SchemaField({
        armor: new fields.SchemaField({
          rating: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          penalty: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
          bulk: new fields.NumberField({
            required: true,
            initial: 0,
            integer: true,
          }),
        }),
        fightingDamage: new fields.StringField({ required: true, initial: "" }),
        marksmanshipDamage: new fields.StringField({
          required: true,
          initial: "",
        }),
        isCloseRange: new fields.BooleanField({ initial: false }),
        isLongRange: new fields.BooleanField({ initial: false }),
        fightingQualities: qualityRefField().qualities,
        marksmanshipQualities: qualityRefField().qualities,
      });

    return {
      ...identityField(),
      description: new fields.StringField({ required: true, initial: "" }),
      powerCost: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      category: new fields.StringField({
        required: true,
        choices: UNIT_CATEGORIES,
        initial: DEFAULT_UNIT_CATEGORY,
      }),
      hasAnotherCost: new fields.BooleanField({ initial: false }),
      anotherCost: new fields.SchemaField({
        keyResource: new fields.StringField({ required: true, initial: "" }),
        modifier: new fields.NumberField({
          required: true,
          initial: 0,
          integer: true,
        }),
        hasModifierByTraining: new fields.BooleanField({ initial: false }),
        modifierByTraining: new fields.ArrayField(
          new fields.SchemaField({
            training: new fields.StringField({ required: true, initial: "" }),
            modifier: new fields.NumberField({
              required: true,
              initial: 0,
              integer: true,
            }),
          })
        ),
      }),
      disciplineModifier: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      allowAnyAbility: new fields.BooleanField({ initial: false }),
      grantedAbilities: new fields.ArrayField(
        new fields.SchemaField({
          slug: new fields.StringField({
            required: false,
            blank: true,
            initial: "",
          }),
          name: new fields.StringField({
            required: false,
            blank: true,
            initial: "",
          }),
        })
      ),
      wildcardAbilityCount: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
      }),
      startingEquipment: equipmentField(),
      upgradedEquipment: equipmentField(),
    };
  }

  static migrateData(source) {
    normalizeSlugSource(source);
    migratedCategory(source);
    migratedGrantedAbilities(source);
    migratedWildcardCount(source);
    migratedEquipmentQualities(source);
    return super.migrateData(source);
  }
}

function migratedCategory(source) {
  if (source.category === undefined) return;
  if (!UNIT_CATEGORIES.includes(source.category))
    source.category = DEFAULT_UNIT_CATEGORY;
}

function migratedGrantedAbilities(source) {
  const legacy = Array.isArray(source.keyAbilities) ? source.keyAbilities : [];
  delete source.keyAbilities;
  const existing = Array.isArray(source.grantedAbilities)
    ? source.grantedAbilities
    : [];
  const bySlug = new Map();
  for (const entry of existing) {
    if (!entry || typeof entry !== "object") continue;
    const slug = slugify(String(entry.slug ?? "")) || slugify(entry.name ?? "");
    bySlug.set(slug, {
      slug,
      name: typeof entry.name === "string" ? entry.name : "",
    });
  }
  for (const entry of legacy) {
    if (typeof entry !== "string") continue;
    const slug = slugify(entry);
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: "" });
  }
  if (!existing.length && !legacy.length) return;
  source.grantedAbilities = [...bySlug.values()];
}

function migratedWildcardCount(source) {
  if (source.wildcardAbilityCount === undefined) return;
  const count = Number(source.wildcardAbilityCount);
  source.wildcardAbilityCount = Number.isFinite(count) ? Math.trunc(count) : 0;
}

function migratedEquipmentQualities(source) {
  for (const equipmentKey of EQUIPMENT_KEYS) {
    const equipment = source[equipmentKey];
    if (!equipment || typeof equipment !== "object") continue;
    for (const listKey of WEAPON_QUALITY_KEYS) {
      if (!Array.isArray(equipment[listKey])) continue;
      migrateQualityRefs(equipment, listKey);
    }
  }
}

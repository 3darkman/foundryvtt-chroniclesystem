import SystemUtils from "../utils/systemUtils.js";
import { abilityOptions } from "../vocabulary/cs-specialty-catalog.js";

const TEMPLATE =
  "systems/chroniclesystem/templates/dialogs/wildcard-abilities-dialog.hbs";

function sortedAbilityOptions() {
  return abilityOptions()
    .map((ability) => ({
      slug: ability.slug,
      label: ability.nameKey
        ? SystemUtils.localize(ability.nameKey)
        : ability.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function counterLabel(chosenCount, count) {
  return SystemUtils.format("CS.dialogs.wildcardAbilities.counter", {
    chosen: chosenCount,
    count,
  });
}

function wireWildcardPicker(dialog, options, chosen, count) {
  const root = dialog?.element;
  if (!root) return;
  const select = root.querySelector(".cs-wildcard-select");
  const addButton = root.querySelector(".cs-wildcard-add");
  const list = root.querySelector(".cs-wildcard-chosen");
  const counter = root.querySelector(".cs-wildcard-counter");
  const empty = root.querySelector(".cs-wildcard-empty");
  const confirmButton = root.querySelector('button[data-action="confirm"]');
  if (!select || !addButton || !list) return;

  const labelFor = (slug) =>
    options.find((option) => option.slug === slug)?.label ?? slug;

  const refresh = () => {
    list.replaceChildren();
    for (const slug of chosen) {
      const row = document.createElement("li");
      row.className = "cs-wildcard-row";
      const name = document.createElement("span");
      name.textContent = labelFor(slug);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "csv2-list-del-btn";
      remove.dataset.slug = slug;
      remove.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
      remove.addEventListener("click", () => {
        chosen.splice(chosen.indexOf(slug), 1);
        refresh();
      });
      row.append(name, remove);
      list.append(row);
    }
    for (const option of select.options) {
      option.hidden = chosen.includes(option.value);
    }
    const available = [...select.options].find((option) => !option.hidden);
    if (available && select.selectedOptions[0]?.hidden)
      select.value = available.value;
    if (counter) counter.textContent = counterLabel(chosen.length, count);
    if (empty) empty.hidden = chosen.length > 0;
    addButton.disabled = chosen.length >= count || !available;
    if (confirmButton) confirmButton.disabled = chosen.length !== count;
  };

  addButton.addEventListener("click", () => {
    const slug = select.value;
    if (!slug || chosen.includes(slug) || chosen.length >= count) return;
    chosen.push(slug);
    refresh();
  });

  refresh();
}

/**
 * spec 025 (contract unit-type-assignment.md C7, FR-004b) — pick exactly `count`
 * wildcard abilities while a Unit Type is being assigned. The dropdown lists the
 * world's abilities ∪ the canonical catalogue (`abilityOptions`), so a GM's own
 * or renamed ability is offered. Cancelling (or closing) resolves `null`, which
 * aborts the whole assignment.
 * @param {number} count how many abilities must be chosen
 * @returns {Promise<string[]|null>} the chosen ability slugs
 */
export async function pickWildcardAbilities(count) {
  const wanted = Number(count) || 0;
  if (wanted <= 0) return [];

  const options = sortedAbilityOptions();
  const chosen = [];
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    { options, count: wanted, counterLabel: counterLabel(0, wanted) }
  );

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["chroniclesystem", "cs-v2", "cs-wildcard-dialog"],
    window: {
      title: SystemUtils.localize("CS.dialogs.wildcardAbilities.title"),
    },
    content,
    render: (event, dialog) =>
      wireWildcardPicker(dialog, options, chosen, wanted),
    buttons: [
      {
        action: "cancel",
        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
        icon: "fas fa-times",
      },
      {
        action: "confirm",
        label: SystemUtils.localize("CS.dialogs.actions.confirm"),
        icon: "fas fa-check",
        default: true,
        callback: () => [...chosen],
      },
    ],
    rejectClose: false,
  });

  return Array.isArray(result) ? result : null;
}

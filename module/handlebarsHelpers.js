import {ChronicleSystem} from "./ChronicleSystem.js";

export const registerCustomHelpers = function () {
    Handlebars.registerHelper('modifier', (str) => {
        str = str === '' || str === null ? '0' : str;
        let value = typeof str == 'string' ? parseInt(str) : str;
        return value === 0 ? '' : value > 0 ? ` + ${value}` : ` - ${-value}`;
    });

    Handlebars.registerHelper('enrich', (content) => {
        return new Handlebars.SafeString(TextEditor.enrichHTML(content));
    });

    Handlebars.registerHelper('str', (content) => {
        return JSON.stringify(content);
    });

    Handlebars.registerHelper('formulaToStr', (formula) => {
        return formula.toStr();
    });

    Handlebars.registerHelper('notNull', function(value) {
        return value != null;
    });

    Handlebars.registerHelper('weapon-test', function(actor, weapon) {
        let data = weapon.data.specialty.split(':');
        if (data.length < 2)
            return "";
        let formula = ChronicleSystem.getActorAbilityFormula(actor, data[0], data[1]);
        formula = ChronicleSystem.adjustFormulaByWeapon(actor, formula, weapon);
        return formula;
    });

    Handlebars.registerHelper('format-formula', function(formula) {
        return formula.ToFormattedStr();
    });
};


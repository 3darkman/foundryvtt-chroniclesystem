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

    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
        return arg1 == arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifDifferent', function(arg1, arg2, options) {
        return arg1 != arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('showIfEquals', function(arg1, arg2, result1, result2 = "", options) {
        return arg1 == arg2 ? result1 : result2;
    });

    Handlebars.registerHelper('showIfContains', function(arg1, arg2, result, result2 = "", options) {
        let array = arg1.split('|');
        return array.includes(arg2.toString()) ? result : result2;
    });

    Handlebars.registerHelper('showIfDifferent', function(arg1, arg2, result1, result2 = "", options) {
        return arg1 != arg2 ? result1 : result2;
    });

    Handlebars.registerHelper('formGroup', function(options) {
        return "systems/chroniclesystem/templates/actors/partials/form-group.html";
    });

    Handlebars.registerHelper('ratingCheckbox', function(options) {
        return "systems/chroniclesystem/templates/components/rating-checkbox.html";
    });

    Handlebars.registerHelper('for', function (from, to, incr, block) {
        let accum = '';
        for (let i = from; i <= to; i += incr)
            accum += block.fn({index: i});
        return accum;
    });

    Handlebars.registerHelper('checked', function (referenceValue, value) {
        return new Handlebars.SafeString(value <= referenceValue ? "checked='checked'" : "");
    });

    Handlebars.registerHelper('showIfLessEquals', function(arg1, arg2, result, result2 = "", options) {
        return new Handlebars.SafeString(arg1 <= arg2 ? result : result2);
    });
};
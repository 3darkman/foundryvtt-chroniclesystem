import {ChronicleSystem} from "./ChronicleSystem.js";
import SystemUtils from "../utils/systemUtils.js";
import LOGGER from "../utils/logger.js";

export const registerCustomHelpers = function () {
    Handlebars.registerHelper('modifier', (str) => {
        str = str === '' || str === null ? '0' : str;
        let value = typeof str == 'string' ? parseInt(str) : str;
        return value === 0 ? '' : value > 0 ? ` + ${value}` : ` - ${-value}`;
    });

    Handlebars.registerHelper("csCompare", (v1, operator, v2) => {
        LOGGER.trace("csCompare | handlebarsHelper | Called.");
        switch (operator) {
            case "==":
                // noinspection EqualityComparisonWithCoercionJS
                return v1 == v2;
            case "===":
                return v1 === v2;
            case "!==":
                return v1 !== v2;
            case "<":
                return v1 < v2;
            case "<=":
                return v1 <= v2;
            case ">":
                return v1 > v2;
            case ">=":
                return v1 >= v2;
            case "&&":
                return v1 && v2;
            case "||":
                return v1 || v2;
            default:
                return false;
        }
    });

    Handlebars.registerHelper('csDebug', (content) => {
        LOGGER.debug(content);
    });

    Handlebars.registerHelper('csTrace', (content) => {
        LOGGER.trace(content);
    });

    Handlebars.registerHelper('enrich', (content) => {
        return new Handlebars.SafeString(TextEditor.enrichHTML(content, {async: false}));
    });

    Handlebars.registerHelper('str', (content) => {
        return JSON.stringify(content);
    });

    Handlebars.registerHelper('formulaToStr', (formula) => {
        if (!formula)
            return "";
        return formula.toStr();
    });

    Handlebars.registerHelper('notNull', function(value) {
        return value != null;
    });

    Handlebars.registerHelper('weapon-test', function(actor, weapon) {
        let data = weapon.specialty.split(':');
        if (data.length < 2)
            return "";
        let formula = ChronicleSystem.getActorAbilityFormula(actor, data[0], data[1]);
        formula = ChronicleSystem.adjustFormulaByWeapon(actor, formula, weapon);
        return formula;
    });

    Handlebars.registerHelper('format-formula', function(formula) {
        if (!formula)
            return "";
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

    Handlebars.registerHelper('concat',function(...positional) {
        const options = positional.splice(-1,1);
        return positional
            .map(SystemUtils.normalizeTextValue)
            .join('');
    })

    Handlebars.registerHelper('formGroup', function(options) {
        return "systems/chroniclesystem/templates/actors/partials/form-group.hbs";
    });

    Handlebars.registerHelper('ratingCheckbox', function(options) {
        return "systems/chroniclesystem/templates/components/rating-checkbox.hbs";
    });

    Handlebars.registerHelper('houseResourceItem', function(options) {
        return "systems/chroniclesystem/templates/components/house-resource-item.hbs";
    });

    Handlebars.registerHelper('memberListItem', function(options) {
        return "systems/chroniclesystem/templates/components/member-list-item.hbs";
    });

    Handlebars.registerHelper('resourceHoldings', function(options) {
        return "systems/chroniclesystem/templates/components/resource-holdings.hbs";
    });

    Handlebars.registerHelper('for', function (from, to, incr, block) {
        let accum = '';
        for (let i = from; i <= to; i += incr)
            accum += block.fn({index: i});
        return accum;
    });

    Handlebars.registerHelper('showIfLessEquals', function(arg1, arg2, result, result2 = "", options) {
        return new Handlebars.SafeString(arg1 <= arg2 ? result : result2);
    });

    Handlebars.registerHelper('showIfLess', function(arg1, arg2, result, result2 = "", options) {
        return new Handlebars.SafeString(arg1 < arg2 ? result : result2);
    });
};

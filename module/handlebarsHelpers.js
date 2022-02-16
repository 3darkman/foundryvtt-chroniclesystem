export const registerCustomHelpers = function () {
    Handlebars.registerHelper('modifier', (str) => {
        str = str === '' || str === null ? '0' : str;
        let value = typeof str == 'string' ? parseInt(str) : str;
        return value == 0 ? '' : value > 0 ? ` + ${value}` : ` - ${-value}`;
    });

    Handlebars.registerHelper('enrich', (content) => {
        return new Handlebars.SafeString(TextEditor.enrichHTML(content));
    });

    Handlebars.registerHelper('str', (content) => {
        return JSON.stringify(content);
    });
};


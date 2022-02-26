export class DiceRollFormula {
    #pool;
    #bonusDice;
    #reroll;
    #modifier;
    #drawback;

    constructor() {
        this.pool = 2;
        this.bonusDice = 0;
        this.reroll = 0;
        this.modifier = 0;
        this.drawback = 0;
    }

    get pool() {
        return this.#pool;
    }

    set pool(value) {
        this.#pool = parseInt(value);
    }

    get bonusDice() {
        return this.#bonusDice;
    }

    set bonusDice(value) {
        this.#bonusDice = parseInt(value);
    }

    get reroll() {
        return this.#reroll;
    }

    set reroll(value) {
        this.#reroll = parseInt(value);
    }

    get modifier() {
        return this.#modifier;
    }

    set modifier(value) {
        this.#modifier = parseInt(value);
    }

    get drawback() {
        return this.#drawback;
    }

    set drawback(value) {
        this.#drawback = parseInt(value);
    }



    toStr() {
        return `${this.pool}|${this.bonusDice}|${this.modifier}|${this.drawback}|${this.reroll}`;
    }

    static fromStr(str) {
        let data = str.split('|');
        let formula = new DiceRollFormula();
        if (data.length === 5) {
            formula.pool = data[0];
            formula.bonusDice = data[1];
            formula.modifier = data[2];
            formula.drawback = data[3];
            formula.reroll = data[4];
        }
        return formula;
    }

    ToFormattedStr() {
        let result = `${this.pool - this.drawback}d6`;
        if (this.bonusDice > 0) {
            result += ` + ${this.bonusDice}B`
        }
        if (this.modifier !== 0) {
            result += this.modifier > 0 ? ` + ${this.modifier}` : ` - ${-this.modifier}`
        }
        return result;
    }
}
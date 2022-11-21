export class DiceRollFormula {
    #pool;
    #bonusDice;
    #reRoll;
    #modifier;
    #dicePenalty;
    #difficult;
    #isUserChanged;

    constructor() {
        this.pool = 2;
        this.bonusDice = 0;
        this.reroll = 0;
        this.modifier = 0;
        this.dicePenalty = 0;
        this.difficult = 0;
        this.isUserChanged = false;
    }

    get isUserChanged() {
        return this.#isUserChanged;
    }

    set isUserChanged(value) {
        this.#isUserChanged = value;
    }

    get difficult() {
        return this.#difficult;
    }

    set difficult(value) {
        this.#difficult = value;
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

    get reRoll() {
        return this.#reRoll;
    }

    set reRoll(value) {
        this.#reRoll = parseInt(value);
    }

    get modifier() {
        return this.#modifier;
    }

    set modifier(value) {
        this.#modifier = parseInt(value);
    }

    get dicePenalty() {
        return this.#dicePenalty;
    }

    set dicePenalty(value) {
        this.#dicePenalty = parseInt(value);
    }



    toStr() {
        return `${this.pool}|${this.bonusDice}|${this.modifier}|${this.dicePenalty}|${this.reRoll}`;
    }

    static fromStr(str) {
        let data = str.split('|');
        let formula = new DiceRollFormula();
        if (data.length === 5) {
            formula.pool = data[0];
            formula.bonusDice = data[1];
            formula.modifier = data[2];
            formula.dicePenalty = data[3];
            formula.reRoll = data[4];
        }
        return formula;
    }

    ToFormattedStr() {
        let pool = Math.max(this.pool - this.dicePenalty, 1);
        let result = `${pool}d6`;
        if (this.bonusDice > 0) {
            result += ` + ${this.bonusDice}B`
        }
        if (this.modifier !== 0) {
            result += this.modifier > 0 ? ` + ${this.modifier}` : ` - ${-this.modifier}`
        }
        return result;
    }
}

export class Disposition {
    #name;
    #rating;
    #deceptionModifier;
    #persuasionModifier;

    constructor(name, rating, deception, persuasion) {
        this.#name = name;
        this.#rating = rating;
        this.#deceptionModifier = deception;
        this.#persuasionModifier = persuasion;
    }

    get name() {
        return this.#name;
    }

    get rating() {
        return this.#rating;
    }

    get deceptionModifier() {
        return this.#deceptionModifier;
    }

    get persuasionModifier() {
        return this.#persuasionModifier;
    }
}
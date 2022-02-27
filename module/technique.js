export class Technique {
    #name;
    #influence;
    #persuasion;
    #deception;

    constructor(name, influence, persuasion, deception) {
        this.#name = name;
        this.#influence = influence;
        this.#deception = deception;
        this.#persuasion = persuasion;
    }

    get name() {
        return this.#name;
    }

    get influence() {
        return this.#influence;
    }

    get persuasion() {
        return this.#persuasion;
    }

    get deception() {
        return this.#deception;
    }
}
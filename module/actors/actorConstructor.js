import factory from "../utils/factory.js";
import {CSCharacterActor} from "./csCharacterActor.js";
import {CSHouseActor} from "./csHouseActor.js";
import {CsHouseUnitActor} from "./cs-house-unit-actor.js";

const actorTypes = {};
actorTypes.character = CSCharacterActor;
actorTypes.house = CSHouseActor;
actorTypes.unit = CsHouseUnitActor;
const actorConstructor = factory(actorTypes, Actor);
export default actorConstructor;
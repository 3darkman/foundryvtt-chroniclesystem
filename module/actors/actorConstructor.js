import factory from "../utils/factory.js";
import {CSCharacterActor} from "./csCharacterActor.js";
import {CSHouseActor} from "./csHouseActor.js";

const actorTypes = {};
actorTypes.character = CSCharacterActor;
actorTypes.house = CSHouseActor;
actorTypes.unit = CSCharacterActor;
const actorConstructor = factory(actorTypes, Actor);
export default actorConstructor;
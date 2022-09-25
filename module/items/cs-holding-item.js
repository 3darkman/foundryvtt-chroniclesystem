import {CSItem} from "./csItem.js";
import LOGGER from "../utils/logger.js";

export class CSHoldingItem extends CSItem {
    getTotalInvested() {
        LOGGER.trace(`Get Total Invested | CSHoldingItem | csHoldingItem.js`);
        let data = this.getCSData();

        let total = parseInt(data.investment);
        let features = Object.keys(data.features).map((key) => data.features[key]);
        features.forEach((feature) => {
            total += parseInt(feature.cost);
        });
        LOGGER.debug(`total invested on ${this.name}: ${total} | CSHoldingItem | csHoldingItem.js`);
        return total;
    }
}

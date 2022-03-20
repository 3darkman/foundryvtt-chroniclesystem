import {CSItem} from "./csItem.js";

export class CSHoldingItem extends CSItem {
    getTotalInvested() {
        let data = this.getCSData();

        let total = parseInt(data.investment);
        let features = Object.keys(data.features).map((key) => data.features[key]);
        features.forEach((feature) => {
           total += parseInt(feature.cost);
        });
        return total;
    }
}
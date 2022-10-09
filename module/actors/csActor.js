/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */

export class CSActor extends Actor {
  getCSData() {
    return this.system;
  }
}

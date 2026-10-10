export class InventorySystem {
  constructor() { this.scrap = 0; }
  collectScrap() { this.scrap += 1; return this.scrap; }
  hasScrap(amount) { return this.scrap >= amount; }
}

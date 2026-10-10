export class CombatSystem {
  constructor() { this.resolve = 100; this.hitCooldown = 0; }
  update(delta) { this.hitCooldown = Math.max(0, this.hitCooldown - delta); }
  takePressure(amount) {
    if (this.hitCooldown > 0) return false;
    this.resolve = Math.max(0, this.resolve - amount);
    this.hitCooldown = 1.2;
    return true;
  }
  recover() { this.resolve = 58; this.hitCooldown = 1.5; }
}

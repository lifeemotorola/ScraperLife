export class CombatSystem {
  constructor() {
    this.maxResolve = 100;
    this.resolve = 100;
    this.hitCooldown = 0;
    this.timeSinceHit = 0;
    this.passiveRegen = false;
    this.defenseMultiplier = 1;
  }

  setMaxResolve(max) {
    const diff = max - this.maxResolve;
    this.maxResolve = max;
    if (diff > 0) this.resolve = Math.min(this.maxResolve, this.resolve + diff);
  }

  setPassiveRegen(enabled) {
    this.passiveRegen = Boolean(enabled);
  }

  setDefenseMultiplier(multiplier) {
    this.defenseMultiplier = multiplier;
  }

  update(delta) {
    this.hitCooldown = Math.max(0, this.hitCooldown - delta);
    this.timeSinceHit += delta;
    if (this.passiveRegen && this.timeSinceHit > 3.5 && this.resolve < this.maxResolve) {
      this.resolve = Math.min(this.maxResolve, this.resolve + delta * 3.5);
    }
  }

  takePressure(amount) {
    if (this.hitCooldown > 0) return false;
    this.timeSinceHit = 0;
    const damage = Math.max(1, Math.round(amount * this.defenseMultiplier));
    this.resolve = Math.max(0, this.resolve - damage);
    this.hitCooldown = 1.2;
    return true;
  }

  recover() {
    this.resolve = Math.round(this.maxResolve * 0.58);
    this.hitCooldown = 1.5;
  }
}

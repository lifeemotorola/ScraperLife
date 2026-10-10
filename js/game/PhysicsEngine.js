export class PhysicsEngine {
  constructor({ limit = 48 } = {}) { this.limit = limit; this.colliders = []; }
  addBuilding({ x, z, width, depth }) { this.colliders.push({ x, z, width, depth }); }
  canMove(position, radius = 0.35) {
    if (Math.abs(position.x) > this.limit || Math.abs(position.z) > this.limit) return false;
    return !this.colliders.some((box) =>
      Math.abs(position.x - box.x) < box.width / 2 + radius &&
      Math.abs(position.z - box.z) < box.depth / 2 + radius,
    );
  }
  constrain(position) {
    position.x = Math.max(-this.limit, Math.min(this.limit - 3, position.x));
    position.z = Math.max(-this.limit, Math.min(this.limit, position.z));
  }
}

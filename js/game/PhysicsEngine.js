import * as THREE from 'three';

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
  // If a point sits inside a collider (a spawn moved under a building footprint, for
  // example), spiral outward until a walkable spot is found so the character never
  // boots stuck — a blocked spawn reads as "rotating in place without moving".
  findFree(position, radius = 0.35, maxRange = 12) {
    if (this.canMove(position, radius)) return position.clone();
    for (let distance = 0.5; distance <= maxRange; distance += 0.5) {
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        const candidate = position.clone();
        candidate.x += Math.cos(angle) * distance;
        candidate.z += Math.sin(angle) * distance;
        if (this.canMove(candidate, radius)) return candidate;
      }
    }
    return position.clone();
  }
  constrain(position) {
    position.x = Math.max(-this.limit, Math.min(this.limit - 3, position.x));
    position.z = Math.max(-this.limit, Math.min(this.limit, position.z));
  }
}

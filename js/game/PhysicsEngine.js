import * as THREE from 'three';

// The shoreline on the east side. Past it is open water, which characters cannot enter
// (this was the old east limit: the player was held at x = 45).
export const SHORE_X = 45;

// The world has no outer edge any more: districts stream in around the player (see Districts.js).
// Colliders carry an `owner` tag so a district's footprints can be removed when it unloads.
export class PhysicsEngine {
  constructor({ shoreX = SHORE_X } = {}) { this.shoreX = shoreX; this.limit = Infinity; this.colliders = []; }
  addBuilding({ x, z, width, depth }, owner = null) { this.colliders.push({ x, z, width, depth, owner }); }
  removeOwner(owner) { this.colliders = this.colliders.filter((box) => box.owner !== owner); }
  canMove(position, radius = 0.35) {
    if (position.x > this.shoreX) return false;
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
    position.x = Math.min(this.shoreX, position.x);
  }
}

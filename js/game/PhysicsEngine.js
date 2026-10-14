import * as THREE from 'three';

// The shoreline on the east side. Past it is open water, which characters cannot enter
// (this was the old east limit: the player was held at x = 45).
export const SHORE_X = 45;

// The world has no outer edge any more: districts stream in around the player (see Districts.js).
// Colliders carry an `owner` tag so a district's footprints can be removed when it unloads.
// Subtracts a street rectangle from a block rectangle. Returns the parts of the block that lie off the street.
function subtractRect(r, s) {
  if (s.x0 >= r.x1 || s.x1 <= r.x0 || s.z0 >= r.z1 || s.z1 <= r.z0) return [r];
  const cx0 = Math.max(r.x0, s.x0), cx1 = Math.min(r.x1, s.x1);
  const cz0 = Math.max(r.z0, s.z0), cz1 = Math.min(r.z1, s.z1);
  const out = [];
  if (r.x0 < cx0) out.push({ x0: r.x0, x1: cx0, z0: r.z0, z1: r.z1 });
  if (cx1 < r.x1) out.push({ x0: cx1, x1: r.x1, z0: r.z0, z1: r.z1 });
  if (r.z0 < cz0) out.push({ x0: cx0, x1: cx1, z0: r.z0, z1: cz0 });
  if (cz1 < r.z1) out.push({ x0: cx0, x1: cx1, z0: cz1, z1: r.z1 });
  return out;
}

export class PhysicsEngine {
  constructor({ shoreX = SHORE_X } = {}) { this.shoreX = shoreX; this.limit = Infinity; this.colliders = []; this.streets = []; }
  // A painted street, as a rectangle on the ground (centre x/z, full width and depth).
  addStreet(x, z, width, depth) {
    this.streets.push({ x0: x - width / 2, x1: x + width / 2, z0: z - depth / 2, z1: z + depth / 2 });
  }
  // `passOverStreets`: the part of the block that lies on a street is walkable, so the
  // character walks through it instead of stopping at it. The rest of the block stays solid.
  addBuilding({ x, z, width, depth }, owner = null, { passOverStreets = false } = {}) {
    if (!passOverStreets || !this.streets.length) {
      this.colliders.push({ x, z, width, depth, owner });
      return;
    }
    let parts = [{ x0: x - width / 2, x1: x + width / 2, z0: z - depth / 2, z1: z + depth / 2 }];
    for (const street of this.streets) parts = parts.flatMap((part) => subtractRect(part, street));
    for (const p of parts) {
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      if (w > 1e-3 && d > 1e-3) this.colliders.push({ x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, width: w, depth: d, owner });
    }
  }
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

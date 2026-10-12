import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

export class ScrapPulse {
  constructor(scene) { this.scene = scene; this.definition = WEAPONS.scrapPulse; this.charge = 100; this.rings = []; }
  update(delta) {
    this.charge = Math.min(100, this.charge + delta * this.definition.rechargePerSecond);
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i]; ring.scale.multiplyScalar(1 + delta * 4.3); ring.material.opacity -= delta * 1.15;
      if (ring.material.opacity <= 0) { this.scene.remove(ring); this.rings.splice(i, 1); }
    }
  }
  activate(position, enemies, { range = null, stunSeconds = null } = {}) {
    if (this.charge < this.definition.chargeCost) return null;
    this.charge -= this.definition.chargeCost;
    const effectiveRange = range ?? this.definition.range;
    const effectiveStun = stunSeconds ?? this.definition.stunSeconds;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.25, .46, 32), new THREE.MeshBasicMaterial({ color: 0x75c5bb, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(position.x, .08, position.z); this.scene.add(ring); this.rings.push(ring);
    let stunned = 0;
    enemies.forEach((enemy) => { if (enemy.position.distanceTo(position) < effectiveRange) { enemy.stun(effectiveStun); stunned += 1; } });
    return stunned;
  }
}

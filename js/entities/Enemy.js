import * as THREE from 'three';
import { NPC, makeMarker } from './NPC.js';

export class Enemy extends NPC {
  constructor(scene, { position, label = 'VARDEE CREW' }) {
    super(scene, { id: 'watch', label, position, shirt: 0x712f29, skin: 0x5b322b, quote: '' });
    this.home = new THREE.Vector3(position[0], 0, position[1]);
    this.phase = Math.random() * Math.PI * 2;
    this.stunSeconds = 0;
    this.marker.material.map = makeMarker(label, 0xff7041).material.map;
  }
  stun(seconds) { this.stunSeconds = Math.max(this.stunSeconds, seconds); }
  update(delta, time, playerPosition) {
    if (this.stunSeconds > 0) {
      this.stunSeconds -= delta; this.marker.visible = false; this.visual.userData.torso.material.color.setHex(0x2f7375); return false;
    }
    this.marker.visible = true; this.visual.userData.torso.material.color.setHex(0x712f29);
    const orbit = time * .45 + this.phase;
    this.position.x = this.home.x + Math.cos(orbit) * 1.65;
    this.position.z = this.home.z + Math.sin(orbit) * 1.15;
    this.group.rotation.y = orbit + Math.PI / 2;
    return this.position.distanceTo(playerPosition) < 2.25;
  }
}

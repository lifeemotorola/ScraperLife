import * as THREE from 'three';
import { NPC } from './NPC.js';

// Vardee's crew. Same rigged character as Markie and everyone else (see NPC.adoptRig), tinted
// with the crew palette from tools/character_palette.py — the red jacket and the orange name
// marker are what tell them apart, not a different body. They also wander the district, stop to
// talk, and can be pulsed while moving; their threat is a proximity check, not a separate orbit.
export class Enemy extends NPC {
  constructor(scene, { position, id = null, label = 'VARDEE CREW' }) {
    const crewId = id || `watch-${position[0]}-${position[1]}`;
    super(scene, {
      id: crewId, paletteId: crewId, label, position, shirt: 0x712f29, skin: 0x5b322b, quote: '',
      role: 'Street watch', voice: 'greeter', accent: 0xff7041,
      wanderRadius: 10, wanders: true,
    });
    this.home = new THREE.Vector3(position[0], 0, position[1]);
    this.stunSeconds = 0;
  }
  stun(seconds) { this.stunSeconds = Math.max(this.stunSeconds, seconds); }

  // Game calls this after CrowdSystem has handled patrol, animation and conversation.
  // Returns true while this watch is close enough to put pressure on Markie.
  threaten(delta, _time, playerPosition) {
    if (this.stunSeconds > 0) {
      this.stunSeconds = Math.max(0, this.stunSeconds - delta);
      this.marker.visible = false;
      this.setSlotColor('shirt', 0x2f7375);   // stunned: the crew's red flushes teal
      return false;
    }
    this.marker.visible = true;
    this.restoreSlotColor('shirt');
    // Mid-conversation a watch is non-hostile until the exchange is over.
    if (this.state === 'talk') return false;
    return this.position.distanceTo(playerPosition) < 2.25;
  }
}

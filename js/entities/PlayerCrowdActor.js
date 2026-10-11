import { makeSpeechBubble } from './NPC.js';

// An adapter for the player-controlled Markie, so CrowdSystem can notice when he meets a resident
// without taking over his keyboard/touch input. He is a stationary *AI slot*, not a stationary
// character: input still drives Player.update; this adapter only supplies the face / speech-bubble
// methods CrowdSystem expects from an NPC.
export class PlayerCrowdActor {
  constructor(player) {
    this.player = player;
    this.id = 'markie';
    this.paletteId = 'markie';
    this.label = 'MARKIE';
    this.role = 'Protagonist';
    this.voice = 'greeter';
    this.accent = 0x75c5bb;
    this.group = player.group;
    this.home = player.position.clone();
    this.wanderRadius = 0;
    this.wanders = false;
    this.state = 'idle';
    this.partner = null;
    this.facing = player.group.rotation.y;
    this.height = 2.3;
    this.bubble = null;
    this.bubbleTimer = 0;
    this.animateThisFrame = true;
  }

  get position() { return this.player.position; }
  distanceTo(position) { return this.position.distanceTo(position); }

  faceTowards(x, z, delta, rate = 7) {
    const wanted = Math.atan2(x - this.position.x, z - this.position.z);
    let difference = wanted - this.facing;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    this.facing += difference * Math.min(1, delta * rate);
    this.player.group.rotation.y = this.facing;
  }

  // Input owns Markie's locomotion. CrowdSystem must never stop a player who is trying to move.
  setLocomotion() {}

  setHeight(height) {
    this.height = height;
    if (this.bubble) this.bubble.position.y = height + .95;
  }

  gesture(state = 'celebrate') {
    // The rig's `interact` clip is a reach-down, not a conversational hand-wave; use the
    // celebration gesture for both kinds of ambient encounter.
    this.player.play(state === 'interact' ? 'celebrate' : state);
  }

  say(text, seconds = 4) {
    this.stopSaying();
    if (!text) return null;
    this.bubble = makeSpeechBubble(text, this.accent);
    this.bubble.position.y = this.height + .95;
    this.group.add(this.bubble);
    this.bubbleTimer = seconds;
    return this.bubble;
  }

  stopSaying() {
    if (!this.bubble) return;
    this.group.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
    this.bubbleTimer = 0;
  }

  update(delta) {
    if (!this.bubble) return;
    this.bubbleTimer -= delta;
    if (this.bubbleTimer <= 0) this.stopSaying();
    else if (this.bubbleTimer < .5) this.bubble.material.opacity = Math.max(0, this.bubbleTimer / .5);
  }
}

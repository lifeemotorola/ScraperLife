import * as THREE from 'three';
import { makeHumanoid } from './Player.js';
import { instantiateCharacter } from './CharacterRig.js';

export function makeMarker(text, color = 0x75c5bb) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 100;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(10,22,22,.88)'; context.fillRect(15, 9, 226, 55);
  context.fillStyle = `#${color.toString(16).padStart(6, '0')}`; context.fillRect(15, 62, 226, 5);
  context.fillStyle = '#f6ecdc'; context.font = '600 31px sans-serif'; context.textAlign = 'center'; context.fillText(text, 128, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.5, .98, 1); return sprite;
}

// A line of dialogue floating over the speaker's head, so a conversation between two NPCs reads
// from across the street and not only in the subtitle bar. Text is wrapped on a canvas because
// there is no DOM in the scene; the bubble is disposed when the line ends (see NPC.say).
export function makeSpeechBubble(text, accent = 0x75c5bb, { maxChars = 30, padding = 16 } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) { lines.push(current); current = word; }
    else current = candidate;
  }
  if (current) lines.push(current);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const fontSize = 30;
  const lineHeight = fontSize + 8;
  canvas.width = 512;
  context.font = `600 ${fontSize}px sans-serif`;
  const textWidth = Math.min(canvas.width - padding * 2,
    Math.max(...lines.map((line) => context.measureText(line).width), 40));
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(lines.length * lineHeight + padding * 2 + 22); // +22 for the tail
  // Re-acquire the context: resizing a canvas clears it and its state.
  const draw = canvas.getContext('2d');
  draw.font = `600 ${fontSize}px sans-serif`;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';

  const boxHeight = canvas.height - 22;
  const radius = 16;
  draw.fillStyle = 'rgba(8,20,21,.92)';
  draw.beginPath();
  draw.moveTo(radius, 2);
  draw.arcTo(canvas.width - 2, 2, canvas.width - 2, boxHeight, radius);
  draw.arcTo(canvas.width - 2, boxHeight, 2, boxHeight, radius);
  draw.lineTo(canvas.width * .58, boxHeight);
  draw.lineTo(canvas.width * .5, canvas.height - 2);   // the tail, pointing at the mouth
  draw.lineTo(canvas.width * .42, boxHeight);
  draw.arcTo(2, boxHeight, 2, 2, radius);
  draw.arcTo(2, 2, canvas.width - 2, 2, radius);
  draw.closePath();
  draw.fill();
  draw.strokeStyle = `#${accent.toString(16).padStart(6, '0')}`;
  draw.lineWidth = 3;
  draw.stroke();

  draw.fillStyle = '#f6ecdc';
  lines.forEach((line, index) => {
    draw.fillText(line, canvas.width / 2, padding + lineHeight * index + lineHeight / 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  // Roughly 2.6 world units wide, aspect kept from the canvas.
  const worldWidth = 2.6;
  sprite.scale.set(worldWidth, worldWidth * (canvas.height / canvas.width), 1);
  sprite.userData.text = String(text || '');
  return sprite;
}

// One person in Waterside. The body is the SAME rigged character Markie uses — the shared GLB is
// cloned in adoptRig() and tinted from tools/character_palette.py's output, so every character is
// Markie's rig in their own skin and clothes. The procedural humanoid is only the placeholder
// shown for the frames between boot and the model landing (and the fallback if loading fails).
export class NPC {
  constructor(scene, {
    id, paletteId = id, label, position, shirt = 0x31595b, skin = 0x6b4326, quote = '', quoteId = null,
    role = 'Resident', voice = 'greeter', accent = 0x75c5bb,
    home = null, wanderRadius = 7, wanders = true,
  }) {
    this.id = id; this.paletteId = paletteId; this.label = label; this.quote = quote; this.quoteId = quoteId;
    this.role = role; this.voice = voice; this.accent = accent;
    this.baseColors = { shirt };
    this.group = new THREE.Group();
    this.visual = makeHumanoid(shirt, skin);
    this.group.add(this.visual);
    this.group.position.set(position[0], 0, position[1]);
    // Where this character belongs. They mill around their own district instead of roaming the
    // whole platform, so a mission target (Kollie at the workshop) is always findable.
    this.home = home ? new THREE.Vector3(home[0], 0, home[1]) : this.group.position.clone();
    this.wanderRadius = wanderRadius;
    this.wanders = wanders;
    this.marker = makeMarker(label, accent);
    this.marker.position.y = 3; this.group.add(this.marker);
    this.baseHeight = 2.3;
    this.height = this.baseHeight;
    this.state = 'idle';      // 'idle' | 'walk' | 'talk' (CrowdSystem drives this)
    this.partner = null;
    this.facing = this.group.rotation.y;
    this.bubble = null;
    this.bubbleTimer = 0;
    this.animator = null;
    this.materials = null;
    this.palette = null;
    // CrowdSystem clears this for characters far from the camera (see update).
    this.animateThisFrame = true;
    scene.add(this.group);
  }
  get position() { return this.group.position; }
  distanceTo(position) { return this.position.distanceTo(position); }

  // Swaps the placeholder for Markie's actual rig, tinted with this character's palette.
  // `shared` is the object loadSharedCharacter() resolves; `palette` is characters[id] from
  // assets/models/character_palettes.json. Returns the instance so callers can react.
  adoptRig(shared, palette = null, paletteData = null) {
    const instance = instantiateCharacter(shared, { palette, paletteData, shadow: false });
    this.visual.visible = false;
    this.rig = instance.root;
    this.palette = palette;
    this.animator = instance.animator?.hasClips ? instance.animator : null;
    this.materials = instance.materials;
    if (palette?.voice) this.voice = palette.voice;
    if (palette?.role) this.role = palette.role;
    if (palette?.accent) {
      this.accent = Number.parseInt(palette.accent.slice(1), 16);
      const old = this.marker;
      this.marker = makeMarker(this.label, this.accent);
      this.marker.position.copy(old.position);
      this.group.remove(old);
      old.material.map?.dispose();
      old.material.dispose();
      this.group.add(this.marker);
    }
    this.group.add(instance.root);
    this.setHeight(this.height);
    return instance;
  }

  // Keeps every character at the same real-world height as Markie's loaded model.
  setHeight(targetHeight) {
    this.height = targetHeight;
    const scale = targetHeight / this.baseHeight;
    this.visual.scale.setScalar(scale);
    if (this.rig) this.rig.scale.setScalar(scale);
    this.marker.position.y = targetHeight + .62;
    if (this.bubble) this.bubble.position.y = targetHeight + .95;
  }

  // Turns toward a world point. Rotation is smoothed because snapping the whole body every
  // frame is what makes a crowd look like a shelf of mannequins on a turntable.
  faceTowards(x, z, delta, rate = 7) {
    const wanted = Math.atan2(x - this.position.x, z - this.position.z);
    let difference = wanted - this.facing;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    this.facing += difference * Math.min(1, delta * rate);
    this.group.rotation.y = this.facing;
    return Math.abs(difference);
  }

  // One step toward a target. Returns 'arrived' | 'moving' | 'blocked'; a blocked step slides
  // along the axis that still has room, exactly like Player.update does for Markie.
  stepTowards(target, delta, speed, physics = null) {
    const delta_x = target.x - this.position.x;
    const delta_z = target.z - this.position.z;
    const distance = Math.hypot(delta_x, delta_z);
    if (distance < 0.0001) return 'arrived';
    const direction_x = delta_x / distance;
    const direction_z = delta_z / distance;
    const step = Math.min(speed * delta, distance);
    const next = this.position.clone();
    next.x += direction_x * step; next.z += direction_z * step;
    if (!physics || physics.canMove(next)) {
      this.position.copy(next);
    } else {
      const slideX = this.position.clone(); slideX.x += direction_x * step;
      const slideZ = this.position.clone(); slideZ.z += direction_z * step;
      if (physics.canMove(slideX)) this.position.copy(slideX);
      else if (physics.canMove(slideZ)) this.position.copy(slideZ);
      else return 'blocked';
    }
    return distance - step <= 0.0001 ? 'arrived' : 'moving';
  }

  // 'idle' | 'walk' | 'run' for the rig. The placeholder needs nothing: its bob lives in update().
  setLocomotion(moving, running = false) {
    this.animator?.setLocomotion({ moving, running });
  }

  gesture(state = 'celebrate') {
    // A wave-ish one-shot when two people meet; no-ops on a model with no clips.
    if (this.animator) return this.animator.trigger(state);
    return false;
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

  // Tints one wardrobe slot at runtime — Vardee's crew flush teal while the pulse stuns them.
  setSlotColor(slot, hex) {
    const materials = this.materials?.get(slot);
    if (materials) { materials.forEach((material) => material.color.setHex(hex)); return true; }
    if (slot === 'shirt' && this.visual?.userData?.torso) this.visual.userData.torso.material.color.setHex(hex);
    return false;
  }

  // Puts a slot back to the colour tools/character_palette.py gave this character.
  restoreSlotColor(slot) {
    const hex = this.palette?.colors?.[slot];
    if (hex) return this.setSlotColor(slot, Number.parseInt(hex.slice(1), 16));
    if (slot === 'shirt' && this.baseColors?.shirt !== undefined) {
      return this.setSlotColor(slot, this.baseColors.shirt);
    }
    return false;
  }

  update(delta, time, index = 0) {
    // Fades an expired speech bubble out and removes it; CrowdSystem owns when lines start.
    if (this.bubble) {
      this.bubbleTimer -= delta;
      if (this.bubbleTimer <= 0) this.stopSaying();
      else if (this.bubbleTimer < .5) this.bubble.material.opacity = Math.max(0, this.bubbleTimer / .5);
    }
    // Off-screen characters are cheap to keep posed: the mixer only advances for people near the
    // camera, and everyone else holds their last frame instead of costing a full skin update.
    if (this.animator && this.animateThisFrame) this.animator.update(delta);
    if (!this.rig) {
      // Placeholder bob: stands in for leg animation until the real rig lands.
      this.group.position.y = Math.sin(time * 2 + index) * .018;
      this.visual.userData.legs.rotation.z = Math.sin(time * 2 + index) * .035;
    } else {
      this.group.position.y = 0;
    }
  }
}

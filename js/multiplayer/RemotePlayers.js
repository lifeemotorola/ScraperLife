import * as THREE from 'three';
import { makeHumanoid } from '../entities/Player.js';
import { instantiateCharacter } from '../entities/CharacterRig.js';
import { makeSpeechBubble } from '../entities/NPC.js';
import { CHARACTER_ROSTER } from '../data/dialogues.js';

const DEFAULT_ACCENT = 0x75c5bb;
const POSITION_RATE = 11;      // higher = snappier catch-up to the latest network position
const TELEPORT_DISTANCE = 6;   // beyond this, snap instead of gliding (respawn, reconnect)
const BUBBLE_HEIGHT = 2.42;    // above the name plate

export function characterName(characterId) {
  return CHARACTER_ROSTER.find((entry) => entry.id === characterId)?.name || 'Unknown';
}

export function characterRole(characterId) {
  return CHARACTER_ROSTER.find((entry) => entry.id === characterId)?.role || '';
}

function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

// Two-line name plate: the character's name in their accent colour, and the player's name.
// Drawn large and without depth testing so it stays readable when a building is in the way.
export function makeNameplate(characterLabel, playerName, accent = DEFAULT_ACCENT) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 176;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(8,18,19,.9)';
  roundRect(context, 6, 6, 500, 164, 18);
  context.fill();
  context.strokeStyle = hex(accent);
  context.lineWidth = 5;
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = hex(accent);
  context.font = '800 46px sans-serif';
  context.fillText(characterLabel.toUpperCase(), 256, 62);
  context.fillStyle = '#f6ecdc';
  context.font = '600 36px sans-serif';
  context.fillText(playerName, 256, 124);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(2.3, 0.79, 1);
  sprite.renderOrder = 20;
  return sprite;
}

// A chat line over someone's head, with the same timing and fade the NPC bubbles use.
export class SpeechBubbleSlot {
  constructor(group, accent, height) {
    this.group = group;
    this.accent = accent;
    this.height = height;
    this.bubble = null;
    this.timer = 0;
  }

  say(text, seconds = 6) {
    this.stop();
    if (!text) return;
    this.bubble = makeSpeechBubble(text, this.accent);
    this.bubble.material.depthTest = false;
    this.bubble.renderOrder = 21;
    this.bubble.position.y = this.height + BUBBLE_HEIGHT;
    this.group.add(this.bubble);
    this.timer = seconds;
  }

  stop() {
    if (!this.bubble) return;
    this.group.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
    this.timer = 0;
  }

  update(delta) {
    if (!this.bubble) return;
    this.timer -= delta;
    if (this.timer <= 0) this.stop();
    else if (this.timer < 0.5) this.bubble.material.opacity = Math.max(0, this.timer / 0.5);
  }

  setHeight(height) {
    this.height = height;
    if (this.bubble) this.bubble.position.y = height + BUBBLE_HEIGHT;
  }
}

// Other players in the shared city. Each one is the same rig Markie uses, dressed in the palette
// of the character they picked, with a name plate and chat bubbles. Positions come from the
// server as the other player reports them, and are interpolated between updates.
export class RemotePlayers {
  constructor(scene, { height = 2.3 } = {}) {
    this.scene = scene;
    this.height = height;
    this.entries = new Map();   // member id -> entry
    this.shared = null;
    this.paletteData = null;
  }

  // Called once the shared rig and palettes have loaded; existing avatars get their bodies now.
  setRig(shared, paletteData) {
    this.shared = shared;
    this.paletteData = paletteData;
    for (const entry of this.entries.values()) this.installBody(entry);
  }

  // Reconciles the roster: adds new people, re-dresses anyone who changed character, removes leavers.
  syncRoster(members, selfId) {
    const seen = new Set();
    for (const member of members) {
      if (member.id === selfId) continue;
      seen.add(member.id);
      let entry = this.entries.get(member.id);
      if (!entry) {
        entry = this.createEntry(member);
        this.entries.set(member.id, entry);
      }
      if (entry.characterId !== member.characterId) {
        entry.characterId = member.characterId;
        this.installBody(entry);
      }
      entry.name = member.name;
      entry.nameplateDirty = true;
      if (member.placed && !entry.placed) {
        entry.placed = true;
        entry.current.set(member.x, 0, member.z);
        entry.target.set(member.x, 0, member.z);
        entry.facing = entry.targetFacing = member.f;
      }
      entry.group.visible = Boolean(member.characterId) && entry.placed;
      this.refreshNameplate(entry);
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  createEntry(member) {
    const group = new THREE.Group();
    const placeholder = makeHumanoid(0x31595b, 0xc08a5c);
    group.add(placeholder);
    this.scene.add(group);
    const entry = {
      id: member.id,
      name: member.name,
      characterId: null,
      group,
      placeholder,
      rig: null,
      animator: null,
      materials: null,
      accent: DEFAULT_ACCENT,
      nameplate: null,
      nameplateDirty: true,
      bubble: new SpeechBubbleSlot(group, DEFAULT_ACCENT, this.height),
      current: new THREE.Vector3(),
      target: new THREE.Vector3(),
      facing: 0,
      targetFacing: 0,
      moving: false,
      running: false,
      placed: false,
      bob: Math.random() * 6,
    };
    group.visible = false;
    return entry;
  }

  accentFor(characterId) {
    const hexValue = this.paletteData?.characters?.[characterId]?.accent;
    return hexValue ? Number.parseInt(hexValue.slice(1), 16) : DEFAULT_ACCENT;
  }

  installBody(entry) {
    this.disposeBody(entry);
    if (!entry.characterId) return;
    entry.accent = this.accentFor(entry.characterId);
    entry.bubble.accent = entry.accent;
    if (!this.shared) {
      entry.placeholder.visible = true;
      return;
    }
    const palette = this.paletteData?.characters?.[entry.characterId] || null;
    const instance = instantiateCharacter(this.shared, { palette, paletteData: this.paletteData, cull: false, shadow: false });
    entry.rig = instance.root;
    entry.materials = instance.materials;
    entry.animator = instance.animator?.hasClips ? instance.animator : null;
    entry.placeholder.visible = false;
    entry.group.add(instance.root);
    entry.nameplateDirty = true;
  }

  disposeBody(entry) {
    if (entry.rig) {
      entry.group.remove(entry.rig);
      for (const list of entry.materials?.values?.() || []) {
        for (const material of list) material?.dispose?.();
      }
      entry.rig = null;
      entry.materials = null;
      entry.animator = null;
    }
    entry.placeholder.visible = true;
  }

  refreshNameplate(entry) {
    if (!entry.nameplateDirty) return;
    entry.nameplateDirty = false;
    if (entry.nameplate) {
      entry.group.remove(entry.nameplate);
      entry.nameplate.material.map?.dispose();
      entry.nameplate.material.dispose();
      entry.nameplate = null;
    }
    if (!entry.characterId) return;
    entry.nameplate = makeNameplate(characterName(entry.characterId), entry.name, entry.accent);
    entry.nameplate.position.y = this.height + 0.62;
    entry.group.add(entry.nameplate);
  }

  applyState(state) {
    const entry = this.entries.get(state.id);
    if (!entry) return;
    entry.placed = true;
    entry.target.set(state.x, 0, state.z);
    entry.targetFacing = state.f;
    entry.moving = Boolean(state.m);
    entry.running = Boolean(state.r);
    if (!entry.group.visible && entry.characterId) {
      entry.current.copy(entry.target);
      entry.facing = entry.targetFacing;
      entry.group.visible = true;
    }
  }

  gesture(id, name) {
    const entry = this.entries.get(id);
    if (!entry?.animator) return;
    // The rig's `celebrate` clip is the one-shot wave the game already uses for greetings.
    entry.animator.trigger(name === 'wave' ? 'celebrate' : name);
  }

  say(id, text, seconds) {
    this.entries.get(id)?.bubble.say(text, seconds);
  }

  // Shows another player's position on the minimap and world map (see UIManager.setRemoteDots).
  positions() {
    return [...this.entries.values()]
      .filter((entry) => entry.group.visible)
      .map((entry) => ({ id: entry.id, name: entry.name, characterId: entry.characterId, x: entry.current.x, z: entry.current.z }));
  }

  update(delta, time) {
    const alpha = 1 - Math.exp(-POSITION_RATE * delta);
    for (const entry of this.entries.values()) {
      if (!entry.group.visible) continue;
      this.refreshNameplate(entry);
      const gap = entry.current.distanceTo(entry.target);
      if (gap > TELEPORT_DISTANCE) entry.current.copy(entry.target);
      else entry.current.lerp(entry.target, alpha);
      entry.group.position.set(entry.current.x, 0, entry.current.z);

      let turn = entry.targetFacing - entry.facing;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      entry.facing += turn * alpha;
      entry.group.rotation.y = entry.facing;

      const walking = gap > 0.02 || entry.moving;
      entry.animator?.setLocomotion({ moving: walking, running: entry.running && walking });
      entry.animator?.update(delta);
      if (!entry.rig) {
        // Placeholder bob until the rig loads; same motion NPCs use.
        entry.placeholder.userData.legs.rotation.z = Math.sin(time * 2 + entry.bob) * 0.035;
      }
      entry.bubble.update(delta);
    }
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.bubble.stop();
    this.disposeBody(entry);
    if (entry.nameplate) {
      entry.nameplate.material.map?.dispose();
      entry.nameplate.material.dispose();
    }
    this.scene.remove(entry.group);
    this.entries.delete(id);
  }

  clear() {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }
}

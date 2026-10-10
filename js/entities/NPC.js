import * as THREE from 'three';
import { makeHumanoid } from './Player.js';

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

export class NPC {
  constructor(scene, { id, label, position, shirt, skin, quote }) {
    this.id = id; this.quote = quote;
    this.group = new THREE.Group();
    this.visual = makeHumanoid(shirt, skin);
    this.group.add(this.visual);
    this.group.position.set(position[0], 0, position[1]);
    this.marker = makeMarker(label);
    this.marker.position.y = 3; this.group.add(this.marker);
    this.baseHeight = 2.3;
    scene.add(this.group);
  }
  get position() { return this.group.position; }
  distanceTo(position) { return this.position.distanceTo(position); }

  // Keeps every NPC at the same real-world character height as Markie’s loaded DAE model.
  setHeight(targetHeight) {
    const scale = targetHeight / this.baseHeight;
    this.visual.scale.setScalar(scale);
    this.marker.position.y = targetHeight + .62;
  }

  update(time, index = 0) {
    this.group.position.y = Math.sin(time * 2 + index) * .018;
    this.visual.userData.legs.rotation.z = Math.sin(time * 2 + index) * .035;
  }
}

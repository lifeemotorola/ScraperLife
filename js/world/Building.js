import * as THREE from 'three';
import { COLORS } from './Environment.js';

export function makeSign(text, width = 3) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#172323'; context.fillRect(0, 0, 512, 128);
  context.strokeStyle = '#ff7041'; context.lineWidth = 8; context.strokeRect(4, 4, 504, 120);
  context.fillStyle = '#f8e7c9'; context.font = '700 47px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 67);
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width * .25), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
}

export class Building {
  constructor(scene, physics, { x, z, width, depth, height, color, label }) {
    this.scene = scene; this.physics = physics;
    this.data = { x, z, width, depth, height, color, label };
  }
  add() {
    const { x, z, width, depth, height, color, label } = this.data;
    const group = new THREE.Group(); group.position.set(x, height / 2, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .05 }));
    body.castShadow = true; body.receiveShadow = true; group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + .32, .28, depth + .32), new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 1 }));
    roof.position.y = height / 2 + .14; roof.castShadow = true; group.add(roof);
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xf6b866, emissive: 0xe48b38, emissiveIntensity: 1.4, roughness: .6 });
    for (let row = 0; row < Math.max(1, Math.floor(height / 2.4)); row += 1) {
      for (let col = 0; col < Math.max(1, Math.floor(width / 2)); col += 1) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(.48, .58, .03), windowMaterial);
        window.position.set(-width / 2 + .9 + col * 1.7, -height / 2 + 1.35 + row * 2.2, -depth / 2 - .02); group.add(window);
      }
    }
    // Street-facing details keep the larger buildings readable at human scale.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.1, .08), new THREE.MeshStandardMaterial({ color: 0x1b2527, roughness: .78, metalness: .12 }));
    door.position.set(0, -height / 2 + 1.05, -depth / 2 - .06); group.add(door);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.1, .16, .7), new THREE.MeshStandardMaterial({ color: 0x344a47, roughness: .8 }));
    awning.position.set(0, -height / 2 + 2.32, -depth / 2 - .34); awning.rotation.x = -.16; group.add(awning);
    const entryLight = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffbd68 }));
    entryLight.position.set(.72, -height / 2 + 2.15, -depth / 2 - .1); group.add(entryLight);
    if (label) { const sign = makeSign(label, Math.min(width * 1.1, 5)); sign.position.set(0, -height / 2 + 2.7, -depth / 2 - .08); group.add(sign); }
    this.scene.add(group); this.physics.addBuilding({ x, z, width: width + .3, depth: depth + .3 });
    return group;
  }
}

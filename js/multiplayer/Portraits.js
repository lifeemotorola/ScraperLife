import * as THREE from 'three';
import { instantiateCharacter } from '../entities/CharacterRig.js';

// Close-up portraits of each playable character, rendered from the same rig and palette the
// game uses. The world camera is too far away for faces to read, so the lobby and the player
// roster show these instead. One offscreen WebGL context is shared by every portrait.

const SIZE = 256;

function disposeInstance(instance) {
  for (const list of instance.materials?.values?.() || []) {
    for (const material of list) material?.dispose?.();
  }
}

export class PortraitStudio {
  constructor() {
    this.renderer = null;
    this.cache = new Map();     // characterId -> Promise<dataURL>
  }

  ensureRenderer() {
    if (this.renderer) return;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sky = new THREE.HemisphereLight(0xdcfff6, 0x3a2a1f, 1.5);
    this.scene.add(sky);
    const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
    key.position.set(1.4, 2.6, 3.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x75c5bb, 1.3);
    rim.position.set(-2.2, 1.6, -2.4);
    this.scene.add(rim);
  }

  // Resolves to a PNG data URL. `shared` is the loaded rig; `paletteData` is character_palettes.json.
  portrait(characterId, shared, paletteData) {
    if (!this.cache.has(characterId)) {
      this.cache.set(characterId, Promise.resolve().then(() => this.render(characterId, shared, paletteData)));
    }
    return this.cache.get(characterId);
  }

  render(characterId, shared, paletteData) {
    this.ensureRenderer();
    const palette = paletteData?.characters?.[characterId] || null;
    const instance = instantiateCharacter(shared, { palette, paletteData, cull: false, shadow: false });
    const root = instance.root;
    this.scene.add(root);
    root.updateMatrixWorld(true);

    // The rig is authored facing +Z (see README: forward is +Z), so a camera on +Z sees the face.
    const box = new THREE.Box3().setFromObject(root);
    const height = box.max.y - box.min.y;
    const centerX = (box.max.x + box.min.x) / 2;
    const centerZ = (box.max.z + box.min.z) / 2;
    const focusY = box.max.y - height * 0.2;          // head centre, with shoulders in frame
    const visible = height * 0.56;                    // vertical span the camera frames
    const distance = (visible / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(centerX, focusY + 0.04, centerZ + distance);
    this.camera.lookAt(centerX, focusY, centerZ);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');

    this.scene.remove(root);
    disposeInstance(instance);
    return url;
  }
}

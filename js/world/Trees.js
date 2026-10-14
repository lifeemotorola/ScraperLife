import { createGLTFLoader } from '../loaders/gltf.js';

// Tree models made by tools/tree_generator.py from the Easy Tree presets (addon/EasyTree).
// Each GLB has a `bark` mesh and, except for the dead tree, a `leaves` mesh.
export const TREE_KINDS = ['tall', 'thin', 'dead', 'large'];

// Season tints multiply the leaf texture per tree: spring, summer, autumn.
export const SEASON_TINTS = [0xc9eea6, 0xffffff, 0xe6b070];

const TREE_URLS = TREE_KINDS.map((kind) => new URL(`../../assets/Environment/trees/tree_${kind}.glb`, import.meta.url).href);

let templatePromise = null;

function readParts(gltf) {
  const parts = {};
  gltf.scene.traverse((object) => {
    if (object.isMesh && (object.name === 'bark' || object.name === 'leaves')) {
      parts[object.name] = { geometry: object.geometry, material: object.material };
    }
  });
  if (!parts.bark) throw new Error('tree model has no bark mesh');
  return parts;
}

// Resolves to one { bark, leaves } entry per tree kind, in TREE_KINDS order.
export function loadTreeTemplates() {
  if (!templatePromise) {
    templatePromise = Promise.all(TREE_URLS.map((url) => new Promise((resolve, reject) => {
      createGLTFLoader().load(url, (gltf) => resolve(readParts(gltf)), undefined, reject);
    }))).catch((error) => {
      templatePromise = null;
      throw error;
    });
  }
  return templatePromise;
}

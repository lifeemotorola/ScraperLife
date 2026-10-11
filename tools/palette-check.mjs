// Runtime half of tools/character_palette.py. Loads the same GLB through the same GLTFLoader
// and asserts that (1) the Python-generated palette covers every exported material,
// (2) every character can be cloned from one rig, (3) cloned material colours stay independent,
// (4) the clones have separate skeletons but shared geometry, and (5) walk clips are present.
//
//   python3 tools/character_palette.py build
//   node tools/palette-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  expandCullBounds,
  instantiateCharacter,
} from '../js/entities/CharacterRig.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = join(rootDir, 'assets/models/survival_character.glb');
const manifestPath = join(rootDir, 'assets/models/survival_character.character.json');
const palettesPath = join(rootDir, 'assets/models/character_palettes.json');
const failures = [];

function check(label, ok, detail = '') {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
}

for (const [label, path] of [['GLB', modelPath], ['manifest', manifestPath], ['palette JSON', palettesPath]]) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    if (label === 'palette JSON') console.error('Run: python3 tools/character_palette.py build');
    process.exit(2);
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const paletteData = JSON.parse(readFileSync(palettesPath, 'utf8'));

// No GL context and no image decoders here. The material maps are preserved as texture shells;
// geometry, skin weights, material names and animation channels are the real GLB data.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window ??= dom.window;
globalThis.document ??= dom.window.document;
globalThis.self ??= dom.window;
// GLTFLoader creates a blob URL for the embedded texture before it calls TextureLoader. Give
// jsdom the Node URL/Blob implementation so that this is a harmless URL rather than a rejected
// image-load promise (the texture shell itself is stubbed immediately below).
globalThis.self.URL = globalThis.URL;
globalThis.Blob ??= dom.window.Blob;
THREE.TextureLoader.prototype.load = (url, onLoad) => {
  const texture = new THREE.Texture();
  texture.source.data = { src: url };
  onLoad?.(texture);
  return texture;
};

const bytes = readFileSync(modelPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(buffer, '', resolve, reject);
});
const shared = {
  root: gltf.scene || gltf.scenes?.[0],
  clips: gltf.animations || [],
  manifest,
  slots: paletteData.slots,
  shared: paletteData.shared,
};

const materialNames = new Set();
const sharedSkins = [];
shared.root.traverse((object) => {
  if (!object.isMesh) return;
  if (object.isSkinnedMesh) sharedSkins.push(object);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.filter(Boolean).forEach((material) => materialNames.add(material.name));
});
check('one shared GLB loaded as a skinned character', sharedSkins.length > 0,
  `${sharedSkins.length} skinned meshes / ${materialNames.size} material names`);
check('palette material names match the GLB',
  paletteData.materials.length === materialNames.size
    && paletteData.materials.every((name) => materialNames.has(name)),
  `${paletteData.materials.length} palette materials / ${materialNames.size} GLB materials`);
check('all GLB materials are grouped into a palette slot',
  paletteData.unmatchedMaterials.length === 0,
  paletteData.unmatchedMaterials.join(', ') || `${materialNames.size} covered`);

const mapped = new Set(Object.values(paletteData.slots).flatMap((slot) => slot.materials));
check('each GLB material is grouped exactly once',
  mapped.size === materialNames.size && [...materialNames].every((name) => mapped.has(name)),
  `${mapped.size} unique mapped materials`);

const ids = Object.keys(paletteData.characters);
check('script generated the whole story roster and individual crew palettes', ids.length === 17,
  `${ids.length}: ${ids.join(', ')}`);
check('each character has a unique skin colour',
  new Set(ids.map((id) => paletteData.characters[id].colors.skin)).size === ids.length,
  `${new Set(ids.map((id) => paletteData.characters[id].colors.skin)).size}/${ids.length}`);
check('each character has a unique jacket colour',
  new Set(ids.map((id) => paletteData.characters[id].colors.shirt)).size === ids.length,
  `${new Set(ids.map((id) => paletteData.characters[id].colors.shirt)).size}/${ids.length}`);

expandCullBounds(shared.root);
const characters = new Map();
for (const id of ids) {
  characters.set(id, instantiateCharacter(shared, {
    palette: paletteData.characters[id], paletteData, cull: id !== 'markie', shadow: id === 'markie',
  }));
}

const materialByName = (root, wanted) => {
  let found = null;
  root.traverse((object) => {
    if (!object.isMesh || found) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    found = list.find((material) => material?.name === wanted) || null;
  });
  return found;
};
const nearColor = (a, b) => {
  const expected = new THREE.Color(b);
  return Math.abs(a.r - expected.r) < 1e-5
    && Math.abs(a.g - expected.g) < 1e-5
    && Math.abs(a.b - expected.b) < 1e-5;
};

for (const id of ids) {
  const character = characters.get(id);
  const palette = paletteData.characters[id];
  check(`'${id}' instantiates the shared rig`, Boolean(character.root && character.animator),
    `${character.root.children.length} root children / ${character.animator.actions.size} actions`);
  for (const [slot, info] of Object.entries(paletteData.slots)) {
    if (!info.materials.length) continue;
    const slotMaterials = character.materials.get(slot) || [];
    const uniqueMaterials = new Set(slotMaterials.map((material) => material.name));
    const expected = palette.colors[slot] || paletteData.shared[slot];
    check(`'${id}' tints ${slot} from its palette`,
      uniqueMaterials.size === info.materials.length
        && slotMaterials.every((material) => expected ? nearColor(material.color, expected) : true),
      `${uniqueMaterials.size}/${info.materials.length} unique material names -> ${expected || 'exported colour'}`);
    check(`'${id}' ${slot} roughness follows the palette recipe`,
      slotMaterials.every((material) => Math.abs(material.roughness - info.roughness) < 1e-6),
      `roughness ${info.roughness}`);
  }
  const culling = [];
  character.root.traverse((object) => { if (object.isMesh) culling.push(object.frustumCulled); });
  check(`'${id}' has the expected culling mode`,
    culling.length > 0 && culling.every((value) => value === (id !== 'markie')),
    id === 'markie' ? 'player always visible' : 'animated NPC bound enabled');
  check(`'${id}' gets a real walk action`, character.animator.actions.has('walk'),
    [...character.animator.actions.keys()].join(', '));
}

const markie = characters.get('markie');
const kollie = characters.get('kollie');
const markieJacket = materialByName(markie.root, 'Jacket1');
const kollieJacket = materialByName(kollie.root, 'Jacket1');
const firstSkinnedMesh = (root) => {
  let found = null;
  root.traverse((object) => { if (!found && object.isSkinnedMesh) found = object; });
  return found;
};
const markieSkinMesh = firstSkinnedMesh(markie.root);
const kollieSkinMesh = firstSkinnedMesh(kollie.root);
check('the same outfit material is independent per character',
  markieJacket && kollieJacket && markieJacket !== kollieJacket
    && !markieJacket.color.equals(kollieJacket.color),
  `Markie ${paletteData.characters.markie.colors.shirt} / Kollie ${paletteData.characters.kollie.colors.shirt}`);
check('clone shares the heavy geometry but not its skeleton',
  markieSkinMesh && kollieSkinMesh
    && markieSkinMesh.geometry === kollieSkinMesh.geometry
    && markieSkinMesh.skeleton !== kollieSkinMesh.skeleton
    && markieSkinMesh.skeleton.bones[0] !== kollieSkinMesh.skeleton.bones[0],
  'same vertex/index buffers; per-person bones and pose');
check('shared source material stays untinted',
  materialByName(shared.root, 'Jacket1')?.color.equals(new THREE.Color(0xffffff)) === true,
  'each clone owns its tint');

console.log();
if (failures.length) {
  console.error(`${failures.length} palette/runtime check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`all checks passed — ${ids.length} palettes, one GLB, ${materialNames.size} material slots`);

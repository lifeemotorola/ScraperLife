import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { makeSign } from './Building.js';

// The authored house (assets/Environment/old-house.dae, exported from 3ds Max / Clara.io).
// It is loaded once; every city block gets a cheap clone that shares geometry and materials.
const HOUSE_URL = new URL('../../assets/Environment/old-house.dae', import.meta.url).href;

// The COLLADA file points its textures at the author's F:\ drive. Map those file names to the
// copies bundled next to the model so the walls, porch and windows load in the browser.
const HOUSE_TEXTURES = {
  'List_1_dom_derevnja.jpg': new URL('../../assets/Environment/List_1_dom_derevnja.jpg', import.meta.url).href,
  'List_2_dom_derevnja.jpg': new URL('../../assets/Environment/List_2_dom_derevnja.jpg', import.meta.url).href,
  'List_3_dom_derevnja.jpg': new URL('../../assets/Environment/List_3_dom_derevnja.jpg', import.meta.url).href,
};

let templatePromise = null;

function resolveTextureUrl(url) {
  const name = decodeURIComponent(url).split(/[\\/]/).pop();
  return HOUSE_TEXTURES[name] || url;
}

// Centre the model on X/Z, stand it on y = 0, and record its real size in metres.
function prepareTemplate(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
  });
  const box = new THREE.Box3().setFromObject(scene);
  const centre = box.getCenter(new THREE.Vector3());
  scene.position.set(-centre.x, -box.min.y, -centre.z);
  const pivot = new THREE.Group();
  pivot.add(scene);
  pivot.userData.size = box.getSize(new THREE.Vector3());
  return pivot;
}

// Resolves to a reusable house template, or rejects if the model cannot be loaded.
export function loadHouseTemplate(url = HOUSE_URL) {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(resolveTextureUrl);
      // The loader starts the texture downloads while parsing the .dae, and onLoad only fires once
      // all of them are done. Wait for both so the city never appears with blank walls.
      let scene = null;
      let texturesDone = false;
      const finishIfReady = () => { if (scene && texturesDone) resolve(prepareTemplate(scene)); };
      manager.onLoad = () => { texturesDone = true; finishIfReady(); };
      new ColladaLoader(manager).load(
        url,
        (collada) => { scene = collada.scene; finishIfReady(); },
        undefined,
        (error) => reject(error),
      );
    });
    templatePromise.catch(() => { templatePromise = null; });
  }
  return templatePromise;
}

// Weathered paint schemes, multiplied over the wall and porch textures (white keeps the original look).
const WALL_TINTS = [0xffffff, 0xc4d3dd, 0xe6c79c, 0xd4a18c, 0xb9cba9, 0xeedca8];
const PORCH_TINTS = [0xffffff, 0x9fb1bb, 0xb89a74, 0xa87565, 0x8fa388, 0xc9b98c];

// Every house gets a different paint scheme and a slightly different width, so no two blocks match.
// The index is the block's position in City's list, so the look is the same on every load.
export function houseVariant(index) {
  return {
    wall: new THREE.Color(WALL_TINTS[index % WALL_TINTS.length]),
    porch: new THREE.Color(PORCH_TINTS[index % PORCH_TINTS.length]),
    widthScale: 0.9 + ((index * 37) % 11) / 100, // 0.90 .. 1.00 of the footprint
  };
}

// Places one house so it fills its footprint and reaches the given height.
// The house keeps its proportions in X/Z (uniform fit) and is stretched vertically to the storey height.
export function placeHouse(scene, template, { x, z, width, depth, height, label, rotationY = 0 }, variant = null) {
  const size = template.userData.size;
  const fit = Math.min(width / size.x, depth / size.z) * (variant?.widthScale ?? 1);
  const house = template.clone(true);
  house.scale.set(fit, height / size.y, fit);
  if (variant) {
    // Each house needs its own material copies so one tint does not recolour every house.
    house.traverse((object) => {
      if (!object.isMesh) return;
      const copies = [object.material].flat().map((material) => {
        const copy = material.clone();
        if (material.name === 'Walls') copy.color.copy(variant.wall);
        else if (material.name === 'Porch') copy.color.copy(variant.porch);
        return copy;
      });
      object.material = Array.isArray(object.material) ? copies : copies[0];
    });
  }
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  group.add(house);
  if (label) {
    // The model has no sign of its own, so the street name goes over the front (-Z) face.
    const sign = makeSign(label, Math.min(width * 1.1, 5));
    sign.position.set(0, Math.min(height, 3.2) - .35, -depth / 2 - .08);
    // A plane faces +Z by default; turn it so its text reads from the street side (-Z).
    sign.rotation.y = Math.PI;
    group.add(sign);
  }
  scene.add(group);
  return group;
}

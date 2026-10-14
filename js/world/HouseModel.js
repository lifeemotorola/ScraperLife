import * as THREE from 'three';
import { createGLTFLoader } from '../loaders/gltf.js';
import { makeSign } from './Building.js';

// The authored house, converted from assets/Environment/old-house.dae by tools/convert_house_glb.py.
// A binary GLB parses far faster than the 4.7 MB COLLADA XML, and its textures are embedded and resized.
const HOUSE_URL = new URL('../../assets/Environment/old-house.glb', import.meta.url).href;

let templatePromise = null;

// Centre the model on X/Z, stand it on y = 0, and record its real size in metres.
function prepareTemplate(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  const box = new THREE.Box3().setFromObject(scene);
  const centre = box.getCenter(new THREE.Vector3());
  scene.position.set(-centre.x, -box.min.y, -centre.z);
  const pivot = new THREE.Group();
  pivot.add(scene);
  pivot.userData.size = box.getSize(new THREE.Vector3());
  return pivot;
}

// Resolves to the house template, or rejects if the model cannot be loaded.
export function loadHouseTemplate(url = HOUSE_URL) {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      createGLTFLoader().load(
        url,
        (gltf) => resolve(prepareTemplate(gltf.scene)),
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

// Places every house in one go. Each model part becomes a single InstancedMesh, so all houses
// cost one draw call per part (and one per part in the shadow pass) instead of one per house.
// Each house still fills its footprint and reaches its storey height, keeping its X/Z proportions.
// Returns every object it added to the scene, so a caller can remove them again later.
export function placeHouses(scene, template, placements) {
  const size = template.userData.size;
  const created = [];
  template.updateMatrixWorld(true);

  const houseMatrices = placements.map(({ x, z, width, depth, height, variant }) => {
    const fit = Math.min(width / size.x, depth / size.z) * (variant?.widthScale ?? 1);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion(),
      new THREE.Vector3(fit, height / size.y, fit),
    );
  });

  const parts = [];
  template.traverse((object) => { if (object.isMesh) parts.push(object); });
  const instanceMatrix = new THREE.Matrix4();
  for (const part of parts) {
    const material = part.material;
    const instanced = new THREE.InstancedMesh(part.geometry, material, placements.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    placements.forEach((placement, i) => {
      instanced.setMatrixAt(i, instanceMatrix.multiplyMatrices(houseMatrices[i], part.matrixWorld));
      const tint = placement.variant && (material.name === 'Walls' ? placement.variant.wall
        : material.name === 'Porch' ? placement.variant.porch : null);
      if (tint) instanced.setColorAt(i, tint);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    scene.add(instanced);
    created.push(instanced);
  }

  // The model has no sign of its own, so each street name goes over its house's front (-Z) face.
  placements.forEach(({ x, z, width, depth, height, label }) => {
    if (!label) return;
    const sign = makeSign(label, Math.min(width * 1.1, 5));
    sign.position.set(x, Math.min(height, 3.2) - .35, z - depth / 2 - .08);
    // A plane faces +Z by default; turn it so its text reads from the street side (-Z).
    sign.rotation.y = Math.PI;
    scene.add(sign);
    created.push(sign);
  });
  return created;
}

import * as THREE from 'three';
import houseBuilderCatalog from '../../assets/Environment/House/house_builder/preset_catalog.json' with { type: 'json' };
import {
  buildTemplateSet,
  housePresetSlot,
  templateIndexFor,
} from './HouseBuilder.js';

// The game's houses are generated from assets/Environment/House/house_builder — the Advanced
// House Builder preset catalog (one template per house family × floor band, built in
// HouseBuilder.js). This replaces the old homemaker GLB (assets/Environment/homemaker-house.glb),
// which was a single hand-converted model every block shared.

let setPromise = null;
let templateCount = 0;

// Resolves to the house template set, or rejects if the presets cannot be built (callers fall
// back to the box houses, then).
export function loadHouseTemplate() {
  if (!setPromise) {
    setPromise = Promise.resolve().then(() => {
      const templates = buildTemplateSet(houseBuilderCatalog);
      if (!templates.length) throw new Error('house_builder preset catalog produced no templates');
      templateCount = templates.length;
      return templates;
    });
    setPromise.catch(() => { setPromise = null; });
  }
  return setPromise;
}

// Weathered paint schemes, multiplied over each template's wall and porch colors (white keeps
// the catalog's own paint).
const WALL_TINTS = [0xffffff, 0xc4d3dd, 0xe6c79c, 0xd4a18c, 0xb9cba9, 0xeedca8];
const PORCH_TINTS = [0xffffff, 0x9fb1bb, 0xb89a74, 0xa87565, 0x8fa388, 0xc9b98c];

// Every house gets a different paint scheme and a slightly different width, so no two blocks
// match, plus a preset slot (which house family it is built from). The index is the block's
// position in City's list or a seeded district roll, so the look is the same on every load.
export function houseVariant(index) {
  // templateCount is known once loadHouseTemplate has run; 10 is the fallback slot count.
  const slots = templateCount ? Math.floor(templateCount / 2) : 10;
  return {
    wall: new THREE.Color(WALL_TINTS[index % WALL_TINTS.length]),
    porch: new THREE.Color(PORCH_TINTS[index % PORCH_TINTS.length]),
    widthScale: 0.9 + ((index * 37) % 11) / 100, // 0.90 .. 1.00 of the footprint
    presetSlot: housePresetSlot(index, slots),
  };
}

// Places every house in one go. Placements are grouped by template (each variant's preset slot
// and the block's height band choose it), and each template part becomes one InstancedMesh, so
// the whole set costs draw calls per used part rather than one per house.
// Each house fills its footprint and reaches its storey height, keeping its X/Z proportions.
// Returns every object it added to the scene, so a caller can remove them again later.
export function placeHouses(scene, templates, placements) {
  if (!Array.isArray(templates) || !templates.length) return [];
  const created = [];

  // Group placements by template index — one InstancedMesh set per template actually used.
  const groups = new Map();
  placements.forEach((placement) => {
    const index = Math.min(
      templateIndexFor(placement.variant, placement.height, templates.length),
      templates.length - 1,
    );
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index).push(placement);
  });

  const instanceMatrix = new THREE.Matrix4();
  for (const [index, list] of groups) {
    const template = templates[index];
    const { size, body } = template.userData;
    // Fit the body to the lot (the veranda and eaves may overhang, like a real porch) and
    // stretch vertically to the block's storey height.
    const houseMatrices = list.map(({ x, z, width, depth, height, variant }) => {
      const fit = Math.min(width / body.w, depth / body.d) * (variant?.widthScale ?? 1);
      return new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion(),
        new THREE.Vector3(fit, height / size.y, fit),
      );
    });
    template.updateMatrixWorld(true);
    const parts = [];
    template.traverse((object) => { if (object.isMesh) parts.push(object); });
    for (const part of parts) {
      const material = part.material;
      const instanced = new THREE.InstancedMesh(part.geometry, material, list.length);
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      list.forEach((placement, i) => {
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
  }

  // House names are not drawn on the houses; they go on the world map (see UIManager.setPlaceNames).
  return created;
}

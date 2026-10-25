// House preset check: builds the game's houses from assets/Environment/House/house_builder —
// the Advanced House Builder preset catalog — with the same generator the game runs, then
// asserts every one of the 50 catalog presets produces a sane template (finite geometry, base
// on y = 0, plausible size, all tintable parts present) and that the variant → template
// selection stays deterministic and in range.
//
//   node tools/house-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  FLOOR_BANDS,
  FLOOR_SPLIT,
  MATERIAL_NAMES,
  basePresets,
  buildHouseTemplate,
  buildTemplateSet,
  housePresetSlot,
  templateIndexFor,
} from '../js/world/HouseBuilder.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'assets/Environment/House/house_builder/preset_catalog.json');
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
};

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
check('preset catalog carries 50 house presets', catalog.houses?.length === 50, `${catalog.houses?.length} houses`);
check('preset catalog carries 100 texture presets', catalog.textures?.length === 100, `${catalog.textures?.length} textures`);
check('catalog release is the expected line', catalog.release === '1.5.0', `release ${catalog.release}`);

const bases = basePresets(catalog);
const families = new Set(catalog.houses.map((house) => house.family));
check('one base preset per house family', bases.length === families.size, `${bases.length} families`);
check('every preset carries a settings block',
  catalog.houses.every((house) => house.settings && house.settings.width > 0 && house.settings.roof_style));

// Scan every attribute of every mesh for NaN/non-finite values.
function geometryProblems(template) {
  const problems = [];
  for (const mesh of template.children) {
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
      const array = attribute.array;
      for (let i = 0; i < array.length; i += 1) {
        if (!Number.isFinite(array[i])) { problems.push(`${mesh.name}.${name}[${i}]`); break; }
      }
    }
    if (!mesh.geometry.boundingSphere || !Number.isFinite(mesh.geometry.boundingSphere.radius)) {
      problems.push(`${mesh.name}.boundingSphere`);
    }
  }
  return problems;
}

// Build every catalog preset at both floor bands — the generator must survive all 100 combos.
let built = 0;
let badSize = 0;
let badBase = 0;
let missingParts = 0;
let nanMeshes = 0;
for (const house of catalog.houses) {
  for (const floors of FLOOR_BANDS) {
    const template = buildHouseTemplate(house, catalog, floors);
    built += 1;
    const { size, body } = template.userData;
    if (![size.x, size.y, size.z, body.w, body.d].every(Number.isFinite)
      || size.x < 3 || size.x > 40 || size.z < 3 || size.z > 40 || size.y < 3 || size.y > 30) badSize += 1;
    // After centring the base sits on y = 0 (the pivot adds nothing).
    let minY = Infinity;
    for (const mesh of template.children) {
      minY = Math.min(minY, mesh.geometry.boundingBox.min.y);
      if (!MATERIAL_NAMES.includes(mesh.name)) missingParts += 1;
      if (!mesh.material || mesh.material.name !== mesh.name) missingParts += 1;
    }
    if (Math.abs(minY) > 1e-6) badBase += 1;
    if (!template.children.some((mesh) => mesh.name === 'Walls')) missingParts += 1;
    if (!template.children.some((mesh) => mesh.name === 'Roof')) missingParts += 1;
    if (geometryProblems(template).length) nanMeshes += 1;
    template.traverse((object) => object.geometry?.dispose?.());
  }
}
check('all 100 preset × floor combos build', built === 100, `${built} templates`);
check('every template has a plausible size', badSize === 0, `${badSize} out of band`);
check('every template stands on y = 0', badBase === 0, `${badBase} floating`);
check('every template keeps Walls/Roof with named materials', missingParts === 0, `${missingParts} problems`);
check('no NaN in any generated geometry', nanMeshes === 0, `${nanMeshes} meshes with bad data`);

// The set the game actually places: one base preset per family × floor bands.
const set = buildTemplateSet(catalog);
check('game template set = families × floor bands', set.length === bases.length * FLOOR_BANDS.length, `${set.length} templates`);
const repeat = buildHouseTemplate(bases[0], catalog, 1);
check('templates are deterministic (same preset → same size)',
  repeat.userData.size.distanceTo(set[0].userData.size) < 1e-6,
  `size ${set[0].userData.size.y.toFixed(2)}m tall`);
repeat.traverse((object) => object.geometry?.dispose?.());

// Selection: variant slot × height band must stay inside the set and spread across families.
const slots = set.length / FLOOR_BANDS.length;
let outOfRange = 0;
const usedSlots = new Set();
for (let i = 0; i < 1000; i += 1) {
  const slot = housePresetSlot(i, slots);
  if (slot < 0 || slot >= slots) outOfRange += 1;
  usedSlots.add(slot);
  for (const height of [7, 7.9, 8.2, 9, 11]) {
    const index = templateIndexFor({ presetSlot: slot }, height, set.length);
    if (index < 0 || index >= set.length) outOfRange += 1;
    const floors = set[index].userData.floors;
    const expect = height < FLOOR_SPLIT ? 1 : 2;
    if (floors !== expect) outOfRange += 1;
  }
}
check('variant slots stay in range (1000 rolls)', outOfRange === 0, `${outOfRange} misses`);
check('variant slots spread across every family', usedSlots.size === slots, `${usedSlots.size}/${slots} slots used`);

set.forEach((template) => template.traverse((object) => object.geometry?.dispose?.()));

// --- Integration: the exact path City and Districts run (load → variant → place) ---------------
const { loadHouseTemplate, houseVariant, placeHouses } = await import('../js/world/HouseModel.js');
const gameTemplates = await loadHouseTemplate();
check('game loads its house template set', gameTemplates.length === bases.length * FLOOR_BANDS.length,
  `${gameTemplates.length} templates`);

// A stand-in scene: placeHouses only calls scene.add.
const added = [];
const scene = { add: (object) => added.push(object) };
const placements = [];
for (let i = 0; i < 16; i += 1) {
  // Mirror City's block sizes (7–14 wide, 6–12 deep, 8–11 tall).
  placements.push({
    x: i * 10, z: 0,
    width: 7 + (i % 4), depth: 6 + (i % 3) * 2, height: 8 + (i % 4) * 0.75,
    variant: houseVariant(i),
  });
}
const created = placeHouses(scene, gameTemplates, placements);
check('placeHouses creates instanced parts', created.length > 0, `${created.length} InstancedMeshes`);
let badMatrix = 0; let badTint = 0;
for (const mesh of created) {
  const m = mesh.instanceMatrix.array;
  for (let i = 0; i < m.length; i += 1) if (!Number.isFinite(m[i])) { badMatrix += 1; break; }
  const tinted = mesh.material.name === 'Walls' || mesh.material.name === 'Porch';
  if (tinted !== !!mesh.instanceColor) badTint += 1;
  if (tinted && mesh.instanceColor) {
    for (let i = 0; i < mesh.instanceColor.array.length; i += 1) {
      if (!Number.isFinite(mesh.instanceColor.array[i])) { badTint += 1; break; }
    }
  }
}
check('every instance matrix is finite', badMatrix === 0, `${badMatrix} bad`);
check('Walls/Porch carry tints, others stay untinted', badTint === 0, `${badTint} mismatches`);
check('the city block variety uses several house styles',
  new Set(placements.map((p, i) => templateIndexFor(p.variant, p.height, gameTemplates.size ?? gameTemplates.length))).size >= 4,
  'distinct templates per 16 blocks');
check('placeHouses handles an empty placement list',
  placeHouses(scene, gameTemplates, []).length === 0, 'no objects');

console.log(failures.length ? `\n${failures.length} FAIL(s)` : '\nAll house preset checks passed.');
process.exit(failures.length ? 1 : 0);

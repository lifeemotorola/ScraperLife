import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from './Environment.js';
import { houseVariant, placeHouses } from './HouseModel.js';
import { SEASON_TINTS, TREE_KINDS } from './Trees.js';

// Endless districts. The world is cut into square chunks. Each chunk is generated from a seed made
// from its own (x, z) index, so the same chunk always looks the same, and chunks load and unload
// around the player as they move. The hand-built Waterside district is the four chunks
// (-1..0, -1..0), and the sea starts at chunk x = 1, so neither is generated.

export const CHUNK = 40;
const color = new THREE.Color();
const PLOT = 20;          // four plots per chunk, each PLOT wide
const ROAD_WIDTH = 6;     // one cross of streets per chunk, along the chunk's centre lines
const SKIP = 'authored';  // marker for chunks left to the hand-built city

export function chunkKind(cx, cz) {
  if (cx >= -1 && cx <= 0 && cz >= -1 && cz <= 0) return SKIP;   // the hand-built district
  if (cx >= 1) return SKIP;                                      // the sea side (endless water)
  return 'land';
}

// Small seeded PRNG (mulberry32), seeded from the chunk index.
function chunkRandom(cx, cz) {
  let h = (Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263) ^ 0x9e3779b9) >>> 0;
  return () => {
    h = (h + 0x6D2B79F5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A flat strip lying on the ground. width runs along X and height along Z.
function strip(width, height, x, y, z) {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  return geometry;
}

function markMatrices(...meshes) {
  for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
}

export class Districts {
  constructor(scene, physics, { template = null, trees = null, radius = 2 } = {}) {
    this.scene = scene;
    this.physics = physics;
    this.template = template;
    this.trees = trees;
    this.radius = radius;
    this.chunks = new Map();
    this.centre = null;
    this.shared = this.makeSharedGeometry();
  }

  // Geometry and materials that every chunk reuses, so chunks add no new material or geometry cost.
  makeSharedGeometry() {
    const stem = new THREE.CylinderGeometry(.055, .07, 4.2, 7);
    stem.translate(0, 2.1, 0);
    const bulb = new THREE.SphereGeometry(.13, 8, 6);
    bulb.translate(0, 4.1, 0);
    return {
      stem, bulb,
      stemMaterial: new THREE.MeshStandardMaterial({ color: 0x22312f, metalness: .5 }),
      bulbMaterial: new THREE.MeshBasicMaterial({ color: 0xffc36c }),
      roadMaterial: new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 1 }),
      stripeMaterial: new THREE.MeshBasicMaterial({ color: 0xdfb965, transparent: true, opacity: .7 }),
    };
  }

  // Builds the chunks around the player, and unloads any that are too far away.
  update(position) {
    const cx = Math.floor(position.x / CHUNK);
    const cz = Math.floor(position.z / CHUNK);
    if (this.centre && this.centre.cx === cx && this.centre.cz === cz) return;
    this.centre = { cx, cz };
    for (let x = cx - this.radius; x <= cx + this.radius; x += 1) {
      for (let z = cz - this.radius; z <= cz + this.radius; z += 1) {
        const key = `${x},${z}`;
        if (this.chunks.has(key) || chunkKind(x, z) === SKIP) continue;
        this.chunks.set(key, this.build(x, z));
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - cx) > this.radius + 1 || Math.abs(chunk.cz - cz) > this.radius + 1) this.unload(key);
    }
  }

  unload(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const object of chunk.objects) {
      this.scene.remove(object);
      object.dispose?.();
      if (object.userData.ownGeometry) object.geometry.dispose();
    }
    this.physics.removeOwner(key);
    this.chunks.delete(key);
  }

  build(cx, cz) {
    const key = `${cx},${cz}`;
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const random = chunkRandom(cx, cz);
    const objects = [];
    const addObject = (object, own = false) => {
      object.userData.ownGeometry = own;
      this.scene.add(object);
      objects.push(object);
    };

    // Streets: one cross through the chunk centre, so neighbouring chunks join up.
    const mx = ox + CHUNK / 2;
    const mz = oz + CHUNK / 2;
    const roadParts = [strip(CHUNK, ROAD_WIDTH, mx, .012, mz), strip(ROAD_WIDTH, CHUNK, mx, .012, mz)];
    const stripeParts = [strip(CHUNK - 2, .16, mx, .025, mz), strip(.16, CHUNK - 2, mx, .025, mz)];
    const roads = new THREE.Mesh(mergeGeometries(roadParts), this.shared.roadMaterial);
    roads.receiveShadow = true;
    addObject(roads, true);
    const stripes = new THREE.Mesh(mergeGeometries(stripeParts), this.shared.stripeMaterial);
    addObject(stripes, true);
    roadParts.concat(stripeParts).forEach((geometry) => geometry.dispose());

    // Lamps stand at the kerbs of the two streets.
    const lampSpots = [[5, 16.5], [35, 23.5], [16.5, 5], [23.5, 35]].map(([dx, dz]) => ({ x: ox + dx, z: oz + dz }));
    const lampStems = new THREE.InstancedMesh(this.shared.stem, this.shared.stemMaterial, lampSpots.length);
    const lampBulbs = new THREE.InstancedMesh(this.shared.bulb, this.shared.bulbMaterial, lampSpots.length);
    const matrix = new THREE.Matrix4();
    lampSpots.forEach((spot, i) => {
      matrix.makeTranslation(spot.x, 0, spot.z);
      lampStems.setMatrixAt(i, matrix);
      lampBulbs.setMatrixAt(i, matrix);
    });
    markMatrices(lampStems, lampBulbs);
    addObject(lampStems); addObject(lampBulbs);

    // Each of the four plots may hold a house or a tree.
    const placements = [];
    // Trees go on lots without a house. Each entry: the tree kind, position, scale and season tint.
    const trees = TREE_KINDS.map(() => []);
    for (let sx = 0; sx < 2; sx += 1) {
      for (let sz = 0; sz < 2; sz += 1) {
        const x = ox + PLOT / 2 + sx * PLOT;
        const z = oz + PLOT / 2 + sz * PLOT;
        // The draws are always made, so a chunk's layout does not depend on whether the house model has loaded.
        const hasHouse = random() < .75;
        const width = 7 + random() * 3.5;
        const depth = 6 + random() * 3;
        const height = 7 + random() * 4;
        const variantIndex = Math.floor(random() * 997);
        random(); // Former palm roll. The draw is kept so later draws, and every chunk's layout, stay the same.
        const treeRoll = random();
        const treeKind = Math.floor(random() * TREE_KINDS.length);
        const treeScale = .85 + random() * .3;
        const treeSeason = Math.floor(random() * SEASON_TINTS.length);
        if (!hasHouse && treeRoll < .6 && this.trees) {
          trees[treeKind].push({ x, z, scale: treeScale, season: treeSeason });
          this.physics.addBuilding({ x, z, width: .6, depth: .6 }, key);
        }
        if (hasHouse && this.template) {
          placements.push({ x, z, width, depth, height, variant: houseVariant(variantIndex) });
          this.physics.addBuilding({ x, z, width: width + .3, depth: depth + .3 }, key);
        }
      }
    }

    if (placements.length) {
      objects.push(...placeHouses(this.scene, this.template, placements));
    }
    trees.forEach((list, kind) => {
      if (!list.length || !this.trees) return;
      // One InstancedMesh per part (bark, leaves), so each tree kind costs one or two draw calls per chunk.
      for (const part of Object.values(this.trees[kind])) {
        const instanced = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        instanced.castShadow = true;
        list.forEach((tree, i) => {
          matrix.makeScale(tree.scale, tree.scale, tree.scale).setPosition(tree.x, 0, tree.z);
          instanced.setMatrixAt(i, matrix);
          instanced.setColorAt(i, color.set(SEASON_TINTS[tree.season]));
        });
        markMatrices(instanced);
        instanced.instanceColor.needsUpdate = true;
        addObject(instanced);
      }
    });

    return { cx, cz, objects };
  }
}

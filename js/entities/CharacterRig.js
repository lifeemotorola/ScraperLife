import * as THREE from 'three';
import { createGLTFLoader } from '../loaders/gltf.js';
// This build of the addon exports bare functions (`retarget`, `retargetClip`, `clone`), not a
// `SkeletonUtils` namespace — importing a namespace here would resolve to `undefined`.
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { applyWardrobe } from './Wardrobe.js';

// Runtime half of tools/rig_and_animate.py. The Python script exports a GLB plus a
// `<name>.character.json` manifest; everything here reads that manifest instead of guessing,
// so renaming a clip or changing the fps in Blender needs no change in JS.
//
// The whole cast is one character: Markie, ten story NPCs and Vardee's crew all come from
// the same GLB. tools/character_palette.py decides what colour each of them is, and
// `loadSharedCharacter` + `instantiateCharacter` here make that affordable — the 5.3 MB body is
// downloaded and parsed ONCE, then cloned per character (SkeletonUtils.clone reuses geometry and
// materials by reference, so `applyPalette` gives every clone its own material copies).

const CROSSFADE = 0.18;
const STATES = ['idle', 'walk', 'run', 'jump', 'pulse', 'hit', 'interact', 'celebrate', 'dance'];

// A state that plays once and then hands back to the locomotion state.
const ONE_SHOT = new Set(['pulse', 'hit', 'interact', 'celebrate', 'jump']);
// 'dance' is deliberately not one-shot: a looping dance is what the manifest's state map is for.

const CLOTH_SLOTS = Object.freeze({
  shirt: { kind: 0, weight: 1.0 },
  pants: { kind: 1, weight: 0.42 },
  pack: { kind: 2, weight: 0.72 },
});
const CLOTH_SHADER_VERSION = 'waterside-cloth-v1';

function clothPhase(seed, slot, index) {
  const text = `${seed ?? 'waterside'}:${slot}:${index}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

// Adds a tiny vertex-space ripple to the three loose wardrobe layers. The body stays on its
// authored animation and the camera never drives this motion: jogging gives fabric a little more
// follow-through, while an idle breeze keeps hems and the backpack from reading as rigid plastic.
function attachClothMotion(materials, seed) {
  const tracks = [];
  for (const [slot, profile] of Object.entries(CLOTH_SLOTS)) {
    for (const [index, material] of (materials.get(slot) || []).entries()) {
      if (!material || material.userData?.clothMotion) continue;
      const state = {
        time: 0,
        amount: 0.22,
        weight: profile.weight,
        kind: profile.kind,
        phase: clothPhase(seed, slot, index),
        uniforms: null,
      };
      const previousCompile = material.onBeforeCompile;
      const previousCacheKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
        previousCompile.call(this, shader, renderer);
        shader.uniforms.uClothTime = { value: state.time };
        shader.uniforms.uClothAmount = { value: state.amount };
        shader.uniforms.uClothWeight = { value: state.weight };
        shader.uniforms.uClothKind = { value: state.kind };
        shader.uniforms.uClothPhase = { value: state.phase };
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>\nuniform float uClothTime;\nuniform float uClothAmount;\nuniform float uClothWeight;\nuniform float uClothKind;\nuniform float uClothPhase;`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>
float slClothMask;
if (uClothKind < 0.5) {
  slClothMask = 1.0 - smoothstep(1.18, 1.82, position.y);
} else if (uClothKind < 1.5) {
  slClothMask = 0.20 + 0.80 * smoothstep(0.12, 0.36, position.y) * (1.0 - smoothstep(1.0, 1.35, position.y));
} else {
  slClothMask = 0.28 + 0.72 * (1.0 - smoothstep(1.30, 1.86, position.y));
}
float slClothDrive = slClothMask * uClothAmount * uClothWeight;
float slClothWaveA = sin(uClothTime * 5.1 + position.y * 5.4 + position.x * 2.7 + uClothPhase);
float slClothWaveB = cos(uClothTime * 3.8 - position.z * 4.1 + position.y * 2.3 + uClothPhase * 1.37);
float slClothBreath = sin(uClothTime * 1.65 + uClothPhase);
transformed.x += slClothDrive * (slClothWaveA * 0.038 + slClothBreath * 0.012);
transformed.z += slClothDrive * slClothWaveB * 0.026;
transformed.y += slClothDrive * slClothWaveA * 0.006;`,
        );
        state.uniforms = shader.uniforms;
      };
      material.customProgramCacheKey = function customProgramCacheKey() {
        return `${previousCacheKey()}|${CLOTH_SHADER_VERSION}`;
      };
      material.needsUpdate = true;
      material.userData.clothMotion = state;
      tracks.push(state);
    }
  }

  if (!tracks.length) return null;
  let target = 0.22;
  let burst = 0;
  let time = 0;
  return {
    setLocomotion({ moving = false, running = false } = {}) {
      target = running ? 1.35 : (moving ? 0.92 : 0.22);
    },
    kick() { burst = Math.max(burst, 0.72); },
    update(delta) {
      const step = Math.max(0, Number.isFinite(delta) ? delta : 0);
      time += step;
      burst = Math.max(0, burst - step);
      const amount = Math.max(target, burst > 0 ? 1.45 : 0);
      const blend = Math.min(1, step * 6);
      for (const state of tracks) {
        state.time = time;
        state.amount += (amount - state.amount) * blend;
        if (state.uniforms) {
          state.uniforms.uClothTime.value = state.time;
          state.uniforms.uClothAmount.value = state.amount;
        }
      }
    },
  };
}

export function resolveClip(clips, wanted, stateMap = {}) {
  // Exact name from the manifest's state map first, then a substring search so a clip
  // exported as "MarkieWalk" or "walk.001" still drives the walk state.
  const mapped = stateMap[wanted];
  if (mapped) {
    const hit = clips.find((c) => c.name === mapped);
    if (hit) return hit;
  }
  const needle = wanted.toLowerCase();
  return clips.find((c) => c.name.toLowerCase() === needle)
    || clips.find((c) => c.name.toLowerCase().includes(needle))
    || null;
}

// The walk clip moves the pelvis about 2.3 m along Z over one loop (root motion). The game already
// moves Markie, so that travel doubled every step and then snapped back when the clip looped.
// This keeps the clip's vertical bob and every joint rotation, and holds the pelvis's X and Z at
// their first-frame values. Each clip is converted once and cached.
const inPlaceClips = new WeakMap();
export function inPlaceClip(clip) {
  if (inPlaceClips.has(clip)) return inPlaceClips.get(clip);
  const tracks = clip.tracks.map((track) => {
    if (track.name !== 'pelvis.position') return track;
    const values = Array.from(track.values);
    const x0 = values[0];
    const z0 = values[2];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = x0;
      values[i + 2] = z0;
    }
    return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values);
  });
  const converted = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  inPlaceClips.set(clip, converted);
  return converted;
}

export class CharacterAnimator {
  // Drives one AnimationMixer with an idle/locomotion layer plus one-shot actions.
  constructor(root, clips, { stateMap = {}, speed = 1 } = {}) {
    this.root = root;
    this.clips = clips.map(inPlaceClip);
    this.stateMap = stateMap;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.state = 'idle';
    this.oneShot = null;
    this.speed = speed;
    this.crossFade = CROSSFADE;
    this.clothMotion = null;
    this.mixer.addEventListener('finished', (e) => this._finished(e));
    for (const state of STATES) {
      const clip = resolveClip(clips, state, stateMap);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.setLoop(ONE_SHOT.has(state) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = ONE_SHOT.has(state);
      action.enabled = true;
      action.setEffectiveWeight(0);
      this.actions.set(state, action);
    }
    this.idle = this.actions.get('idle') || null;
    if (this.idle) this.idle.setEffectiveWeight(1).play();
  }

  get hasClips() { return this.actions.size > 0; }

  _finished({ action }) {
    if (action !== this.oneShot) return;
    this.oneShot = null;
    action.setEffectiveWeight(0);
    action.stop();
    this.apply();
  }

  // state = 'idle' | 'walk' | 'run'; running only matters for how fast the walk clip plays.
  setLocomotion({ moving = false, running = false } = {}) {
    this.clothMotion?.setLocomotion({ moving, running });
    const next = !moving ? 'idle' : (running ? 'run' : 'walk');
    if (next === this.state) {
      if (next === 'walk') this.setPace(running ? 1.35 : 1);
      return;
    }
    this.state = next;
    this.apply();
  }

  setPace(scale) {
    const action = this.actions.get('walk');
    if (action) action.timeScale = scale;
  }

  trigger(state) {
    const action = this.actions.get(state);
    if (!action) return false;
    this.clothMotion?.kick();
    if (this.oneShot) this.oneShot.stop();
    this.oneShot = action;
    action.reset().setEffectiveWeight(1).play();
    return true;
  }

  apply() {
    const want = ONE_SHOT.has(this.state) ? null : this.state;
    for (const [name, action] of this.actions) {
      if (action === this.oneShot) continue;
      const on = name === want || (want === null && name === 'idle');
      if (on) action.reset().setEffectiveWeight(1).play();
      else action.fadeOut(this.crossFade);
    }
    if (this.oneShot) this.oneShot.fadeOut(this.crossFade * 2);
  }

  update(delta) {
    this.mixer.update(delta);
    this.clothMotion?.update(delta);
  }
}

export function loadCharacterManifest(url) {
  return fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
}

export function styleCharacter(root, { shadow = true, cull = false } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadow;
    object.receiveShadow = shadow;
    // Skinned meshes are culled against their own `boundingSphere` (see expandCullBounds). That
    // is why this is off by default: the player is always on screen, so culling him can only
    // hurt. Crowd clones opt in with `cull: true` AFTER expandCullBounds() has set the spheres.
    object.frustumCulled = cull;
    if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.flatShading = false;
      material.roughness = Math.min(material.roughness ?? 0.8, 0.85);
      material.needsUpdate = true;
    }
  });
  return root;
}

// Frustum culling for skinned meshes. three.js does NOT cull a SkinnedMesh against
// `geometry.boundingSphere`: SkinnedMesh has its own `boundingSphere`, which is null until the
// first frustum test and is then built from the vertices as posed at THAT moment and never
// rebuilt. So an animated limb (a walking foot, a swinging hand, a blink) can leave the sphere
// and the whole mesh disappears while part of it is still on screen. The fix is to give every
// skinned mesh one sphere that is guaranteed to enclose every skinned vertex in every frame of
// every clip. tools/palette-check.mjs verifies that against the real vertices at 60 fps.
//
// Why a bound instead of sampling every vertex: a skinned vertex is a weighted blend of
// `bone.matrixWorld * boneInverse` applied to its bind position (SkinnedMesh.applyBoneTransform).
// A blend of points lies inside any sphere that contains all of them, and each bone moves its
// points rigidly, so for the bone-by-bone term  |M·q - C| <= s·|q - joint| + |boneWorld - C|.
// Only the per-bone reach (computed once from bind pose) and the bone positions per frame are
// needed, which is cheap enough to run on every load (sampling all 85k vertices took seconds).
const CLOTH_SLACK = 0.08;      // metres; procedural cloth moves vertices up to ~0.05 after skinning
const CULL_SAMPLE_FPS = 60;    // bone keys sit on the 30 fps grid; 60 fps leaves room for crossfades

export function expandCullBounds(root, clips = [], margin = 1.02) {
  root.updateMatrixWorld(true);
  const skins = [];
  root.traverse((object) => { if (object.isSkinnedMesh) skins.push(object); });
  if (!skins.length) return 0;

  // Work on a CLONE so the shared bind pose that every instantiateCharacter() clone is copied
  // from is never posed. Clone traversal order matches `skins`, so the spheres map back 1:1.
  const probe = cloneSkeleton(root);
  probe.updateMatrixWorld(true);
  const probeSkins = [];
  probe.traverse((object) => { if (object.isSkinnedMesh) probeSkins.push(object); });

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const per = probeSkins.map((skin) => {
    const bones = skin.skeleton.bones;
    const inverses = skin.skeleton.boneInverses;
    const bind = skin.bindMatrix;
    const geometry = skin.geometry;
    geometry.computeBoundingBox();
    // Centre and reach are in "bind space": the space the skinning formula blends in.
    const centre = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(bind);
    const joints = bones.map((_, i) => new THREE.Vector3().setFromMatrixPosition(matrix.copy(inverses[i]).invert()));
    const reach = new Float64Array(bones.length);
    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    let weightSum = 1;
    for (let v = 0; v < geometry.attributes.position.count; v++) {
      vertex.fromBufferAttribute(geometry.attributes.position, v).applyMatrix4(bind);
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(v, k);
        if (weight === 0) continue;
        sum += weight;
        const b = skinIndex.getComponent(v, k);
        reach[b] = Math.max(reach[b], vertex.distanceTo(joints[b]));
      }
      weightSum = Math.max(weightSum, sum);
    }
    return { skin, bones, inverses, centre, reach, weightSum, radius: 0 };
  });

  const sample = () => {
    probe.updateMatrixWorld(true);
    for (const entry of per) {
      const { bones, inverses, centre, reach } = entry;
      for (let b = 0; b < bones.length; b++) {
        if (reach[b] === 0) continue;
        // Scale of the skinning matrix (current * inverse bind); 1 for a rigid bone.
        const scale = matrix.multiplyMatrices(bones[b].matrixWorld, inverses[b]).getMaxScaleOnAxis();
        const distance = position.setFromMatrixPosition(bones[b].matrixWorld).distanceTo(centre);
        entry.radius = Math.max(entry.radius, scale * reach[b] + distance);
      }
    }
  };

  // Bind pose first, then every frame of every clip.
  sample();
  const mixer = new THREE.AnimationMixer(probe);
  for (const clip of clips) {
    if (!clip?.duration) continue;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.max(1, Math.ceil(clip.duration * CULL_SAMPLE_FPS));
    for (let f = 0; f <= frames; f++) {
      action.time = Math.min(clip.duration, f / CULL_SAMPLE_FPS);
      mixer.update(0);
      sample();
    }
  }
  mixer.stopAllAction();

  const inverseBind = new THREE.Matrix4();
  let largest = 0;
  per.forEach((entry, i) => {
    const { skin, centre, weightSum } = entry;
    // Sphere in bind space -> mesh-local space (the space `Frustum` transforms by matrixWorld).
    const sphere = new THREE.Sphere(centre, (entry.radius * weightSum) * margin + CLOTH_SLACK);
    sphere.applyMatrix4(inverseBind.copy(skin.bindMatrix).invert());
    skins[i].boundingSphere = sphere;
    skins[i].frustumCulled = true;
    largest = Math.max(largest, sphere.radius);
  });
  return largest;
}


export function loadCharacter(url, { manifest = null, onProgress } = {}) {
  // Resolves { gltf, manifest, animator }. Rejects only when the GLB itself fails to load -
  // a missing manifest is fine, the clip names are matched by name in that case.
  const gltfPromise = new Promise((resolve, reject) => {
    createGLTFLoader().load(url, resolve, onProgress, (error) => reject(error));
  });
  return Promise.all([gltfPromise, manifest ? loadCharacterManifest(manifest) : Promise.resolve(null)])
    .then(([gltf, data]) => {
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error('glTF has no scene');
      styleCharacter(root);
      const height = data?.height || null;
      // The exported rig is authored facing -Y in Blender, which the glTF Y-up conversion
      // turns into three.js +Z - the convention Player.group.rotation.y already assumes.
      // `extraYaw` is here for a character authored some other way.
      const extraYaw = Number(data?.forward?.extraYaw || 0);
      if (extraYaw) root.rotation.y = extraYaw;
      return {
        gltf,
        root,
        manifest: data,
        height,
        clips: gltf.animations || [],
        animator: new CharacterAnimator(root, gltf.animations || [], {
          stateMap: data?.stateMap || {},
        }),
      };
    });
}

// ---- the shared cast ------------------------------------------------------------------------

// Palettes are data, authored by tools/character_palette.py from the GLB's real material list.
// Resolves null (not a rejection) when the file is missing, so the game still boots with the
// exported material colours instead of showing nobody.
export function loadPalettes(url) {
  return fetch(url).then((response) => (response.ok ? response.json() : null)).catch(() => null);
}

const sharedCache = new Map();

// Loads (once) the one body the whole cast is made of. Every caller gets the SAME promise, so
// the sixteen in-world characters cost one 5.3 MB download and one glTF parse. Cull bounds are
// computed here, once, from every clip, and every clone inherits them (SkinnedMesh.copy).
// The shared body is one mesh with one material (the skin), so the wardrobe has nothing to dress.
// Split its triangles by body region into three material groups once, when the shared rig loads:
// trousers (legs, below the waist), shirt (torso and arms, above it) and skin (head, hands, feet).
// Region boundaries are in the model's own units, the same space the wardrobe shader reads.
// The new materials are named so applyPalette can colour them through the palette's slots.
export const WARDROBE_SHIRT_MATERIAL = 'WardrobeShirt';
export const WARDROBE_PANTS_MATERIAL = 'WardrobePants';
const WAIST_Y = 1.18;
const SHOULDER_Y = 1.98;
const FEET_Y = 0.14;
const TROUSER_HALF_WIDTH = 0.3;
const SLEEVE_END_Y = 1.1;       // arms end here; hands below are skin

function splitBodyRegions(root) {
  root.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    const geometry = object.geometry;
    if (!geometry.attributes.position) return;
    const pos = geometry.attributes.position;
    // The Markie GLB is not indexed: its vertices come in consecutive triangles.
    const index = geometry.index
      ? geometry.index.array
      : Uint32Array.from({ length: pos.count }, (_, i) => i);
    const buckets = { skin: [], shirt: [], pants: [] };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      const outer = Math.abs(cx) >= TROUSER_HALF_WIDTH;
      let key = 'skin';
      if (cy >= WAIST_Y && cy <= SHOULDER_Y) key = 'shirt';
      else if (outer && cy >= SLEEVE_END_Y && cy < WAIST_Y) key = 'shirt'; // arms hang below the waist
      else if (!outer && cy >= FEET_Y && cy < WAIST_Y) key = 'pants';
      buckets[key].push(a, b, c);
    }
    const order = ['skin', 'shirt', 'pants'];
    const total = index.length;
    const merged = new Uint32Array(total);
    let offset = 0;
    geometry.clearGroups();
    order.forEach((key, materialIndex) => {
      merged.set(buckets[key], offset);
      if (buckets[key].length) geometry.addGroup(offset, buckets[key].length, materialIndex);
      offset += buckets[key].length;
    });
    geometry.setIndex(new THREE.BufferAttribute(merged, 1));
    const skinMaterial = object.material;
    const shirt = skinMaterial.clone();
    shirt.name = WARDROBE_SHIRT_MATERIAL;
    const pants = skinMaterial.clone();
    pants.name = WARDROBE_PANTS_MATERIAL;
    object.material = [skinMaterial, shirt, pants];
  });
  return root;
}

// Palette slots with the split body's shirt and trouser materials added, so applyPalette colours them.
function slotsWithWardrobeRegions(slots) {
  const out = { ...(slots || {}) };
  const add = (slot, name) => {
    const info = out[slot] || {};
    out[slot] = { ...info, materials: [...(info.materials || []), name] };
  };
  add('shirt', WARDROBE_SHIRT_MATERIAL);
  add('pants', WARDROBE_PANTS_MATERIAL);
  return out;
}

export function loadSharedCharacter(url, { manifest = null, onProgress } = {}) {
  if (!sharedCache.has(url)) {
    const loading = loadCharacter(url, { manifest, onProgress }).then((loaded) => {
      splitBodyRegions(loaded.root);
      expandCullBounds(loaded.root, loaded.clips);
      return { ...loaded, url };
    });
    // A failed load must not poison the cache: the next caller gets to try again.
    sharedCache.set(url, loading.catch((error) => { sharedCache.delete(url); throw error; }));
  }
  return sharedCache.get(url);
}

// Colour one clone from a palette. Materials are CLONED per character first: SkeletonUtils
// hands every clone the same material objects, so tinting in place would recolour the entire
// cast to whoever was styled last. Returns slot -> [materials] so gameplay can tint one slot
// later (Vardee's crew flush teal when the scrap pulse stuns them).
export function applyPalette(root, character, { slots = {}, shared = {} } = {}) {
  const colours = { ...(shared || {}), ...(character?.colors || {}) };
  const slotByMaterial = new Map();
  for (const [slot, info] of Object.entries(slots || {})) {
    for (const name of info.materials || []) slotByMaterial.set(name, { slot, ...info });
  }
  const applied = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const copies = source.map((material) => {
      if (!material) return material;
      const copy = material.clone();
      const info = slotByMaterial.get(material.name);
      if (info) {
        const hex = colours[info.slot];
        if (hex) copy.color.set(hex);
        if (typeof info.roughness === 'number') copy.roughness = info.roughness;
        // Skin, cloth and leather are dielectric; anything more metallic reads as chrome.
        copy.metalness = Math.min(copy.metalness ?? 0, 0.1);
        copy.needsUpdate = true;
        if (!applied.has(info.slot)) applied.set(info.slot, []);
        applied.get(info.slot).push(copy);
      }
      return copy;
    });
    object.material = Array.isArray(object.material) ? copies : copies[0];
  });
  return applied;
}

// One character out of the shared body: its own skeleton-driven clone, its own materials, its
// own mixer. `palette` is the palette document's `characters[id]` entry (see applyPalette).
// Markie opts out of frustum culling (`cull: false`): he is always on screen, so the only thing
// culling could do for him is make him blink out if a bound was ever wrong.
export function instantiateCharacter(shared, { palette = null, paletteData = null, cull = true, shadow = true } = {}) {
  const root = cloneSkeleton(shared.root);
  styleCharacter(root, { shadow, cull });
  // Copy wardrobe materials even without a colour palette: procedural cloth uniforms must be
  // independent per actor, just like their skeleton and pose.
  const materials = applyPalette(root, palette, {
    slots: slotsWithWardrobeRegions(paletteData?.slots || shared.slots || {}),
    shared: paletteData?.shared || shared.shared || {},
  });
  const wardrobe = applyWardrobe(root, materials, palette, { shadow, cull });
  const animator = new CharacterAnimator(root, shared.clips || [], {
    stateMap: shared.manifest?.stateMap || {},
  });
  animator.clothMotion = attachClothMotion(materials, palette?.seed || palette?.name || root.uuid);
  return { root, animator, materials, wardrobe };
}

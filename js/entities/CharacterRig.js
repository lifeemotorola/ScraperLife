import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// This build of the addon exports bare functions (`retarget`, `retargetClip`, `clone`), not a
// `SkeletonUtils` namespace — importing a namespace here would resolve to `undefined`.
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

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

export class CharacterAnimator {
  // Drives one AnimationMixer with an idle/locomotion layer plus one-shot actions.
  constructor(root, clips, { stateMap = {}, speed = 1 } = {}) {
    this.root = root;
    this.clips = clips;
    this.stateMap = stateMap;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.state = 'idle';
    this.oneShot = null;
    this.speed = speed;
    this.crossFade = CROSSFADE;
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
    // Skinned meshes are culled against the bind-pose bounds, so an animated limb can be
    // dropped for a frame and the character blinks out at the edge of the view. That is why
    // this is off by default: the player is always on screen, so culling him can only hurt.
    // Crowd clones opt in with `cull: true` AFTER expandCullBounds() has inflated the bounds.
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

// A skinned mesh culls against its BIND pose: a limb that swings out during the walk clip can
// leave that sphere and three.js drops the whole draw for a frame. With sixteen characters on
// the platform, drawing the ones behind the camera is the single biggest waste in the frame, so
// the crowd opts into culling with bounds big enough for the animated silhouette instead — a
// sphere around the rig's centre covering the bind-pose diagonal. tools/palette-check.mjs
// measures the deformed walk against this sphere, so the margin is verified, not guessed.
export function expandCullBounds(root, margin = 1.12) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5 * margin, 0.001);
  const inverse = new THREE.Matrix4();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = true;
    inverse.copy(object.matrixWorld).invert();
    // The sphere lives in geometry space, and geometry is SHARED between clones (see
    // instantiateCharacter) — every clone is authored identically, so they all compute the
    // same sphere and overwriting it is idempotent rather than a race.
    object.geometry.boundingSphere = new THREE.Sphere(centre.clone().applyMatrix4(inverse), radius);
  });
  return radius;
}


export function loadCharacter(url, { manifest = null, onProgress } = {}) {
  // Resolves { gltf, manifest, animator }. Rejects only when the GLB itself fails to load -
  // a missing manifest is fine, the clip names are matched by name in that case.
  const gltfPromise = new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, onProgress, (error) => reject(error));
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
// the sixteen in-world characters cost one 5.3 MB download and one glTF parse. Cull bounds are inflated here
// because geometry is shared by every clone, so it only has to be computed once.
export function loadSharedCharacter(url, { manifest = null, onProgress } = {}) {
  if (!sharedCache.has(url)) {
    const loading = loadCharacter(url, { manifest, onProgress }).then((loaded) => {
      expandCullBounds(loaded.root);
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
  const materials = palette ? applyPalette(root, palette, {
    slots: paletteData?.slots || shared.slots || {},
    shared: paletteData?.shared || shared.shared || {},
  }) : new Map();
  const animator = new CharacterAnimator(root, shared.clips || [], {
    stateMap: shared.manifest?.stateMap || {},
  });
  return { root, animator, materials };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Runtime half of tools/rig_and_animate.py. The Python script exports a GLB plus a
// `<name>.character.json` manifest; everything here reads that manifest instead of guessing,
// so renaming a clip or changing the fps in Blender needs no change in JS.

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

export function styleCharacter(root, { shadow = true } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (shadow) { object.castShadow = true; object.receiveShadow = true; }
    // Skinned meshes are culled against the bind-pose bounds, so an animated limb can be
    // dropped for a frame and the character blinks out at the edge of the view.
    object.frustumCulled = false;
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

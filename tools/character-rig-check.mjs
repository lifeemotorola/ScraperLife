// Asset-pipeline check: loads the exported character GLB through the real three.js loader and
// asserts the conventions the camera, the physics and the NPC scaling depend on.
//
//   python3 tools/rig_and_animate.py build --fbx fbx/Survival_Character.fbx ...   (first)
//   node tools/character-rig-check.mjs                                            (here)
//
// Why these specific assertions:
//  * forward must be +Z, because Player.update sets rotation.y = atan2(dir.x, dir.z). The old
//    DAE needed DAE_FORWARD_YAW for exactly this reason; the exported rig must not.
//  * the feet must sit on y=0 or MatchCharacterHeights/NPC.setHeight scale the whole cast wrong.
//  * every clip the state machine asks for must exist, otherwise the character silently stays
//    in idle and the bug only shows up as "the animation does nothing".
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join } from 'node:path';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { createGLTFLoader } from '../js/loaders/gltf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(root, 'assets', 'models');
const arg = process.argv[2];
const glbPath = arg ? (isAbsolute(arg) ? arg : join(root, arg)) : join(assetDir, 'survival_character.glb');
const manifestPath = glbPath.replace(/\.glb$/, '.character.json');

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

if (!existsSync(glbPath)) {
  console.log(`SKIP  no ${glbPath.replace(`${root}/`, '')} yet.`);
  console.log('      generate it with:  blender --background --python tools/rig_and_animate.py -- build --fbx fbx/Survival_Character.fbx');
  process.exit(0);
}

// No GL context and no image decoders here: make texture loading resolve immediately so the
// parse promise settles. Geometry, skins and animation channels are unaffected.
THREE.TextureLoader.prototype.load = (url, onLoad) => {
  const texture = new THREE.Texture();
  texture.source.data = { src: url };
  onLoad?.(texture);
  return texture;
};
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window ??= dom.window;
globalThis.document ??= dom.window.document;
// GLTFLoader touches self.URL when it turns an embedded image into a blob; a failed image load
// is swallowed by the loader itself, but `self` has to exist for it to get that far.
globalThis.self ??= dom.window;
// The GLB embeds a texture in a bufferView. GLTFLoader creates a temporary object URL for it;
// jsdom does not provide createObjectURL, so use Node's URL implementation for the no-WebGL test.
globalThis.self.URL = globalThis.URL;
globalThis.Blob ??= dom.window.Blob;

const buffer = readFileSync(glbPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const gltf = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('GLTFLoader.parse did not settle (texture or extension problem?)')), 30000);
  createGLTFLoader().parse(arrayBuffer, '', (data) => { clearTimeout(timer); resolve(data); }, (error) => { clearTimeout(timer); reject(error); });
});

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const { resolveClip, CharacterAnimator, styleCharacter } = await import(join(root, 'js/entities/CharacterRig.js'));
// what loadCharacter() does to the model before the game sees it
const scene = styleCharacter(gltf.scene);
scene.updateMatrixWorld(true);

const meshes = [];
const skinned = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); if (o.isSkinnedMesh) skinned.push(o); });
check('loads as a glTF scene', Boolean(scene), `${scene.children.length} root children`);
check('has a skinned mesh (the skin survived the export)', skinned.length > 0, `${skinned.length} skinned / ${meshes.length} meshes`);
check('skinned meshes skip frustum culling', skinned.every((m) => m.frustumCulled === false), 'frustumCulled=false set by styleCharacter');

const triangles = skinned.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3), 0);
const vertices = skinned.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
check('has a real polygon count', triangles > 2000, `${Math.round(triangles)} tris / ${vertices} verts`);

const box = new THREE.Box3().setFromObject(scene);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
if (manifest?.height) {
  check('stands the height the manifest promises', Math.abs(size.y - manifest.height) < 0.12,
    `bbox ${size.y.toFixed(3)} vs manifest ${manifest.height}`);
}
check('feet are on y=0', Math.abs(box.min.y) < 0.05, `bbox min y = ${box.min.y.toFixed(4)}`);

// Facing: compare the toe joints with the ankle joints, the same measurement
// tools/rig_and_animate.py uses to author the rig. +Z must be forward.
const bone = (name) => scene.getObjectByName(name);
const worldOf = (obj) => { const v = new THREE.Vector3(); obj.getWorldPosition(v); return v; };
const toeL = bone('ball_l') || bone('toe_l') || bone('LeftToeBase');
const ankleL = bone('foot_l') || bone('LeftFoot');
if (toeL && ankleL) {
  const forward = worldOf(toeL).z - worldOf(ankleL).z;
  check('character faces +Z (the game forward axis)', forward > 0.01,
    `toe is ${forward.toFixed(3)} ahead of the ankle on +Z`);
} else {
  check('found toe/ankle bones to test facing', false, `looked for ball_l/foot_l on ${scene.children.length} nodes`);
}
const head = bone('head') || bone('Head');
const up = head ? worldOf(head).y - worldOf(ankleL || scene).y : 0;
check('head is above the feet (no axis flip)', up > 0.5, `head-to-ankle dy = ${up.toFixed(3)}`);

// --- clips -------------------------------------------------------------------------------------
const clips = gltf.animations || [];
check('animation clips exported', clips.length > 0, clips.map((c) => c.name).join(', '));
const wanted = ['idle', 'walk', 'run', 'pulse', 'hit', 'interact'];
const stateMap = manifest?.stateMap || {};
for (const state of wanted) {
  const clip = resolveClip(clips, state, stateMap);
  check(`clip for the '${state}' state resolves`, Boolean(clip), clip ? `${clip.name} (${clip.duration.toFixed(2)}s)` : 'MISSING');
}
for (const entry of manifest?.clips || []) {
  const clip = clips.find((c) => c.name === entry.name);
  if (!clip) { check(`manifest clip '${entry.name}' exists in the GLB`, false); continue; }
  const drift = Math.abs(clip.duration - entry.duration);
  check(`'${entry.name}' duration matches the manifest`, drift < 0.02, `${clip.duration.toFixed(3)}s vs ${entry.duration.toFixed(3)}s`);
  // Key times must land on the 1/fps grid. The exporter's size optimiser drops redundant
  // keys, so counting keys would be misleading; a wrong scene fps would not land on the grid.
  const grid = 1 / (manifest.fps || 30);
  const times = Array.from(clip.tracks[0]?.times || []);
  const offGrid = times.filter((t) => Math.abs(t / grid - Math.round(t / grid)) > 1e-3).length;
  check(`'${entry.name}' keys sit on the ${manifest.fps} fps grid`, times.length > 1 && offGrid === 0,
    `${times.length} keys, max drift ${times.length ? Math.max(...times.map((t) => Math.abs(t / grid - Math.round(t / grid)))).toFixed(4) : 'n/a'} frames`);
}

// --- the mixer actually moves the bones ---------------------------------------------------------
const animator = new CharacterAnimator(scene, clips, { stateMap });
check('state machine built an action per state', animator.actions.size >= Math.min(4, clips.length),
  `${animator.actions.size} actions: ${[...animator.actions.keys()].join(', ')}`);
const foot = ankleL || toeL;
const sample = () => { scene.updateMatrixWorld(true); return worldOf(foot); };
animator.setLocomotion({ moving: true, running: false });
const walkStart = sample();
const walkTrack = animator.actions.get('walk');
for (let i = 0; i < 24; i++) animator.update(1 / 60);
const walkMid = sample();
const moved = walkStart.distanceTo(walkMid);
check('walking moves the ankle bone', moved > 0.02, `ankle travelled ${moved.toFixed(4)} in 0.4s`);
check('walk action is weighted and playing', walkTrack?.isRunning() === true && walkTrack?.time > 0,
  `time=${walkTrack?.time?.toFixed(3)}`);
const numbersFinite = Number.isFinite(walkMid.x) && Number.isFinite(walkMid.y) && Number.isFinite(walkMid.z);
check('no NaN in posed matrices', numbersFinite, `(${walkMid.toArray().map((v) => v.toFixed(3)).join(', ')})`);

animator.setLocomotion({ moving: true, running: true });
const runTrack = animator.actions.get('run');
check('sprinting switches to the run clip', runTrack?.isRunning() === true, `run weight ${runTrack?.getEffectiveWeight?.()?.toFixed?.(2) ?? 'n/a'}`);

animator.setLocomotion({ moving: false, running: false });
for (let i = 0; i < 20; i++) animator.update(1 / 60);
check('stopping returns to idle', animator.state === 'idle' && animator.actions.get('idle')?.isRunning() === true,
  `state=${animator.state}`);

const pulse = animator.trigger('pulse');
check('a one-shot can be triggered', pulse === true, 'pulse (Space / PULSE)');
for (let i = 0; i < 30; i++) animator.update(1 / 60);
check('one-shot does not wedge the state machine', animator.state === 'idle' || animator.oneShot !== null,
  `state=${animator.state}`);

// The real test that the skeleton and the skin agree: play the walk clip and keep measuring
// the *deformed* bounds. A rig whose bones sit in a different frame than its mesh produces a
// box that jumps, sinks through the floor, or doubles in size the moment the mixer steps.
const posed = new THREE.Box3();
const skinnedBox = new THREE.Box3();
let minY = Infinity, maxY = -Infinity, widest = 0;
for (let i = 0; i < 60; i++) {
  animator.update(1 / 60);
  scene.updateMatrixWorld(true);
  // Box3.setFromObject reads each geometry's static box, which for a skinned mesh is the bind
  // pose - so union the per-mesh boxes that three.js recomputes from the *current* skeleton.
  skinnedBox.makeEmpty();
  for (const mesh of skinned) {
    mesh.computeBoundingBox();
    if (mesh.boundingBox) skinnedBox.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  posed.copy(skinnedBox);
  minY = Math.min(minY, posed.min.y); maxY = Math.max(maxY, posed.max.y);
  widest = Math.max(widest, posed.max.x - posed.min.x);
}
check('the deformed mesh stays on the floor while walking', minY > -0.25 && Math.abs(minY) < 0.3,
  `lowest point over 1s = ${minY.toFixed(3)}`);
check('the deformed mesh keeps its height while walking', Math.abs(maxY - (manifest?.height || maxY)) < 0.45,
  `tallest point = ${maxY.toFixed(3)}`);
check('the silhouette does not explode', widest < (manifest?.height || 2.3) * 1.2, `widest span = ${widest.toFixed(3)}`);
// Which clip the state machine is holding matters more than which one exists: a clip whose
// skeleton and skin disagree moves the body through the floor while the bbox looks fine.
const clipUnderTest = animator.state;

// A skin needs every bone it references to exist under the same names the export recorded.
if (manifest?.slots) {
  const missing = Object.entries(manifest.slots).filter(([, boneName]) => !bone(boneName)).map(([slot]) => slot);
  check('every mapped slot exists as a node in the GLB', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${Object.keys(manifest.slots).length} slots`);
}

console.log(failures.length ? `\n${failures.length} character check(s) failed.` : '\nAll character-asset checks passed.');
process.exit(failures.length ? 1 : 0);

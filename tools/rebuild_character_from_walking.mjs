#!/usr/bin/env node
// Rebuild Markie's GLB around the skinned body and Mixamo rig in fbx/Walking.fbx.
//
//   node tools/rebuild_character_from_walking.mjs \
//     [--fbx fbx/Walking.fbx] [--source /tmp/markie_main.glb] [--out assets/models/survival_character.glb] \
//     [--manifest assets/models/survival_character.character.json]
//
// What it does
//   * Mesh: the single skinned body from Walking.fbx (one material, named "Body2" so the
//     palette's skin slot picks it up). Scaled so the body is Markie's height (2.3 units),
//     feet on y=0.
//   * Rig: Walking.fbx's 52 Mixamo bones. Bones that play a role in the game are renamed
//     to Markie's names (pelvis, spine_01..03, neck_01, head, clavicle/upperarm/lowerarm/
//     hand/thigh/calf/foot/ball _l/_r) so the manifest slots, the wardrobe (which looks up
//     "head") and the state map keep working. Other bones keep their Mixamo names.
//   * Clips: "walk" is Mixamo's own walk from the FBX (same rig, so no retarget needed).
//     The other clips (idle, run, jump, pulse, hit, grab, celebrate) are retargeted from the
//     previous Markie GLB (--source, the main-branch file) by world-space delta retargeting.
//     Markie's twist and corrective helper bones are not on the new rig and are dropped.
//   * Writes the GLB and rewrites the manifest's clips, stats and bone/material fields.
//
// Requires only the repo's `three` dependency. Stubs for `document` are installed because the
// loaders expect a DOM; textures are stripped from the source GLB, so nothing is fetched.

globalThis.document = {
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(v) {}, get src() { return ''; } }),
  createElement: () => ({ addEventListener() {}, style: {} }),
};
globalThis.self = globalThis;
// The binary GLB writer reads its output Blob through FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend?.(); }); }
};
globalThis.window = globalThis;

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const argv = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => {
  if (v.startsWith('--')) acc.push([v.slice(2), all[i + 1]]);
  return acc;
}, []));
const FBX = resolve(argv.fbx || 'fbx/Walking.fbx');
const SOURCE = resolve(argv.source || '/tmp/markie_main.glb');
const OUT = resolve(argv.out || 'assets/models/survival_character.glb');
const MANIFEST = resolve(argv.manifest || 'assets/models/survival_character.character.json');
const TARGET_HEIGHT = 2.3;
const FPS = 30;
const SKIN = 0xc8a48a;

// Mixamo bone (without the "mixamorig" prefix) -> Markie name used by the game.
const MIXAMO_TO_MARKIE = {
  Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'head',
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
};
const MAPPED = Object.values(MIXAMO_TO_MARKIE);
const targetName = (mixamo) => MIXAMO_TO_MARKIE[mixamo] ?? mixamo;

// ---------- 1. Mesh and rig from Walking.fbx ----------
const fbxBuf = readFileSync(FBX);
const fbx = new FBXLoader().parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), '');
fbx.updateMatrixWorld(true);
const skinned = fbx.getObjectByProperty('isSkinnedMesh', true);
const srcBones = skinned.skeleton.bones;
const srcMesh = skinned;

const bounds = new THREE.Box3();
const tmp = new THREE.Vector3();
{
  const pos = srcMesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) bounds.expandByPoint(tmp.fromBufferAttribute(pos, i).applyMatrix4(srcMesh.matrixWorld));
}
const scale = TARGET_HEIGHT / (bounds.max.y - bounds.min.y);
const offset = new THREE.Vector3(0, bounds.min.y, 0);
const toRig = (p) => p.clone().sub(offset).multiplyScalar(scale);

// Bind pose: the skin's inverse bind matrices are the true rest pose the vertices were
// authored in. Rebuild every bone's rest transform from them (scaled and moved to feet-on-y=0),
// so the rig and the mesh agree exactly.
// Rig-space world transform of each bone: position scaled and moved to feet-on-y=0,
// rotation unchanged. Locals are then taken relative to the parent in rig space.
const bindPos = [];
const bindQuat = [];
srcBones.forEach((b, i) => {
  const world = skinned.skeleton.boneInverses[i].clone().invert();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  world.decompose(p, q, sc);
  bindPos[i] = toRig(p);
  bindQuat[i] = q;
});
const bones = srcBones.map((b) => {
  const nb = new THREE.Bone();
  nb.name = targetName(b.name.replace(/^mixamorig/, ''));
  return nb;
});
srcBones.forEach((b, i) => {
  const pi = srcBones.indexOf(b.parent);
  if (pi >= 0) bones[pi].add(bones[i]);
});
srcBones.forEach((b, i) => {
  const pi = srcBones.indexOf(b.parent);
  if (pi >= 0) {
    const pq = bindQuat[pi].clone().invert();
    bones[i].quaternion.copy(pq.clone().multiply(bindQuat[i]));
    bones[i].position.copy(bindPos[i].clone().sub(bindPos[pi]).applyQuaternion(pq));
  } else {
    bones[i].quaternion.copy(bindQuat[i]);
    bones[i].position.copy(bindPos[i]);
  }
});
const skeletonInverses = srcBones.map((b, i) => new THREE.Matrix4().compose(bindPos[i], bindQuat[i], new THREE.Vector3(1, 1, 1)).invert());
const boneIndexByName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
const rootBones = bones.filter((b) => !b.parent || b.parent.type !== 'Bone');

// Geometry: rescale into rig space so the bind pose matches the bones.
const geometry = srcMesh.geometry.clone();
{
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).applyMatrix4(srcMesh.matrixWorld);
    pos.setXYZ(i, ...toRig(tmp).toArray());
  }
  pos.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
}
const material = new THREE.MeshStandardMaterial({ name: 'Body2', color: SKIN, roughness: 0.85, metalness: 0 });

const root = new THREE.Group();
root.name = 'root';
rootBones.forEach((b) => root.add(b));
const body = new THREE.SkinnedMesh(geometry, material);
body.name = 'Body2';
root.add(body);
const skeleton = new THREE.Skeleton(bones, skeletonInverses);
root.updateMatrixWorld(true);
body.bind(skeleton, new THREE.Matrix4());
if (process.env.BIND_DEBUG) {
  // At rest, skinning must return the authored vertex positions.
  let worst = 0; const v = new THREE.Vector3(); const out = new THREE.Vector3();
  for (let i = 0; i < geometry.attributes.position.count; i += 97) {
    v.fromBufferAttribute(geometry.attributes.position, i);
    const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
    out.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!w) continue;
      const bi = si.getComponent(i, k);
      const m = skeleton.bones[bi].matrixWorld.clone().multiply(skeleton.boneInverses[bi]);
      out.add(v.clone().applyMatrix4(m).multiplyScalar(w));
    }
    worst = Math.max(worst, out.distanceTo(v));
  }
  console.log('bind-pose max skinning error', worst.toFixed(5), 'bones', bones.length, 'root bones', rootBones.map((b) => b.name));
}

// ---------- 2. Source clips ----------
// Markie's main-branch GLB, with textures stripped (we only need the rig and the animation).
const srcGlbBuf = readFileSync(SOURCE);
const srcJsonLen = srcGlbBuf.readUInt32LE(12);
const srcJson = JSON.parse(srcGlbBuf.subarray(20, 20 + srcJsonLen).toString('utf8'));
srcJson.images = []; srcJson.textures = []; srcJson.samplers = [];
for (const m of srcJson.materials || []) { delete m.extensions; const p = m.pbrMetallicRoughness || {}; for (const k of Object.keys(p)) if (k.endsWith('Texture')) delete p[k]; for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete m[k]; }
const srcJsonBuf = Buffer.from(JSON.stringify(srcJson), 'utf8');
const srcBinOffset = 20 + srcJsonLen + 8;
const srcBinLen = srcGlbBuf.readUInt32LE(20 + srcJsonLen);
const srcGlb = (() => {
  const jsonPadded = Buffer.concat([srcJsonBuf, Buffer.alloc((4 - (srcJsonBuf.length % 4)) % 4, 0x20)]);
  const binPadded = srcGlbBuf.subarray(srcBinOffset, srcBinOffset + srcBinLen);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4);
  h.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, jsonPadded, bh, binPadded]);
})();
const srcArr = srcGlb.buffer.slice(srcGlb.byteOffset, srcGlb.byteOffset + srcGlb.byteLength);
await MeshoptDecoder.ready;
const srcGltf = await new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(srcArr, '', res, rej));
const srcScene = srcGltf.scene;
srcScene.updateMatrixWorld(true);
const srcNodeByName = {};
srcScene.traverse((o) => { if (o.name) srcNodeByName[o.name] = o; });

// World rest rotation of a Markie node (product of rest locals up to the scene).
function srcRestWorldQ(obj) {
  const q = new THREE.Quaternion();
  for (let o = obj; o && o !== srcScene; o = o.parent) q.premultiply(o.quaternion);
  return q;
}

// ---------- 3. Clip builders ----------
function retargetClip(clip, dur) {
  const interp = {};
  for (const t of clip.tracks) {
    const [name, prop] = t.name.split('.');
    interp[name] = interp[name] || {};
    interp[name][prop] = t.createInterpolant();
  }
  // Keys sit exactly on the 30 fps grid. The clip keeps the source's frame count.
  const N = Math.max(2, Math.round(dur * FPS));
  const times = Array.from({ length: N + 1 }, (_, k) => k / FPS);
  const clipDur = N / FPS;
  const out = {}; // rig bone -> { quats: Float32Array, pos?: Float32Array }
  for (const n of MAPPED) out[n] = { quats: new Float32Array(4 * times.length) };
  const pelvisSrc = srcNodeByName.pelvis;
  out.pelvis.pos = new Float32Array(3 * times.length);
  const restSrcQ = {};
  for (const n of MAPPED) restSrcQ[n] = srcRestWorldQ(srcNodeByName[n]);
  const restRigQ = {};
  const rigWorldRest = (b) => { const q = new THREE.Quaternion(); for (let o = b; o; o = o.parent) q.premultiply(o.quaternion); return q; };
  for (const n of MAPPED) restRigQ[n] = rigWorldRest(bones[boneIndexByName[n]]);

  times.forEach((t, k) => {
    const poseQ = (name, obj) => {
      const it = interp[name]?.quaternion;
      if (!it) return obj.quaternion.clone();
      const r = it.evaluate(t);
      return new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
    };
    // Source world for a Markie node at this frame.
    const srcWorldQ = (obj) => {
      const q = new THREE.Quaternion();
      for (let o = obj; o && o !== srcScene; o = o.parent) q.premultiply(poseQ(o.name, o));
      return q;
    };
    // Rig world for every bone, top-down, with mapped bones replaced by retargeted rotations.
    const memo = new Map();
    const worldOf = (b) => {
      if (memo.has(b)) return memo.get(b);
      const parentW = b.parent && b.parent.type === 'Bone' ? worldOf(b.parent) : new THREE.Quaternion();
      let local;
      let world;
      if (MAPPED.includes(b.name) && srcNodeByName[b.name]) {
        const sObj = srcNodeByName[b.name];
        const delta = srcWorldQ(sObj).multiply(restSrcQ[b.name].clone().invert());
        world = delta.multiply(restRigQ[b.name].clone());
        local = parentW.clone().invert().multiply(world);
        if (local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        const idx = out[b.name].quats;
        idx.set([local.x, local.y, local.z, local.w], 4 * k);
      } else {
        local = b.quaternion.clone();
        world = parentW.clone().multiply(local);
      }
      memo.set(b, world);
      return world;
    };
    for (const n of MAPPED) worldOf(bones[boneIndexByName[n]]);

    // Pelvis translation: delta from the source rest, applied to the rig's rest.
    const pit = interp.pelvis?.position;
    const restPos = bones[boneIndexByName.pelvis].position;
    const dpos = pit ? pit.evaluate(t) : null;
    const srcRest = pelvisSrc.position;
    const p = dpos
      ? new THREE.Vector3(restPos.x + (dpos[0] - srcRest.x), restPos.y + (dpos[1] - srcRest.y), restPos.z + (dpos[2] - srcRest.z))
      : restPos;
    out.pelvis.pos.set([p.x, p.y, p.z], 3 * k);
  });

  // keep quaternions in one hemisphere so interpolation never takes the long way round
  for (const n of MAPPED) {
    const q = out[n].quats;
    for (let k = 1; k < times.length; k++) {
      const d = q[4 * k] * q[4 * (k - 1)] + q[4 * k + 1] * q[4 * (k - 1) + 1] + q[4 * k + 2] * q[4 * (k - 1) + 2] + q[4 * k + 3] * q[4 * (k - 1) + 3];
      if (d < 0) for (let c = 0; c < 4; c++) q[4 * k + c] *= -1;
    }
  }
  const tracks = [];
  for (const n of MAPPED) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, out[n].quats));
  }
  tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, out.pelvis.pos));
  return new THREE.AnimationClip(clip.name, clipDur, tracks);
}

function walkFromFbx() {
  const c = fbx.animations.find((a) => a.duration > 0.1);
  const tracks = c.tracks.map((t) => {
    const m = t.name.match(/^mixamorig(.+)\.(quaternion|position)$/);
    if (!m) return null;
    const name = targetName(m[1]);
    if (m[2] === 'quaternion') return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t.times, t.values);
    // Hips translation: rig-space position (feet on y=0, scaled to height).
    const vals = new Float32Array(t.values.length);
    for (let i = 0; i < t.values.length; i += 3) {
      vals[i] = (t.values[i] - offset.x) * scale;
      vals[i + 1] = (t.values[i + 1] - offset.y) * scale;
      vals[i + 2] = (t.values[i + 2] - offset.z) * scale;
    }
    return new THREE.VectorKeyframeTrack(`${name}.position`, t.times, vals);
  }).filter(Boolean);
  return new THREE.AnimationClip('walk', c.duration, tracks);
}

const CLIP_ORDER = ['idle', 'walk', 'run', 'jump', 'pulse', 'hit', 'grab', 'celebrate'];
const srcClips = Object.fromEntries(srcGltf.animations.map((a) => [a.name, a]));
const clips = CLIP_ORDER.map((name) => {
  if (name === 'walk') return walkFromFbx();
  const src = srcClips[name];
  if (!src) throw new Error(`source has no ${name} clip`);
  return retargetClip(src, src.duration);
});

// ---------- 4. Export ----------
const scene = new THREE.Scene();
scene.add(root);
const exporter = new GLTFExporter();
const glb = await new Promise((res, rej) => exporter.parse(scene, res, rej, { binary: true, animations: clips, onlyVisible: false, embedImages: false }));
const outBuf = Buffer.from(glb);
writeFileSync(OUT, outBuf);

// ---------- 5. Manifest ----------
const jsonLen = outBuf.readUInt32LE(12);
const gltf = JSON.parse(outBuf.subarray(20, 20 + jsonLen).toString('utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const prevNotes = Object.fromEntries((manifest.clips || []).map((c) => [c.name, c]));
manifest.clips = CLIP_ORDER.map((name) => {
  const anim = gltf.animations.find((a) => a.name === name);
  const dur = Math.max(...anim.samplers.map((s) => gltf.accessors[s.input].max[0]));
  const prev = prevNotes[name] || {};
  return { name, loop: prev.loop ?? false, seconds: Number(dur.toFixed(3)), curves: anim.channels.length, note: prev.note || '', duration: Number(dur.toFixed(4)) };
});
const triCount = gltf.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + (p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3, 0), 0);
const vertCount = gltf.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + gltf.accessors[p.attributes.POSITION].count, 0), 0);
manifest.stats = {
  file: 'survival_character.glb',
  bytes: outBuf.length,
  nodes: gltf.nodes.length,
  bones: gltf.skins[0].joints.length,
  skins: gltf.skins.length,
  skinnedMeshes: gltf.nodes.filter((n) => n.skin !== undefined).length,
  triangles: Math.round(triCount),
  vertices: vertCount,
  morphTargets: 0,
  materials: [...new Set(gltf.meshes.flatMap((m) => m.primitives.map((p) => gltf.materials[p.material]?.name)))],
  images: 0,
  animations: manifest.clips.map((c) => ({ name: c.name, duration: c.duration, bones: new Set(gltf.animations.find((a) => a.name === c.name).channels.map((ch) => ch.target.node)).size, channels: c.curves })),
};
manifest.source = 'fbx/Walking.fbx';
manifest.generator = 'tools/rebuild_character_from_walking.mjs';
manifest.height = TARGET_HEIGHT;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

console.log(`wrote ${OUT} (${(outBuf.length / 1e6).toFixed(2)} MB): ${gltf.nodes.length} nodes, ${vertCount} verts, ${Math.round(triCount)} tris`);
console.log(`clips: ${manifest.clips.map((c) => `${c.name} ${c.duration}s`).join(', ')}`);
console.log(`scale ${scale.toFixed(4)}, bounds y ${bounds.min.y.toFixed(3)}..${bounds.max.y.toFixed(3)}`);

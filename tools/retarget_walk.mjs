#!/usr/bin/env node
// Retarget the Mixamo walk cycle in fbx/Walking.fbx onto Markie's existing skeleton.
//
// Only the "walk" clip's rotation channels on mapped bones are replaced. Markie's
// mesh, skeleton, materials, the other clips (idle/run/jump/...) and the root
// translation channels are left byte-for-byte as they were.
//
// Method: world-space delta retargeting. For each mapped bone the source's world
// rotation change since its rest pose is applied to the target bone's world rest
// rotation. Bone local axes do not need to match because the mesh skins to the
// bone's world orientation.
//
// Usage:  node tools/retarget_walk.mjs [--fbx fbx/Walking.fbx] [--glb assets/models/survival_character.glb]
//                                      [--clip walk] [--frames 33]
//
// Requires only the repo's `three` dependency. The FBX loader wants a DOM for
// texture loading; a stub is installed below because textures are not needed.

globalThis.document = {
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(v) {}, get src() { return ''; } }),
  createElement: () => ({ addEventListener() {}, style: {} }),
};
globalThis.self = globalThis;
globalThis.window = globalThis;

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => {
  if (v.startsWith('--')) acc.push([v.slice(2), all[i + 1]]);
  return acc;
}, []));
const FBX = resolve(args.fbx || 'fbx/Walking.fbx');
const GLB = resolve(args.glb || 'assets/models/survival_character.glb');
const CLIP_NAME = args.clip || 'walk';
const FRAMES = Number(args.frames || 33);

// Target (Markie) node -> Mixamo bone. Twist and corrective helper bones are not mapped
// and keep their original walk data.
const MAP = {
  pelvis: 'Hips',
  spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2',
  neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};

// ---------- source: Mixamo FBX ----------
const fbxBuf = readFileSync(FBX);
const fbx = new FBXLoader().parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), '');
const srcClip = fbx.animations.find((c) => c.duration > 0.1);
if (!srcClip) throw new Error('no animated clip in FBX');
const srcBones = {};
fbx.traverse((o) => { if (o.isBone) srcBones[o.name.replace(/^mixamorig/, '')] = o; });
const srcTracks = {};
for (const t of srcClip.tracks) {
  const m = t.name.match(/^mixamorig(.+)\.quaternion$/);
  if (m) srcTracks[m[1]] = t;
}
function srcWorld(name, poseOf) {
  // world rotation of a Mixamo bone, with optional animated local rotation per bone
  const q = new THREE.Quaternion();
  let b = srcBones[name];
  while (b && b.isBone) {
    const local = poseOf(b.name.replace(/^mixamorig/, ''), b);
    q.premultiply(local);
    b = b.parent;
  }
  return q;
}
const restPose = (_n, b) => b.quaternion.clone();

// ---------- target: Markie GLB JSON ----------
const glbBuf = readFileSync(GLB);
if (glbBuf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
let off = 12;
const chunks = [];
while (off < glbBuf.length) {
  const len = glbBuf.readUInt32LE(off), type = glbBuf.readUInt32LE(off + 4);
  chunks.push({ type, data: glbBuf.subarray(off + 8, off + 8 + len) });
  off += 8 + len;
}
const gltf = JSON.parse(chunks[0].data.toString('utf8'));
let bin = Buffer.from(chunks[1].data);
const nodes = gltf.nodes;
const parentOf = {};
nodes.forEach((n, i) => (n.children || []).forEach((c) => { parentOf[c] = i; }));
const nodeByName = {};
nodes.forEach((n, i) => { if (n.name) nodeByName[n.name] = i; });

const restLocal = (i) => new THREE.Quaternion(...(nodes[i].rotation || [0, 0, 0, 1]));
const restT = new Map(); // node index -> world rest quaternion
function targetRestWorld(i) {
  if (restT.has(i)) return restT.get(i);
  const p = parentOf[i] !== undefined ? targetRestWorld(parentOf[i]) : new THREE.Quaternion();
  const w = p.clone().multiply(restLocal(i));
  restT.set(i, w);
  return w;
}

// Walk clip in the glTF
const walk = gltf.animations.find((a) => a.name === CLIP_NAME);
if (!walk) throw new Error(`no ${CLIP_NAME} animation`);
const walkDuration = Math.max(...walk.samplers.map((s) => {
  const acc = gltf.accessors[s.input];
  return acc.max[0];
}));

// ---------- sample retargeted rotations ----------
const srcDur = srcClip.duration;
const times = [];
for (let k = 0; k <= FRAMES; k++) times.push((k * walkDuration) / FRAMES); // last == first for looping
// Only bones that already have a rotation channel in the walk clip are retargeted, so the
// parent chain the runtime sees matches the one computed here.
const walkRotNodes = new Set(walk.channels.filter((c) => c.target.path === 'rotation').map((c) => nodes[c.target.node].name));
const mappedNodes = Object.keys(MAP).filter((n) => nodeByName[n] !== undefined && walkRotNodes.has(n));
const skipped = Object.keys(MAP).filter((n) => !mappedNodes.includes(n));
if (skipped.length) console.log(`not retargeted (no walk rotation channel): ${skipped.join(', ')}`);
const outQuats = {}; // node name -> Float32Array of 4 * times.length
mappedNodes.forEach((n) => { outQuats[n] = new Float32Array(4 * times.length); });

const restSrcWorld = {};
for (const n of mappedNodes) restSrcWorld[n] = srcWorld(MAP[n], restPose);

const interp = {};
for (const [name, t] of Object.entries(srcTracks)) interp[name] = t.createInterpolant();

times.forEach((tOut, k) => {
  const ts = (tOut * srcDur) / walkDuration;
  const poseAt = (name, b) => {
    const it = interp[name];
    if (!it) return b.quaternion.clone();
    const r = it.evaluate(ts);
    return new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
  };
  // memoised target world at this frame
  const memo = new Map();
  const worldAt = (i) => {
    if (memo.has(i)) return memo.get(i);
    const p = parentOf[i] !== undefined ? worldAt(parentOf[i]) : new THREE.Quaternion();
    const name = nodes[i].name;
    let w;
    if (name && MAP[name] && outQuats[name]) {
      const delta = srcWorld(MAP[name], poseAt).multiply(restSrcWorld[name].clone().invert());
      const desired = delta.multiply(targetRestWorld(i).clone());
      const local = p.clone().invert().multiply(desired);
      if (local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
      const o = outQuats[name];
      o.set([local.x, local.y, local.z, local.w], 4 * k);
      w = desired;
    } else {
      w = p.clone().multiply(restLocal(i));
    }
    memo.set(i, w);
    return w;
  };
  for (const name of mappedNodes) worldAt(nodeByName[name]);
});

// Keep quaternions in one hemisphere across frames so interpolation does not flip.
for (const name of mappedNodes) {
  const o = outQuats[name];
  for (let k = 1; k < times.length; k++) {
    const dot = o[4 * k] * o[4 * (k - 1)] + o[4 * k + 1] * o[4 * (k - 1) + 1] + o[4 * k + 2] * o[4 * (k - 1) + 2] + o[4 * k + 3] * o[4 * (k - 1) + 3];
    if (dot < 0) for (let c = 0; c < 4; c++) o[4 * k + c] *= -1;
  }
}

// ---------- write back into the GLB ----------
function appendAccessor(data, type, count, min, max) {
  const pad = (4 - (bin.length % 4)) % 4;
  bin = Buffer.concat([bin, Buffer.alloc(pad), Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
  const byteOffset = bin.length - data.byteLength;
  gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength });
  const bufferView = gltf.bufferViews.length - 1;
  const acc = { bufferView, componentType: 5126, count, type };
  if (min) acc.min = min;
  if (max) acc.max = max;
  gltf.accessors.push(acc);
  return gltf.accessors.length - 1;
}
const timeAcc = appendAccessor(Float32Array.from(times), 'SCALAR', times.length, [0], [times[times.length - 1]]);
let replaced = 0;
for (const ch of walk.channels) {
  if (ch.target.path !== 'rotation') continue;
  const name = nodes[ch.target.node].name;
  if (!outQuats[name]) continue;
  const sampler = walk.samplers[ch.sampler];
  const outAcc = appendAccessor(outQuats[name], 'VEC4', times.length, null, null);
  sampler.input = timeAcc;
  sampler.output = outAcc;
  sampler.interpolation = 'LINEAR';
  replaced++;
}
gltf.buffers[0].byteLength = bin.length;

// rebuild GLB
let json = Buffer.from(JSON.stringify(gltf), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
const total = 12 + 8 + json.length + 8 + bin.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(GLB, Buffer.concat([header, jh, json, bh, bin]));
console.log(`source ${srcClip.name} ${srcDur.toFixed(3)}s -> ${CLIP_NAME} ${walkDuration.toFixed(3)}s, ${times.length} keys`);
console.log(`replaced ${replaced} rotation channels; mapped nodes: ${mappedNodes.join(', ')}`);

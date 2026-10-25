// Software-render the game's generated house templates to PNGs so the house_builder presets
// can be eyeballed without a browser: `node tools/house-preview.mjs [outdir]`.
// Paints flat-shaded triangles with a z-buffer and writes PNGs with Node's zlib only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import zlib from 'node:zlib';
import { buildTemplateSet } from '../js/world/HouseBuilder.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || '/tmp/house-preview';
mkdirSync(outDir, { recursive: true });

const catalog = JSON.parse(readFileSync(join(root, 'assets/Environment/House/house_builder/preset_catalog.json'), 'utf8'));

// --- PNG writer (8-bit RGB, one IDAT) -----------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}
function writePng(path, width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// --- Renderer -----------------------------------------------------------------------------------
const W = 640; const H = 480;
const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function render(template, path) {
  const { size } = template.userData;
  const target = new THREE.Vector3(0, size.y * 0.45, 0);
  // Front-left three-quarter view (the veranda faces -Z).
  const eye = target.clone().add(new THREE.Vector3(-size.x * 1.15, size.y * 0.85 + 3, -size.z * 1.7 - 5));
  const forward = target.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const focal = 620;
  const light = new THREE.Vector3(-0.55, 1, -0.45).normalize(); // from the camera's side

  const pixels = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i += 1) { // sky/ground gradient
    const y = Math.floor(i / W);
    const t = y / H;
    pixels[i * 3] = Math.round(168 - 40 * t);
    pixels[i * 3 + 1] = Math.round(196 - 44 * t);
    pixels[i * 3 + 2] = Math.round(210 - 30 * t);
  }
  const depth = new Float32Array(W * H).fill(Infinity);

  const tris = [];
  template.updateMatrixWorld(true);
  for (const mesh of template.children) {
    const position = mesh.geometry.attributes.position;
    const color = mesh.geometry.attributes.color;
    const normal = mesh.geometry.attributes.normal;
    for (let i = 0; i < position.count; i += 3) {
      const verts = []; const cols = []; let nz = new THREE.Vector3();
      for (let k = 0; k < 3; k += 1) {
        const v = new THREE.Vector3().fromBufferAttribute(position, i + k).applyMatrix4(mesh.matrixWorld);
        const view = v.clone().sub(eye);
        verts.push({
          x: view.dot(right), y: view.dot(up), z: view.dot(forward),
        });
        cols.push([color.getX(i + k), color.getY(i + k), color.getZ(i + k)]);
        if (k === 0) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          nz = new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        }
      }
      const lit = 0.42 + 0.58 * Math.max(0, nz.dot(light));
      const depthAvg = (verts[0].z + verts[1].z + verts[2].z) / 3;
      const face = cols.map((c) => c.map((channel) => Math.round(255 * Math.min(1, Math.max(0, srgb(channel) * lit)))));
      tris.push({ verts, face, depth: depthAvg });
    }
  }
  tris.sort((a, b) => b.depth - a.depth);

  const project = (v) => {
    const f = focal / Math.max(0.3, v.z);
    return { x: W / 2 + f * v.x, y: H / 2 - f * v.y, z: v.z };
  };
  for (const tri of tris) {
    const [a, b, c] = tri.verts.map(project);
    if (tri.verts.some((v) => v.z < 0.3)) continue;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5; const py = y + 0.5;
        const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
        const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * tri.verts[0].z + w1 * tri.verts[1].z + w2 * tri.verts[2].z;
        const idx = y * W + x;
        if (z >= depth[idx]) continue;
        depth[idx] = z;
        pixels[idx * 3] = w0 * tri.face[0][0] + w1 * tri.face[1][0] + w2 * tri.face[2][0];
        pixels[idx * 3 + 1] = w0 * tri.face[0][1] + w1 * tri.face[1][1] + w2 * tri.face[2][1];
        pixels[idx * 3 + 2] = w0 * tri.face[0][2] + w1 * tri.face[1][2] + w2 * tri.face[2][2];
      }
    }
  }
  writePng(path, W, H, pixels);
}

const templates = buildTemplateSet(catalog);
for (const template of templates) {
  const { preset, floors } = template.userData;
  const file = join(outDir, `${preset}_f${floors}.png`);
  render(template, file);
  console.log(`wrote ${file}`);
  template.traverse((object) => object.geometry?.dispose?.());
}
console.log('done');

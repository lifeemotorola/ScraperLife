import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural houses built from assets/Environment/House/house_builder — the Advanced House
// Builder preset catalog (50 parameter houses, 100 textures). This is the game's house source
// now: every template is generated from a catalog `settings` block — walls with real door and
// window openings, veranda, columns, arches, railings, balcony, belt courses, security bars and
// HIP/GABLE/SHED/FLAT roofs — instead of the old homemaker GLB.
//
// The module is DOM-free so tools/house-check.mjs can build every preset in Node.

// A placement picks a template by height band first (so a block's storeys match its height),
// then by the variant's preset slot (so neighbours differ). Two bands: 1- and 2-floor templates.
export const FLOOR_BANDS = [1, 2];
export const FLOOR_SPLIT = 8.2; // metres: below this a 1-floor template is the closer fit
export const MATERIAL_NAMES = ['Walls', 'Porch', 'Roof', 'Details'];

// ---------------------------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------------------------

// One preset per family, in catalog order: the set spans every house family (10 so far).
export function basePresets(catalog) {
  const seen = new Set();
  const bases = [];
  for (const house of catalog.houses) {
    if (seen.has(house.family)) continue;
    seen.add(house.family);
    bases.push(house);
  }
  return bases;
}

// Deterministic preset slot for a variant index — the same block always gets the same house
// style on every load (the city uses the block index, districts a seeded 0..996 roll).
export function housePresetSlot(index, slots) {
  if (slots <= 1) return 0;
  return (Math.imul(index, 2654435761) >>> 0) % slots;
}

// Template index for one placement: variant slot × floor bands + height band, clamped so a
// stale slot can never index past the built set.
export function templateIndexFor(variant, height, templateCount) {
  const slots = Math.max(1, Math.floor(templateCount / FLOOR_BANDS.length));
  const band = height < FLOOR_SPLIT ? 0 : FLOOR_BANDS.length - 1;
  const slot = (((variant?.presetSlot ?? 0) % slots) + slots) % slots;
  return slot * FLOOR_BANDS.length + band;
}

// Texture color for a surface kind (PLASTER walls, TILE roofs, …), picked deterministically
// per preset so every style keeps its own paint on every load. Near-black variants are filtered
// out per role — a wall paint below `minLum` would read as a black hole once instance tints
// (which only multiply) are applied on top.
function pickColor(catalog, kinds, seed, minLum = 0) {
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let pool = catalog.textures.filter((texture) => kinds.includes(texture.kind));
  const friendly = pool.filter((texture) => luminance(texture.color) >= minLum);
  if (friendly.length) pool = friendly;
  if (!pool.length) pool = catalog.textures;
  const texture = pool[Math.abs(seed) % pool.length];
  const [r, g, b] = texture.color;
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

const SURFACE_KINDS = { PLASTER: ['PLASTER', 'STUCCO'], BRICK: ['BRICK', 'BLOCK'], TIMBER: ['WOOD', 'SIDING'] };
const ROOF_KINDS = { TILE: ['TILE'], METAL: ['METAL'], SHINGLE: ['TILE', 'STONE'] };

// Shared materials: all per-template color lives in vertex colors, so every template reuses
// four materials (and four GPU programs) no matter how many presets are built. Per-instance
// tints ride on top via InstancedMesh.instanceColor in placeHouses.
let sharedMaterials = null;
export function houseMaterials() {
  if (!sharedMaterials) {
    // Material names matter: placeHouses tints `Walls` and `Porch` per instance by name.
    sharedMaterials = {
      Walls: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      Porch: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      Roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.12, side: THREE.DoubleSide }),
      Details: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    };
    for (const name of MATERIAL_NAMES) sharedMaterials[name].name = name;
  }
  return sharedMaterials;
}

// ---------------------------------------------------------------------------------------------
// Geometry accumulation. Every primitive is painted (vertex color) and ends up non-indexed with
// position/normal/uv/color, so mergeGeometries always sees matching attributes.
// ---------------------------------------------------------------------------------------------

class HouseParts {
  constructor() {
    this.groups = new Map(); // material name -> geometry[]
  }

  push(name, geometry, color) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const count = flat.attributes.position.count;
    const paint = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      paint[i * 3] = color.r; paint[i * 3 + 1] = color.g; paint[i * 3 + 2] = color.b;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(paint, 3));
    if (!this.groups.has(name)) this.groups.set(name, []);
    this.groups.get(name).push(flat);
  }

  box(name, color, cx, cy, cz, sx, sy, sz) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    this.push(name, new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz), color);
  }

  cylinder(name, color, cx, cy, cz, radiusTop, radiusBottom, height, segments = 10) {
    if (radiusBottom <= 0 || height <= 0) return;
    this.push(name, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments).translate(cx, cy, cz), color);
  }

  torus(name, color, cx, cy, cz, radius, tube) {
    if (radius <= tube || radius <= 0) return;
    this.push(name, new THREE.TorusGeometry(radius, tube, 4, 12, Math.PI).translate(cx, cy, cz), color);
  }

  // A flat polygon from 3D points. Winding is auto-oriented so the face points away from `ref`
  // (a point inside the house), which keeps every gable, shed infill and roof plane lit from
  // outside no matter how the points were listed.
  poly(name, color, points, ref) {
    if (points.length < 3) return;
    const verts = points.map((p) => new THREE.Vector3(...p));
    const normal = new THREE.Vector3().crossVectors(
      verts[1].clone().sub(verts[0]), verts[2].clone().sub(verts[0]),
    );
    const centre = verts.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(verts.length);
    if (normal.dot(centre.clone().sub(ref)) < 0) verts.reverse();
    for (let i = 1; i < verts.length - 1; i += 1) this.tri(name, color, verts[0], verts[i], verts[i + 1]);
  }

  tri(name, color, a, b, c) {
    const normal = new THREE.Vector3().crossVectors(
      b.clone().sub(a), c.clone().sub(a),
    ).normalize();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray()]), 3));
    const normals = new Float32Array([...normal.toArray(), ...normal.toArray(), ...normal.toArray()]);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    const paint = new Float32Array(9);
    for (let i = 0; i < 3; i += 1) {
      paint[i * 3] = color.r; paint[i * 3 + 1] = color.g; paint[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(paint, 3));
    if (!this.groups.has(name)) this.groups.set(name, []);
    this.groups.get(name).push(geometry);
  }
}

// ---------------------------------------------------------------------------------------------
// Wall building: rectangles with rectangular holes (real openings, no booleans)
// ---------------------------------------------------------------------------------------------

// Splits the wall band [u0..u1] × [y0..y1] into rectangles that avoid every hole, as
// { a, b, y0, y1 } strips. Holes use the same coordinates: u along the wall, y absolute.
function wallStrips(u0, u1, y0, y1, holes) {
  const edges = new Set([u0, u1]);
  holes.forEach((hole) => {
    edges.add(Math.max(u0, hole.a)); edges.add(Math.min(u1, hole.b));
  });
  const xs = [...edges].sort((p, q) => p - q);
  const strips = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const xa = xs[i]; const xb = xs[i + 1];
    if (xb - xa < 0.02) continue;
    const blocking = holes
      .filter((hole) => hole.a <= xa + 1e-6 && hole.b >= xb - 1e-6)
      .sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const hole of blocking) {
      if (hole.y0 > y + 1e-6) strips.push({ a: xa, b: xb, y0: y, y1: Math.min(hole.y0, y1) });
      y = Math.max(y, hole.y1);
    }
    if (y < y1 - 1e-6) strips.push({ a: xa, b: xb, y0: y, y1 });
  }
  return strips;
}

// Evenly spread `count` window centres across [a, b].
function spreadCentres(a, b, count) {
  const centres = [];
  for (let i = 0; i < count; i += 1) centres.push(a + ((b - a) * (i + 1)) / (count + 1));
  return centres;
}

// ---------------------------------------------------------------------------------------------
// Template builder
// ---------------------------------------------------------------------------------------------

// Builds one house template from a catalog preset (optionally re-floored), centred on X/Z with
// its base on y = 0, like the GLB path's prepareTemplate. Returns a THREE.Group whose
// userData carries { size (full bbox), body: { w, d }, preset, floors }.
export function buildHouseTemplate(preset, catalog, floors = null) {
  const s = { ...preset.settings };
  s.floors = floors ?? s.floors;
  const seed = Number.parseInt(String(preset.id).replace(/\D/g, ''), 10) || 0;

  const W = s.width; const D = s.depth; const T = s.wall_thickness ?? 0.22;
  const FH = s.floor_height ?? 3.2; const F = s.foundation ?? 0.55;
  const N = s.floors; const over = s.overhang ?? 0.65;
  const pitch = THREE.MathUtils.degToRad(s.roof_pitch ?? 28);
  const winW = s.window_width ?? 1.05; const winH = s.window_height ?? 1.35;
  const sill = s.sill_height ?? 0.9; const doorW = s.door_width ?? 1.1;
  const doorH = s.door_height ?? 2.2; const veranda = !!s.veranda_enabled;
  const dv = veranda ? (s.veranda_depth ?? 2.4) : 0;
  const deckW = veranda ? Math.max(3, W - 2 * (s.veranda_width ?? 0.6)) : 0;
  const wallTop = F + N * FH;
  const roofStyle = s.roof_style ?? 'HIP';

  const wallColor = pickColor(catalog, SURFACE_KINDS[s.surface] ?? ['PLASTER'], seed + s.floors, 0.25);
  const roofColor = pickColor(catalog, ROOF_KINDS[s.roof_surface] ?? ['TILE'], seed * 3 + 7, 0.08);
  const deckColor = pickColor(catalog, ['WOOD'], seed + 11, 0.15);
  const trimColor = new THREE.Color().setHex(0xe8e2d0, THREE.SRGBColorSpace);
  const doorColor = new THREE.Color().setHex(0x2e4d3a, THREE.SRGBColorSpace);
  const glassColor = new THREE.Color().setRGB(0.22, 0.32, 0.38, THREE.SRGBColorSpace);
  const barColor = new THREE.Color().setHex(0x1f292b, THREE.SRGBColorSpace);
  const parts = new HouseParts();
  const inside = new THREE.Vector3(0, wallTop - 1, 0); // orientation ref for poly() faces

  // A SHED roof rises at the front: the front wall runs up to the roof line, the side triangles
  // above wallTop are filled in with the roof, and the back wall stops at wallTop.
  const shedRise = roofStyle === 'SHED' ? Math.tan(pitch) * (D + over) + 0.12 : 0;
  const frontTop = wallTop + shedRise;

  // --- Window/door layouts per façade, per floor -------------------------------------------------
  const doorZone = doorW / 2 + winW / 2 + 0.3;
  const m = 0.9; // margin from wall ends
  const layout = []; // per floor: { front, back, left, right } window centres
  for (let f = 0; f < N; f += 1) {
    layout.push({
      front: spreadCentres(-W / 2 + m, W / 2 - m, s.windows_front ?? 3)
        .filter((x) => f > 0 || Math.abs(x) >= doorZone), // the ground floor's centre slot is the door
      back: spreadCentres(-W / 2 + m, W / 2 - m, s.windows_front ?? 3),
      left: spreadCentres(-D / 2 + m, D / 2 - m, s.windows_side ?? 2),
      right: spreadCentres(-D / 2 + m, D / 2 - m, s.windows_side ?? 2),
    });
  }

  // --- Foundation, apron and veranda deck --------------------------------------------------------
  parts.box('Walls', wallColor, 0, F / 2, 0, W, F, D);
  if (s.ground !== false) {
    const z0 = -D / 2 - dv - 0.35; const z1 = D / 2 + 0.35;
    parts.box('Porch', deckColor, 0, 0.04, (z0 + z1) / 2, W + 0.7, 0.08, z1 - z0);
  }
  if (veranda) parts.box('Porch', deckColor, 0, F - 0.09, -D / 2 - dv / 2, deckW, 0.18, dv);

  // --- Walls with real openings, one floor band at a time ----------------------------------------
  const faces = ['front', 'back', 'left', 'right'];
  const wallInfo = {};
  for (const face of faces) {
    const horizontal = face === 'front' || face === 'back'; // wall runs along X
    const u0 = horizontal ? -W / 2 : -D / 2 + T;
    const u1 = horizontal ? W / 2 : D / 2 - T;
    const plane = horizontal ? (face === 'front' ? -D / 2 : D / 2) : (face === 'left' ? -W / 2 : W / 2);
    const outward = (face === 'front' || face === 'left') ? -1 : 1;
    wallInfo[face] = { horizontal, plane, outward };
    for (let f = 0; f < N; f += 1) {
      const y0 = F + f * FH;
      const y1 = (face === 'front' && f === N - 1) ? frontTop : Math.min(F + (f + 1) * FH, wallTop);
      const holes = layout[f][face].map((c) => ({
        a: c - winW / 2, b: c + winW / 2, y0: y0 + sill, y1: y0 + sill + winH,
      }));
      if (face === 'front' && f === 0) holes.push({ a: -doorW / 2, b: doorW / 2, y0, y1: y0 + doorH });
      for (const strip of wallStrips(u0, u1, y0, y1, holes)) {
        const uc = (strip.a + strip.b) / 2; const yc = (strip.y0 + strip.y1) / 2;
        const uw = strip.b - strip.a; const yh = strip.y1 - strip.y0;
        if (horizontal) parts.box('Walls', wallColor, uc, yc, plane + (outward * T) / 2, uw, yh, T);
        else parts.box('Walls', wallColor, plane + (outward * T) / 2, yc, uc, T, yh, uw);
      }
    }
  }

  // Windows: glass in the opening, a trim frame on the exterior face, optional security bars.
  for (const face of faces) {
    const { horizontal, plane, outward } = wallInfo[face];
    for (let f = 0; f < N; f += 1) {
      const floorY = F + f * FH;
      for (const c of layout[f][face]) {
        const yc = floorY + sill + winH / 2;
        const glassAt = plane + (outward * T) / 2;
        const frameAt = plane + outward * 0.025;
        const barAt = plane + outward * 0.045;
        if (horizontal) {
          parts.box('Details', glassColor, c, yc, glassAt, winW - 0.08, winH - 0.08, 0.05);
          parts.box('Details', trimColor, c - winW / 2 - 0.035, yc, frameAt, 0.07, winH + 0.14, 0.06);
          parts.box('Details', trimColor, c + winW / 2 + 0.035, yc, frameAt, 0.07, winH + 0.14, 0.06);
          parts.box('Details', trimColor, c, floorY + sill + winH + 0.035, frameAt, winW + 0.14, 0.07, 0.06);
          parts.box('Details', trimColor, c, floorY + sill - 0.035, frameAt, winW + 0.14, 0.07, 0.06);
          if (s.security_bars) {
            for (const off of [-winW / 4, 0, winW / 4]) parts.box('Details', barColor, c + off, yc, barAt, 0.035, winH - 0.1, 0.035);
          }
        } else {
          parts.box('Details', glassColor, glassAt, yc, c, 0.05, winH - 0.08, winW - 0.08);
          parts.box('Details', trimColor, frameAt, yc, c - winW / 2 - 0.035, 0.06, winH + 0.14, 0.07);
          parts.box('Details', trimColor, frameAt, yc, c + winW / 2 + 0.035, 0.06, winH + 0.14, 0.07);
          parts.box('Details', trimColor, frameAt, floorY + sill + winH + 0.035, c, 0.06, 0.07, winW + 0.14);
          parts.box('Details', trimColor, frameAt, floorY + sill - 0.035, c, 0.06, 0.07, winW + 0.14);
          if (s.security_bars) {
            for (const off of [-winW / 4, 0, winW / 4]) parts.box('Details', barColor, barAt, yc, c + off, 0.035, winH - 0.1, 0.035);
          }
        }
      }
    }
  }

  // Front door: a dark panel in the opening with a trim casing on the street face.
  parts.box('Details', doorColor, 0, F + doorH / 2, -D / 2 + T / 2, doorW - 0.04, doorH - 0.04, 0.06);
  parts.box('Details', trimColor, -(doorW / 2 + 0.045), F + doorH / 2, -D / 2 - 0.02, 0.09, doorH + 0.1, 0.06);
  parts.box('Details', trimColor, doorW / 2 + 0.045, F + doorH / 2, -D / 2 - 0.02, 0.09, doorH + 0.1, 0.06);
  parts.box('Details', trimColor, 0, F + doorH + 0.05, -D / 2 - 0.02, doorW + 0.28, 0.1, 0.06);

  // --- Belt courses (the bands that break up a tall façade) --------------------------------------
  if (s.belt_courses) {
    const band = (y, front = true) => {
      if (front) parts.box('Details', trimColor, 0, y + 0.065, -D / 2 - 0.02, W + 0.1, 0.13, 0.07);
      parts.box('Details', trimColor, 0, y + 0.065, D / 2 + 0.02, W + 0.1, 0.13, 0.07);
      parts.box('Details', trimColor, -W / 2 - 0.02, y + 0.065, 0, 0.07, 0.13, D);
      parts.box('Details', trimColor, W / 2 + 0.02, y + 0.065, 0, 0.07, 0.13, D);
    };
    band(F); // plinth cap
    for (let f = 1; f < N; f += 1) band(F + f * FH);
    band(wallTop, roofStyle !== 'SHED'); // eave band (the shed's front wall keeps rising)
  }

  // --- Veranda: columns, arches, railings, canopy, balcony ---------------------------------------
  if (veranda) {
    const cs = s.column_size ?? 0.34;
    const half = deckW / 2 - cs / 2 - 0.12;
    const n = Math.max(2, s.porch_columns ?? 3);
    const clear = doorW / 2 + 0.8 + cs / 2 + 0.1; // keep the door path and steps clear
    const columnXs = [];
    for (let i = 0; i < n; i += 1) {
      const x = n === 1 ? 0 : -half + (2 * half * i) / (n - 1);
      if (Math.abs(x) < 0.01) columnXs.push(-clear, clear); // split the centre post around the steps
      else if (Math.abs(x) < clear) columnXs.push(Math.sign(x) * clear);
      else columnXs.push(x);
    }
    const uniqueXs = [...new Set(columnXs.map((x) => Number(x.toFixed(3))))].sort((p, q) => p - q);
    const zCol = -D / 2 - dv + cs / 2 + 0.12;
    const soffit = F + FH - 0.16;
    const round = (s.column_style ?? 'SQUARE') !== 'SQUARE';
    for (const x of uniqueXs) {
      if (round) {
        parts.cylinder('Porch', wallColor, x, (F + soffit) / 2, zCol, cs * 0.4, cs * 0.5, soffit - F);
        parts.cylinder('Porch', wallColor, x, F + 0.07, zCol, cs * 0.62, cs * 0.62, 0.14, 8);
        parts.cylinder('Porch', wallColor, x, soffit - 0.07, zCol, cs * 0.62, cs * 0.62, 0.14, 8);
      } else {
        parts.box('Porch', wallColor, x, (F + soffit) / 2, zCol, cs, soffit - F, cs);
        parts.box('Porch', wallColor, x, F + 0.07, zCol, cs * 1.3, 0.14, cs * 1.3);
        parts.box('Porch', wallColor, x, soffit - 0.07, zCol, cs * 1.3, 0.14, cs * 1.3);
      }
    }
    // Arches span each gap between columns, springing from just below the canopy.
    if (s.porch_arches) {
      for (let i = 0; i < uniqueXs.length - 1; i += 1) {
        const gap = uniqueXs[i + 1] - uniqueXs[i];
        const r = ((gap - cs) / 2) * 0.95;
        if (r < 0.3 || r > gap) continue;
        parts.torus('Porch', wallColor, (uniqueXs[i] + uniqueXs[i + 1]) / 2, soffit - 0.04 - r, zCol, r, 0.05);
      }
    }
    // Railings fill each column gap above knee height (the add-on's porch railings).
    if (s.railings) {
      for (let i = 0; i < uniqueXs.length - 1; i += 1) {
        const xa = uniqueXs[i]; const xb = uniqueXs[i + 1];
        const gap = xb - xa;
        if (gap < 0.4) continue;
        parts.box('Porch', wallColor, (xa + xb) / 2, F + 0.96, zCol, gap, 0.08, 0.07);
        const balusters = Math.min(14, Math.max(2, Math.round(gap / 0.3)));
        for (let k = 1; k < balusters; k += 1) {
          parts.box('Porch', wallColor, xa + (gap * k) / balusters, F + 0.46, zCol, 0.045, 0.92, 0.045);
        }
      }
    }
    // Canopy over the deck; with floors above it doubles as the balcony slab.
    const cz0 = -D / 2 - dv - 0.2; const cz1 = -D / 2 + 0.1;
    parts.box('Porch', deckColor, 0, F + FH - 0.08, (cz0 + cz1) / 2, deckW + 0.35, 0.16, cz1 - cz0);
    if (s.balcony && N >= 2) {
      const railZ = cz0 + 0.1;
      const railW = deckW + 0.35;
      parts.box('Porch', wallColor, 0, F + FH + 0.5, railZ, railW, 0.08, 0.08);
      for (const side of [-1, 1]) {
        parts.box('Porch', wallColor, side * (railW / 2 - 0.04), F + FH + 0.5, (railZ + cz1) / 2, 0.08, 0.08, cz1 - railZ);
      }
      const balusters = Math.min(20, Math.max(4, Math.round(railW / 0.3)));
      for (let k = 0; k <= balusters; k += 1) {
        parts.box('Porch', wallColor, -railW / 2 + (railW * k) / balusters, F + FH + 0.25, railZ, 0.045, 0.5, 0.045);
      }
    }
  }

  // --- Steps up to the door ----------------------------------------------------------------------
  if (s.steps !== false && F > 0.2) {
    const zEdge = veranda ? -D / 2 - dv : -D / 2;
    const stepDepth = 0.36;
    const steps = Math.max(2, Math.round((F - 0.08) / 0.18));
    const drop = (F - 0.08) / steps;
    for (let j = 0; j < steps; j += 1) {
      const top = F - j * drop;
      parts.box('Porch', deckColor, 0, (0.08 + top) / 2, zEdge - (j + 0.5) * stepDepth,
        doorW + 0.6, top - 0.08, stepDepth);
    }
  }

  // --- Roof -------------------------------------------------------------------------------------
  const roofW = W + 2 * over; const roofD = D + 2 * over;
  if (roofStyle === 'FLAT') {
    parts.box('Roof', roofColor, 0, wallTop + 0.08, 0, W + 0.16, 0.16, D + 0.16);
    const ph = 0.45; const pt = Math.max(0.14, T);
    parts.box('Walls', wallColor, 0, wallTop + 0.16 + ph / 2, -(D + 0.16) / 2 + pt / 2, W + 0.16, ph, pt);
    parts.box('Walls', wallColor, 0, wallTop + 0.16 + ph / 2, (D + 0.16) / 2 - pt / 2, W + 0.16, ph, pt);
    parts.box('Walls', wallColor, -(W + 0.16) / 2 + pt / 2, wallTop + 0.16 + ph / 2, 0, pt, ph, D + 0.16 - 2 * pt);
    parts.box('Walls', wallColor, (W + 0.16) / 2 - pt / 2, wallTop + 0.16 + ph / 2, 0, pt, ph, D + 0.16 - 2 * pt);
  } else {
    parts.box('Roof', roofColor, 0, wallTop + 0.06, 0, roofW, 0.12, roofD); // fascia / eave plate
    const roofY = wallTop + 0.12;
    const rise = Math.tan(pitch) * (roofStyle === 'SHED' ? roofD : Math.min(roofW, roofD) / 2);
    const apex = roofY + rise;
    if (roofStyle === 'HIP') {
      if (roofW >= roofD) {
        const k = (roofW - roofD) / 2;
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, -roofD / 2], [roofW / 2, roofY, -roofD / 2], [k, apex, 0], [-k, apex, 0]], inside);
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, roofD / 2], [-k, apex, 0], [k, apex, 0]], inside);
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, -roofD / 2], [-k, apex, 0]], inside);
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, -roofD / 2], [roofW / 2, roofY, roofD / 2], [k, apex, 0]], inside);
      } else {
        const k = (roofD - roofW) / 2;
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, -roofD / 2], [roofW / 2, roofY, roofD / 2], [0, apex, k], [0, apex, -k]], inside);
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, -roofD / 2], [0, apex, -k], [0, apex, k]], inside);
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, -roofD / 2], [roofW / 2, roofY, -roofD / 2], [0, apex, -k]], inside);
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, roofD / 2], [0, apex, k]], inside);
      }
    } else if (roofStyle === 'GABLE') {
      const edgeY = roofY + Math.tan(pitch) * over; // plane height where it passes the wall line
      if (roofW >= roofD) {
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, -roofD / 2], [roofW / 2, roofY, -roofD / 2], [roofW / 2, apex, 0], [-roofW / 2, apex, 0]], inside);
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, roofD / 2], [-roofW / 2, apex, 0], [roofW / 2, apex, 0]], inside);
        for (const side of [-1, 1]) { // gable-end infill, wall colour
          parts.poly('Walls', wallColor, [
            [side * W / 2, wallTop, -D / 2], [side * W / 2, wallTop, D / 2], [side * W / 2, edgeY, D / 2],
            [side * W / 2, apex, 0], [side * W / 2, edgeY, -D / 2],
          ], inside);
        }
      } else {
        parts.poly('Roof', roofColor, [[roofW / 2, roofY, -roofD / 2], [-roofW / 2, roofY, -roofD / 2], [-roofW / 2, apex, 0], [roofW / 2, apex, 0]], inside);
        parts.poly('Roof', roofColor, [[-roofW / 2, roofY, roofD / 2], [roofW / 2, roofY, roofD / 2], [roofW / 2, apex, 0], [-roofW / 2, apex, 0]], inside);
        for (const side of [-1, 1]) {
          parts.poly('Walls', wallColor, [
            [-W / 2, wallTop, side * D / 2], [W / 2, wallTop, side * D / 2], [W / 2, edgeY, side * D / 2],
            [0, apex, side * D / 2], [-W / 2, edgeY, side * D / 2],
          ], inside);
        }
      }
    } else { // SHED: one slope falling to the back; the front wall already rises to meet it.
      const yHi = roofY + rise;
      parts.poly('Roof', roofColor, [
        [-roofW / 2, yHi, -roofD / 2], [roofW / 2, yHi, -roofD / 2],
        [roofW / 2, roofY, roofD / 2], [-roofW / 2, roofY, roofD / 2],
      ], inside);
      // Side infill from the wall tops up to the sloping plane: a quad per side.
      const planeY = (z) => yHi - Math.tan(pitch) * (z + roofD / 2);
      for (const side of [-1, 1]) {
        parts.poly('Walls', wallColor, [
          [side * W / 2, wallTop, -D / 2], [side * W / 2, wallTop, D / 2],
          [side * W / 2, planeY(D / 2), D / 2], [side * W / 2, planeY(-D / 2), -D / 2],
        ], inside);
      }
    }
  }

  // --- Merge, centre and package -----------------------------------------------------------------
  const materials = houseMaterials();
  const meshes = [];
  const bounds = new THREE.Box3();
  for (const [name, geometries] of parts.groups) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error(`house_builder: could not merge ${name} parts for ${preset.id}`);
    merged.computeBoundingBox();
    bounds.union(merged.boundingBox);
    const mesh = new THREE.Mesh(merged, materials[name]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  for (const mesh of meshes) {
    mesh.geometry.translate(-centre.x, -bounds.min.y, -centre.z);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  const pivot = new THREE.Group();
  pivot.name = `house_${preset.id}_f${N}`;
  meshes.forEach((mesh) => pivot.add(mesh));
  pivot.userData.size = bounds.getSize(new THREE.Vector3());
  pivot.userData.body = { w: W, d: D };
  pivot.userData.preset = preset.id;
  pivot.userData.floors = N;
  return pivot;
}

// The template set the game places: one base preset per family × FLOOR_BANDS floor counts.
export function buildTemplateSet(catalog) {
  const templates = [];
  for (const preset of basePresets(catalog)) {
    for (const floors of FLOOR_BANDS) templates.push(buildHouseTemplate(preset, catalog, floors));
  }
  return templates;
}

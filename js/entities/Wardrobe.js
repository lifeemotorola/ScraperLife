import * as THREE from 'three';

// The palette generator writes these IDs for each actor. Keeping the IDs in order makes the
// shader compact while still letting the authored roster use readable wardrobe names.
export const WARDROBE_TOP_STYLES = Object.freeze([
  'street-tee', 'print-blouse', 'work-shirt', 'wrap-blouse', 'football-jersey',
  'graphic-tee', 'hoodie', 'utility-vest', 'bomber', 'tactical-polo', 'tailored-suit',
  'formal-tunic', 'striped-jersey', 'market-polo', 'hi-vis-vest', 'track-jacket', 'cargo-vest',
]);

export const WARDROBE_BOTTOM_STYLES = Object.freeze([
  'field-cargo', 'pattern-trouser', 'pressed-trouser', 'straight-jeans', 'track-pants',
  'rolled-jeans', 'tailored-pants', 'work-cargo', 'dark-denim', 'tactical-pants',
  'suit-trousers', 'formal-trousers', 'uniform-trousers', 'market-jeans', 'dock-workwear',
  'harbor-track-pants', 'warehouse-cargo',
]);

const WARDROBE_SHADER_VERSION = 'waterside-wardrobe-v1';
const LIGHT_THREAD = new THREE.Color('#f4e9d5');

const WARDROBE_SHADER_COMMON = `
uniform float uWardrobeSlot;
uniform float uWardrobeStyle;
uniform float uWardrobeNumber;
uniform vec3 uWardrobeAccent;
uniform vec3 uWardrobeLight;
uniform vec3 uWardrobeSkin;
varying vec3 vWardrobePosition;

float slWardrobeBox(vec2 point, vec2 center, vec2 halfSize) {
  vec2 edge = abs(point - center) - halfSize;
  return 1.0 - smoothstep(-0.002, 0.004, max(edge.x, edge.y));
}
float slWardrobeLine(float value, float center, float width) {
  return 1.0 - smoothstep(width, width + 0.003, abs(value - center));
}
float slWardrobeCircle(vec2 point, vec2 center, float radius) {
  return 1.0 - smoothstep(radius - 0.003, radius + 0.003, length(point - center));
}
float slWardrobeDigit(vec2 point, float number) {
  float top = slWardrobeBox(point, vec2(0.0, 0.060), vec2(0.027, 0.005));
  float middle = slWardrobeBox(point, vec2(0.0, 0.000), vec2(0.027, 0.005));
  float bottom = slWardrobeBox(point, vec2(0.0, -0.060), vec2(0.027, 0.005));
  float upperLeft = slWardrobeBox(point, vec2(-0.030, 0.031), vec2(0.005, 0.028));
  float upperRight = slWardrobeBox(point, vec2(0.030, 0.031), vec2(0.005, 0.028));
  float lowerLeft = slWardrobeBox(point, vec2(-0.030, -0.031), vec2(0.005, 0.028));
  float lowerRight = slWardrobeBox(point, vec2(0.030, -0.031), vec2(0.005, 0.028));
  float digit = 0.0;
  if (number < 0.5) digit = top + upperLeft + upperRight + lowerLeft + lowerRight + bottom;
  else if (number < 1.5) digit = upperRight + lowerRight;
  else if (number < 2.5) digit = top + upperRight + middle + lowerLeft + bottom;
  else if (number < 3.5) digit = top + upperRight + middle + lowerRight + bottom;
  else if (number < 4.5) digit = upperLeft + upperRight + middle + lowerRight;
  else if (number < 5.5) digit = top + upperLeft + middle + lowerRight + bottom;
  else if (number < 6.5) digit = top + upperLeft + middle + lowerLeft + lowerRight + bottom;
  else if (number < 7.5) digit = top + upperRight + lowerRight;
  else if (number < 8.5) digit = top + upperLeft + upperRight + middle + lowerLeft + lowerRight + bottom;
  else digit = top + upperLeft + upperRight + middle + lowerRight + bottom;
  return clamp(digit, 0.0, 1.0);
}`;

const WARDROBE_VERTEX_VARYING = 'varying vec3 vWardrobePosition;';
const WARDROBE_VERTEX_POSITION = 'vWardrobePosition = position;';

const WARDROBE_FRAGMENT_LOOK = `
vec3 slWardrobeP = vWardrobePosition;
float slWardrobeKind = floor(uWardrobeStyle + 0.5);
float slWardrobeFront = smoothstep(0.06, 0.18, slWardrobeP.z);
float slWardrobeBack = 1.0 - smoothstep(-0.19, -0.07, slWardrobeP.z);
float slWardrobeTorso = 1.0 - smoothstep(0.18, 0.29, abs(slWardrobeP.x));
float slWardrobeChest = slWardrobeFront * slWardrobeTorso
  * smoothstep(1.36, 1.48, slWardrobeP.y) * (1.0 - smoothstep(1.84, 1.96, slWardrobeP.y));
float slWardrobeSleeves = (1.0 - slWardrobeTorso)
  * smoothstep(1.10, 1.24, slWardrobeP.y) * (1.0 - smoothstep(1.83, 1.98, slWardrobeP.y));
float slWardrobeAccentMask = 0.0;
float slWardrobeLightMask = 0.0;
float slWardrobeSkinMask = 0.0;

if (uWardrobeSlot < 0.5) {
  // 0 street tee: contrast neckline, sleeve cuffs and a small chest mark.
  if (slWardrobeKind < 0.5) {
    slWardrobeAccentMask = max(slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.89, 0.018),
      slWardrobeChest * slWardrobeBox(slWardrobeP.xy, vec2(-0.115, 1.68), vec2(0.038, 0.038)));
    slWardrobeLightMask = slWardrobeSleeves * slWardrobeLine(slWardrobeP.y, 1.39, 0.014);
  }
  // 1 printed blouse: an all-over diamond/block-print panel, framed at the hem and collar.
  else if (slWardrobeKind < 1.5) {
    vec2 slPrintCell = fract(vec2(slWardrobeP.x * 18.0, slWardrobeP.y * 18.0)) - 0.5;
    float slDiamond = 1.0 - smoothstep(0.16, 0.25, abs(slPrintCell.x) + abs(slPrintCell.y));
    float slPrintDots = 1.0 - smoothstep(0.045, 0.075, length(slPrintCell));
    slWardrobeAccentMask = slWardrobeChest * max(slDiamond, slPrintDots * 0.72);
    slWardrobeLightMask = slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.51, 0.018);
  }
  // 2 work shirt: stitched placket and two patch pockets.
  else if (slWardrobeKind < 2.5) {
    float slPockets = slWardrobeBox(slWardrobeP.xy, vec2(-0.105, 1.68), vec2(0.048, 0.055))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.105, 1.68), vec2(0.048, 0.055));
    slWardrobeAccentMask = slWardrobeChest * max(slPockets, slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.68), vec2(0.009, 0.19)));
    slWardrobeLightMask = slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.88, 0.013);
  }
  // 3 wrap blouse: a diagonal crossover panel and bright neckline.
  else if (slWardrobeKind < 3.5) {
    float slWrapLine = slWardrobeLine(slWardrobeP.y, 1.60 + abs(slWardrobeP.x) * 0.82, 0.012);
    slWardrobeAccentMask = slWardrobeChest * max(slWrapLine, slWardrobeLine(slWardrobeP.y, 1.88, 0.016));
    slWardrobeLightMask = slWardrobeChest * slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.53), vec2(0.15, 0.018));
  }
  // 4 football jersey: shoulder piping, double bands and the player's number.
  else if (slWardrobeKind < 4.5) {
    float slBands = slWardrobeLine(slWardrobeP.y, 1.76, 0.012) + slWardrobeLine(slWardrobeP.y, 1.71, 0.010);
    float slDigit = slWardrobeDigit(vec2(slWardrobeP.x, slWardrobeP.y - 1.63), uWardrobeNumber);
    slWardrobeAccentMask = slWardrobeSleeves * slBands + slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.49, 0.018);
    slWardrobeLightMask = slWardrobeChest * slDigit;
  }
  // 5 graphic tee: a ringed crest and sleeve tab.
  else if (slWardrobeKind < 5.5) {
    float slRing = slWardrobeCircle(slWardrobeP.xy, vec2(0.0, 1.69), 0.075)
      - slWardrobeCircle(slWardrobeP.xy, vec2(0.0, 1.69), 0.057);
    float slCross = slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.69), vec2(0.008, 0.035))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.69), vec2(0.035, 0.008));
    slWardrobeAccentMask = slWardrobeChest * max(slRing, slCross);
    slWardrobeLightMask = slWardrobeChest * slWardrobeCircle(slWardrobeP.xy, vec2(0.0, 1.69), 0.012);
  }
  // 6 hoodie: back hood panel, drawstrings and a front kangaroo pocket.
  else if (slWardrobeKind < 6.5) {
    float slHood = slWardrobeBack * (1.0 - smoothstep(1.78, 1.91, slWardrobeP.y))
      * smoothstep(1.71, 1.80, slWardrobeP.y) * (1.0 - smoothstep(0.22, 0.30, abs(slWardrobeP.x)));
    float slPocket = slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.43), vec2(0.12, 0.055));
    float slStrings = slWardrobeLine(slWardrobeP.x, -0.023, 0.004) + slWardrobeLine(slWardrobeP.x, 0.023, 0.004);
    slWardrobeAccentMask = max(slWardrobeChest * slPocket, slHood);
    slWardrobeLightMask = slWardrobeChest * slStrings * (1.0 - smoothstep(1.77, 1.84, slWardrobeP.y));
  }
  // 7 utility vest: front straps, reflective bar and tool pockets.
  else if (slWardrobeKind < 7.5) {
    float slStraps = slWardrobeBox(slWardrobeP.xy, vec2(-0.13, 1.65), vec2(0.018, 0.22))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.13, 1.65), vec2(0.018, 0.22));
    float slPockets = slWardrobeBox(slWardrobeP.xy, vec2(-0.08, 1.48), vec2(0.055, 0.05))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.08, 1.48), vec2(0.055, 0.05));
    slWardrobeAccentMask = slWardrobeChest * max(slStraps, slPockets);
    slWardrobeLightMask = slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.58, 0.018);
  }
  // 8 bomber: ribbed collar, cuffs and hem.
  else if (slWardrobeKind < 8.5) {
    slWardrobeAccentMask = slWardrobeFront * slWardrobeTorso
      * (slWardrobeLine(slWardrobeP.y, 1.89, 0.018) + slWardrobeLine(slWardrobeP.y, 1.22, 0.014));
    slWardrobeLightMask = slWardrobeSleeves * slWardrobeLine(slWardrobeP.y, 1.37, 0.014);
  }
  // 9 tactical polo: collar, epaulettes and a chest patch.
  else if (slWardrobeKind < 9.5) {
    float slEpaulettes = slWardrobeSleeves * slWardrobeLine(slWardrobeP.y, 1.83, 0.018);
    float slPatch = slWardrobeBox(slWardrobeP.xy, vec2(-0.115, 1.69), vec2(0.04, 0.035));
    slWardrobeAccentMask = slWardrobeChest * max(slPatch, slWardrobeLine(slWardrobeP.x, 0.0, 0.012));
    slWardrobeLightMask = slEpaulettes + slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.88, 0.012);
  }
  // 10 tailored suit: contrasting lapels, shirt front and tie.
  else if (slWardrobeKind < 10.5) {
    float slLapel = slWardrobeLine(slWardrobeP.y, 1.88 - abs(slWardrobeP.x) * 0.72, 0.012)
      * step(0.025, abs(slWardrobeP.x));
    float slTieWidth = mix(0.010, 0.027, clamp((1.81 - slWardrobeP.y) / 0.20, 0.0, 1.0));
    float slTie = step(abs(slWardrobeP.x), slTieWidth) * step(1.56, slWardrobeP.y) * step(slWardrobeP.y, 1.82);
    slWardrobeAccentMask = slWardrobeChest * slTie;
    slWardrobeLightMask = slWardrobeChest * slLapel;
  }
  // 11 formal tunic: embroidered central panel and two decorated bands.
  else if (slWardrobeKind < 11.5) {
    vec2 slEmbroideryCell = fract(vec2(slWardrobeP.x * 20.0, slWardrobeP.y * 14.0)) - 0.5;
    float slEmbroidery = 1.0 - smoothstep(0.14, 0.22, abs(slEmbroideryCell.x) + abs(slEmbroideryCell.y));
    slWardrobeAccentMask = slWardrobeChest * max(slEmbroidery * 0.8, slWardrobeLine(slWardrobeP.x, 0.0, 0.022));
    slWardrobeLightMask = slWardrobeChest * (slWardrobeLine(slWardrobeP.y, 1.82, 0.017) + slWardrobeLine(slWardrobeP.y, 1.48, 0.014));
  }
  // 12 striped jersey: broad chest bands and a second unique shirt number.
  else if (slWardrobeKind < 12.5) {
    float slStripe = 1.0 - smoothstep(0.012, 0.020, abs(fract(slWardrobeP.y * 10.0) - 0.5));
    slWardrobeAccentMask = slWardrobeChest * slStripe;
    slWardrobeLightMask = slWardrobeChest * slWardrobeDigit(vec2(slWardrobeP.x, slWardrobeP.y - 1.62), uWardrobeNumber);
  }
  // 13 market polo: collar, placket and woven checker panel.
  else if (slWardrobeKind < 13.5) {
    vec2 slCheck = fract(vec2(slWardrobeP.x * 14.0, slWardrobeP.y * 16.0));
    float slChecker = step(0.5, slCheck.x) * step(0.5, slCheck.y)
      + step(slCheck.x, 0.5) * step(slCheck.y, 0.5);
    slWardrobeAccentMask = slWardrobeChest * slChecker * 0.40;
    slWardrobeLightMask = slWardrobeChest * (slWardrobeLine(slWardrobeP.y, 1.88, 0.014)
      + slWardrobeBox(slWardrobeP.xy, vec2(-0.11, 1.68), vec2(0.038, 0.042)));
  }
  // 14 dock hi-vis vest: reflective braces and cross-band.
  else if (slWardrobeKind < 14.5) {
    float slBraces = slWardrobeBox(slWardrobeP.xy, vec2(-0.135, 1.65), vec2(0.017, 0.23))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.135, 1.65), vec2(0.017, 0.23));
    slWardrobeAccentMask = slWardrobeChest * slBraces;
    slWardrobeLightMask = slWardrobeChest * (slWardrobeLine(slWardrobeP.y, 1.73, 0.020)
      + slWardrobeLine(slWardrobeP.y, 1.48, 0.017));
  }
  // 15 track jacket: paired sleeve stripes and a front zip.
  else if (slWardrobeKind < 15.5) {
    float slSleeveStripe = slWardrobeSleeves * (slWardrobeLine(abs(slWardrobeP.x), 0.38, 0.018)
      + slWardrobeLine(abs(slWardrobeP.x), 0.43, 0.010));
    slWardrobeAccentMask = slSleeveStripe + slWardrobeChest * slWardrobeLine(slWardrobeP.x, 0.0, 0.009);
    slWardrobeLightMask = slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.86, 0.014);
  }
  // 16 cargo vest: utility pockets and a reinforced center seam.
  else {
    float slPockets = slWardrobeBox(slWardrobeP.xy, vec2(-0.11, 1.66), vec2(0.05, 0.06))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.11, 1.66), vec2(0.05, 0.06))
      + slWardrobeBox(slWardrobeP.xy, vec2(-0.11, 1.49), vec2(0.05, 0.045))
      + slWardrobeBox(slWardrobeP.xy, vec2(0.11, 1.49), vec2(0.05, 0.045));
    slWardrobeAccentMask = slWardrobeChest * max(slPockets, slWardrobeBox(slWardrobeP.xy, vec2(0.0, 1.67), vec2(0.009, 0.18)));
    slWardrobeLightMask = slWardrobeChest * slWardrobeLine(slWardrobeP.y, 1.88, 0.012);
  }
  // Short sleeves and sleeveless vests reveal the character-specific skin tone on the shared rig.
  if (slWardrobeKind < 0.5 || (slWardrobeKind > 3.5 && slWardrobeKind < 5.5)
      || (slWardrobeKind > 11.5 && slWardrobeKind < 13.5)) {
    slWardrobeSkinMask = slWardrobeSleeves * (1.0 - smoothstep(1.47, 1.53, slWardrobeP.y));
  } else if (slWardrobeKind > 6.5 && slWardrobeKind < 7.5
      || slWardrobeKind > 13.5 && slWardrobeKind < 14.5
      || slWardrobeKind > 15.5) {
    slWardrobeSkinMask = slWardrobeSleeves;
  }
} else if (uWardrobeSlot < 1.5) {
  float slPantsFront = smoothstep(0.02, 0.16, slWardrobeP.z);
  float slPants = slPantsFront * smoothstep(0.10, 0.22, slWardrobeP.y)
    * (1.0 - smoothstep(1.16, 1.32, slWardrobeP.y));
  float slThighPockets = slWardrobeBox(slWardrobeP.xy, vec2(-0.16, 0.76), vec2(0.045, 0.065))
    + slWardrobeBox(slWardrobeP.xy, vec2(0.16, 0.76), vec2(0.045, 0.065));
  if (slWardrobeKind < 0.5 || slWardrobeKind > 6.5) {
    slWardrobeAccentMask = slPants * slThighPockets;
  } else if (slWardrobeKind < 5.5 || slWardrobeKind > 13.5) {
    slWardrobeAccentMask = slPants * slWardrobeLine(abs(slWardrobeP.x), 0.16, 0.012);
  }
  if (slWardrobeKind == 1.0 || slWardrobeKind == 5.0 || slWardrobeKind == 8.0 || slWardrobeKind == 13.0) {
    slWardrobeLightMask = slPants * slWardrobeLine(slWardrobeP.y, 0.24, 0.018);
  }
  if (slWardrobeKind == 2.0 || slWardrobeKind == 6.0 || slWardrobeKind == 10.0 || slWardrobeKind == 11.0) {
    slWardrobeAccentMask = slPants * slWardrobeLine(slWardrobeP.x, 0.0, 0.008);
  }
}

diffuseColor.rgb = mix(diffuseColor.rgb, uWardrobeAccent, clamp(slWardrobeAccentMask, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, uWardrobeLight, clamp(slWardrobeLightMask, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, uWardrobeSkin, clamp(slWardrobeSkinMask, 0.0, 1.0));`;

function attachWardrobeMaterial(material, slot, style, number, accentColor, skinColor) {
  if (!material || material.userData?.wardrobeAppearance) return;
  const slotIndex = slot === 'shirt' ? 0 : (slot === 'pants' ? 1 : 2);
  const state = {
    slot: slotIndex,
    style,
    number,
    accent: new THREE.Color(accentColor),
    skin: new THREE.Color(skinColor),
  };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.uWardrobeSlot = { value: state.slot };
    shader.uniforms.uWardrobeStyle = { value: state.style };
    shader.uniforms.uWardrobeNumber = { value: state.number };
    shader.uniforms.uWardrobeAccent = { value: state.accent };
    shader.uniforms.uWardrobeLight = { value: LIGHT_THREAD };
    shader.uniforms.uWardrobeSkin = { value: state.skin };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${WARDROBE_VERTEX_VARYING}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${WARDROBE_VERTEX_POSITION}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${WARDROBE_SHADER_COMMON}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${WARDROBE_FRAGMENT_LOOK}`,
    );
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    return `${previousCacheKey()}|${WARDROBE_SHADER_VERSION}`;
  };
  material.userData.wardrobeAppearance = state;
  material.needsUpdate = true;
}

function accessoryMaterial(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function addAccessoryMesh(parent, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  const options = parent.userData?.wardrobeRenderOptions || {};
  mesh.name = name;
  mesh.castShadow = options.shadow !== false;
  mesh.receiveShadow = options.shadow !== false;
  mesh.frustumCulled = options.cull !== false;
  parent.add(mesh);
  return mesh;
}

function attachHeadwear(root, palette, renderOptions) {
  const style = palette?.wardrobe?.headwear || 'none';
  if (style === 'none') return null;
  const head = root.getObjectByName('head');
  if (!head) return null;

  const accent = palette.accent || palette.colors?.shirt || '#67534a';
  const main = accessoryMaterial(accent);
  const trim = accessoryMaterial('#f4e9d5', 0.72);
  const group = new THREE.Group();
  group.name = `WardrobeHeadwear_${style}`;
  group.userData.wardrobeRenderOptions = renderOptions;
  head.add(group);

  const addDome = (radius = 0.145, x = 0.27) => {
    const geometry = new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geometry.rotateZ(-Math.PI / 2); // head-bone local +X points up in the model
    const dome = addAccessoryMesh(group, geometry, main, `${style}_crown`);
    dome.position.x = x;
    return dome;
  };
  const addBrim = (width = 0.30, depth = 0.16, x = 0.27) => {
    const brim = addAccessoryMesh(group,
      new THREE.BoxGeometry(0.018, depth, width), main, `${style}_brim`);
    brim.position.set(x, -0.07, 0); // negative local Y faces the character's +Z front
    return brim;
  };
  const addBand = (tube = 0.025, x = 0.13) => {
    const ring = new THREE.TorusGeometry(0.13, tube, 7, 20);
    ring.rotateY(Math.PI / 2); // ring plane is the head's local YZ plane
    const band = addAccessoryMesh(group, ring, main, `${style}_band`);
    band.position.x = x;
    return band;
  };

  if (style === 'cap' || style === 'sports-cap') {
    addDome(0.14, 0.26);
    addBrim(style === 'sports-cap' ? 0.32 : 0.30, style === 'sports-cap' ? 0.19 : 0.15, 0.27);
  } else if (style === 'flat-cap') {
    const crown = addAccessoryMesh(group,
      new THREE.CylinderGeometry(0.14, 0.15, 0.075, 16), main, 'flat_cap_crown');
    crown.rotation.z = -Math.PI / 2;
    crown.position.x = 0.27;
    addBrim(0.28, 0.13, 0.29);
  } else if (style === 'headwrap' || style === 'headband' || style === 'bandana') {
    addBand(style === 'headwrap' ? 0.042 : 0.025, style === 'headwrap' ? 0.16 : 0.115);
    if (style !== 'headband') {
      const knot = addAccessoryMesh(group, new THREE.SphereGeometry(0.045, 8, 6), trim, `${style}_knot`);
      knot.position.set(0.145, 0, 0.115);
      knot.scale.set(0.75, 0.7, 1.2);
    }
  } else if (style === 'beanie') {
    addDome(0.145, 0.23);
    addBand(0.025, 0.23);
    const bobble = addAccessoryMesh(group, new THREE.SphereGeometry(0.035, 8, 6), trim, 'beanie_bobble');
    bobble.position.x = 0.39;
  } else if (style === 'kufi') {
    const cap = addAccessoryMesh(group,
      new THREE.CylinderGeometry(0.125, 0.14, 0.09, 16), main, 'kufi_cap');
    cap.rotation.z = -Math.PI / 2;
    cap.position.x = 0.27;
    const band = addAccessoryMesh(group,
      new THREE.CylinderGeometry(0.143, 0.143, 0.018, 16), trim, 'kufi_trim');
    band.rotation.z = -Math.PI / 2;
    band.position.x = 0.245;
  } else if (style === 'hardhat') {
    addDome(0.155, 0.27);
    const brim = addAccessoryMesh(group,
      new THREE.CylinderGeometry(0.18, 0.17, 0.025, 18), trim, 'hardhat_rim');
    brim.rotation.z = -Math.PI / 2;
    brim.position.x = 0.275;
  }

  group.userData.wardrobeAccessory = style;
  return group;
}

export function applyWardrobe(root, materials, palette, renderOptions = {}) {
  const wardrobe = palette?.wardrobe;
  if (!wardrobe) return null;
  const topStyle = WARDROBE_TOP_STYLES.indexOf(wardrobe.top);
  const bottomStyle = WARDROBE_BOTTOM_STYLES.indexOf(wardrobe.bottom);
  const accent = palette.accent || palette.colors?.shirt || '#67534a';
  const skin = palette.colors?.skin || '#865337';

  for (const material of materials.get('shirt') || []) {
    attachWardrobeMaterial(material, 'shirt', Math.max(0, topStyle), wardrobe.number || 0, accent, skin);
  }
  for (const material of materials.get('pants') || []) {
    attachWardrobeMaterial(material, 'pants', Math.max(0, bottomStyle), wardrobe.number || 0, accent, skin);
  }

  if (wardrobe.backpack === false) {
    root.traverse((object) => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      if (list.some((material) => material?.name === 'Backpack2')) object.visible = false;
    });
  }
  const headwear = attachHeadwear(root, palette, renderOptions);
  root.userData.wardrobe = { ...wardrobe };
  return { topStyle: wardrobe.top, bottomStyle: wardrobe.bottom, headwear: headwear?.name || null };
}

// HDR runtime check: decode the baked file with the actual three.js RGBELoader, make sure it
// carries unclamped radiance, then assert the game's scene uses linear HDR lighting and clear,
// distance-based fog (the old fog blanket is what hid the far platform).
//
//   python3 tools/bake_hdr_sky.py bake
//   node tools/lighting-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { ClimateController, FOG, HDR, setupEnvironment } from '../js/world/Environment.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hdrPath = join(root, 'assets/textures/waterside_sky.hdr');
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
};

if (!existsSync(hdrPath)) {
  console.error(`Missing ${hdrPath}. Run: python3 tools/bake_hdr_sky.py bake`);
  process.exit(2);
}
const bytes = readFileSync(hdrPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const image = new RGBELoader().setDataType(THREE.FloatType).parse(buffer);
const samples = image.data;
let peak = 0;
let peakIndex = 0;
for (let i = 0; i < samples.length; i += 4) {
  const value = Math.max(samples[i], samples[i + 1], samples[i + 2]);
  if (value > peak) { peak = value; peakIndex = i; }
}
const peakRow = Math.floor(peakIndex / 4 / image.width);
const peakColumn = (peakIndex / 4) % image.width;
check('RGBELoader decodes the generated Radiance file', image.width === 512 && image.height === 256,
  `${image.width}x${image.height}, ${samples.constructor.name}`);
check('RGBELoader preserves HDR values above 1.0', peak > 1,
  `peak channel ${peak.toFixed(1)}`);
check('the sun is above the horizon', peakRow > 0 && peakRow < image.height / 2,
  `brightest pixel row ${peakRow}/${image.height}`);
check('the sun sits in the matched equirectangular quadrant',
  peakColumn > image.width * 0.85 && peakColumn < image.width * 0.98,
  `brightest column ${peakColumn}/${image.width} (sun azimuth 146deg)`);
check('HDR sky is loaded from a Vite-resolvable .hdr URL', HDR.url.endsWith('.hdr'), HDR.url);

const scene = new THREE.Scene();
const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 };
const lights = setupEnvironment(scene, renderer);
check('renderer is configured for ACES HDR tone mapping', renderer.toneMapping === THREE.ACESFilmicToneMapping,
  `toneMapping=${renderer.toneMapping}`);
check('HDR is the main ambient fill (not a 2.0 hemisphere wash)',
  lights.sky.intensity <= 0.5 && scene.environmentIntensity === HDR.day,
  `hemisphere ${lights.sky.intensity}; environment ${scene.environmentIntensity}`);
check('default haze starts beyond the whole platform',
  scene.fog.isFog && !scene.fog.isFogExp2 && scene.fog.near >= 50 && scene.fog.far >= 180,
  `linear fog ${scene.fog.near}..${scene.fog.far}`);
check('clear weather has the longest sight line', FOG.clear.far > FOG.rain.far && FOG.clear.far > FOG.haze.far,
  `clear ${FOG.clear.far}, rain ${FOG.rain.far}, harmattan ${FOG.haze.far}`);

const climate = new ClimateController(scene, lights, { mobile: true });
climate.dayProgress = 0.61;
const startWeather = climate.update(0, new THREE.Vector3());
const lightDirection = lights.sun.position.clone().normalize();
const skyDirection = climate.hdrReferenceSun.clone();
check('day-cycle sun agrees with the baked HDR sun at game start',
  lightDirection.distanceTo(skyDirection) < 0.015,
  `direction error ${lightDirection.distanceTo(skyDirection).toFixed(4)}`);
check('climate keeps a readable clear day', startWeather.id === 'clear'
  && scene.fog.near > 50 && scene.fog.far > FOG.clear.far * 0.9,
  `${startWeather.label}, far=${scene.fog.far.toFixed(1)}`);

climate.update(62, new THREE.Vector3());
check('tropical rain is a weather state, not permanent fog',
  climate.weather.id === 'rain' && scene.fog.far < FOG.clear.far && scene.fog.near >= FOG.rain.near * 0.8,
  `rain sight ${scene.fog.near.toFixed(1)}..${scene.fog.far.toFixed(1)}`);
climate.update(62, new THREE.Vector3());
check('harmattan has its own limited horizon',
  climate.weather.id === 'haze' && scene.fog.far < FOG.rain.far,
  `haze sight ${scene.fog.near.toFixed(1)}..${scene.fog.far.toFixed(1)}`);

const cycleScene = new THREE.Scene();
const cycleLights = setupEnvironment(cycleScene);
const cycle = new ClimateController(cycleScene, cycleLights, { mobile: true });
const sunrise = cycle.update(0, new THREE.Vector3());
check('one in-game day takes exactly 15 real minutes', cycle.dayDuration === 15 * 60,
  `${cycle.dayDuration / 60} minutes per 24-hour cycle`);
check('the first half starts at sunrise (06:00)', sunrise.time === 'DAY 01 // 06:00'
  && Math.abs(cycle.dayProgress - 0.25) < 1e-9, sunrise.time);
cycle.update(225, new THREE.Vector3());
check('the first half reaches full daylight at noon', cycle.formatTime() === 'DAY 01 // 12:00'
  && cycleLights.sun.intensity > 2.5, `${cycle.formatTime()}, sun ${cycleLights.sun.intensity.toFixed(2)}`);
cycle.update(225, new THREE.Vector3());
check('7.5 minutes reaches sunset and night lighting', cycle.formatTime() === 'DAY 01 // 18:00'
  && cycleLights.sun.intensity < 0.1 && cycleLights.moon.intensity > 0.35,
  `${cycle.formatTime()}, sun ${cycleLights.sun.intensity.toFixed(2)}, moon ${cycleLights.moon.intensity.toFixed(2)}`);
cycle.update(450, new THREE.Vector3());
check('the next sunrise arrives at 15 minutes and advances the day', cycle.formatTime() === 'DAY 02 // 06:00'
  && Math.abs(cycle.dayProgress - 0.25) < 1e-9, cycle.formatTime());

console.log();
if (failures.length) {
  console.error(`${failures.length} lighting check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`all checks passed — RGBE ${image.width}x${image.height}, HDR peak ${peak.toFixed(1)}, clear range ${FOG.clear.near}..${FOG.clear.far}`);

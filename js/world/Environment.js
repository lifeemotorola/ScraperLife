import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const COLORS = {
  ground: 0x314843, road: 0x293437, roof: 0x1a2426, orange: 0xff7041,
  teal: 0x75c5bb, water: 0x36747c, cream: 0xf4e9d5,
};

// ---- HDR lighting -----------------------------------------------------------------------------
//
// The old lighting was a flat background colour, a hemisphere light at intensity 2 and a
// `FogExp2` at density .028 — at 35 units that fog had already eaten half the contrast, and by
// the far edge of the platform everything was the same grey. That is what read as "foggy": light
// had no *direction* and no *source*, so every surface got the same directionless wash.
//
// Now the ambient term is an image: `tools/bake_hdr_sky.py` bakes an equirectangular HDR sky
// (Radiance RGBE, a real sun at ~55x the sky's brightness), it is loaded with RGBELoader,
// convolved by PMREMGenerator into `scene.environment`, and every MeshStandardMaterial in the
// city is lit by it — sky from above, sun glare from the sun's actual azimuth, ground bounce
// from below. ACESFilmic tone mapping then maps that HDR range onto the screen, which is what
// keeps the sun white-hot while skin and concrete stay mid-range.
export const HDR = {
  url: new URL('../../assets/textures/waterside_sky.hdr', import.meta.url).href,
  exposure: 1.0,
  // Environment intensity is driven by the day cycle (see ClimateController.update).
  day: 1.0,
  dawn: 0.45,
  night: 0.12,
  backgroundBlur: 0.0,
};

// Linear distance fog replaces the exponential one. `near` is where haze starts: with the clear
// sky it starts beyond the whole platform, so the city stays crisp and only the far water and
// the horizon soften. Weather can still pull it in — that is a state, not the default look.
export const FOG = {
  clear: { near: 58, far: 190 },
  rain: { near: 34, far: 128 },
  haze: { near: 26, far: 96 },
};

export function setupEnvironment(scene, renderer = null) {
  // A flat colour until the HDR sky lands (and the fallback if it never does).
  scene.background = new THREE.Color(0x183033);
  scene.fog = new THREE.Fog(0x9dc0c4, FOG.clear.near, FOG.clear.far);
  scene.environmentIntensity = HDR.day;
  scene.backgroundIntensity = HDR.day;
  // With an environment map providing ambient light, the hemisphere light is only a small fill.
  // It used to carry the entire scene at intensity 2, which flattened everything it touched.
  const sky = new THREE.HemisphereLight(0x9fd6e8, 0x2b3a34, .35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffd9b0, 2.6);
  sun.position.set(-18, 26, 11); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -37; sun.shadow.camera.right = 37; sun.shadow.camera.top = 37; sun.shadow.camera.bottom = -37;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x5db1c6, .35); moon.position.set(25, 12, -24); scene.add(moon);
  if (renderer) {
    // HDR pipeline: linear lighting, then ACES maps it into display range.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = HDR.exposure;
  }
  return { sky, sun, moon };
}

// Convolves an equirectangular HDR map into the cube-UV form `scene.environment` needs.
// `pmrem` is injectable so tools/lighting-check.mjs can drive this without a GL context.
export function applyHDREnvironment(scene, texture, { pmrem = null, renderer = null, asBackground = true } = {}) {
  if (!texture) return null;
  const generator = pmrem || (renderer ? new THREE.PMREMGenerator(renderer) : null);
  const environment = generator ? generator.fromEquirectangular(texture).texture : null;
  if (environment) scene.environment = environment;
  if (asBackground) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.backgroundBlurriness = HDR.backgroundBlur;
  }
  // The render target survives; the generator's internal resources do not need to.
  generator?.dispose?.();
  return environment;
}

// A procedural HDR sky, used when the baked .hdr cannot be fetched (offline build, blocked
// asset). It is still real image-based lighting — PMREM renders it into a half-float target, so
// the sun blob keeps values above 1.0 — just not the authored Waterside one.
export function makeProceduralEnvironment(scene, renderer, { pmrem = null } = {}) {
  const generator = pmrem || (renderer ? new THREE.PMREMGenerator(renderer) : null);
  if (!generator) return null;
  const skyScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0.30, 0.72, 1.42) },
      horizon: { value: new THREE.Color(1.55, 1.95, 2.10) },
      ground: { value: new THREE.Color(0.16, 0.19, 0.17) },
      sunDirection: { value: new THREE.Vector3(-0.586, 0.707, 0.395).normalize() },
      sunColor: { value: new THREE.Color(1.0, 0.855, 0.66) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // No colourspace conversion here on purpose: the output goes into a linear half-float
    // target, and values above 1.0 are the point.
    fragmentShader: `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      uniform vec3 sunDirection; uniform vec3 sunColor;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float up = max(direction.y, 0.0);
        vec3 colour = mix(horizon, zenith, pow(up, 0.42));
        colour = mix(ground, colour, smoothstep(-0.06, 0.02, direction.y));
        float facing = max(dot(direction, sunDirection), 0.0);
        colour += sunColor * (pow(facing, 900.0) * 55.0 + pow(facing, 12.0) * 3.0);
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16), material));
  const target = generator.fromScene(skyScene, 0.02);
  if (target?.texture) scene.environment = target.texture;
  material.dispose();
  generator.dispose?.();
  return target?.texture || null;
}

// Loads the baked sky and installs it. Never rejects: if the .hdr is missing the procedural sky
// takes over, so the game is lit by HDR either way and a blocked asset cannot leave it flat.
export function loadHDREnvironment(scene, renderer, { url = HDR.url, onReady = null } = {}) {
  return new Promise((resolve) => {
    const finish = (result) => {
      try { onReady?.(result); } catch (error) { console.warn('HDR onReady handler failed:', error); }
      resolve(result);
    };
    const fallback = (cause) => {
      try {
        const environment = makeProceduralEnvironment(scene, renderer);
        finish({ source: 'procedural', texture: null, environment, error: cause || null });
      } catch (error) {
        // Even a PMREM allocation failure must not leave the boot promise pending.
        console.warn('Procedural HDR fallback failed:', error);
        finish({ source: 'unavailable', texture: null, environment: null, error: cause || error });
      }
    };
    new RGBELoader().load(
      url,
      (texture) => {
        try {
          const environment = applyHDREnvironment(scene, texture, { renderer });
          finish({ source: 'hdr', texture, environment });
        } catch (error) {
          texture.dispose?.();
          fallback(error);
        }
      },
      undefined,
      (error) => fallback(error || new Error(`Could not load HDR map: ${url}`)),
    );
  });
}

/** Drives a compressed day/night cycle and recurring coastal weather. */
export class ClimateController {
  constructor(scene, lights, { mobile = false } = {}) {
    this.scene = scene; this.lights = lights; this.mobile = mobile;
    this.elapsed = 0;
    this.dayProgress = .61; // late afternoon start: 14:38
    this.dayDuration = 300; // five real minutes for one in-game day
    this.weatherIndex = -1;
    this.weather = { id: 'clear', label: 'COASTAL CLEAR', rain: 0, fog: FOG.clear, tint: new THREE.Color(0x6da9a2) };
    this.rain = this.createRain();
    this.night = new THREE.Color(0x07141f);
    this.day = new THREE.Color(0x72aea7);
    this.dawn = new THREE.Color(0xeb8159);
    this.workingColor = new THREE.Color();
    // The baked map's sun starts at the same position as the day-cycle sun at dayProgress=.61.
    // Rotate both environment and background together as the sun moves, so reflections and the
    // actual sky keep agreeing with the shadow-casting DirectionalLight through the full day.
    this.hdrStartSun = new THREE.Vector3(-0.586, 0.707, 0.395).normalize();
    this.sunDirection = new THREE.Vector3();
    this.hdrRotation = new THREE.Quaternion();
    this.hdrEuler = new THREE.Euler();
  }

  createRain() {
    const count = this.mobile ? 360 : 850;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - .5) * 34;
      positions[i * 3 + 1] = Math.random() * 23;
      positions[i * 3 + 2] = (Math.random() - .5) * 34;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xa7d8df, size: .07, transparent: true, opacity: 0, depthWrite: false });
    const rain = new THREE.Points(geometry, material);
    rain.visible = false; this.scene.add(rain); return rain;
  }

  setWeather(index) {
    // `fog` is now a { near, far } range in world units, not an exponential density: haze is a
    // weather state that pulls the horizon in, instead of a permanent grey over the whole map.
    const states = [
      { id: 'clear', label: 'COASTAL CLEAR', rain: 0, fog: FOG.clear, tint: new THREE.Color(0x6da9a2) },
      { id: 'rain', label: 'TROPICAL RAIN', rain: .82, fog: FOG.rain, tint: new THREE.Color(0x385d67) },
      { id: 'haze', label: 'HARMATTAN HAZE', rain: 0, fog: FOG.haze, tint: new THREE.Color(0xb8a77a) },
    ];
    this.weatherIndex = index; this.weather = states[index];
  }

  update(delta, playerPosition) {
    this.elapsed += delta;
    this.dayProgress = (this.dayProgress + delta / this.dayDuration) % 1;
    const weatherIndex = Math.floor(this.elapsed / 62) % 3;
    const changed = weatherIndex !== this.weatherIndex;
    if (changed) this.setWeather(weatherIndex);

    // At 06:00 the sun rises; at 12:00 it reaches its highest point.
    const solarAngle = this.dayProgress * Math.PI * 2 - Math.PI / 2;
    const daylight = Math.max(0, Math.sin(solarAngle));
    const horizon = Math.max(0, 1 - Math.abs(Math.sin(solarAngle) * 2.4));
    const radius = 42;
    this.lights.sun.position.set(Math.cos(solarAngle) * radius, Math.sin(solarAngle) * radius, 18);
    this.sunDirection.copy(this.lights.sun.position).normalize();
    this.hdrRotation.setFromUnitVectors(this.hdrStartSun, this.sunDirection);
    this.hdrEuler.setFromQuaternion(this.hdrRotation);
    this.scene.environmentRotation?.copy(this.hdrEuler);
    this.scene.backgroundRotation?.copy(this.hdrEuler);
    // The HDR environment is the ambient term now, so the direct lights are much smaller than
    // they used to be. Pushing them back up on top of the sky is what washed the city out.
    this.lights.sun.intensity = .04 + daylight * 2.6;
    this.lights.moon.intensity = .05 + (1 - daylight) * .35;
    this.lights.moon.position.set(-Math.cos(solarAngle) * radius, -Math.sin(solarAngle) * radius, -18);
    this.lights.sky.intensity = .10 + daylight * .30;

    this.workingColor.copy(this.night).lerp(this.day, daylight);
    if (horizon > .05) this.workingColor.lerp(this.dawn, horizon * .46);
    this.workingColor.lerp(this.weather.tint, this.weather.id === 'clear' ? .08 : .24);
    // The background may be the HDR sky texture (not a colour) once the environment has loaded;
    // a texture is dimmed with backgroundIntensity, a fallback colour is dimmed by copying.
    if (this.scene.background?.isColor) this.scene.background.copy(this.workingColor);

    // Day/night now dims the *light coming from the sky map*, which is what an HDR environment
    // is for: at night the same map still lights the streets, just far weaker.
    const environmentIntensity = HDR.night + (HDR.day - HDR.night) * daylight;
    this.scene.environmentIntensity = environmentIntensity + horizon * HDR.dawn * .35;
    this.scene.backgroundIntensity = environmentIntensity * 1.25 + horizon * .25;

    this.scene.fog.color.copy(this.workingColor);
    const range = this.weather.fog;
    // Night pulls the horizon a little closer; the clear day still sees the whole platform.
    const nightPull = (1 - daylight) * .18;
    this.scene.fog.near = range.near * (1 - nightPull);
    this.scene.fog.far = range.far * (1 - nightPull);

    this.updateRain(delta, playerPosition);
    return { changed, id: this.weather.id, label: this.weather.label, time: this.formatTime() };
  }

  updateRain(delta, playerPosition) {
    const active = this.weather.rain > 0;
    this.rain.visible = active;
    this.rain.material.opacity += ((active ? this.weather.rain * .62 : 0) - this.rain.material.opacity) * Math.min(1, delta * 2.2);
    if (!active || !playerPosition) return;
    this.rain.position.set(playerPosition.x, 0, playerPosition.z);
    const positions = this.rain.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      let y = positions.getY(i) - delta * 19;
      if (y < 0) {
        y = 20 + Math.random() * 6;
        positions.setX(i, (Math.random() - .5) * 34);
        positions.setZ(i, (Math.random() - .5) * 34);
      }
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }

  formatTime() {
    const totalMinutes = Math.floor(this.dayProgress * 24 * 60);
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `DAY 01 // ${hours}:${minutes}`;
  }
}

export function road(scene, x, z, width, height, axis = 'x') {
  const geometry = axis === 'x' ? new THREE.PlaneGeometry(width, height) : new THREE.PlaneGeometry(height, width);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .012, z); mesh.receiveShadow = true; scene.add(mesh);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? width - 2 : .18, axis === 'x' ? .16 : width - 2), new THREE.MeshBasicMaterial({ color: 0xdfb965, transparent: true, opacity: .45 }));
  stripe.rotation.x = -Math.PI / 2; stripe.position.set(x, .025, z); scene.add(stripe);
}

// Soft round sprite shared by all glow effects (lamp halos, scrap shimmer, flashes).
let glowTexture = null;
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.25, 'rgba(255,255,255,.5)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

// Decorative glows are drawn as additive points instead of PointLights. Each PointLight adds per-pixel
// lighting work to every lit material in the scene, so dozens of them made the whole frame slow.
// All glows in one call share a single draw call; setColor(index, 0) hides one glow.
export function addGlowPoints(scene, glows, { size = 2, opacity = 1 } = {}) {
  const positions = new Float32Array(glows.length * 3);
  const colors = new Float32Array(glows.length * 3);
  const color = new THREE.Color();
  glows.forEach((glow, index) => {
    positions.set([glow.x, glow.y, glow.z], index * 3);
    color.setHex(glow.color);
    colors.set([color.r, color.g, color.b], index * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute('color', colorAttribute);
  const material = new THREE.PointsMaterial({
    size, map: getGlowTexture(), vertexColors: true, sizeAttenuation: true, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points,
    setColor(index, hex) {
      color.setHex(hex);
      colorAttribute.setXYZ(index, color.r, color.g, color.b);
      colorAttribute.needsUpdate = true;
    },
  };
}

// Single glow sprite for one-off effects (a flash or a restored light). Returns the sprite so callers can remove it.
export function addGlowSprite(scene, position, color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.position.copy(position); sprite.scale.set(size, size, 1);
  scene.add(sprite);
  return sprite;
}

// A small fixed pool of real PointLights that follows the player: each light is moved to one of the lamps
// nearest the player. The light count never changes, so shaders are not recompiled, and the number of lights
// stays far below one per lamp. This keeps the streets lit at night at a fraction of the per-pixel cost.
export class LampLightPool {
  constructor(scene, lamps, count) {
    this.lamps = lamps; this.lastX = Infinity; this.lastZ = Infinity;
    this.lights = Array.from({ length: count }, () => {
      const light = new THREE.PointLight(0xffad62, 3.5, 10); light.position.y = 3.9; scene.add(light); return light;
    });
  }
  update(playerPosition) {
    const { x, z } = playerPosition;
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 1.5) return; // re-pick only after the player moves
    this.lastX = x; this.lastZ = z;
    const nearest = this.lamps
      .map((lamp) => ({ lamp, distance: (lamp.x - x) ** 2 + (lamp.z - z) ** 2 }))
      .sort((a, b) => a.distance - b.distance);
    this.lights.forEach((light, index) => {
      const lamp = nearest[index]?.lamp;
      if (lamp) light.position.set(lamp.x, 3.9, lamp.z);
    });
  }
}

export function lamp(scene, x, z, glows) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 4.2, 7), new THREE.MeshStandardMaterial({ color: 0x22312f, metalness: .5 }));
  stem.position.y = 2.1; group.add(stem);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc36c }));
  bulb.position.y = 4.1; group.add(bulb);
  scene.add(group);
  glows.push({ x, y: 3.9, z, color: 0xffad62 });
}

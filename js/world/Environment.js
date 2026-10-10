import * as THREE from 'three';

export const COLORS = {
  ground: 0x314843, road: 0x293437, roof: 0x1a2426, orange: 0xff7041,
  teal: 0x75c5bb, water: 0x36747c, cream: 0xf4e9d5,
};

export function setupEnvironment(scene) {
  scene.background = new THREE.Color(0x183033);
  scene.fog = new THREE.FogExp2(0x183033, .028);
  const sky = new THREE.HemisphereLight(0x86bbb4, 0x23302b, 2);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffd6a5, 2.4);
  sun.position.set(-18, 26, 11); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -37; sun.shadow.camera.right = 37; sun.shadow.camera.top = 37; sun.shadow.camera.bottom = -37;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x5db1c6, 1); moon.position.set(25, 12, -24); scene.add(moon);
  return { sky, sun, moon };
}

/** Drives a compressed day/night cycle and recurring coastal weather. */
export class ClimateController {
  constructor(scene, lights, { mobile = false } = {}) {
    this.scene = scene; this.lights = lights; this.mobile = mobile;
    this.elapsed = 0;
    this.dayProgress = .61; // late afternoon start: 14:38
    this.dayDuration = 300; // five real minutes for one in-game day
    this.weatherIndex = -1;
    this.weather = { id: 'clear', label: 'COASTAL CLEAR', rain: 0, fog: .022, tint: new THREE.Color(0x6da9a2) };
    this.rain = this.createRain();
    this.night = new THREE.Color(0x07141f);
    this.day = new THREE.Color(0x72aea7);
    this.dawn = new THREE.Color(0xeb8159);
    this.workingColor = new THREE.Color();
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
    const states = [
      { id: 'clear', label: 'COASTAL CLEAR', rain: 0, fog: .022, tint: new THREE.Color(0x6da9a2) },
      { id: 'rain', label: 'TROPICAL RAIN', rain: .82, fog: .036, tint: new THREE.Color(0x385d67) },
      { id: 'haze', label: 'HARMATTAN HAZE', rain: 0, fog: .047, tint: new THREE.Color(0xb8a77a) },
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
    this.lights.sun.intensity = .06 + daylight * 2.45;
    this.lights.moon.intensity = .08 + (1 - daylight) * 1.05;
    this.lights.moon.position.set(-Math.cos(solarAngle) * radius, -Math.sin(solarAngle) * radius, -18);
    this.lights.sky.intensity = .65 + daylight * 1.35;

    this.workingColor.copy(this.night).lerp(this.day, daylight);
    if (horizon > .05) this.workingColor.lerp(this.dawn, horizon * .46);
    this.workingColor.lerp(this.weather.tint, this.weather.id === 'clear' ? .08 : .24);
    this.scene.background.copy(this.workingColor);
    this.scene.fog.color.copy(this.workingColor);
    this.scene.fog.density = this.weather.fog + (1 - daylight) * .009;

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

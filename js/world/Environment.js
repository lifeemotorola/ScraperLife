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

export function lamp(scene, x, z) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 4.2, 7), new THREE.MeshStandardMaterial({ color: 0x22312f, metalness: .5 }));
  stem.position.y = 2.1; group.add(stem);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc36c }));
  bulb.position.y = 4.1; group.add(bulb);
  const light = new THREE.PointLight(0xffad62, 1.9, 8); light.position.y = 3.9; group.add(light); scene.add(group);
}

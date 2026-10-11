import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

// The rigged COLLADA character (assets/textures/markie.dae) is authored facing +X,
// not +Z like the rest of the game assumes (the group's +Z is the "forward" that
// rotation.y = atan2(dx, dz) aligns with the walking direction). Verified against the
// loaded asset: width 1.05 on X, 5.9 on Z (T-pose arms), toes pointing +X.
// Without this quarter turn, Markie strafes sideways the whole time.
export const DAE_FORWARD_YAW = -Math.PI / 2;

export function makeHumanoid(shirt, skin, { backpack = false } = {}) {
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(.48, .88, .35), new THREE.MeshStandardMaterial({ color: 0x22302f, roughness: 1 }));
  legs.position.y = .52; legs.castShadow = true; group.add(legs);
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: shirt, roughness: .75 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.36, .55, 4, 10), torsoMaterial);
  torso.position.y = 1.31; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 10), new THREE.MeshStandardMaterial({ color: skin, roughness: .9 }));
  head.position.y = 1.93; head.castShadow = true; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.285, 10, 7, 0, Math.PI * 2, 0, Math.PI * .47), new THREE.MeshStandardMaterial({ color: 0x1d1713, roughness: 1 }));
  hair.position.y = 2.02; group.add(hair);
  if (backpack) {
    // -Z is the character's back: forward is +Z for every humanoid in this game.
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.44, .58, .16), new THREE.MeshStandardMaterial({ color: 0xc36a31, roughness: .8 }));
    pack.position.set(0, 1.28, -.31); pack.castShadow = true; group.add(pack);
  }
  group.userData = { torso, legs };
  return group;
}

export class Player {
  constructor(scene, spawn = new THREE.Vector3(-16, 0, 13)) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(spawn);
    this.fallback = makeHumanoid(0x31595b, 0xe2a071, { backpack: true });
    this.group.add(this.fallback);
    this.lastSafe = spawn.clone();
    this.glow = new THREE.PointLight(0x75c5bb, .55, 5);
    this.glow.position.set(0, 2, 0); this.group.add(this.glow);
    scene.add(this.group);
  }
  get position() { return this.group.position; }

  // Loads the included COLLADA character. The procedural character remains as a safe fallback if loading fails.
  loadDAE(url, onReady) {
    const loader = new ColladaLoader();
    loader.load(url, (collada) => {
      const model = collada.scene;
      model.name = 'MarkieRiggedDAECharacter';
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true; object.receiveShadow = true;
        if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
        // The CC0 source mesh is neutral grey; this grounded skin tone gives the prototype a Markie-specific look.
        const styleMaterial = (material) => {
          material.color?.setHex(0x5a2d1c);
          material.roughness = .72;
          material.metalness = 0;
          material.flatShading = false;
          material.needsUpdate = true;
        };
        if (Array.isArray(object.material)) object.material.forEach(styleMaterial);
        else if (object.material) styleMaterial(object.material);
      });
      model.scale.set(1.05, 1.05, 1.05);
      model.position.y = 0;
      model.rotation.y = DAE_FORWARD_YAW;
      this.fallback.visible = false;
      this.model = model;
      if (collada.animations?.length) {
        this.mixer = new THREE.AnimationMixer(model);
        this.walkAction = this.mixer.clipAction(collada.animations[0]);
        this.walkAction.play();
        this.walkAction.paused = true;
      }
      this.group.add(model);
      onReady?.(this.getCharacterHeight());
    }, undefined, () => {
      // Keep the procedural model visible if a browser cannot load the DAE asset.
      this.fallback.visible = true;
      onReady?.(this.getCharacterHeight());
    });
  }

  getCharacterHeight() {
    const character = this.model || this.fallback;
    character.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(character);
    return bounds.max.y - bounds.min.y;
  }

  update(delta, input, physics, time) {
    const { x, z, running } = input.getMovement();
    const moving = Boolean(x || z);
    if (moving) {
      const direction = new THREE.Vector3(x, 0, z).normalize();
      const speed = running ? 7.2 : 4.25;
      const step = speed * delta;
      const next = this.position.clone().addScaledVector(direction, step);
      if (physics.canMove(next)) {
        this.position.copy(next);
      } else {
        // Blocked head-on (wall corner): slide along whichever axis still has room.
        // Without this, pushing toward a wall only turns Markie in place.
        const slideX = this.position.clone(); slideX.x += direction.x * step;
        const slideZ = this.position.clone(); slideZ.z += direction.z * step;
        if (physics.canMove(slideX)) this.position.copy(slideX);
        else if (physics.canMove(slideZ)) this.position.copy(slideZ);
      }
      this.lastSafe.copy(this.position);
      physics.constrain(this.position);
      this.group.rotation.y = Math.atan2(direction.x, direction.z);
      this.fallback.userData.legs.position.y = .52 + Math.sin(time * 13) * .035;
      if (this.model) this.model.position.y = Math.abs(Math.sin(time * 13)) * .018;
    }
    if (this.mixer) {
      this.walkAction.paused = !moving;
      this.walkAction.timeScale = running ? 1.35 : 1;
      this.mixer.update(delta);
    }
  }
  recover() { this.position.copy(this.lastSafe); }
}

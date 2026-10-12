import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { instantiateCharacter, loadSharedCharacter } from './CharacterRig.js';

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
    // Which playable character this player wears (multiplayer picks; Markie by default).
    this.characterId = 'markie';
    this.sharedRig = null;
    this.paletteData = null;
    this.instance = null;
    this.lastSafe = spawn.clone();
    this.glow = new THREE.PointLight(0x75c5bb, .55, 5);
    this.glow.position.set(0, 2, 0); this.group.add(this.glow);
    scene.add(this.group);

    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashMultiplier = 1;
    this.dashBaseCooldown = 1.1;
    this.dashTrails = [];
  }
  get position() { return this.group.position; }

  triggerDash(speedMultiplier = 1, cooldownReduction = 1) {
    if (this.dashCooldown > 0) return false;
    this.dashTimer = 0.22;
    this.dashMultiplier = speedMultiplier;
    this.dashCooldown = this.dashBaseCooldown * cooldownReduction;
    this.createDashGhost();
    return true;
  }

  isDashing() {
    return this.dashTimer > 0;
  }

  createDashGhost() {
    if (!this.scene) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.58, 16),
      new THREE.MeshBasicMaterial({ color: 0x75c5bb, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.position.x, 0.08, this.position.z);
    this.scene.add(ring);
    this.dashTrails.push({ mesh: ring, life: 0.25, maxLife: 0.25 });
  }

  updateDashTrails(delta) {
    for (let i = this.dashTrails.length - 1; i >= 0; i--) {
      const trail = this.dashTrails[i];
      trail.life -= delta;
      trail.mesh.scale.multiplyScalar(1 + delta * 2.2);
      trail.mesh.material.opacity = Math.max(0, (trail.life / trail.maxLife) * 0.75);
      if (trail.life <= 0) {
        this.scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        trail.mesh.material.dispose();
        this.dashTrails.splice(i, 1);
      }
    }
  }

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

  // Loads the rigged GLB produced by tools/rig_and_animate.py (fbx/Survival_Character.fbx
  // authored to this repo's conventions: faces +Z, feet on y=0, `height` units tall) through the
  // SAME shared instance the whole cast is cloned from, so Markie and the fifteen NPCs cost one
  // download and one glTF parse between them. `palettes` is assets/models/character_palettes.json;
  // characters.markie gives him his own skin and outfit (the exported materials are leftover
  // greys, pinks and greens, so without it Markie is the wrong colour too).
  // On any failure it hands over to `fallback` (the COLLADA character), then to the procedural
  // humanoid - the game must always show *a* Markie.
  loadGLB(url, { manifest = null, palettes = null, fallback = null, onReady } = {}) {
    Promise.all([
      loadSharedCharacter(url, { manifest }),
      Promise.resolve(palettes).catch(() => null),
    ]).then(([shared, paletteData]) => {
      this.sharedRig = shared;
      this.paletteData = paletteData;
      this.installCharacter();
      onReady?.(this.getCharacterHeight());
    }).catch(() => {
      if (fallback) fallback();
      else {
        this.fallback.visible = true;
        onReady?.(this.getCharacterHeight());
      }
    });
  }

  // Puts the body for `this.characterId` on the group, replacing any body already there. Returns
  // false until the shared rig has loaded; loadGLB calls it again when the rig arrives, so a pick
  // made during loading still applies.
  installCharacter() {
    if (!this.sharedRig) return false;
    const palette = this.paletteData?.characters?.[this.characterId] || null;
    if (this.instance) {
      this.group.remove(this.instance.root);
      for (const list of this.instance.materials?.values?.() || []) {
        for (const material of list) material?.dispose?.();
      }
    }
    const instance = instantiateCharacter(this.sharedRig, { palette, paletteData: this.paletteData, cull: false });
    this.instance = instance;
    this.fallback.visible = false;
    this.model = instance.root;
    this.materials = instance.materials;
    this.animator = instance.animator?.hasClips ? instance.animator : null;
    this.group.add(instance.root);
    return true;
  }

  // Multiplayer: change which character this player is. Position and story progress are untouched.
  setCharacter(characterId) {
    this.characterId = characterId;
    return this.installCharacter();
  }

  // One-shot reaction ("pulse", "hit", "interact", "celebrate"); no-ops on a model with no clips.
  play(state) {
    this.animator?.trigger?.(state);
  }

  getCharacterHeight() {
    const character = this.model || this.fallback;
    character.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(character);
    return bounds.max.y - bounds.min.y;
  }

  update(delta, input, physics, time) {
    this.updateDashTrails(delta);
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    }

    const { x, z, running } = input.getMovement();
    const moving = Boolean(x || z);

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - delta);
      const dashSpeed = 16.0 * this.dashMultiplier;
      const step = dashSpeed * delta;
      const dir = moving
        ? new THREE.Vector3(x, 0, z).normalize()
        : new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
      const next = this.position.clone().addScaledVector(dir, step);
      if (physics.canMove(next)) {
        this.position.copy(next);
      } else {
        const slideX = this.position.clone(); slideX.x += dir.x * step;
        const slideZ = this.position.clone(); slideZ.z += dir.z * step;
        if (physics.canMove(slideX)) this.position.copy(slideX);
        else if (physics.canMove(slideZ)) this.position.copy(slideZ);
      }
      this.lastSafe.copy(this.position);
      physics.constrain(this.position);
      this.group.rotation.y = Math.atan2(dir.x, dir.z);
    } else if (moving) {
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
      // The procedural bob stands in for leg animation; a real rig already has knee bend in
      // its walk clip, so adding the bob on top would double it.
      if (this.model && !this.animator) this.model.position.y = Math.abs(Math.sin(time * 13)) * .018;
    }
    if (this.animator) {
      this.animator.setLocomotion({ moving, running });
      this.animator.update(delta);
    } else if (this.mixer) {
      this.walkAction.paused = !moving;
      this.walkAction.timeScale = running ? 1.35 : 1;
      this.mixer.update(delta);
    }
  }
  recover() { this.position.copy(this.lastSafe); }
}

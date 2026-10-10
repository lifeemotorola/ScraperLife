import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { MobileController } from './MobileController.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { UIManager } from './UIManager.js';
import { Player } from '../entities/Player.js';
import { NPC } from '../entities/NPC.js';
import { Enemy } from '../entities/Enemy.js';
import { ScrapPulse } from '../entities/Weapon.js';
import { City } from '../world/City.js';
import { ClimateController, setupEnvironment, COLORS } from '../world/Environment.js';
import { MissionSystem } from '../systems/MissionSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { DIALOGUE } from '../data/dialogues.js';

export class Game {
  init() {
    this.running = false;
    this.time = 0;
    this.isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.scene = new THREE.Scene();
    this.lighting = setupEnvironment(this.scene);
    this.climate = new ClimateController(this.scene, this.lighting, { mobile: this.isMobile });
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 120);
    this.camera.position.set(-16, 12, 25);
    this.cameraTarget = new THREE.Vector3(); this.cameraLook = new THREE.Vector3();
    this.cameraModes = [
      { label: 'ACTION VIEW', offset: new THREE.Vector3(1.7, 4.8, 8.6), lookHeight: 1.65, ahead: 2.3, fov: 58, smooth: .10 },
      { label: 'WIDE VIEW', offset: new THREE.Vector3(0, 10.4, 14.5), lookHeight: 1.0, ahead: 2.4, fov: 60, smooth: .075 },
      { label: 'CITY VIEW', offset: new THREE.Vector3(0, 18, 18), lookHeight: .3, ahead: 1.4, fov: 66, smooth: .055 },
    ];
    this.cameraIndex = 1;
    this.cameraOrbitYaw = 0;
    this.cameraOrbitPitch = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isMobile ? 1.25 : 2)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = !this.isMobile;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.clock = new THREE.Clock();

    this.ui = new UIManager();
    this.inventory = new InventorySystem();
    this.missions = new MissionSystem(this.inventory);
    this.dialogue = new DialogueSystem(this.ui, DIALOGUE);
    this.combat = new CombatSystem();
    this.physics = new PhysicsEngine();
    this.city = new City(this.scene, this.physics); this.city.build();
    this.player = new Player(this.scene);
    this.pulse = new ScrapPulse(this.scene);
    this.npcs = this.createNPCs();
    this.enemies = [new Enemy(this.scene, { position: [19, -7] }), new Enemy(this.scene, { position: [10, 1] })];
    this.matchCharacterHeights(this.player.getCharacterHeight());
    this.player.loadDAE(new URL('../../assets/textures/markie.dae', import.meta.url).href, (height) => this.matchCharacterHeights(height));
    this.scrap = this.createScrap();
    this.input = new InputManager({
      element: this.renderer.domElement,
      onInteract: () => this.interact(),
      onPulse: () => this.usePulse(),
      onCamera: () => this.cycleCamera(),
      onLook: (deltaX, deltaY) => this.dragCamera(deltaX, deltaY),
    });
    this.mobileController = new MobileController(this.input);
    this.ui.bindStart(() => this.start(), () => location.reload());
    this.ui.setCameraView(this.cameraModes[this.cameraIndex].label);
    window.addEventListener('resize', () => this.resize());
    this.updateQuest();
    this.animate();
  }

  createNPCs() {
    const people = [
      { id: 'kollie', label: 'OLD MAN KOLLIE', position: [-4, -3], shirt: 0x6a5540, skin: 0x6d4432, quote: DIALOGUE.truth },
      { id: 'tenneh', label: 'TENNEH', position: [16, 13], shirt: 0x783d73, skin: 0x8a4d43, quote: DIALOGUE.tenneh },
      { id: 'flomo', label: 'FLOMO', position: [-18, 13], shirt: 0x3b6781, skin: 0x6b382a, quote: DIALOGUE.firstScrap },
      { id: 'sia', label: 'SIA', position: [-11, 4], shirt: 0xd28942, skin: 0x6d4432, quote: 'SIA: “Mister Markie, those men keep asking about you.”' },
      { id: 'garmai', label: 'GARMAI', position: [4, 13], shirt: 0x4d6a91, skin: 0x7f4638, quote: 'GARMAI: “The market hears every secret before it reaches the street.”' },
      { id: 'boakai', label: 'BOAKAI', position: [21, -3], shirt: 0x6b6540, skin: 0x57301f, quote: 'BOAKAI: “I trade in tools, not trouble.”' },
      { id: 'jallah', label: 'JALLAH', position: [-22, 1], shirt: 0x407665, skin: 0x6a3825, quote: 'JALLAH: “Respect does not come free around here.”' },
      { id: 'togar', label: 'TOGAR', position: [13, -4], shirt: 0x5e3030, skin: 0x4a291f, quote: 'TOGAR: “Vardee has eyes everywhere.”' },
      { id: 'vardee', label: 'VARDEE', position: [-22, -16], shirt: 0x54252a, skin: 0x4a291f, quote: 'VARDEE: “Every street has a price, Markie.”' },
    ];
    return Object.fromEntries(people.map((data) => [data.id, new NPC(this.scene, data)]));
  }

  matchCharacterHeights(markieHeight) {
    const everyone = [...Object.values(this.npcs || {}), ...(this.enemies || [])];
    everyone.forEach((character) => character.setHeight(markieHeight));
  }

  createScrap() {
    const locations = [[-14,10],[-21,-4],[-9,4],[4,13],[10,5],[18,15],[23,-18],[-1,-17],[7,-8],[18,-26],[0,26],[-25,25]];
    return locations.map(([x,z], index) => {
      const group = new THREE.Group(); group.position.set(x, .32, z);
      const metal = new THREE.Mesh(new THREE.IcosahedronGeometry(.31, 0), new THREE.MeshStandardMaterial({ color: 0xa9b3ac, metalness: .85, roughness: .23, emissive: 0x1b4946, emissiveIntensity: .3 }));
      metal.rotation.set(index, index * .6, 0); group.add(metal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.45,.018,6,20),new THREE.MeshBasicMaterial({color:COLORS.teal,transparent:true,opacity:.65}));
      ring.rotation.x = Math.PI / 2; ring.position.y = -.28; group.add(ring);
      const light = new THREE.PointLight(COLORS.teal, 1.4, 4); light.position.y = .4; group.add(light);
      group.userData = { baseY: .32, phase: index * .8, collected: false };
      this.scene.add(group); return group;
    });
  }

  start() {
    this.running = true; this.ui.startGame(); this.ui.toast('JOB STARTED // THE WEIGHT OF TRUTH'); this.dialogue.play('opening', 6);
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }
  cycleCamera() {
    this.cameraIndex = (this.cameraIndex + 1) % this.cameraModes.length;
    const view = this.cameraModes[this.cameraIndex];
    this.ui.setCameraView(view.label);
    if (this.running) this.ui.toast(`CAMERA // ${view.label}`);
  }
  dragCamera(deltaX, deltaY) {
    // Mouse and touch dragging orbit the camera while preserving Markie's movement controls.
    this.cameraOrbitYaw -= deltaX * .008;
    this.cameraOrbitPitch = THREE.MathUtils.clamp(this.cameraOrbitPitch - deltaY * .005, -.42, .38);
  }

  getInteraction() {
    let closest = null; let distance = 1.75;
    for (const scrap of this.scrap) {
      if (scrap.userData.collected) continue;
      const nextDistance = this.player.position.distanceTo(scrap.position);
      if (nextDistance < distance) { distance = nextDistance; closest = { type: 'scrap', object: scrap, text: 'PICK UP SALVAGED SCRAP' }; }
    }
    if (this.missions.canRepair && this.player.position.distanceTo(this.city.generatorPosition) < 2.6) closest = { type: 'radio', text: 'REPAIR KOLLIE’S RADIO' };
    if (this.missions.is('mentor') && this.npcs.kollie.distanceTo(this.player.position) < 2.5) closest = { type: 'kollie', text: 'ASK KOLLIE ABOUT YOUR PARENTS' };
    if (this.missions.is('market') && this.npcs.tenneh.distanceTo(this.player.position) < 2.5) closest = { type: 'tenneh', text: 'TALK TO TENNEH' };
    if (!closest) {
      const sideCharacter = Object.values(this.npcs).find((npc) => npc.distanceTo(this.player.position) < 1.8 && !['kollie', 'tenneh'].includes(npc.id));
      if (sideCharacter) closest = { type: 'npc', object: sideCharacter, text: `TALK TO ${sideCharacter.id.toUpperCase()}` };
    }
    return closest;
  }

  interact() {
    if (!this.running || !this.interaction) return;
    const hit = this.interaction;
    if (hit.type === 'scrap') {
      hit.object.userData.collected = true; hit.object.visible = false;
      const total = this.inventory.collectScrap(); this.ui.toast(`SALVAGE SECURED // ${total} PIECE${total === 1 ? '' : 'S'}`);
      if (total === 1) this.dialogue.play('firstScrap', 4);
      if (total === 7) { this.ui.toast('ALL MATERIALS FOUND // RETURN TO KOLLIE'); this.dialogue.play('allScrap', 5); }
      this.updateQuest();
    } else if (hit.type === 'radio' && this.missions.repairRadio()) {
      this.city.activateRadio(); this.ui.toast('KOLLIE’S RADIO RESTORED'); this.dialogue.play('radioFixed', 6); this.updateQuest();
    } else if (hit.type === 'kollie' && this.missions.speakWithKollie()) {
      this.ui.toast('CASE NOTE ADDED // VARDEE + KORMAH'); this.dialogue.play('truth', 7); this.updateQuest();
    } else if (hit.type === 'tenneh' && this.missions.speakWithTenneh()) {
      this.ui.toast('NEW LEAD // VARDEE’S MARKET RUNNERS'); this.dialogue.play('tenneh', 7); this.updateQuest();
      setTimeout(() => { this.running = false; this.ui.completeGame(this.inventory.scrap); }, 3500);
    } else if (hit.type === 'npc') {
      this.ui.subtitle(hit.object.quote, 4);
    }
  }

  usePulse() {
    if (!this.running) return;
    const stunned = this.pulse.activate(this.player.position, this.enemies);
    if (stunned === null) return;
    this.ui.toast(stunned ? `SCRAP PULSE // ${stunned} WATCH${stunned > 1 ? 'ES' : ''} DISRUPTED` : 'SCRAP PULSE // AREA CLEAR');
  }

  updateQuest() { this.ui.updateQuest(this.missions.mission, this.inventory.scrap); }
  updateCamera() {
    const view = this.cameraModes[this.cameraIndex];
    const up = new THREE.Vector3(0, 1, 0);
    const yaw = this.player.group.rotation.y + this.cameraOrbitYaw;
    const playerForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, this.player.group.rotation.y);
    const offset = view.offset.clone().applyAxisAngle(up, yaw);
    const horizontalDistance = Math.hypot(view.offset.x, view.offset.z);
    offset.y += this.cameraOrbitPitch * horizontalDistance;
    this.cameraTarget.copy(this.player.position).add(offset);
    this.camera.position.lerp(this.cameraTarget, view.smooth);
    this.cameraLook.copy(this.player.position).addScaledVector(playerForward, view.ahead);
    this.cameraLook.y += view.lookHeight + this.cameraOrbitPitch * 2.2;
    this.camera.lookAt(this.cameraLook);
    const nextFov = this.camera.fov + (view.fov - this.camera.fov) * .12;
    if (Math.abs(nextFov - this.camera.fov) > .01) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }
  }
  objectiveTarget() {
    if (this.missions.canRepair) return this.city.generatorPosition;
    if (this.missions.is('mentor')) return this.npcs.kollie.position;
    if (this.missions.is('market')) return this.npcs.tenneh.position;
    if (this.missions.is('gather')) return this.scrap.find((piece) => !piece.userData.collected)?.position || this.city.generatorPosition;
    return new THREE.Vector3(14, 0, -13);
  }
  update(delta) {
    this.player.update(delta, this.input, this.physics, this.time);
    for (const scrap of this.scrap) { if (!scrap.userData.collected) { scrap.position.y = scrap.userData.baseY + Math.sin(this.time * 2 + scrap.userData.phase) * .11; scrap.rotation.y += delta * .85; } }
    Object.values(this.npcs).forEach((npc, index) => npc.update(this.time, index));
    this.combat.update(delta); this.pulse.update(delta);
    this.enemies.forEach((enemy) => {
      if (enemy.update(delta, this.time, this.player.position) && this.combat.takePressure(12)) {
        this.ui.toast('VARDEE’S WATCH // STAY MOVING');
        if (this.combat.resolve <= 0) { this.player.recover(); this.combat.recover(); this.ui.toast('MARKIE TAKES A BREATH // BACK ON YOUR FEET'); }
      }
    });
    this.interaction = this.getInteraction();
    if (this.interaction) this.ui.showInteraction(this.interaction.text); else this.ui.hideInteraction();
    this.ui.updateStatus({ resolve: this.combat.resolve, pulse: this.pulse.charge, player: this.player.position, target: this.objectiveTarget() });
  }
  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), .05); this.time += delta;
    const climate = this.climate.update(delta, this.player.position);
    this.ui.updateWorldInfo(climate);
    if (climate.changed && this.running) this.ui.toast(`CLIMATE SHIFT // ${climate.label}`);
    if (this.running) this.update(delta);
    this.updateCamera(); this.renderer.render(this.scene, this.camera);
  }
}

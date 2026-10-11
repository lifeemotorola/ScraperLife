import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { MobileController } from './MobileController.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { UIManager } from './UIManager.js';
import { Player } from '../entities/Player.js';
import { NPC } from '../entities/NPC.js';
import { PlayerCrowdActor } from '../entities/PlayerCrowdActor.js';
import { Enemy } from '../entities/Enemy.js';
import { ScrapPulse } from '../entities/Weapon.js';
import { City } from '../world/City.js';
import { ClimateController, addGlowPoints, setupEnvironment, loadHDREnvironment, COLORS } from '../world/Environment.js';
import { loadPalettes, loadSharedCharacter } from '../entities/CharacterRig.js';
import { CrowdSystem, CROWD_TUNING } from '../systems/CrowdSystem.js';
import { MissionSystem } from '../systems/MissionSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { VoiceSystem } from '../systems/VoiceSystem.js';
import { MusicSystem } from '../systems/MusicSystem.js';
import { SoundEffectsSystem } from '../systems/SoundEffectsSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { DIALOGUE } from '../data/dialogues.js';

// Camera rigs, expressed as an offset from Markie. Negative Z is BEHIND him, so the
// camera looks the way he is heading and "up" on the stick always walks away from the
// camera (up the screen). Keep both conventions in sync with InputManager.getMovement().
export const CAMERA_MODES = [
  { label: 'ACTION VIEW', offset: new THREE.Vector3(1.7, 4.8, -8.6), lookHeight: 1.65, ahead: 2.3, fov: 58, smooth: .10 },
  { label: 'WIDE VIEW', offset: new THREE.Vector3(0, 10.4, -14.5), lookHeight: 1.0, ahead: 2.4, fov: 60, smooth: .075 },
  { label: 'CITY VIEW', offset: new THREE.Vector3(0, 22, -24), lookHeight: .3, ahead: 1.4, fov: 66, smooth: .055 },
  { label: 'PLATFORM VIEW', offset: new THREE.Vector3(0, 32, -32), lookHeight: -1.2, ahead: 0.5, fov: 70, smooth: .045 },
];

export class Game {
  init() {
    this.running = false;
    this.time = 0;
    this.footstepTimer = 0;
    this.isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 180);
    this.camera.position.set(-16, 12, -4);
    this.cameraTarget = new THREE.Vector3(); this.cameraLook = new THREE.Vector3();
    this.cameraModes = CAMERA_MODES;
    this.cameraIndex = 1;
    // Camera yaw is a world angle owned by the player (drag to look / CAM to recenter).
    // It is NOT welded to Markie's facing, so the view never whips around when he turns.
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    // Pixel ratio drives fill-rate cost (x4 at DPR 2), so desktop is capped at 1.5 for smoother frames.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isMobile ? 1.25 : 1.5)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Desktop re-renders the sun's shadow map on a timer (see animate) instead of every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = !this.isMobile;
    this.shadowTimer = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.lighting = setupEnvironment(this.scene, this.renderer);
    this.climate = new ClimateController(this.scene, this.lighting, { mobile: this.isMobile });
    this.hdrReady = false;
    this.hdrPromise = loadHDREnvironment(this.scene, this.renderer).then((result) => {
      this.hdrReady = Boolean(result?.environment);
      this.hdrSource = result?.source || 'fallback';
      return result;
    }).catch((error) => {
      // The procedural environment is the normal failure fallback; this is only a last-ditch
      // guard for a WebGL/context error during PMREM generation.
      console.warn('HDR lighting could not initialize:', error);
      this.hdrReady = false;
      this.hdrSource = 'flat fallback';
      return null;
    });
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.clock = new THREE.Clock();

    this.ui = new UIManager();
    this.inventory = new InventorySystem();
    this.missions = new MissionSystem(this.inventory);
    this.voice = new VoiceSystem();
    this.music = new MusicSystem();
    this.sfx = new SoundEffectsSystem();
    this.dialogue = new DialogueSystem(this.ui, DIALOGUE, this.voice);
    this.combat = new CombatSystem();
    this.physics = new PhysicsEngine({ limit: 48 });
    this.city = new City(this.scene, this.physics); this.city.build({ lampLightCount: this.isMobile ? 3 : 5 });
    // (-16, 0, 10) stands on the open street by Kollie Radio Works; findFree guarantees
    // the spawn never lands inside a building collider again (that reads as Markie
    // rotating in place, unable to move).
    const spawn = this.physics.findFree(new THREE.Vector3(-16, 0, 10));
    this.player = new Player(this.scene, spawn);
    this.pulse = new ScrapPulse(this.scene);
    this.npcs = this.createNPCs();
    this.enemies = [
      new Enemy(this.scene, { id: 'watch-east-1', position: [19, -7] }),
      new Enemy(this.scene, { id: 'watch-market-2', position: [10, 1] }),
      new Enemy(this.scene, { id: 'watch-docks-3', position: [34, -12] }),
      new Enemy(this.scene, { id: 'watch-harbor-4', position: [-28, -18] }),
      new Enemy(this.scene, { id: 'watch-warehouse-5', position: [5, -28] }),
    ];
    this.enemies.forEach((enemy) => {
      const free = this.physics.findFree(enemy.position, 0.35, 12);
      enemy.position.copy(free);
      enemy.home.copy(free);
    });
    // All ten story residents and all five of Vardee's watch share the same AI: stroll, stop
    // inside a pair's greeting radius, turn to face each other, and speak a greeting or lecture.
    // Markie is included as a non-wandering actor so a player who walks up to a resident gets a
    // greeting too; the adapter cannot take over the actual player input.
    this.markieCrowdActor = new PlayerCrowdActor(this.player);
    this.crowd = new CrowdSystem([this.markieCrowdActor, ...Object.values(this.npcs), ...this.enemies], this.physics, {
      onExchange: ({ kind, opener, responder, position }) => {
        if (position.distanceTo(this.player.position) > CROWD_TUNING.hearRadius) return;
        if (this.voice.abortConversation || (this.voice.currentAudio && this.voice.player && !this.voice.player.paused)) return;
        this.ui.toast(kind === 'lecture'
          ? `${opener.label} HAS A WORD FOR ${responder.label}`
          : `${opener.label} AND ${responder.label} // STREET TALK`, 2300);
      },
      onLine: ({ person, text, seconds, exchange }) => {
        if (exchange.position.distanceTo(this.player.position) > CROWD_TUNING.hearRadius) return;
        // Ambient talk never cuts across a recorded story line or an active voice conversation.
        if (this.voice.abortConversation || (this.voice.currentAudio && this.voice.player && !this.voice.player.paused)) return;
        if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return;
        // Recorded story clips stay mission-only; ambient chatter uses the voice profile/TTS so
        // the same line can belong to any resident.
        this.dialogue.playText(`${person.label}: “${text}”`, seconds);
      },
    });
    this.matchCharacterHeights(this.player.getCharacterHeight());
    // The single rig every character uses (tools/rig_and_animate.py) and the generated colour
    // sheet (tools/character_palette.py). loadSharedCharacter caches the promise, so Markie and
    // every NPC share one 5.3 MB GLB download and one parse; each gets only a skeleton+material
    // instance. The authored DAE remains Markie's fallback if the GLB is missing.
    this.characterModelUrl = new URL('../../assets/models/survival_character.glb', import.meta.url).href;
    this.characterManifestUrl = new URL('../../assets/models/survival_character.character.json', import.meta.url).href;
    this.characterPaletteUrl = new URL('../../assets/models/character_palettes.json', import.meta.url).href;
    const daeUrl = new URL('../../assets/textures/markie.dae', import.meta.url).href;
    const loadDAE = () => this.player.loadDAE(daeUrl, (height) => this.matchCharacterHeights(height));
    this.characterPalettesPromise = loadPalettes(this.characterPaletteUrl);
    this.sharedCharacterPromise = loadSharedCharacter(this.characterModelUrl, {
      manifest: this.characterManifestUrl,
    });
    this.player.loadGLB(this.characterModelUrl, {
      manifest: this.characterManifestUrl,
      palettes: this.characterPalettesPromise,
      fallback: loadDAE,
      onReady: (height) => this.matchCharacterHeights(height),
    });
    Promise.all([this.sharedCharacterPromise, this.characterPalettesPromise]).then(([shared, palettes]) => {
      const everyone = [...Object.values(this.npcs), ...this.enemies];
      for (const character of everyone) {
        character.adoptRig(shared, palettes?.characters?.[character.paletteId] || null, palettes);
      }
      this.matchCharacterHeights(shared.height || this.player.getCharacterHeight());
    }).catch((error) => {
      // Keep the procedural models visible if the GLB is genuinely unavailable. This also makes
      // the cause observable in the console instead of failing silently behind the intro screen.
      console.warn('Shared character rig could not load; keeping placeholder people:', error);
    });
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
    this.ui.bindVoiceToggle(() => {
      const on = this.voice.toggle();
      this.ui.toast(on ? 'VOICES // ON' : 'VOICES // OFF');
      if (on) this.voice.unlock();
      return on;
    });
    this.ui.setVoiceState(this.voice.enabled);
    this.ui.bindMusicToggle(() => {
      const on = this.music.toggle();
      this.ui.toast(on ? 'MUSIC // ON' : 'MUSIC // OFF');
      return on;
    });
    this.ui.setMusicState(this.music.enabled);
    this.ui.setCameraView(this.cameraModes[this.cameraIndex].label);
    window.addEventListener('resize', () => this.resize());
    this.updateQuest();
    this.animate();
  }

  createNPCs() {
    const people = [
      { id: 'kollie', label: 'OLD MAN KOLLIE', role: 'Mentor', voice: 'lecturer', accent: 0x9fd7ff,
        position: [-4, -3], home: [-4, -3], wanderRadius: 8, quote: DIALOGUE.truth, quoteId: 'truth' },
      { id: 'tenneh', label: 'TENNEH', role: 'Love interest', voice: 'greeter', accent: 0xffb454,
        position: [16, 13], home: [16, 13], wanderRadius: 7, quote: DIALOGUE.tenneh, quoteId: 'tenneh' },
      { id: 'flomo', label: 'FLOMO', role: 'Best friend', voice: 'greeter', accent: 0xa8d26a,
        position: [-18, 13], home: [-18, 13], wanderRadius: 8, quote: DIALOGUE.flomoSupport, quoteId: 'flomoSupport' },
      { id: 'sia', label: 'SIA', role: 'Street kid', voice: 'greeter', accent: 0xffd08a,
        position: [-11, 4], home: [-11, 4], wanderRadius: 6, quote: DIALOGUE.siaThanks, quoteId: 'siaThanks' },
      { id: 'garmai', label: 'GARMAI', role: 'Information broker', voice: 'lecturer', accent: 0xc760b0,
        position: [4, 13], home: [4, 13], wanderRadius: 7, quote: DIALOGUE.garmaiWhisper, quoteId: 'garmaiWhisper' },
      { id: 'boakai', label: 'BOAKAI', role: 'Equipment fixer', voice: 'greeter', accent: 0xd8c07a,
        position: [32, -3], home: [32, -3], wanderRadius: 8, quote: DIALOGUE.boakai, quoteId: 'boakai' },
      // Jallah's authored position sat inside the Night Clinic collision box; move his anchor to
      // the Old Harbor side of the same district so he can actually take a step.
      { id: 'jallah', label: 'JALLAH', role: 'Rival', voice: 'greeter', accent: 0xff6b5e,
        position: [-29, 12], home: [-29, 12], wanderRadius: 8, quote: DIALOGUE.jallahRival, quoteId: 'jallahRival' },
      { id: 'togar', label: 'TOGAR', role: 'Lieutenant', voice: 'lecturer', accent: 0x9aa7b0,
        position: [13, -4], home: [13, -4], wanderRadius: 9, quote: DIALOGUE.togarWarning, quoteId: 'togarWarning' },
      { id: 'vardee', label: 'VARDEE', role: 'Antagonist', voice: 'lecturer', accent: 0xff3b3b,
        position: [-22, -16], home: [-22, -16], wanderRadius: 9, quote: DIALOGUE.vardeeConfront, quoteId: 'vardeeConfront' },
      { id: 'kormah', label: 'KORMAH', role: 'Corrupt official', voice: 'lecturer', accent: 0xbca36a,
        position: [24, -7], home: [24, -7], wanderRadius: 7, quote: DIALOGUE.kormah, quoteId: 'kormah' },
    ];
    return Object.fromEntries(people.map((data) => {
      const npc = new NPC(this.scene, data);
      // Any authored position inside a building gets nudged to the nearest walkable point before
      // it becomes the home anchor. The residents can always move from where they spawn.
      const free = this.physics.findFree(npc.position, 0.35, 12);
      npc.position.copy(free);
      npc.home.copy(free);
      return [data.id, npc];
    }));
  }

  matchCharacterHeights(markieHeight) {
    const everyone = [...Object.values(this.npcs || {}), ...(this.enemies || [])];
    everyone.forEach((character) => character.setHeight(markieHeight));
    this.markieCrowdActor?.setHeight(markieHeight);
  }

  createScrap() {
    // Expanded platform: 20 scrap sites across 92-unit sector, still need 7 for radio
    const locations = [
      [-14,10],[-21,-4],[-9,4],[4,13],[10,5],[18,15],[23,-18],[-1,-17],
      [7,-8],[18,-26],[0,26],[-25,25],
      [-32,-10], [34, 8], [-8,-32], [30, 22], [-30,32], [10,-34], [36,-20], [-36, 6]
    ];
    const glows = [];
    const scrap = locations.map(([x,z], index) => {
      const group = new THREE.Group(); group.position.set(x, .32, z);
      const metal = new THREE.Mesh(new THREE.IcosahedronGeometry(.31, 0), new THREE.MeshStandardMaterial({ color: 0xa9b3ac, metalness: .85, roughness: .23, emissive: 0x1b4946, emissiveIntensity: .3 }));
      metal.rotation.set(index, index * .6, 0); group.add(metal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.45,.018,6,20),new THREE.MeshBasicMaterial({color:COLORS.teal,transparent:true,opacity:.65}));
      ring.rotation.x = Math.PI / 2; ring.position.y = -.28; group.add(ring);
      // Each piece's teal shimmer is a glow point (not a PointLight); it is hidden when the piece is collected.
      glows.push({ x, y: .72, z, color: COLORS.teal });
      group.userData = { baseY: .32, phase: index * .8, collected: false, glowIndex: index };
      this.scene.add(group); return group;
    });
    this.scrapGlow = addGlowPoints(this.scene, glows, { size: 1.6, opacity: .9 });
    return scrap;
  }

  start() {
    this.running = true; this.ui.startGame();
    // Music must begin inside the start-button gesture so mobile browsers permit playback.
    this.music.start();
    this.sfx.unlock();
    // Unlocks speech inside the same gesture so the opening line can play over the music.
    this.voice.unlock();
    this.ui.toast('JOB STARTED // THE WEIGHT OF TRUTH'); this.dialogue.play('opening', 6);
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }
  cycleCamera() {
    this.cameraIndex = (this.cameraIndex + 1) % this.cameraModes.length;
    const view = this.cameraModes[this.cameraIndex];
    // Cycling the view also swings the camera back behind Markie, so a lost player can
    // always recover the "forward = up the screen" framing with one tap.
    this.cameraYaw = this.player.group.rotation.y;
    this.ui.setCameraView(view.label);
    if (this.running) this.ui.toast(`CAMERA // ${view.label}`);
  }
  dragCamera(deltaX, deltaY) {
    this.cameraYaw -= deltaX * .008;
    // Drag down = look down at Markie, drag up = level out toward the horizon.
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + deltaY * .005, -.42, .38);
  }

  getInteraction() {
    let closest = null; let distance = 1.9;
    for (const scrap of this.scrap) {
      if (scrap.userData.collected) continue;
      const nextDistance = this.player.position.distanceTo(scrap.position);
      if (nextDistance < distance) { distance = nextDistance; closest = { type: 'scrap', object: scrap, text: 'PICK UP SALVAGED SCRAP' }; }
    }
    // Platform missions: priority to current objective
    if (this.missions.canRepair && this.player.position.distanceTo(this.city.generatorPosition) < 2.8) closest = { type: 'radio', text: 'REPAIR KOLLIE’S RADIO' };
    else if (this.missions.is('mentor') && this.npcs.kollie.distanceTo(this.player.position) < 2.8) closest = { type: 'kollie', text: 'ASK KOLLIE ABOUT YOUR PARENTS' };
    else if (this.missions.is('market') && this.npcs.tenneh.distanceTo(this.player.position) < 2.8) closest = { type: 'tenneh', text: 'TALK TO TENNEH' };
    else if (this.missions.is('complete') ) {
      // auto-advance after Tenneh; prompt is to go to docks, not interaction — but allow quick advance
      if (this.npcs.tenneh.distanceTo(this.player.position) < 2.2) closest = { type: 'tenneh_complete', text: 'CONTINUE // HEAD TO DOCKS [M]' };
    }
    else if (this.missions.is('docks') && this.npcs.boakai.distanceTo(this.player.position) < 2.8) closest = { type: 'boakai', text: 'TALK TO BOAKAI — DOCKS' };
    else if (this.missions.is('boakai') && this.npcs.boakai.distanceTo(this.player.position) < 2.5) closest = { type: 'boakai2', text: 'ASK ABOUT WAREHOUSE 6' };
    else if (this.missions.is('warehouse') || this.missions.is('boakai')) {
      const ledgerDist = this.player.position.distanceTo(this.city.ledgerPos);
      if (ledgerDist < 2.6) closest = { type: 'ledger', text: this.missions.is('warehouse') ? 'RETRIEVE RUSTED LEDGER' : 'INVESTIGATE WAREHOUSE 6' };
      // also catch Boakai if warehouse phase but close to him
    }
    else if (this.missions.is('vardee') && this.npcs.vardee.distanceTo(this.player.position) < 2.8) closest = { type: 'vardee', text: 'CONFRONT VARDEE' };
    else if (this.missions.is('finale') && this.npcs.tenneh.distanceTo(this.player.position) < 2.8) closest = { type: 'finale', text: 'DELIVER LEDGER TO TENNEH' };
    else if (this.missions.is('finale') && this.npcs.sia.distanceTo(this.player.position) < 2.2) closest = { type: 'finale_sia', text: 'REASSURE SIA' };

    if (!closest) {
      const sideCharacter = Object.values(this.npcs).find((npc) => npc.distanceTo(this.player.position) < 1.9 && !['kollie', 'tenneh','boakai','vardee'].includes(npc.id));
      if (sideCharacter) closest = { type: 'npc', object: sideCharacter, text: `TALK TO ${sideCharacter.id.toUpperCase()}` };
    }
    return closest;
  }

  interact() {
    if (!this.running || !this.interaction) return;
    const hit = this.interaction;
    if (hit.type === 'scrap') this.sfx.play('pickup');
    else if (hit.type === 'radio') this.sfx.play('repair');
    else this.sfx.play('interact', 0.8);
    if (hit.type === 'scrap') {
      hit.object.userData.collected = true; hit.object.visible = false; this.scrapGlow.setColor(hit.object.userData.glowIndex, 0);
      const total = this.inventory.collectScrap(); this.ui.toast(`SALVAGE SECURED // ${total} PIECE${total === 1 ? '' : 'S'}`);
      this.player.play('interact');   // reach-down on the piece he just lifted
      if (total === 1) this.dialogue.play('firstScrap', 4);
      if (total === 7) { this.ui.toast('ALL MATERIALS FOUND // RETURN TO KOLLIE'); this.dialogue.play('allScrap', 5); }
      this.updateQuest();
    } else if (hit.type === 'radio' && this.missions.repairRadio()) {
      this.city.activateRadio(); this.ui.toast('KOLLIE’S RADIO RESTORED // + PLATFORM MAP UNLOCKED'); this.dialogue.play('radioFixed', 6); this.updateQuest();
    } else if (hit.type === 'kollie' && this.missions.speakWithKollie()) {
      this.ui.toast('CASE NOTE ADDED // VARDEE + KORMAH'); this.updateQuest();
      // Kollie speaks twice: the accusation, then the memory of Markie's parents.
      this.dialogue.playConversation(['truth', 'kollieParents'], null, { truth: 7, kollieParents: 8 });
    } else if (hit.type === 'tenneh' && this.missions.speakWithTenneh()) {
      // market -> complete
      this.ui.toast('NEW LEAD // VARDEE’S MARKET RUNNERS'); this.dialogue.play('tenneh', 7); this.updateQuest();
      // Auto-advance complete -> docks after brief reflection, keep platform flowing
      setTimeout(() => {
        if (this.missions.completeToDocks()) {
          this.ui.toast('CHAPTER 1 COMPLETE // NEW JOB: HARBOR LIGHTS');
          this.dialogue.play('boakai', 5);
          this.updateQuest();
        }
      }, 3400);
    } else if (hit.type === 'tenneh_complete') {
      if (this.missions.completeToDocks()) {
        this.ui.toast('JOB CHAIN CONTINUES // HARBOR LIGHTS'); this.updateQuest();
      }
    } else if (hit.type === 'boakai' && this.missions.speakWithBoakai()) {
      this.ui.toast('BOAKAI: WAREHOUSE 6 HOLDS THE PROOF'); this.dialogue.play('boakai', 6); this.updateQuest();
      // Immediately push to warehouse phase after acknowledging
      setTimeout(() => { if (this.missions.enterWarehouse()) { this.ui.toast('OBJECTIVE // ENTER WAREHOUSE 6'); this.updateQuest(); } }, 1200);
    } else if (hit.type === 'boakai2' && this.missions.enterWarehouse()) {
      this.ui.toast('WAREHOUSE 6 // LEDGER INSIDE'); this.updateQuest();
      this.dialogue.playConversation(['boakai', 'boakaiProof'], null, { boakai: 6, boakaiProof: 7 });
    } else if (hit.type === 'ledger') {
      // Ledger pickup: supports both boakai->warehouse entry and warehouse->vardee collection
      if (this.missions.is('boakai') && this.missions.enterWarehouse()) {
        this.ui.toast('ENTERED WAREHOUSE 6 // SEARCHING...'); this.updateQuest();
        setTimeout(() => this.tryCollectLedger(), 600);
      } else if (this.missions.is('warehouse')) {
        this.tryCollectLedger();
      } else if (this.missions.is('boakai')) {
        this.tryCollectLedger();
      }
    } else if (hit.type === 'vardee' && this.missions.confrontVardee()) {
      this.ui.toast('VARDEE CONFRONTED // TRUTH HAS A PRICE'); this.updateQuest();
      // A three-voice standoff: Vardee threatens, Togar warns, Markie stands his ground.
      this.dialogue.playConversation(
        ['vardeeConfront', 'togarWarning', 'markieResolve'],
        null,
        { vardeeConfront: 6, togarWarning: 5, markieResolve: 6 },
      );
      this.city.ledger?.light && (this.city.ledger.light.intensity = 0);
    } else if ((hit.type === 'finale' || hit.type === 'finale_sia') && this.missions.speakWithTenneh()) {
      // finale -> finale_complete is handled via MissionSystem speakWithTenneh when in finale
      // Our MissionSystem expects speakWithTenneh for finale as well
      // Manually handle finale delivery
      if (this.missions.phase === 'finale') {
        // need to trigger speakWithTenneh for finale
        this.missions.phase = 'finale_complete';
      }
      this.ui.toast('LEDGER DELIVERED // THE MARKET WILL REMEMBER'); this.updateQuest();
      this.player.play('celebrate');
      // A real spoken exchange closes the chapter: Tenneh answers the market, Markie
      // reads the truth aloud, and Sia asks what it all means. The completion screen
      // waits for the conversation instead of cutting the voices off.
      this.dialogue.playConversation(
        ['finale', 'warehouse', 'siaThanks', 'siaHope', 'tennehTogether'],
        () => setTimeout(() => { this.running = false; this.ui.completeGame(this.inventory.scrap, this.missions.totalMissions); }, 900),
        { finale: 7, warehouse: 6, siaThanks: 5, siaHope: 7, tennehTogether: 6 },
      );
    } else if (hit.type === 'npc') {
      // Voice the side character with their recorded clip when one exists.
      if (hit.object.quoteId) this.dialogue.play(hit.object.quoteId, 4);
      else this.dialogue.playText(hit.object.quote, 4);
    }
  }

  tryCollectLedger() {
    if (!this.missions.is('warehouse')) return;
    if (this.missions.collectLedger()) {
      this.sfx.play('pickup', 0.82);
      this.city.collectLedger();
      this.ui.toast('LEDGER SECURED // TAKE IT TO VARDEE'); this.dialogue.play('warehouse', 6); this.updateQuest();
    }
  }

  usePulse() {
    if (!this.running) return;
    const stunned = this.pulse.activate(this.player.position, this.enemies);
    if (stunned === null) return;
    this.sfx.play('pulse', stunned > 0 ? 1 : 0.82);
    this.player.play('pulse');
    this.ui.toast(stunned ? `SCRAP PULSE // ${stunned} WATCH${stunned > 1 ? 'ES' : ''} DISRUPTED` : 'SCRAP PULSE // AREA CLEAR');
  }

  updateQuest() { this.ui.updateQuest(this.missions.mission, this.inventory.scrap); }
  updateCamera() {
    const view = this.cameraModes[this.cameraIndex];
    const up = new THREE.Vector3(0, 1, 0);
    const yaw = this.cameraYaw;
    const offset = view.offset.clone().applyAxisAngle(up, yaw);
    const horizontalDistance = Math.hypot(view.offset.x, view.offset.z);
    offset.y += this.cameraPitch * horizontalDistance;
    this.cameraTarget.copy(this.player.position).add(offset);
    this.camera.position.lerp(this.cameraTarget, view.smooth);
    // Aim a little past Markie along the direction the camera faces, so he stays framed
    // even when he runs across the screen instead of straight away from the camera.
    const cameraForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, yaw);
    this.cameraLook.copy(this.player.position).addScaledVector(cameraForward, view.ahead);
    this.cameraLook.y += view.lookHeight + this.cameraPitch * 2.2;
    this.camera.lookAt(this.cameraLook);
    // Yaw the player actually sees through — this is the frame stick/key input is read in
    // (see update), so "up" is exactly up the screen even in the off-centre ACTION VIEW.
    this.viewYaw = Math.atan2(this.cameraLook.x - this.camera.position.x, this.cameraLook.z - this.camera.position.z);
    const nextFov = this.camera.fov + (view.fov - this.camera.fov) * .12;
    if (Math.abs(nextFov - this.camera.fov) > .01) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }
  }
  objectiveTarget() {
    if (this.missions.canRepair) return this.city.generatorPosition;
    if (this.missions.is('mentor')) return this.npcs.kollie.position;
    if (this.missions.is('market')) return this.npcs.tenneh.position;
    if (this.missions.is('complete')) return this.npcs.tenneh.position;
    if (this.missions.is('docks')) return this.npcs.boakai.position;
    if (this.missions.is('boakai')) return this.city.warehousePos;
    if (this.missions.is('warehouse')) return this.city.ledgerPos;
    if (this.missions.is('vardee')) return this.npcs.vardee.position;
    if (this.missions.is('finale')) return this.npcs.tenneh.position;
    if (this.missions.is('gather')) return this.scrap.find((piece) => !piece.userData.collected)?.position || this.city.generatorPosition;
    return this.npcs.tenneh.position;
  }
  update(delta) {
    // Stick/keys are read in the camera's frame (see InputManager.getMovement), using the
    // yaw the player can actually see, so up/right on the pad are up/right on screen.
    this.input.setCameraYaw(this.viewYaw ?? this.cameraYaw);
    const moveState = this.input.getMovement();
    const previousX = this.player.position.x;
    const previousZ = this.player.position.z;
    this.player.update(delta, this.input, this.physics, this.time);
    const travel = Math.hypot(this.player.position.x - previousX, this.player.position.z - previousZ);
    if (travel > 0.002) {
      const stepInterval = moveState.running ? 0.34 : 0.48;
      this.footstepTimer += delta;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer %= stepInterval;
        this.sfx.play('footstep', moveState.running ? 1 : 0.78);
      }
    } else {
      this.footstepTimer = 0;
    }
    for (const scrap of this.scrap) { if (!scrap.userData.collected) { scrap.position.y = scrap.userData.baseY + Math.sin(this.time * 2 + scrap.userData.phase) * .11; scrap.rotation.y += delta * .85; } }
    // ledger hover
    if (this.city.ledger?.ledger?.visible) {
      this.city.ledger.ledger.rotation.y += delta * 0.6;
      this.city.ledger.ledger.position.y = 1.42 + Math.sin(this.time * 2.5) * 0.07;
    }
    this.crowd.update(delta, this.player.position);
    this.combat.update(delta); this.pulse.update(delta);
    this.enemies.forEach((enemy) => {
      if (enemy.threaten(delta, this.time, this.player.position) && this.combat.takePressure(12)) {
        this.sfx.play('impact');
        this.player.play('hit');   // recoil clip; ignored when the model has no clips
        this.ui.toast('VARDEE’S WATCH // STAY MOVING');
        if (this.combat.resolve <= 0) { this.player.recover(); this.combat.recover(); this.ui.toast('MARKIE TAKES A BREATH // BACK ON YOUR FEET'); }
      }
    });
    this.interaction = this.getInteraction();
    if (this.interaction) this.ui.showInteraction(this.interaction.text); else this.ui.hideInteraction();
    this.ui.updateStatus({
      resolve: this.combat.resolve,
      pulse: this.pulse.charge,
      player: this.player.position,
      target: this.objectiveTarget(),
      missionTitle: this.missions.mission.title,
      npcs: this.npcs,
    });
  }
  // The sun moves slowly, so its shadow map does not need a full re-render every frame.
  updateShadows(delta) {
    if (this.isMobile) return; // mobile keeps shadows off, as before
    this.shadowTimer += delta;
    if (this.shadowTimer >= 1 / 30) { this.shadowTimer = 0; this.renderer.shadowMap.needsUpdate = true; }
  }
  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), .05); this.time += delta;
    const climate = this.climate.update(delta, this.player.position);
    this.ui.updateWorldInfo(climate);
    if (climate.changed && this.running) this.ui.toast(`CLIMATE SHIFT // ${climate.label}`);
    if (this.running) this.update(delta);
    this.city.updateLamps(this.player.position);
    this.updateShadows(delta);
    this.updateCamera(); this.renderer.render(this.scene, this.camera);
  }
}

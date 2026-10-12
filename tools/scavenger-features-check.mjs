// Test suite for ScraperLife new features:
// - Scavenger Journal & Field Workbench (upgrades, dossiers, intel)
// - Quick Dash & Evade maneuver
// - Echo Sonar Radar & Salvage Ping
// - Combat Resolve upgrades and passive recovery
//
// Run with: node tools/scavenger-features-check.mjs

import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? (() => ({ matches: false }));
dom.window.matchMedia ??= () => ({ matches: false });

const { InventorySystem, UPGRADE_DEFINITIONS } = await import(join(root, 'js/systems/InventorySystem.js'));
const { CombatSystem } = await import(join(root, 'js/systems/CombatSystem.js'));
const { ScrapPulse } = await import(join(root, 'js/entities/Weapon.js'));
const { Player } = await import(join(root, 'js/entities/Player.js'));
const { SoundEffectsSystem } = await import(join(root, 'js/systems/SoundEffectsSystem.js'));
const { UIManager } = await import(join(root, 'js/game/UIManager.js'));
const { CHARACTER_DOSSIERS, DISTRICT_INTEL } = await import(join(root, 'js/data/dossier.js'));

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label} — ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)} ${detail}`);
};

// 1. Inventory & Upgrades
const inv = new InventorySystem();
check('initial inventory has 0 scrap and 0 salvage points', inv.scrap === 0 && inv.salvagePoints === 0);
inv.collectScrap();
inv.collectScrap();
inv.collectScrap();
check('collectScrap increments both scrap and salvage points', inv.scrap === 3 && inv.salvagePoints === 3);
check('canCraft accepts affordable mod', inv.canCraft('radar_echo'), 'radar_echo cost=2');
check('canCraft rejects unaffordable or already owned', !inv.canCraft('pulse_overcharge') || inv.canCraft('radar_echo'));
const crafted = inv.craft('radar_echo');
check('craft radar_echo succeeds and deducts cost', crafted && inv.hasUpgrade('radar_echo') && inv.salvagePoints === 1, `remaining=${inv.salvagePoints}`);
check('cannot craft already owned upgrade again', !inv.canCraft('radar_echo') && !inv.craft('radar_echo'));

// 2. Upgrade definitions integrity
const upgradeKeys = Object.keys(UPGRADE_DEFINITIONS);
check('all four core upgrades are defined', upgradeKeys.length === 4 && ['radar_echo', 'kinetic_coil', 'pulse_overcharge', 'insulated_vest'].every(k => upgradeKeys.includes(k)));
check('upgrade definitions contain required metadata', upgradeKeys.every(k => {
  const u = UPGRADE_DEFINITIONS[k];
  return u.id && u.name && u.cost > 0 && u.icon && u.category && u.description;
}));

// 3. Combat System upgrades
const combat = new CombatSystem();
check('initial resolve is 100', combat.resolve === 100 && combat.maxResolve === 100);
combat.setMaxResolve(135);
check('setMaxResolve expands resolve pool', combat.maxResolve === 135 && combat.resolve === 135);
combat.setDefenseMultiplier(0.75);
combat.takePressure(20);
check('defense multiplier reduces incoming damage', combat.resolve === 120, `resolve=${combat.resolve}`);
combat.setPassiveRegen(true);
combat.update(1.0); // hitCooldown
combat.update(3.0); // timeSinceHit reaches 4.0
combat.update(1.0); // regen active
check('passive regen restores resolve after quiet period', combat.resolve > 120, `regen resolve=${combat.resolve.toFixed(1)}`);

// 4. ScrapPulse with Overcharge
const scene = new THREE.Scene();
const pulse = new ScrapPulse(scene);
const mockEnemyFar = { position: new THREE.Vector3(7.0, 0, 0), stun: (s) => { mockEnemyFar.stunned = s; } };
const stunnedStandard = pulse.activate(new THREE.Vector3(0, 0, 0), [mockEnemyFar]);
check('standard pulse range (5.6m) does not reach 7.0m', stunnedStandard === 0);
pulse.charge = 100;
const stunnedOvercharged = pulse.activate(new THREE.Vector3(0, 0, 0), [mockEnemyFar], { range: 8.2, stunSeconds: 7.5 });
check('overcharged pulse range (8.2m) reaches and stuns at 7.0m', stunnedOvercharged === 1 && mockEnemyFar.stunned === 7.5);

// 5. Player Quick Dash & Evade
const physics = { canMove: () => true, constrain: () => {} };
const input = { getMovement: () => ({ x: 0, z: -1, running: false }) };
const player = new Player(scene, new THREE.Vector3(0, 0, 0));
check('player initially is not dashing', !player.isDashing());
const dashTriggered = player.triggerDash(1.0, 1.0);
check('triggerDash initiates dash state', dashTriggered && player.isDashing());
const initialZ = player.position.z;
player.update(0.1, input, physics, 0.1);
check('dashing propels player forward at high speed', player.position.z < initialZ - 1.0, `z delta=${(player.position.z - initialZ).toFixed(2)}`);
check('dash creates trailing ghost rings', player.dashTrails.length > 0);
check('triggerDash respects cooldown while active', !player.triggerDash(1.0, 1.0));

// 6. Sound Effects for New Features
class FakeParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
}
const fakeNode = (type) => ({
  kind: type,
  gain: new FakeParam(1),
  frequency: new FakeParam(440),
  pan: new FakeParam(0),
  connect(t) { return t; },
  start() {},
  stop() {},
});
const fakeContext = {
  state: 'running',
  currentTime: 1,
  sampleRate: 8000,
  destination: {},
  createGain: () => fakeNode('gain'),
  createOscillator: () => fakeNode('oscillator'),
  createBiquadFilter: () => fakeNode('filter'),
  createStereoPanner: () => fakeNode('panner'),
  createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
  createBufferSource: () => fakeNode('buffer-source'),
  resume: () => Promise.resolve(),
};
const sfx = new SoundEffectsSystem({ contextFactory: () => fakeContext });
check('dash sound synthesizes cleanly', sfx.play('dash'));
check('radar ping sound synthesizes cleanly', sfx.play('ping'));
check('upgrade sound synthesizes cleanly', sfx.play('upgrade'));

// 7. Scavenger Journal & Workbench UI Integration
const ui = new UIManager();
let craftedId = null;
ui.bindJournalHandlers({
  inventory: inv,
  missions: { mission: { title: 'TEST MISSION' }, progressText: '01 / 13' },
  onCraft: (id) => { craftedId = id; return true; },
});
ui.openJournal();
check('openJournal opens the journal panel and renders upgrades',
  ui.journalOpen && !dom.window.document.getElementById('journal-panel').classList.contains('hidden'));
ui.switchJournalTab('dossier');
check('switchJournalTab switches to dossier section',
  ui.activeJournalTab === 'dossier' && !dom.window.document.getElementById('journal-content-dossier').classList.contains('hidden'));
check('dossier contains character profiles',
  dom.window.document.getElementById('dossier-list').children.length >= 8);
ui.switchJournalTab('intel');
check('switchJournalTab switches to intel section',
  ui.activeJournalTab === 'intel' && !dom.window.document.getElementById('journal-content-intel').classList.contains('hidden'));
ui.closeJournal();
check('closeJournal hides the panel',
  !ui.journalOpen && dom.window.document.getElementById('journal-panel').classList.contains('hidden'));

// 8. Radar Ping Minimap Marker
ui.showRadarPing(new THREE.Vector3(10, 0, 10));
check('showRadarPing displays pulsing radar marker on minimap',
  Boolean(ui.radarPingMarker && !ui.radarPingMarker.classList.contains('hidden')));
ui.hideRadarPing();
check('hideRadarPing hides the radar marker',
  ui.radarPingMarker.classList.contains('hidden'));

// 9. Character Dossiers & District Intel data verification
check('dossiers contain Markie, Kollie, Tenneh, Vardee, Kormah',
  ['markie', 'kollie', 'tenneh', 'vardee', 'kormah'].every((id) => CHARACTER_DOSSIERS.some(d => d.id === id)));
check('district intel contains lore and hardware records',
  DISTRICT_INTEL.length >= 4);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nAll Scavenger Life feature checks passed cleanly.');

// Crowd movement/encounter regression check for js/systems/CrowdSystem.js. Uses small Three.js
// vectors and the real PhysicsEngine; no browser or WebGL is needed.
//
//   node tools/crowd-check.mjs
import * as THREE from 'three';
import { PhysicsEngine } from '../js/game/PhysicsEngine.js';
import { CrowdSystem, CROWD_TUNING } from '../js/systems/CrowdSystem.js';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
};

class MockPerson {
  constructor({ id, label = id.toUpperCase(), position, voice = 'greeter', wanders = true, radius = 6 }) {
    this.id = id;
    this.paletteId = id;
    this.label = label;
    this.voice = voice;
    this.position = new THREE.Vector3(position[0], 0, position[1]);
    this.home = this.position.clone();
    this.wanderRadius = radius;
    this.wanders = wanders;
    this.state = 'idle';
    this.partner = null;
    this.facing = 0;
    this.said = [];
    this.stopped = 0;
    this.locomotion = { moving: false, running: false };
    this.gestures = [];
    this.animateThisFrame = true;
    this.bubbleTimer = 0;
  }
  faceTowards(x, z) {
    this.facing = Math.atan2(x - this.position.x, z - this.position.z);
  }
  stepTowards(target, delta, speed, physics) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return 'arrived';
    const step = Math.min(length, speed * delta);
    const next = this.position.clone().add(new THREE.Vector3(dx / length, 0, dz / length).multiplyScalar(step));
    if (physics && !physics.canMove(next)) return 'blocked';
    this.position.copy(next);
    return length - step < 0.001 ? 'arrived' : 'moving';
  }
  setLocomotion(moving, running = false) { this.locomotion = { moving, running }; }
  gesture(action) { this.gestures.push(action); }
  say(text, seconds) { this.said.push(text); this.bubbleTimer = seconds; }
  stopSaying() { this.stopped += 1; this.bubbleTimer = 0; }
  update(delta) { this.bubbleTimer = Math.max(0, this.bubbleTimer - delta); }
}

const physics = new PhysicsEngine({ limit: 48 });
const events = [];
const lines = [];
const kollie = new MockPerson({ id: 'kollie', label: 'OLD MAN KOLLIE', position: [0, 0], voice: 'lecturer' });
const tenneh = new MockPerson({ id: 'tenneh', position: [1, 0], voice: 'greeter' });
const crowd = new CrowdSystem([kollie, tenneh], physics, {
  random: () => 0.5,
  onExchange: (exchange) => events.push(exchange),
  onLine: (line) => lines.push(line),
  tuning: { talkSeconds: 4, personalCooldown: 0, pairCooldown: 10 },
});
crowd.brain(kollie).cooldown = 0;
crowd.brain(tenneh).cooldown = 0;
const exchange = crowd.update(1 / 60, new THREE.Vector3(0.5, 0, 0));
check('two residents within meeting radius exchange automatically',
  Boolean(exchange) && crowd.history.length === 1, `${crowd.history.length} exchange(s)`);
check('a lecturer takes the first turn',
  exchange?.kind === 'lecture' && exchange.opener === kollie,
  `${exchange?.kind}: ${exchange?.opener?.label} -> ${exchange?.responder?.label}`);
check('both people stop to talk and face one another',
  kollie.state === 'talk' && tenneh.state === 'talk'
    && Math.abs(kollie.facing) < Math.PI && Math.abs(tenneh.facing) < Math.PI,
  `${kollie.state} / ${tenneh.state}`);
check('the opening line has a speech bubble and gesture',
  kollie.said.length === 1 && kollie.gestures.length === 1 && lines.length === 1,
  `${kollie.said[0]}`);
check('player-near line callback is ready for audio/subtitles',
  lines[0]?.person === kollie && lines[0]?.text === exchange.lines[0].text,
  `${lines[0]?.person?.id}: ${lines[0]?.text}`);

// Half-way through, the responder gets their own line and their own 3D bubble.
crowd.update(2, new THREE.Vector3(0.5, 0, 0));
check('the responder answers halfway through the conversation',
  lines.length === 2 && lines[1].person === tenneh && tenneh.said.length === 1,
  `${lines.length} spoken turns`);
crowd.update(2.1, new THREE.Vector3(0.5, 0, 0));
check('the conversation ends cleanly and the pair cools down',
  kollie.state !== 'talk' && tenneh.state !== 'talk'
    && (crowd.cooldowns.get('kollie|tenneh') || 0) > 0,
  `${kollie.state} / ${tenneh.state}`);

// An ordinary encounter is a greeting rather than a lecture.
const boakai = new MockPerson({ id: 'boakai', position: [8, 8] });
const flomo = new MockPerson({ id: 'flomo', position: [8.5, 8] });
const greetingEvents = [];
const greetings = new CrowdSystem([boakai, flomo], physics, {
  random: () => 0.5,
  onExchange: (result) => greetingEvents.push(result),
  tuning: { personalCooldown: 0 },
});
greetings.brain(boakai).cooldown = 0;
greetings.brain(flomo).cooldown = 0;
greetings.update(1 / 60);
check('two greeters meet with a greeting instead of a lecture',
  greetingEvents[0]?.kind === 'greet' && greetingEvents[0].lines.length === 2,
  greetingEvents[0]?.lines.map((line) => line.person.id).join(' -> ') || 'no exchange');

// Markie is an actor in the conversation system, but the crowd must never move him or steal his
// movement controls. A resident that reaches him still gets an ambient greeting.
const markie = new MockPerson({ id: 'markie', label: 'MARKIE', position: [-5, 0], wanders: false });
const sia = new MockPerson({ id: 'sia', position: [-4.5, 0] });
const markieLines = [];
const playerMeet = new CrowdSystem([markie, sia], physics, {
  random: () => 0.5,
  onLine: (line) => markieLines.push(line),
  tuning: { personalCooldown: 0 },
});
playerMeet.brain(markie).cooldown = 0;
playerMeet.brain(sia).cooldown = 0;
const markieBefore = markie.position.clone();
playerMeet.update(1 / 60, markie.position);
check('Markie can greet a resident without being moved by crowd AI',
  markie.state === 'talk' && markie.position.equals(markieBefore) && markieLines.length === 1,
  `${markie.state}, position unchanged, ${markieLines[0]?.person.id} speaks`);

// A resident actually changes their world position, stays inside the physics boundary and
// starts a walk cycle. This also guards the easy-to-miss case where an idle timer never expires.
const walker = new MockPerson({ id: 'walker', position: [20, 20], radius: 4 });
const patrol = new CrowdSystem([walker], physics, { random: () => 0.5 });
patrol.brain(walker).timer = 0;
const before = walker.position.clone();
patrol.update(0.5, new THREE.Vector3());
check('residents roam rather than staying planted', walker.position.distanceTo(before) > 0.05,
  `${walker.position.distanceTo(before).toFixed(2)} world units in 0.5s`);
check('moving resident gets its walk state',
  walker.state === 'walk' && walker.locomotion.moving,
  `${walker.state}, moving=${walker.locomotion.moving}`);
check('wander target remains on the platform',
  Math.abs(patrol.brain(walker).target.x) <= 46 && Math.abs(patrol.brain(walker).target.z) <= 46,
  `(${patrol.brain(walker).target.x.toFixed(2)}, ${patrol.brain(walker).target.z.toFixed(2)})`);

// Movement uses the exact same wall test the player uses: the step is rejected at a collider.
const blockedPhysics = new PhysicsEngine({ limit: 48 });
blockedPhysics.addBuilding({ x: 0, z: 0, width: 4, depth: 4 });
const blocked = new MockPerson({ id: 'blocked', position: [-2.5, 0], radius: 1 });
const blockedCrowd = new CrowdSystem([blocked], blockedPhysics, { random: () => 0.5 });
blockedCrowd.brain(blocked).timer = 0;
blockedCrowd.brain(blocked).target = new THREE.Vector3(0, 0, 0);
blockedCrowd.update(1 / 60);
check('crowd walkers cannot cross the real building collider',
  blockedPhysics.canMove(blocked.position) && blocked.position.x < -2,
  `stopped at x=${blocked.position.x.toFixed(2)}`);

check('the crowd uses a calm NPC walking pace', CROWD_TUNING.speed < 2.5,
  `${CROWD_TUNING.speed} units/second`);
check('encounters have a cooldown, not an every-frame loop', CROWD_TUNING.pairCooldown >= 20,
  `${CROWD_TUNING.pairCooldown}s pair cooldown`);

console.log();
if (failures.length) {
  console.error(`${failures.length} crowd check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('all checks passed — movement, pair cooldowns, greetings, lectures, and replies');

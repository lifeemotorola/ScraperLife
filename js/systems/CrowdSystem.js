import * as THREE from 'three';
import { SMALL_TALK } from '../data/dialogues.js';

// Waterside is not a museum of statues standing on their mission markers. Every character walks
// their own district, and when two of them come face to face they stop, turn to each other and
// talk — a greeting between equals, a lecture when one of them is a teacher, a broker or a
// gangster who does not chat so much as hold court.
//
// Two rules keep that from breaking the game:
//  * each character wanders around a HOME anchor inside a small radius, so a mission target is
//    always where the quest arrow says it is (Game.objectiveTarget reads live positions);
//  * movement goes through the same PhysicsEngine the player uses, so nobody walks into
//    Kollie's workshop or off the platform.
export const CROWD_TUNING = {
  meetRadius: 2.1,      // close enough to stop and talk
  arriveRadius: 0.4,
  speed: 1.55,          // a stroll; Markie walks at 4.25, so the player is never out-walked
  pauseMin: 1.4,
  pauseMax: 5.2,
  talkSeconds: 9,
  pairCooldown: 30,     // the same two people will not immediately start again
  personalCooldown: 3,  // ...and one person will not jump from chat to chat
  animateRadius: 46,    // beyond this the mixer holds its last frame (see NPC.update)
  hearRadius: 20,       // subtitles only when the player is close enough to overhear
  maxExchangesPerStep: 2,
};

function pairKey(a, b) { return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`; }

export class CrowdSystem {
  // people: anything with { id, label, voice, position, group, state, wanders, ... } (NPC).
  // physics: the same PhysicsEngine the player collides with.
  // onExchange({ kind, opener, responder, lines, position, hearable }) — Game turns this into a
  // small HUD cue. onLine({ person, text, exchange, seconds }) fires once per speaker turn, so
  // audio/subtitles stay in sync with the speech bubble. random is injectable for tests.
  constructor(people, physics, { onExchange = null, onLine = null, random = Math.random, tuning = {} } = {}) {
    this.people = [...people];
    this.physics = physics;
    this.onExchange = onExchange;
    this.onLine = onLine;
    this.random = random;
    this.config = { ...CROWD_TUNING, ...tuning };
    this.brains = new Map();
    this.cooldowns = new Map();
    this.history = [];
    this.elapsed = 0;
    this.people.forEach((person, index) => {
      this.brains.set(person, {
        target: null,
        // Stagger the first pause so the whole crowd does not step off in unison.
        timer: this.randomBetween(this.config.pauseMin, this.config.pauseMax) * (index / Math.max(1, this.people.length)),
        talkTimer: 0,
        partner: null,
        exchange: null,
        saidLine: false,
        lineCursor: 0,
        cooldown: this.randomBetween(0, 2),
      });
    });
  }

  randomBetween(min, max) { return min + (max - min) * this.random(); }

  brain(person) { return this.brains.get(person); }

  // A walkable point inside the character's own district.
  pickTarget(person) {
    const brain = this.brain(person);
    if (!brain) return null;
    const angle = this.random() * Math.PI * 2;
    const reach = person.wanderRadius * (0.35 + this.random() * 0.65);
    const wanted = new THREE.Vector3(
      person.home.x + Math.cos(angle) * reach,
      0,
      person.home.z + Math.sin(angle) * reach,
    );
    const limit = this.physics?.limit ?? 48;
    wanted.x = THREE.MathUtils.clamp(wanted.x, -limit + 2, limit - 2);
    wanted.z = THREE.MathUtils.clamp(wanted.z, -limit + 2, limit - 2);
    brain.target = this.physics?.findFree ? this.physics.findFree(wanted, 0.35, 6) : wanted;
    return brain.target;
  }

  // Two characters meet: a lecturer holds court, everybody else just greets. Lines come from
  // js/data/dialogues.js, rotated per character so the same pair does not repeat itself.
  startExchange(a, b) {
    const brainA = this.brain(a); const brainB = this.brain(b);
    if (!brainA || !brainB || a === b) return null;
    const lecturer = [a, b].find((person) => person.voice === 'lecturer') || null;
    const kind = lecturer ? 'lecture' : 'greet';
    const opener = lecturer || (a.id <= b.id ? a : b);
    const responder = opener === a ? b : a;
    const openerBrain = this.brain(opener);
    const responderBrain = this.brain(responder);

    const pool = (kind === 'lecture' ? SMALL_TALK.lectures : SMALL_TALK.greetings)[opener.id]
      || (kind === 'lecture' ? SMALL_TALK.lectures : SMALL_TALK.greetings).default || [];
    const replies = SMALL_TALK.replies[responder.id] || SMALL_TALK.replies.default || [];
    if (!pool.length) return null;

    const openerLine = pool[openerBrain.lineCursor % pool.length];
    const responderLine = replies.length ? replies[responderBrain.lineCursor % replies.length] : null;
    openerBrain.lineCursor += 1;
    responderBrain.lineCursor += 1;

    const half = this.config.talkSeconds / 2;
    const lines = [{ person: opener, text: openerLine, at: 0 }];
    if (responderLine) lines.push({ person: responder, text: responderLine, at: half });

    const exchange = {
      kind,
      opener,
      responder,
      lines,
      position: a.position.clone().lerp(b.position, 0.5),
    };
    for (const person of [a, b]) {
      const brain = this.brain(person);
      brain.talkTimer = this.config.talkSeconds;
      brain.partner = person === a ? b : a;
      brain.saidLine = false;
      brain.cooldown = this.config.personalCooldown;
      // Held on the brain, not read back off the history: another pair may start talking before
      // this one's second line lands, and the answer must belong to THIS conversation.
      brain.exchange = exchange;
      person.state = 'talk';
      person.partner = brain.partner;
    }
    this.cooldowns.set(pairKey(a, b), this.config.pairCooldown);

    // The opener speaks now; the answer lands at the half-way point (see update).
    lines[0].person.say(lines[0].text, half + 0.6);
    this.onLine?.({ person: lines[0].person, text: lines[0].text, exchange, seconds: half + 0.6 });
    // A wave for a greeting, a pointed finger for a lecture.
    opener.gesture?.(kind === 'lecture' ? 'interact' : 'celebrate');
    responder.gesture?.(kind === 'lecture' ? 'celebrate' : 'interact');

    this.history.push(exchange);
    if (this.history.length > 40) this.history.shift();
    this.onExchange?.(exchange);
    return exchange;
  }

  // Who is standing close enough to talk? Both must be free, and neither pair nor person may
  // still be cooling down from the last conversation.
  findMeetings() {
    const meetings = [];
    for (let i = 0; i < this.people.length; i += 1) {
      for (let j = i + 1; j < this.people.length; j += 1) {
        const a = this.people[i]; const b = this.people[j];
        const brainA = this.brain(a); const brainB = this.brain(b);
        if (a.state === 'talk' || b.state === 'talk') continue;
        if (brainA.cooldown > 0 || brainB.cooldown > 0) continue;
        const key = pairKey(a, b);
        if ((this.cooldowns.get(key) || 0) > 0) continue;
        if (a.position.distanceTo(b.position) <= this.config.meetRadius) meetings.push([a, b]);
      }
    }
    return meetings;
  }

  endTalk(person) {
    const brain = this.brain(person);
    person.state = 'idle';
    person.partner = null;
    person.stopSaying?.();
    if (brain) {
      brain.talkTimer = 0;
      brain.partner = null;
      brain.timer = this.randomBetween(this.config.pauseMin, this.config.pauseMax);
      brain.target = null;
    }
  }

  updateTalk(person, delta) {
    const brain = this.brain(person);
    brain.talkTimer -= delta;
    // Turn to face whoever they are talking to, and answer at the half-way point.
    if (brain.partner) person.faceTowards(brain.partner.position.x, brain.partner.position.z, delta, 6);
    const exchange = brain.exchange;
    if (!brain.saidLine && exchange && brain.talkTimer <= this.config.talkSeconds / 2) {
      const line = exchange.lines.find((entry) => entry.person === person && entry.at > 0);
      if (line) {
        const seconds = this.config.talkSeconds / 2 + 0.6;
        person.say(line.text, seconds);
        this.onLine?.({ person, text: line.text, exchange, seconds });
        brain.saidLine = true;
      } else brain.saidLine = true;
    }
    person.setLocomotion(false);
    if (brain.talkTimer <= 0) this.endTalk(person);
  }

  updateWander(person, delta) {
    const brain = this.brain(person);
    if (person.state === 'talk') return;
    if (!brain.target) {
      brain.timer -= delta;
      person.setLocomotion(false);
      person.state = 'idle';
      if (brain.timer > 0) return;
      this.pickTarget(person);
      if (!brain.target) { brain.timer = this.config.pauseMin; return; }
      person.state = 'walk';
    }
    person.faceTowards(brain.target.x, brain.target.z, delta, 5);
    const result = person.position.distanceTo(brain.target) <= this.config.arriveRadius
      ? 'arrived'
      : person.stepTowards(brain.target, delta, this.config.speed, this.physics);
    person.setLocomotion(result !== 'arrived');
    if (result === 'arrived' || result === 'blocked') {
      brain.target = null;
      brain.timer = this.randomBetween(this.config.pauseMin, this.config.pauseMax);
      person.state = 'idle';
    }
  }

  update(delta, playerPosition = null) {
    this.elapsed += delta;
    for (const [key, seconds] of this.cooldowns) {
      const next = seconds - delta;
      if (next <= 0) this.cooldowns.delete(key); else this.cooldowns.set(key, next);
    }
    this.people.forEach((person, index) => {
      const brain = this.brain(person);
      if (brain.cooldown > 0) brain.cooldown = Math.max(0, brain.cooldown - delta);
      // A character nobody can see does not need a fresh skin solve this frame.
      person.animateThisFrame = !playerPosition
        || person.position.distanceTo(playerPosition) <= this.config.animateRadius;
      if (person.stunSeconds > 0) {
        if (person.state === 'talk') this.endTalk(person);
        person.state = 'stunned';
        person.setLocomotion(false);
      } else {
        if (person.state === 'stunned') person.state = 'idle';
        if (person.state === 'talk') this.updateTalk(person, delta);
        else if (person.wanders) this.updateWander(person, delta);
        else person.setLocomotion(false);
      }
      person.update?.(delta, this.elapsed, index);
    });
    const meetings = this.findMeetings();
    for (const [a, b] of meetings.slice(0, this.config.maxExchangesPerStep)) {
      this.startExchange(a, b);
    }
    return this.history[this.history.length - 1] || null;
  }

  // True when two characters are mid-conversation (used by the HUD toast).
  get talking() { return this.people.filter((person) => person.state === 'talk'); }
}

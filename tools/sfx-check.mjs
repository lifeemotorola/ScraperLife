// Exercise the procedural game SFX against a tiny fake Web Audio graph; no browser/audio device needed.
//   node tools/sfx-check.mjs
import { SoundEffectsSystem } from '../js/systems/SoundEffectsSystem.js';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)} ${detail}`);
};

class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exp', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
}

const nodes = [];
function fakeNode(type) {
  const node = {
    kind: type,
    connections: [],
    connect(target) { this.connections.push(target); return target; },
    start(time) { this.startedAt = time; },
    stop(time) { this.stoppedAt = time; },
  };
  if (type === 'gain') node.gain = new FakeParam(1);
  if (type === 'oscillator') {
    node.frequency = new FakeParam(440);
    node.type = 'sine';
  }
  if (type === 'filter') {
    node.frequency = new FakeParam(1000);
    node.type = 'lowpass';
  }
  if (type === 'panner') node.pan = new FakeParam(0);
  if (type === 'buffer-source') node.buffer = null;
  nodes.push(node);
  return node;
}

const context = {
  state: 'suspended',
  currentTime: 2,
  sampleRate: 8000,
  destination: { kind: 'destination' },
  createGain: () => fakeNode('gain'),
  createOscillator: () => fakeNode('oscillator'),
  createBiquadFilter: () => fakeNode('filter'),
  createStereoPanner: () => fakeNode('panner'),
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  },
  createBufferSource: () => fakeNode('buffer-source'),
  resume() { this.state = 'running'; return Promise.resolve(); },
  close() { this.state = 'closed'; return Promise.resolve(); },
};

const sfx = new SoundEffectsSystem({ contextFactory: () => context });
check('start gesture creates and unlocks Web Audio', await sfx.unlock() && context.state === 'running',
  `state=${context.state}, generated noise buffer`);
const beforePickup = nodes.length;
check('scrap pickup queues a metallic chime and clink', sfx.play('pickup'),
  `${nodes.length - beforePickup} audio nodes`);
const beforePulse = nodes.length;
check('scrap pulse queues a low sweep and airy burst', sfx.play('pulse', 0.9),
  `${nodes.length - beforePulse} audio nodes`);
check('footsteps, repair, interaction, and impact sounds are available',
  sfx.play('footstep') && sfx.play('repair') && sfx.play('interact') && sfx.play('impact'),
  `${nodes.filter((node) => node.kind === 'oscillator' && node.startedAt !== undefined).length} scheduled tones`);
const scheduled = nodes.filter((node) => node.startedAt !== undefined);
check('all synthesized sounds schedule safe positive durations',
  scheduled.length >= 10 && scheduled.every((node) => node.stoppedAt > node.startedAt),
  `${scheduled.length} sources start and stop cleanly`);
sfx.setEnabled(false);
const mutedNodeCount = nodes.length;
check('disabled SFX do not schedule more sounds', !sfx.play('pickup') && nodes.length === mutedNodeCount,
  `nodes=${nodes.length}`);
sfx.close();

const unsupported = new SoundEffectsSystem({ contextFactory: () => null });
check('missing Web Audio support stays non-fatal', !await unsupported.unlock() && !unsupported.play('pulse'),
  'game continues silently if audio is unavailable');

if (failures.length) {
  console.error(`\n${failures.length} SFX check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall checks passed — footsteps, pickup, pulse, repair, interaction, and impact SFX');

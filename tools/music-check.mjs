// Validate the generated platform loop is a browser-ready, non-silent PCM WAV.
//   python3 tools/bake_platform_music.py
//   node tools/music-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { MusicSystem } from '../js/systems/MusicSystem.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'assets/audio/platform-loop.wav');
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

if (!existsSync(path)) {
  console.error(`Missing ${path}. Run: python3 tools/bake_platform_music.py`);
  process.exit(2);
}

const bytes = readFileSync(path);
check('music file has RIFF/WAVE signatures',
  bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE',
  `${bytes.length.toLocaleString()} bytes`);

let format = null;
let dataStart = -1;
let dataSize = 0;
for (let offset = 12; offset + 8 <= bytes.length;) {
  const name = bytes.toString('ascii', offset, offset + 4);
  const size = bytes.readUInt32LE(offset + 4);
  const body = offset + 8;
  if (name === 'fmt ' && size >= 16) {
    format = {
      encoding: bytes.readUInt16LE(body),
      channels: bytes.readUInt16LE(body + 2),
      sampleRate: bytes.readUInt32LE(body + 4),
      bits: bytes.readUInt16LE(body + 14),
    };
  }
  if (name === 'data') { dataStart = body; dataSize = size; break; }
  offset = body + size + (size % 2);
}

check('music is stereo 16-bit PCM at 22.05 kHz',
  format?.encoding === 1 && format.channels === 2 && format.sampleRate === 22050 && format.bits === 16,
  format ? `${format.channels} ch / ${format.bits}-bit / ${format.sampleRate} Hz`
    : 'missing PCM format chunk');

const bytesPerFrame = format ? format.channels * format.bits / 8 : 0;
const duration = bytesPerFrame ? dataSize / (format.sampleRate * bytesPerFrame) : 0;
check('loop length is suitable for background play', duration >= 30 && duration <= 60,
  `${duration.toFixed(2)} seconds`);

let peak = 0;
let sumSquares = 0;
let frames = 0;
if (dataStart >= 0 && format?.bits === 16 && bytesPerFrame === 4) {
  for (let offset = dataStart; offset + 3 < dataStart + dataSize; offset += bytesPerFrame) {
    const left = bytes.readInt16LE(offset) / 32768;
    const right = bytes.readInt16LE(offset + 2) / 32768;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    sumSquares += left * left + right * right;
    frames += 2;
  }
}
const rms = frames ? Math.sqrt(sumSquares / frames) : 0;
check('loop contains audible, unclipped music', peak > 0.1 && peak < 1 && rms > 0.015 && rms < 0.8,
  `peak ${peak.toFixed(3)}, RMS ${rms.toFixed(3)}`);

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scraper-life.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
class FakeAudio {
  constructor(src) { this.src = src; this.loop = false; this.preload = ''; this.volume = 1; this.paused = true; this.calls = 0; }
  play() { this.calls += 1; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  setAttribute() {}
}
globalThis.Audio = FakeAudio;
const music = new MusicSystem();
check('music player loads the bundled platform loop', music.player?.src.endsWith('/assets/audio/platform-loop.wav')
  && music.player.loop && music.player.volume <= 0.25,
  `loop=${music.player?.loop}, volume=${music.player?.volume}`);
const started = await music.start();
check('music starts from the game start gesture', started && !music.player.paused && music.player.calls === 1,
  `play calls=${music.player.calls}`);
music.setEnabled(false);
check('music toggle pauses and remembers the off setting', music.player.paused
  && window.localStorage.getItem('scraper-life-music') === 'off', 'paused and persisted');
music.setEnabled(true);
check('music toggle resumes the loop', !music.player.paused
  && window.localStorage.getItem('scraper-life-music') === 'on', `play calls=${music.player.calls}`);
Object.defineProperty(document, 'hidden', { configurable: true, value: true });
document.dispatchEvent(new dom.window.Event('visibilitychange'));
const pausedInBackground = music.player.paused;
Object.defineProperty(document, 'hidden', { configurable: true, value: false });
document.dispatchEvent(new dom.window.Event('visibilitychange'));
check('music pauses in hidden tabs and resumes when visible', pausedInBackground && !music.player.paused,
  `hidden paused=${pausedInBackground}`);
music.destroy();

if (failures.length) {
  console.error(`\n${failures.length} music check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall checks passed — ready to loop quietly beneath platform dialogue');

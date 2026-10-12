// Voice-roster regression check for js/systems/VoiceSystem.js. Drives the real profile /
// deal / speak code against a fake speechSynthesis stocked like a desktop browser (and then
// like a starving one); no browser or audio device is needed.
//
//   node tools/voice-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIALOGUE } from '../js/data/dialogues.js';
import { MUSIC_INTEL, RADIO_NEWS_BULLETINS } from '../js/data/musicIntel.js';
import { PROFILES, profileFor, dealVoices, guessGender, splitSpeaker, AUDIO_LINES, NPC_QUOTE_LINES, STREET_AUDIO_LINES, VoiceSystem } from '../js/systems/VoiceSystem.js';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Mirrors voiceKey() in VoiceSystem.js on purpose: if the two formats ever drift apart,
// the "visitor skips cast voices" check below fails loudly instead of passing silently.
const voiceId = (voice) => `${voice.name}::${voice.lang}`;
const sameDeal = (a, b) => a.size === b.size && [...a].every(([speaker, voice]) => b.has(speaker) && voiceId(b.get(speaker)) === voiceId(voice));

// A desktop-sized voice list: 12 male, 10 female, 2 the classifier cannot place, and one
// French voice that must never be dealt to an English-speaking cast.
const voice = (name, lang = 'en-US') => ({ name, lang, voiceURI: `urn:${name}`, localService: true, default: false });
const RICH_VOICES = [
  voice('Microsoft David - English (United States)'),
  voice('Google UK English Male', 'en-GB'),
  voice('Daniel', 'en-GB'),
  voice('Alex'),
  voice('Fred'),
  voice('James'),
  voice('Guy'),
  voice('Ryan'),
  voice('Eric'),
  voice('Liam'),
  voice('Oliver'),
  voice('Thomas'),
  voice('Microsoft Zira - English (United States)'),
  voice('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  voice('Google UK English Female', 'en-GB'),
  voice('Samantha'),
  voice('Victoria'),
  voice('Karen', 'en-AU'),
  voice('Aria'),
  voice('Jenny'),
  voice('Moira'),
  voice('Tessa'),
  voice('Google US English'),
  voice('Ana'),
  voice('Mathieu', 'fr-FR'),
];

// ---- The roster: a profile per speaker ----------------------------------

const palettes = JSON.parse(readFileSync(new URL('../assets/models/character_palettes.json', import.meta.url), 'utf8'));
const cast = Object.keys(PROFILES);
const expected = new Set([
  ...Object.values(palettes.characters).map((character) => character.label),
  ...Object.values(DIALOGUE).map((line) => splitSpeaker(line).speaker),
  'NARRATOR',
]);
const uncovered = [...expected].filter((speaker) => !PROFILES[speaker]);
check('every speaker tag the game can produce has a profile', uncovered.length === 0,
  uncovered.length ? `missing: ${uncovered.join(', ')}` : `${expected.size} speakers, ${cast.length} profiles`);

const pairs = cast.flatMap((a, i) => cast.slice(i + 1).map((b) => [a, b]));
const twins = pairs.filter(([a, b]) => JSON.stringify(PROFILES[a]) === JSON.stringify(PROFILES[b]));
check('no two characters share a voice profile', twins.length === 0,
  twins.length ? `${twins.map(([a, b]) => `${a}≈${b}`).join(', ')} are identical` : `${cast.length} distinct profiles`);

const narratorTwins = ['MUSU', 'KORMAH', 'EAST WATCH', 'MARKET WATCH', 'DOCKS WATCH', 'HARBOR WATCH', 'WAREHOUSE WATCH']
  .filter((speaker) => JSON.stringify(PROFILES[speaker]) === JSON.stringify(PROFILES.NARRATOR));
check('Kormah, Musu and the watch crew are no longer narrator-voiced', narratorTwins.length === 0,
  narratorTwins.length ? `${narratorTwins.join(', ')} still borrow the narrator` : 'each keeps an own profile');

check('numbered speaker tags keep their own identity',
  splitSpeaker('WATCH 2: “Clear the road.”').speaker === 'WATCH 2'
    && splitSpeaker('EAST WATCH: “Move along, my friend.”').speaker === 'EAST WATCH'
    && splitSpeaker('No tag in this line.').speaker === 'NARRATOR',
  'digits no longer collapse into the narrator');

// ---- The clips: recorded lines ship as wav -------------------------------

// Minimal RIFF/WAVE reader: enough to prove a file is a playable PCM wav and to
// measure its length. Not a decoder — the browser still does the real work.
function readWavInfo(path) {
  let buffer;
  try { buffer = readFileSync(path); } catch { return null; }
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;
  let offset = 12;
  let fmt = null;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (chunkId === 'data') dataSize = chunkSize;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (!fmt || !dataSize) return null;
  const byteRate = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
  return { ...fmt, seconds: byteRate ? dataSize / byteRate : 0 };
}

const clipEntries = [
  ...Object.entries(AUDIO_LINES),
  ...Object.entries(NPC_QUOTE_LINES),
  ...Object.entries(STREET_AUDIO_LINES),
];
check('recorded voice lines ship as .wav clips',
  clipEntries.length === 88 && clipEntries.every(([, url]) => url.endsWith('.wav')),
  `${clipEntries.length} clips (25 mission + 42 music quotes + 21 street talk), no mp3 left behind`);

const clipInfos = clipEntries.map(([id, url]) => [id, readWavInfo(fileURLToPath(url))]);
const unreadable = clipInfos.filter(([id, info]) => {
  if (!info) return true;
  return (info.audioFormat !== 1 && info.audioFormat !== 3)
    || info.channels < 1 || info.channels > 2
    || info.sampleRate < 8000 || info.sampleRate > 96000
    || info.bitsPerSample !== 16
    || info.seconds < 0.5;
});
const recordedSeconds = clipInfos.reduce((sum, [, info]) => sum + (info?.seconds || 0), 0);
check('every voice wav is a playable 16-bit PCM file',
  unreadable.length === 0,
  unreadable.length ? `${unreadable.map(([id]) => id).join(', ')} unreadable` : `${clipInfos.length} clips, ${recordedSeconds.toFixed(1)}s of recorded dialogue`);

const radioSteps = [
  ...Object.values(MUSIC_INTEL).flatMap((track) => track.cohostDialogue || []),
  ...RADIO_NEWS_BULLETINS.flatMap((bulletin) => bulletin.steps || []),
];
const radioInfos = radioSteps.map((step) => [step.audio?.split('/').pop() || 'unknown', readWavInfo(fileURLToPath(step.audio))]);
const unreadableRadio = radioInfos.filter(([, info]) => {
  if (!info) return true;
  return (info.audioFormat !== 1 && info.audioFormat !== 3)
    || info.channels < 1 || info.channels > 2
    || info.sampleRate < 16000 || info.sampleRate > 96000
    || info.bitsPerSample !== 16
    || info.seconds < 1.5;
});
const radioSeconds = radioInfos.reduce((sum, [, info]) => sum + (info?.seconds || 0), 0);
check('every 94.7 FM radio broadcaster wav is a playable 16-bit PCM file',
  radioInfos.length === 41 && unreadableRadio.length === 0,
  unreadableRadio.length ? `${unreadableRadio.map(([id]) => id).join(', ')} unreadable` : `${radioInfos.length} clips, ${radioSeconds.toFixed(1)}s of radio dialogue`);

// ---- The deal: one system voice per character ---------------------------

const deal = dealVoices(cast, RICH_VOICES);
const dealtVoices = [...deal.values()];
check('a rich browser deals every character a distinct system voice',
  deal.size === cast.length && new Set(dealtVoices).size === cast.length,
  `${new Set(dealtVoices).size}/${cast.length} unique voices from ${RICH_VOICES.length} installed`);

const wrongGender = [...deal].filter(([speaker, picked]) => guessGender(picked.name) !== PROFILES[speaker].gender);
check('dealt voices match each character’s gender', wrongGender.length === 0,
  wrongGender.length ? `${wrongGender.map(([s, v]) => `${s}→${v.name}`).join(', ')}` : 'gender respected for the whole cast');

check('non-English voices stay out of the deal', !dealtVoices.some((picked) => picked.lang.startsWith('fr')),
  'the French voice is never dealt');

const refreshDeal = dealVoices(cast, RICH_VOICES.map((entry) => ({ ...entry })));
check('the deal survives a voiceschanged refresh unchanged', sameDeal(deal, refreshDeal),
  'a rebuilt list deals the same voices');

const POOR_VOICES = [voice('Microsoft David - English (United States)'), voice('Microsoft Zira - English (United States)')];
const poorDeal = dealVoices(cast, POOR_VOICES);
check('a two-voice browser still deals everyone a voice',
  poorDeal.size === cast.length && [...poorDeal.values()].every((picked) => POOR_VOICES.includes(picked)),
  'profiles keep them distinguishable when they must share');
check('an empty voice list deals nothing instead of throwing', dealVoices(cast, []).size === 0);

// ---- Speakers the roster does not know yet ------------------------------

const visitorDeal = dealVoices([{ speaker: 'VISITOR 7', gender: null }], RICH_VOICES,
  new Set(dealtVoices.map(voiceId)));
check('a speaker outside the roster is dealt a voice the cast does not own',
  visitorDeal.has('VISITOR 7') && !dealtVoices.includes(visitorDeal.get('VISITOR 7')),
  `VISITOR 7 → ${visitorDeal.get('VISITOR 7')?.name}`);

const visitor = profileFor('VISITOR 7');
const visitorAgain = profileFor('VISITOR 7');
const otherVisitor = profileFor('VISITOR 8');
check('unknown speakers get stable profiles no cast member uses',
  JSON.stringify(visitor) === JSON.stringify(visitorAgain)
    && !Object.values(PROFILES).some((profile) => profile.pitch === visitor.pitch && profile.rate === visitor.rate)
    && (otherVisitor.pitch !== visitor.pitch || otherVisitor.rate !== visitor.rate),
  `VISITOR 7 pitch=${visitor.pitch} rate=${visitor.rate}, VISITOR 8 pitch=${otherVisitor.pitch} rate=${otherVisitor.rate}`);

// ---- The full speak() path, against a fake browser ----------------------

const spoken = [];
globalThis.window = {
  speechSynthesis: {
    getVoices: () => RICH_VOICES,
    cancel() {},
    speak: (utterance) => spoken.push(utterance),
    addEventListener() {},
  },
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  localStorage: { getItem: () => null, setItem() {} },
};
globalThis.Audio = class {
  constructor() { this.preload = 'auto'; }
  addEventListener() {}
  play() { return Promise.resolve(); }
};

const system = new VoiceSystem();   // constructor pulls RICH_VOICES synchronously
const heard = new Map();
for (const speaker of cast) {
  system.speak(`${speaker}: “Small small, we move.”`);
  await sleep(90);                  // speak() queues the utterance after a 60ms pause
  heard.set(speaker, spoken[spoken.length - 1]);
}

const heardVoices = [...heard.values()].map((utterance) => utterance.voice);
check('speak() gives every character their own browser voice',
  heard.size === cast.length && new Set(heardVoices).size === cast.length,
  `${new Set(heardVoices).size}/${cast.length} distinct voices at runtime`);

const offProfile = [...heard].filter(([speaker, utterance]) => utterance.pitch !== profileFor(speaker).pitch
  || utterance.rate !== profileFor(speaker).rate);
check('speak() applies each character’s pitch and rate', offProfile.length === 0,
  offProfile.length ? `${offProfile.map(([s]) => s).join(', ')} drift from profile` : 'every utterance matches its profile');

system.speak('VISITOR 7: “Ehn, my people.”');
await sleep(90);
system.speak('VISITOR 8: “The sea quiet today.”');
await sleep(90);
const [visitorUtterance, otherVisitorUtterance] = spoken.slice(-2);
check('unknown speakers are voiced separately from the cast at runtime',
  visitorUtterance.voice && visitorUtterance.voice !== otherVisitorUtterance.voice
    && !heardVoices.includes(visitorUtterance.voice) && !heardVoices.includes(otherVisitorUtterance.voice),
  `${visitorUtterance.voice?.name} and ${otherVisitorUtterance.voice?.name}`);

// Any future beat without a recorded clip must still carry the character's voice.
spoken.length = 0;
system.playLine('unrecordedBeat', DIALOGUE.kormah, 4);
await sleep(90);
check('unrecorded mission lines fall back to the character voice, not the narrator',
  spoken.length === 1 && spoken[0].voice === heard.get('KORMAH').voice && spoken[0].pitch === PROFILES.KORMAH.pitch,
  `KORMAH speaks at pitch ${spoken[0].pitch}`);

// A cheap phone: one male and one female voice. The rebuild must not swap voices mid-line
// or throw, and profiles remain the only thing telling the men apart.
system.voices = POOR_VOICES;
system.speak('TENNEH: “Markie, you too thin. Come and eat.”');
await sleep(90);
check('a two-voice browser keeps speaking without errors',
  spoken[spoken.length - 1].voice === POOR_VOICES[1] && spoken[spoken.length - 1].pitch === PROFILES.TENNEH.pitch,
  `TENNEH on ${POOR_VOICES[1].name} at pitch ${PROFILES.TENNEH.pitch}`);

const bare = new VoiceSystem();
bare.voices = [];
bare.speak('MARKIE: “I did not come this far to walk away.”');
await sleep(90);
check('with no system voices the line still speaks with the profile',
  spoken[spoken.length - 1].lang === 'en-US' && spoken[spoken.length - 1].pitch === PROFILES.MARKIE.pitch,
  'default voice, MARKIE pitch');

console.log();
if (failures.length) {
  console.error(`${failures.length} voice check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('all checks passed — every character on the platform speaks with a voice of their own');

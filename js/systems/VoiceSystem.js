// The streets of Waterside speak back. VoiceSystem plays real recorded voice lines for
// every character (assets/audio/*.wav). Anything without a clip — the ambient street talk,
// the Season One draft beats, or a blocked/failed download — falls back to the browser's
// speech synthesis, and there every character on the platform keeps a voice of their own:
// a per-character pitch/rate profile (PROFILES below) plus a distinct system voice dealt
// out deterministically (dealVoices), so no two residents ever sound alike — even on a
// browser that only ships one or two voices.

// One voice per speaker tag the game can produce — every character walking the platform,
// plus the narrator for untagged lines and Musu, whose flashback palette already ships.
// Key ORDER is load-bearing: when a browser offers only a few system voices the deal in
// dealVoices walks this order, so the story cast is guaranteed a voice before the narrator,
// and Vardee's watch comes last. Within a gender every (pitch, rate) pair is unique, so
// even two characters forced to share one system voice never sound alike.
export const PROFILES = {
  // The story cast, in the order the player hears them.
  MARKIE: { gender: 'male', pitch: 1.0, rate: 1.0 },            // the player: neutral, present
  'OLD MAN KOLLIE': { gender: 'male', pitch: 0.7, rate: 0.85 },  // elder: low, unhurried
  TENNEH: { gender: 'female', pitch: 1.08, rate: 0.97 },        // market woman: warm, direct
  FLOMO: { gender: 'male', pitch: 1.14, rate: 1.08 },           // best friend: quick, excitable
  SIA: { gender: 'female', pitch: 1.4, rate: 1.06 },            // street kid: bright, fast
  GARMAI: { gender: 'female', pitch: 0.92, rate: 0.88 },        // broker: low, deliberate
  BOAKAI: { gender: 'male', pitch: 0.84, rate: 0.95 },          // fixer: measured
  JALLAH: { gender: 'male', pitch: 0.96, rate: 1.02 },          // rival: level, clipped
  TOGAR: { gender: 'male', pitch: 0.74, rate: 0.92 },           // enforcer: low, wary
  VARDEE: { gender: 'male', pitch: 0.6, rate: 0.9 },            // antagonist: the deepest voice on the street
  KORMAH: { gender: 'male', pitch: 0.78, rate: 0.88 },          // corrupt official: slow, oily
  // The narrator speaks untagged lines; Musu exists so far only in the flashback palette.
  NARRATOR: { gender: 'female', pitch: 1.0, rate: 0.95 },
  MUSU: { gender: 'female', pitch: 1.05, rate: 0.9 },           // mother: soft, remembering
  // Vardee's watch patrols the districts; two of the five are women, so the crew does not
  // sound like five copies of one man.
  'EAST WATCH': { gender: 'male', pitch: 0.88, rate: 1.05 },
  'MARKET WATCH': { gender: 'female', pitch: 1.12, rate: 1.0 },
  'DOCKS WATCH': { gender: 'male', pitch: 0.66, rate: 0.94 },
  'HARBOR WATCH': { gender: 'female', pitch: 0.95, rate: 1.1 },
  'WAREHOUSE WATCH': { gender: 'male', pitch: 1.06, rate: 0.96 },
};

const FEMALE_HINTS = ['female', 'woman', 'zira', 'hazel', 'susan', 'aria', 'jenny', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'serena', 'allison', 'sonia', 'libby', 'natasha', 'catherine', 'martha'];
const MALE_HINTS = ['male', 'david', 'daniel', 'alex', 'fred', 'george', 'james', 'guy', 'ryan', 'eric', 'liam', 'oliver', 'thomas', 'aaron', 'arthur'];

// One tiny silent WAV, used to unlock HTML audio inside the START-button gesture on
// platforms (notably iOS Safari) that otherwise refuse to play the first voice line.
const SILENCE_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

export function guessGender(voiceName) {
  const name = voiceName.toLowerCase();
  // Check female hints first: "female" contains "male".
  if (FEMALE_HINTS.some((hint) => name.includes(hint))) return 'female';
  if (MALE_HINTS.some((hint) => name.includes(hint))) return 'male';
  return null;
}

// A speaker tag's stable starting point in a candidate ring. Only ever used to pick an
// index — the same name must always hash the same way, nothing more.
function hashSpeaker(speaker) {
  let hash = 0;
  for (const char of speaker) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash;
}

// A system voice's identity. name+lang stays unique on the Android builds that ship
// several voices under the same voiceURI.
function voiceKey(voice) { return `${voice.name}::${voice.lang}`; }

// Every speaker tag the game can produce is in PROFILES. Anything else — a character added
// after this list, a visiting player's display name — still gets a deterministic voice of
// its own, nudged until it matches no shipped profile, so two speakers never sound alike
// by accident.
const derivedProfiles = new Map();
export function profileFor(speaker) {
  if (PROFILES[speaker]) return PROFILES[speaker];
  if (derivedProfiles.has(speaker)) return derivedProfiles.get(speaker);
  const hash = hashSpeaker(speaker);
  let pitch = Math.round((0.75 + (hash % 51) / 100) * 100) / 100;   // 0.75 .. 1.25
  let rate = 0.88 + ((hash * 7) % 23) / 100;                        // 0.88 .. 1.10
  const taken = Object.values(PROFILES).concat([...derivedProfiles.values()]);
  while (taken.some((profile) => profile.pitch === pitch && profile.rate === rate)) {
    pitch = Math.round((pitch + 0.01) * 100) / 100;
  }
  let gender = null;
  const upper = speaker.toUpperCase();
  if (upper.includes('KPANNAH') || upper.includes('WOMAN') || upper.includes('GIRL') || upper.includes('LADY') || upper.includes('QUEEN')) {
    gender = 'female';
    pitch = 1.34;
    rate = 1.04;
  } else if (upper.includes('GABRIEL') || upper.includes('MAN') || upper.includes('BOY') || upper.includes('MALE')) {
    gender = 'male';
    pitch = 0.86;
    rate = 1.02;
  }
  const profile = { gender, pitch, rate };
  derivedProfiles.set(speaker, profile);
  return profile;
}

// Deal the browser's system voices out to the cast so no two characters share one while
// supplies last. Each speaker starts at a hash of their name and walks the candidate ring
// until they reach a voice nobody was dealt; when the browser runs out, they keep the
// hash-stable pick and stay distinguishable through their pitch/rate profile. The same
// voice list always produces the same deal. `taken` (a set of voiceKey()s) lets a caller
// keep an earlier deal exclusive. speakers are roster names looked up in PROFILES, or
// { speaker, gender } objects for anyone the roster does not know yet.
export function dealVoices(speakers, voices, taken = new Set()) {
  const english = voices.filter((voice) => /^en/i.test(voice.lang));
  const base = english.length ? english : voices;
  const used = new Set(taken);
  const map = new Map();
  for (const entry of speakers) {
    const speaker = typeof entry === 'string' ? entry : entry.speaker;
    const gender = typeof entry === 'string' ? PROFILES[speaker]?.gender : entry.gender;
    const gendered = gender ? base.filter((voice) => guessGender(voice.name) === gender) : [];
    const candidates = gendered.length ? gendered : base;
    if (!candidates.length) continue;
    const start = hashSpeaker(speaker) % candidates.length;
    let pick = candidates[start];
    for (let step = 1; step < candidates.length; step += 1) {
      if (!used.has(voiceKey(pick))) break;
      pick = candidates[(start + step) % candidates.length];
    }
    map.set(speaker, pick);
    used.add(voiceKey(pick));
  }
  return map;
}

// Dialogue lines carry a speaker tag like `TENNEH: "..."`. Split it off so the subtitle
// keeps the tag while the spoken line is the character's words only. Digits are allowed in
// the tag so numbered crews and visiting players ("WATCH 2", "PLAYER 1") keep their own
// voice instead of collapsing into the narrator's.
export function splitSpeaker(line) {
  let text = String(line || '').trim();
  let speaker = 'NARRATOR';
  const match = text.match(/^([A-Z][A-Z0-9 .'’-]*):\s*/);
  if (match) {
    speaker = match[1].trim().toUpperCase();
    text = text.slice(match[0].length);
  }
  text = text.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  return { speaker, text };
}

// Real recorded lines, one clip per dialogue id, all PCM-16 wav (tools/voice_clips_to_wav.py
// converts and verifies them). Static URLs so the bundler can hash them.
export const AUDIO_LINES = {
  opening: new URL('../../assets/audio/opening.wav', import.meta.url).href,
  firstScrap: new URL('../../assets/audio/firstScrap.wav', import.meta.url).href,
  allScrap: new URL('../../assets/audio/allScrap.wav', import.meta.url).href,
  radioFixed: new URL('../../assets/audio/radioFixed.wav', import.meta.url).href,
  truth: new URL('../../assets/audio/truth.wav', import.meta.url).href,
  tenneh: new URL('../../assets/audio/tenneh.wav', import.meta.url).href,
  boakai: new URL('../../assets/audio/boakai.wav', import.meta.url).href,
  warehouse: new URL('../../assets/audio/warehouse.wav', import.meta.url).href,
  vardeeConfront: new URL('../../assets/audio/vardeeConfront.wav', import.meta.url).href,
  finale: new URL('../../assets/audio/finale.wav', import.meta.url).href,
  siaThanks: new URL('../../assets/audio/siaThanks.wav', import.meta.url).href,
  garmaiWhisper: new URL('../../assets/audio/garmaiWhisper.wav', import.meta.url).href,
  flomoSupport: new URL('../../assets/audio/flomoSupport.wav', import.meta.url).href,
  togarWarning: new URL('../../assets/audio/togarWarning.wav', import.meta.url).href,
  jallahRival: new URL('../../assets/audio/jallahRival.wav', import.meta.url).href,
  // New conversation lines
  markieResolve: new URL('../../assets/audio/markieResolve.wav', import.meta.url).href,
  kollieParents: new URL('../../assets/audio/kollieParents.wav', import.meta.url).href,
  boakaiProof: new URL('../../assets/audio/boakaiProof.wav', import.meta.url).href,
  siaHope: new URL('../../assets/audio/siaHope.wav', import.meta.url).href,
  tennehTogether: new URL('../../assets/audio/tennehTogether.wav', import.meta.url).href,
};

export class VoiceSystem {
  constructor() {
    this.ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
    this.enabled = true;
    this.voices = [];
    // The dealt-out system voices: one per speaker, no two speakers sharing while the
    // browser has enough to go around. Rebuilt whenever the voice list changes (see
    // pickVoice); until then it stays empty and speak() falls back to the default voice.
    this.voiceList = null;
    this.voiceAssignments = new Map();
    this.voicesTaken = new Set();
    this.pendingTimer = null;
    this.currentAudio = null;
    this.clipGeneration = 0;
    this.abortConversation = null;
    // One shared element: unlocked once inside a user gesture, reused for every clip.
    this.player = typeof window !== 'undefined' && typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.player) this.player.preload = 'auto';
    if (!this.ttsSupported) return;
    try { this.enabled = window.localStorage.getItem('scraper-life-voices') !== 'off'; } catch { /* private mode */ }
    const refresh = () => {
      const list = window.speechSynthesis.getVoices();
      if (Array.isArray(list) && list.length) this.voices = list;
    };
    refresh();
    // Chrome populates the voice list asynchronously.
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refresh);
    } else {
      window.speechSynthesis.onvoiceschanged = refresh;
    }
  }

  // Called from the START button click: silently plays inside the gesture so later
  // clips (and speech synthesis) are allowed without further interaction.
  unlock() {
    if (this.player) {
      try {
        this.player.src = SILENCE_WAV;
        this.player.play().catch(() => { /* unlock failed; clips may still work later */ });
      } catch { /* ignore */ }
    }
    if (this.ttsSupported) {
      try {
        const silent = new window.SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      } catch { /* never break the game over speech */ }
    }
  }

  // ---- Real audio first, TTS fallback -------------------------------

  playLine(id, line, seconds = 4, onDone = null) {
    if (!this.enabled) return;
    const url = AUDIO_LINES[id];
    if (url && this.player) {
      this.playClip(url, line, seconds, onDone);
      return;
    }
    this.speak(line, onDone);
  }

  playClip(url, line, seconds = 4, onDone = null) {
    if (!this.player) { this.speak(line, onDone); return; }
    this.stopPlayback();
    const audio = this.player;
    audio.src = url;
    audio.currentTime = 0;
    this.currentAudio = audio;
    const generation = this.clipGeneration;
    let settled = false;
    const clear = () => {
      if (this.currentAudio === audio && this.clipGeneration === generation) this.currentAudio = null;
    };
    const ended = () => {
      if (settled || this.clipGeneration !== generation) return;
      settled = true;
      clear();
      onDone?.();
    };
    const fallback = () => {
      if (settled || this.clipGeneration !== generation) return;
      settled = true;
      clear();
      // Clip blocked or failed to load — the fallback keeps the line audible.
      this.speak(line, onDone);
    };
    audio.addEventListener('ended', ended, { once: true });
    audio.addEventListener('error', fallback, { once: true });
    audio.play().catch(fallback);
  }

  // A scripted multi-voice conversation. steps: [{ id, line, seconds }].
  // onLine shows each subtitle; onDone fires once, after the last speaker finishes
  // (or when the safety cap hits, so the game flow can never hang on audio).
  playConversation(steps, { onLine, onDone } = {}) {
    this.stop();
    let finished = false;
    let safetyTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      this.abortConversation = null;
      onDone?.();
    };
    this.abortConversation = finish;

    let index = 0;
    const playStep = () => {
      if (finished) return;
      if (index >= steps.length) { finish(); return; }
      const step = steps[index]; index += 1;
      onLine?.(step.line, step.seconds || 4);
      const wait = (step.seconds || 4) * 1000;
      const url = AUDIO_LINES[step.id];
      if (this.enabled && url && this.player) {
        const audio = this.player;
        this.stopPlayback();
        audio.src = url;
        audio.currentTime = 0;
        this.currentAudio = audio;
        const advance = () => { if (this.currentAudio === audio) this.currentAudio = null; playStep(); };
        audio.addEventListener('ended', advance, { once: true });
        audio.addEventListener('error', () => { this.speak(step.line); setTimeout(playStep, wait); }, { once: true });
        audio.play().catch(() => {
          this.speak(step.line);
          setTimeout(playStep, wait);
        });
      } else {
        if (this.enabled) this.speak(step.line);
        setTimeout(playStep, wait);
      }
    };
    const totalSeconds = steps.reduce((sum, step) => sum + (step.seconds || 4), 0);
    safetyTimer = setTimeout(finish, (totalSeconds + 14) * 1000);
    playStep();
  }

  stopPlayback() {
    // Invalidate `ended`/`error` listeners from the previous line before reusing the one shared
    // Audio element. Otherwise an old pause/error can clear the new line's `currentAudio` flag.
    this.clipGeneration += 1;
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch { /* ignore */ }
      this.currentAudio = null;
    }
  }

  stop() {
    clearTimeout(this.pendingTimer);
    this.stopPlayback();
    if (this.abortConversation) { const abort = this.abortConversation; this.abortConversation = null; abort(); }
    if (this.ttsSupported) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  }

  toggle() {
    this.enabled = !this.enabled;
    try { window.localStorage.setItem('scraper-life-voices', this.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  // ---- Speech-synthesis fallback ------------------------------------

  pickVoice(speaker, gender) {
    if (!this.voices.length) return null;
    // Chrome fills the voice list asynchronously, so rebuild the deal whenever a new list
    // arrives. The deal is deterministic, so a rebuild never swaps anyone's voice.
    if (this.voiceList !== this.voices) {
      this.voiceList = this.voices;
      this.voiceAssignments = dealVoices(Object.keys(PROFILES), this.voices);
      this.voicesTaken = new Set([...this.voiceAssignments.values()].map(voiceKey));
    }
    if (this.voiceAssignments.has(speaker)) return this.voiceAssignments.get(speaker);
    // A speaker outside the roster — a character added later, a visiting player's name —
    // is still dealt a voice of their own, skipping the ones the cast already owns.
    if (gender === 'female') {
      const femaleVoices = this.voices.filter((v) => guessGender(v.name) === 'female');
      if (femaleVoices.length) {
        const pick = femaleVoices[hashSpeaker(speaker) % femaleVoices.length];
        this.voiceAssignments.set(speaker, pick);
        return pick;
      }
    } else if (gender === 'male') {
      const maleVoices = this.voices.filter((v) => guessGender(v.name) === 'male');
      if (maleVoices.length) {
        const pick = maleVoices[hashSpeaker(speaker) % maleVoices.length];
        this.voiceAssignments.set(speaker, pick);
        return pick;
      }
    }

    const dealt = dealVoices([{ speaker, gender }], this.voices, this.voicesTaken).get(speaker) || null;
    if (dealt) {
      this.voiceAssignments.set(speaker, dealt);
      this.voicesTaken.add(voiceKey(dealt));
    }
    return dealt;
  }

  speak(line, onEnd = null) {
    if (!this.ttsSupported || !this.enabled) {
      if (onEnd) {
        const words = String(line || '').split(/\s+/).length;
        const ms = Math.max(2500, (words / 3.0) * 1000);
        this.pendingTimer = setTimeout(onEnd, ms);
      }
      return;
    }
    const { speaker, text } = splitSpeaker(line);
    if (!text) { onEnd?.(); return; }
    clearTimeout(this.pendingTimer);
    try {
      window.speechSynthesis.cancel();
      // Tiny pause after cancel(): some Chrome builds drop utterances queued in the
      // same tick as cancel().
      this.pendingTimer = setTimeout(() => {
        try {
          const utterance = new window.SpeechSynthesisUtterance(text);
          const profile = profileFor(speaker);
          utterance.pitch = profile.pitch;
          utterance.rate = profile.rate;
          const voice = this.pickVoice(speaker, profile.gender);
          if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
          else utterance.lang = 'en-US';

          let finished = false;
          const done = () => {
            if (finished) return;
            finished = true;
            onEnd?.();
          };

          utterance.onend = done;
          utterance.onerror = done;

          // Safety timeout in case speech engine drops onend
          const words = text.split(/\s+/).length;
          const safetyMs = Math.max(3500, (words / 2.0) * 1000 + 4000);
          const timer = setTimeout(done, safetyMs);
          const origEnd = utterance.onend;
          utterance.onend = () => {
            clearTimeout(timer);
            origEnd();
          };

          window.speechSynthesis.speak(utterance);
        } catch {
          onEnd?.();
        }
      }, 60);
    } catch {
      onEnd?.();
    }
  }
}

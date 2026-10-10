// The streets of Waterside speak back. VoiceSystem gives every dialogue line an audible
// voice using the browser's built-in speech synthesis — no audio assets to ship, which
// matters for a PWA installed from Cloudflare with an offline service worker. Each named
// speaker keeps a consistent pitch/rate profile, and gets a distinct system voice when
// the platform offers more than one.
const PROFILES = {
  MARKIE: { gender: 'male', pitch: 1.0, rate: 1.0 },
  'OLD MAN KOLLIE': { gender: 'male', pitch: 0.7, rate: 0.85 },
  TENNEH: { gender: 'female', pitch: 1.08, rate: 0.97 },
  FLOMO: { gender: 'male', pitch: 1.14, rate: 1.08 },
  VARDEE: { gender: 'male', pitch: 0.6, rate: 0.9 },
  BOAKAI: { gender: 'male', pitch: 0.84, rate: 0.95 },
  SIA: { gender: 'female', pitch: 1.4, rate: 1.06 },
  GARMAI: { gender: 'female', pitch: 0.92, rate: 0.88 },
  TOGAR: { gender: 'male', pitch: 0.74, rate: 0.92 },
  JALLAH: { gender: 'male', pitch: 0.96, rate: 1.02 },
  NARRATOR: { gender: 'female', pitch: 1.0, rate: 0.95 },
};

const FEMALE_HINTS = ['female', 'woman', 'zira', 'hazel', 'susan', 'aria', 'jenny', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'serena', 'allison', 'sonia', 'libby', 'natasha', 'catherine', 'martha'];
const MALE_HINTS = ['male', 'david', 'daniel', 'alex', 'fred', 'george', 'james', 'guy', 'ryan', 'eric', 'liam', 'oliver', 'thomas', 'aaron', 'arthur'];

function guessGender(voiceName) {
  const name = voiceName.toLowerCase();
  // Check female hints first: "female" contains "male".
  if (FEMALE_HINTS.some((hint) => name.includes(hint))) return 'female';
  if (MALE_HINTS.some((hint) => name.includes(hint))) return 'male';
  return null;
}

// Dialogue lines carry a speaker tag like `TENNEH: "..."`. Split it off so the subtitle
// keeps the tag while the spoken line is the character's words only.
export function splitSpeaker(line) {
  let text = String(line || '').trim();
  let speaker = 'NARRATOR';
  const match = text.match(/^([A-Z][A-Z .'’-]*):\s*/);
  if (match) {
    speaker = match[1].trim().toUpperCase();
    text = text.slice(match[0].length);
  }
  text = text.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  return { speaker, text };
}

export class VoiceSystem {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
    this.enabled = true;
    this.voices = [];
    this.pendingTimer = null;
    if (!this.supported) return;
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

  // Some browsers only allow speech inside/after a user gesture. Calling this from the
  // START button click quietly clears that gate before the first real line plays.
  unlock() {
    if (!this.supported) return;
    try {
      const silent = new window.SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    } catch { /* never break the game over speech */ }
  }

  pickVoice(speaker, gender) {
    const pool = this.voices.length ? this.voices : [];
    if (!pool.length) return null;
    const english = pool.filter((voice) => /^en/i.test(voice.lang));
    const base = english.length ? english : pool;
    const gendered = base.filter((voice) => guessGender(voice.name) === gender);
    const candidates = gendered.length ? gendered : base;
    // Deterministic per speaker, so a character keeps the same voice across sessions.
    let hash = 0;
    for (const char of speaker) hash = (hash * 31 + char.charCodeAt(0)) % 997;
    return candidates[hash % candidates.length];
  }

  speak(line) {
    if (!this.supported || !this.enabled) return;
    const { speaker, text } = splitSpeaker(line);
    if (!text) return;
    clearTimeout(this.pendingTimer);
    try {
      window.speechSynthesis.cancel();
      // Tiny pause after cancel(): some Chrome builds drop utterances queued in the
      // same tick as cancel().
      this.pendingTimer = setTimeout(() => {
        try {
          const utterance = new window.SpeechSynthesisUtterance(text);
          const profile = PROFILES[speaker] || PROFILES.NARRATOR;
          utterance.pitch = profile.pitch;
          utterance.rate = profile.rate;
          const voice = this.pickVoice(speaker, profile.gender);
          if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
          else utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
        } catch { /* never break the game over speech */ }
      }, 60);
    } catch { /* never break the game over speech */ }
  }

  stop() {
    clearTimeout(this.pendingTimer);
    if (this.supported) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  }

  toggle() {
    this.enabled = !this.enabled;
    try { window.localStorage.setItem('scraper-life-voices', this.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (!this.enabled) this.stop();
    return this.enabled;
  }
}

// The streets of Waterside speak back. VoiceSystem plays real recorded voice lines for
// every character (assets/audio/*.mp3). If a clip is missing, blocked, or fails to load,
// the line falls back to the browser's speech synthesis with per-character profiles, so
// the conversation never goes silent.
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

// One tiny silent WAV, used to unlock HTML audio inside the START-button gesture on
// platforms (notably iOS Safari) that otherwise refuse to play the first voice line.
const SILENCE_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

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

// Real recorded lines, one clip per dialogue id. Static URLs so the bundler can hash them.
const AUDIO_LINES = {
  opening: new URL('../../assets/audio/opening.mp3', import.meta.url).href,
  firstScrap: new URL('../../assets/audio/firstScrap.mp3', import.meta.url).href,
  allScrap: new URL('../../assets/audio/allScrap.mp3', import.meta.url).href,
  radioFixed: new URL('../../assets/audio/radioFixed.mp3', import.meta.url).href,
  truth: new URL('../../assets/audio/truth.mp3', import.meta.url).href,
  tenneh: new URL('../../assets/audio/tenneh.mp3', import.meta.url).href,
  boakai: new URL('../../assets/audio/boakai.mp3', import.meta.url).href,
  warehouse: new URL('../../assets/audio/warehouse.mp3', import.meta.url).href,
  vardeeConfront: new URL('../../assets/audio/vardeeConfront.mp3', import.meta.url).href,
  finale: new URL('../../assets/audio/finale.mp3', import.meta.url).href,
  siaThanks: new URL('../../assets/audio/siaThanks.mp3', import.meta.url).href,
  garmaiWhisper: new URL('../../assets/audio/garmaiWhisper.mp3', import.meta.url).href,
  flomoSupport: new URL('../../assets/audio/flomoSupport.mp3', import.meta.url).href,
  togarWarning: new URL('../../assets/audio/togarWarning.mp3', import.meta.url).href,
  jallahRival: new URL('../../assets/audio/jallahRival.mp3', import.meta.url).href,
};

export class VoiceSystem {
  constructor() {
    this.ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
    this.enabled = true;
    this.voices = [];
    this.pendingTimer = null;
    this.currentAudio = null;
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

  playLine(id, line, seconds = 4) {
    if (!this.enabled) return;
    const url = AUDIO_LINES[id];
    if (url && this.player) {
      this.playClip(url, line, seconds);
      return;
    }
    this.speak(line);
  }

  playClip(url, line, seconds = 4) {
    if (!this.player) { this.speak(line); return; }
    this.stopPlayback();
    const audio = this.player;
    audio.src = url;
    audio.currentTime = 0;
    this.currentAudio = audio;
    audio.play().catch(() => {
      // Clip blocked or failed to load — the fallback keeps the line audible.
      if (this.currentAudio === audio) this.currentAudio = null;
      this.speak(line);
    });
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
    if (!this.ttsSupported || !this.enabled) return;
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
}

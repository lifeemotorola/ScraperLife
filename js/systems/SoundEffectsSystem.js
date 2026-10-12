const DEFAULT_VOLUME = 0.48;
const SILENCE = 0.0001;

/** Short, original synthesized game effects; no sample files or audio downloads required. */
export class SoundEffectsSystem {
  constructor({ contextFactory = null, volume = DEFAULT_VOLUME } = {}) {
    this.contextFactory = contextFactory;
    this.volume = volume;
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  createContext() {
    if (this.context) return this.context;
    try {
      const AudioContextClass = this.contextFactory
        ? null
        : (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null);
      const context = this.contextFactory ? this.contextFactory() : (AudioContextClass ? new AudioContextClass() : null);
      if (!context) return null;
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(context.destination);
      this.noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      let seed = 0x7f4a7c15;
      for (let i = 0; i < channel.length; i += 1) {
        // Deterministic white noise, so every browser session has the same quiet texture.
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        channel[i] = (seed / 0xffffffff) * 2 - 1;
      }
      return context;
    } catch {
      // Audio is optional; a denied or unavailable context must never block the game.
      this.context = null;
      this.master = null;
      return null;
    }
  }

  unlock() {
    const context = this.createContext();
    if (!context) return Promise.resolve(false);
    if (context.state !== 'suspended') return Promise.resolve(true);
    try { return Promise.resolve(context.resume()).then(() => true).catch(() => false); }
    catch { return Promise.resolve(false); }
  }

  tone({ frequency, endFrequency = frequency, start, duration, volume, type = 'sine', attack = 0.008, pan = 0 }) {
    const context = this.context;
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), start + Math.max(0.003, attack));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

    let output = envelope;
    if (pan && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(pan, start);
      envelope.connect(panner);
      output = panner;
    } else {
      oscillator.connect(envelope);
    }
    output.connect(this.master);
    if (output !== envelope) oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  noise({ start, duration, volume, filter = 'highpass', cutoff = 1200, pan = 0 }) {
    const context = this.context;
    if (!context || !this.master || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filterNode = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noiseBuffer;
    filterNode.type = filter;
    filterNode.frequency.setValueAtTime(cutoff, start);
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(SILENCE, volume), start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, start + duration);
    source.connect(filterNode);
    filterNode.connect(envelope);

    let output = envelope;
    if (pan && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(pan, start);
      envelope.connect(panner);
      output = panner;
    }
    output.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  play(name, strength = 1) {
    const context = this.createContext();
    if (!this.enabled || !context || context.state === 'closed') return false;
    if (context.state === 'suspended') this.unlock();
    const energy = Math.max(0, Math.min(1.5, Number(strength) || 0));
    if (energy === 0) return false;
    const now = context.currentTime + 0.012;

    if (name === 'pickup') {
      this.noise({ start: now, duration: 0.055, volume: 0.14 * energy, cutoff: 1650, pan: -0.08 });
      [[660, 0, 0.19], [990, 0.075, 0.22], [1320, 0.15, 0.28]].forEach(([frequency, delay, volume], index) => {
        this.tone({ frequency, start: now + delay, duration: 0.30 - index * 0.035,
          volume: volume * energy, type: 'sine', attack: 0.004, pan: (index - 1) * 0.16 });
      });
      return true;
    }

    if (name === 'pulse') {
      this.tone({ frequency: 142, endFrequency: 38, start: now, duration: 0.44,
        volume: 0.40 * energy, type: 'sine', attack: 0.012 });
      this.tone({ frequency: 510, endFrequency: 175, start: now + 0.015, duration: 0.32,
        volume: 0.19 * energy, type: 'triangle', attack: 0.01 });
      this.tone({ frequency: 1120, endFrequency: 420, start: now + 0.11, duration: 0.42,
        volume: 0.10 * energy, type: 'sine', attack: 0.02, pan: 0.16 });
      this.noise({ start: now, duration: 0.30, volume: 0.12 * energy, cutoff: 580, filter: 'lowpass' });
      return true;
    }

    if (name === 'repair') {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        this.tone({ frequency, start: now + index * 0.085, duration: 0.34,
          volume: 0.16 * energy, type: 'sine', attack: 0.012, pan: (index - 1.5) * 0.12 });
      });
      this.noise({ start: now, duration: 0.08, volume: 0.08 * energy, cutoff: 2100 });
      return true;
    }

    if (name === 'impact') {
      this.tone({ frequency: 128, endFrequency: 49, start: now, duration: 0.19,
        volume: 0.32 * energy, type: 'triangle', attack: 0.004 });
      this.noise({ start: now, duration: 0.075, volume: 0.12 * energy, cutoff: 760, filter: 'lowpass' });
      return true;
    }

    if (name === 'footstep') {
      this.footstepSide = -(this.footstepSide || 1);
      const pan = this.footstepSide * 0.12;
      this.tone({ frequency: 112, endFrequency: 64, start: now, duration: 0.10,
        volume: 0.18 * energy, type: 'sine', attack: 0.003, pan });
      this.noise({ start: now, duration: 0.06, volume: 0.10 * energy,
        cutoff: 620, filter: 'lowpass', pan });
      return true;
    }

    if (name === 'interact') {
      this.tone({ frequency: 390, endFrequency: 245, start: now, duration: 0.085,
        volume: 0.095 * energy, type: 'triangle', attack: 0.003, pan: -0.05 });
      this.noise({ start: now, duration: 0.027, volume: 0.07 * energy, cutoff: 1750 });
      return true;
    }

    if (name === 'dash') {
      this.tone({ frequency: 220, endFrequency: 580, start: now, duration: 0.16,
        volume: 0.22 * energy, type: 'triangle', attack: 0.005, pan: -0.05 });
      this.noise({ start: now, duration: 0.16, volume: 0.18 * energy, cutoff: 1600, filter: 'bandpass', pan: 0.05 });
      return true;
    }

    if (name === 'ping') {
      this.tone({ frequency: 1760, endFrequency: 2200, start: now, duration: 0.26,
        volume: 0.20 * energy, type: 'sine', attack: 0.004, pan: 0.1 });
      this.tone({ frequency: 880, start: now + 0.06, duration: 0.32,
        volume: 0.14 * energy, type: 'sine', attack: 0.008, pan: -0.1 });
      return true;
    }

    if (name === 'upgrade') {
      [440, 554.37, 659.25, 880, 1108.73].forEach((frequency, index) => {
        this.tone({ frequency, start: now + index * 0.06, duration: 0.30,
          volume: 0.18 * energy, type: 'triangle', attack: 0.006, pan: (index - 2) * 0.1 });
      });
      return true;
    }

    return false;
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); return this.enabled; }

  close() {
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
  }
}

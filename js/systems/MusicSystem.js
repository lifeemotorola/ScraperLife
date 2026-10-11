const MUSIC_URL = new URL('../../assets/audio/platform-loop.wav', import.meta.url).href;
const MUSIC_STORAGE_KEY = 'scraper-life-music';

/** Small loop player for the platform's original, generated instrumental soundtrack. */
export class MusicSystem {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.volume = 0.2;
    this.player = typeof window !== 'undefined' && typeof Audio !== 'undefined'
      ? new Audio(MUSIC_URL)
      : null;

    try { this.enabled = window.localStorage.getItem(MUSIC_STORAGE_KEY) !== 'off'; }
    catch { /* storage may be blocked in private browsing */ }

    if (this.player) {
      this.player.loop = true;
      this.player.preload = 'auto';
      this.player.volume = this.volume;
      this.player.setAttribute('playsinline', '');
    }

    this.document = typeof document !== 'undefined' ? document : null;
    this.resumeAfterVisibility = false;
    this.onVisibilityChange = () => {
      if (!this.player || !this.started || !this.enabled) return;
      if (this.document.hidden) {
        this.resumeAfterVisibility = !this.player.paused;
        if (this.resumeAfterVisibility) this.player.pause();
      } else if (this.resumeAfterVisibility) {
        this.resumeAfterVisibility = false;
        this.start();
      }
    };
    this.document?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  // Called from the START button's gesture, which allows browsers to play the loop without
  // relying on autoplay permission. The track starts quietly under the opening dialogue.
  start() {
    this.started = true;
    if (!this.enabled || !this.player) return Promise.resolve(false);
    try {
      return Promise.resolve(this.player.play()).then(() => true).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  toggle() { return this.setEnabled(!this.enabled); }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try { window.localStorage.setItem(MUSIC_STORAGE_KEY, this.enabled ? 'on' : 'off'); }
    catch { /* storage may be blocked in private browsing */ }

    if (!this.player) return this.enabled;
    if (!this.enabled) {
      this.resumeAfterVisibility = false;
      this.player.pause();
    } else if (this.started) {
      this.start();
    }
    return this.enabled;
  }

  destroy() {
    this.player?.pause();
    this.document?.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}

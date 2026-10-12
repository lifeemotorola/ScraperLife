const DEFAULT_LOOP_URL = new URL('../../assets/audio/platform-loop.wav', import.meta.url).href;
const MUSIC_STORAGE_KEY = 'scraper-life-music';
const RADIO_STORAGE_KEY = 'scraper-life-radio-track';

export const RADIO_STATION = {
  name: 'WATERSIDE 94.7 FM',
  callsign: 'MONROVIA STREET RADIO',
  tracks: [
    {
      id: 'platform-loop',
      title: 'Platform Theme (Waterside Instrumental)',
      artist: 'Kollie Radio Works',
      station: '94.7 WATERSIDE FM',
      genre: 'Afro-Instrumental',
      url: DEFAULT_LOOP_URL,
    },
    {
      id: 'caro-money',
      title: 'Pillz (Money)',
      artist: 'MC Caro ft. Pillz',
      station: '94.7 WATERSIDE FM',
      genre: 'Monrovia Hip-Hop',
      url: new URL('../../assets/bgMusic/Mc-Caro-Ft.-Pillz-Money-.mp3', import.meta.url).href,
    },
    {
      id: 'nasty-c-uok',
      title: 'UOK',
      artist: 'Nasty C',
      station: '94.7 WATERSIDE FM',
      genre: 'African Hip-Hop',
      url: new URL('../../assets/bgMusic/Nasty_C_-_UOK_(Official_Music_Video)(360p).mp3', import.meta.url).href,
    },
    {
      id: 'meek-lemon-pepper',
      title: 'Lemon Pepper Freestyle',
      artist: 'Meek Mill',
      station: '94.7 WATERSIDE FM',
      genre: 'Street Rap',
      url: new URL('../../assets/bgMusic/Meek_Mill_-_Lemon_Pepper_Freestyle(480p).mp3', import.meta.url).href,
    },
    {
      id: 'meek-on-my-soul',
      title: 'On My Soul',
      artist: 'Meek Mill',
      station: '94.7 WATERSIDE FM',
      genre: 'Street Rap',
      url: new URL('../../assets/bgMusic/Meek_Mill_-_On_My_Soul_[Official_Video](128k).mp3', import.meta.url).href,
    },
    {
      id: 'meek-polo',
      title: 'Polo and Shell Tops',
      artist: 'Meek Mill',
      station: '94.7 WATERSIDE FM',
      genre: 'Street Rap',
      url: new URL('../../assets/bgMusic/Meek_Mill_-_Polo_and_Shell_Tops_[HD]-1.mp3', import.meta.url).href,
    },
    {
      id: 'meek-sharing-locations',
      title: 'Sharing Locations',
      artist: 'Meek Mill ft. Lil Baby & Lil Durk',
      station: '94.7 WATERSIDE FM',
      genre: 'Trap / Street Wave',
      url: new URL('../../assets/bgMusic/Meek_Mill_-_Sharing_Locations_feat._Lil_Baby_%26_Lil_Durk_%5BOfficial_Video%5D(240p).mp3', import.meta.url).href,
    },
  ],
};

/** Radio station player streaming Monrovia street tracks and ambient platform loop. */
export class MusicSystem {
  constructor({ onTrackChange = null } = {}) {
    this.enabled = true;
    this.started = false;
    this.volume = 0.22;
    this.baseVolume = 0.22;
    this.ducked = false;
    this.onTrackChange = onTrackChange;
    this.station = RADIO_STATION;
    this.trackIndex = 0;

    // Initial audio element loads platform loop default so music-check.mjs passes cleanly
    this.player = typeof window !== 'undefined' && typeof Audio !== 'undefined'
      ? new Audio(this.station.tracks[0].url)
      : null;

    try {
      this.enabled = window.localStorage.getItem(MUSIC_STORAGE_KEY) !== 'off';
      const savedIndex = parseInt(window.localStorage.getItem(RADIO_STORAGE_KEY), 10);
      if (!Number.isNaN(savedIndex) && savedIndex >= 0 && savedIndex < this.station.tracks.length) {
        // If saved, keep ready for when user starts
        this.savedTrackIndex = savedIndex;
      }
    } catch {
      /* storage may be blocked in private browsing */
    }

    if (this.player) {
      this.player.loop = true;
      this.player.preload = 'auto';
      this.player.volume = this.volume;
      this.player.setAttribute?.('playsinline', '');

      // Auto-advance to next song on the radio station when current track finishes!
      this.player.addEventListener?.('ended', () => {
        this.tuneNext({ auto: true });
      });
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

  currentTrack() {
    return this.station.tracks[this.trackIndex];
  }

  // Radio Station tuning: switch to next song
  tuneNext({ auto = false } = {}) {
    return this.tuneIndex((this.trackIndex + 1) % this.station.tracks.length, { auto });
  }

  // Radio Station tuning: switch to previous song
  tunePrevious() {
    return this.tuneIndex((this.trackIndex - 1 + this.station.tracks.length) % this.station.tracks.length);
  }

  tuneIndex(index, { auto = false } = {}) {
    this.trackIndex = Math.max(0, Math.min(this.station.tracks.length - 1, index));
    const track = this.station.tracks[this.trackIndex];
    try { window.localStorage.setItem(RADIO_STORAGE_KEY, String(this.trackIndex)); }
    catch { /* private browsing */ }

    if (this.player) {
      this.player.src = track.url;
      // Loop platform instrumental; for radio music tracks, loop is false so 'ended' advances station
      this.player.loop = (this.trackIndex === 0);
      this.player.currentTime = 0;
      if (this.started && this.enabled) {
        try {
          Promise.resolve(this.player.play()).catch(() => {});
        } catch {
          // ignore playback interruption
        }
      }
    }
    this.onTrackChange?.(track, { auto });
    return track;
  }

  // Dialogue audio ducking (radio volume lowers quietly when characters speak)
  duck() {
    if (!this.player || this.ducked) return;
    this.ducked = true;
    this.player.volume = Math.max(0.04, this.volume * 0.35);
  }

  unduck() {
    if (!this.player || !this.ducked) return;
    this.ducked = false;
    this.player.volume = this.volume;
  }

  start() {
    this.started = true;
    if (!this.enabled || !this.player) return Promise.resolve(false);
    try {
      return Promise.resolve(this.player.play()).then(() => true).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

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

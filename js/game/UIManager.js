export class UIManager {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      intro: $('intro'), complete: $('complete'), start: $('start-button'), restart: $('restart-button'),
      interaction: $('interaction'), interactionText: $('interaction-text'), toast: $('toast'), subtitle: $('subtitle'),
      progressLabel: $('progress-label'), progressBar: $('progress-bar'),
      resolveBar: $('resolve-bar'), resolveNumber: $('resolve-number'), pulse: $('pulse-status'),
      worldTime: $('world-time'), weather: $('weather-label'), camera: $('camera-label'),
      mapPlayer: $('map-player'), objective: document.querySelector('.map-objective'), finalScrap: $('final-scrap'), finalMissions: $('final-missions'),
      mapPanel: $('map-panel'), worldMap: $('world-map'), worldMapPlayer: $('world-map-player'), worldMapObjective: $('world-map-objective'), worldMapObjectiveLabel: $('world-map-objective-label'), closeWorldMap: $('close-world-map'), mapTitle: $('map-title'),
      settingsButton: $('settings-button'), settingsPanel: $('settings-panel'), settingsClose: $('settings-close'),
      completeCopy: $('complete-copy'),
      touchMap: $('touch-map'), voiceToggle: $('voice-toggle'), musicToggle: $('music-toggle'),
    };
    this.worldBounds = 48; // matches PhysicsEngine limit + water offset; platform expanded to 92 units
    this.worldMapOpen = false;
    this.settingsOpen = false;
    // Touch players have no E key; the interaction prompt should name the button they do have.
    if (matchMedia('(pointer: coarse)').matches) {
      const key = this.el.interaction?.querySelector('kbd');
      if (key) key.textContent = 'USE';
    }
  }

  bindStart(onStart, onRestart) {
    this.el.start.addEventListener('click', onStart);
    this.el.restart.addEventListener('click', onRestart);

    this.el.settingsButton?.addEventListener('click', () => this.toggleSettings());
    this.el.settingsClose?.addEventListener('click', () => this.closeSettings());
    this.el.settingsPanel?.addEventListener('click', (event) => {
      if (event.target === this.el.settingsPanel) this.closeSettings();
    });

    // Platform map: click minimap, press M, or use the mobile MAP button.
    this.el.mapPanel?.addEventListener('click', () => this.toggleWorldMap());
    this.el.mapPanel?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.toggleWorldMap(); }
    });
    this.el.closeWorldMap?.addEventListener('click', () => this.closeMap());
    this.el.worldMap?.addEventListener('click', (event) => {
      if (event.target === this.el.worldMap) this.closeMap();
    });
    this.el.touchMap?.addEventListener('click', () => this.toggleWorldMap());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (this.settingsOpen) { event.preventDefault(); this.closeSettings(); return; }
        if (this.worldMapOpen) { event.preventDefault(); this.closeMap(); return; }
      }
      if (this.settingsOpen) return;
      if (event.key.toLowerCase() === 'm') { event.preventDefault(); this.toggleWorldMap(); }
    });
  }
  // Settings button on desktop and touch; V remains an optional keyboard shortcut.
  bindVoiceToggle(onToggle) {
    const flip = () => this.setVoiceState(onToggle());
    this.el.voiceToggle?.addEventListener('click', (event) => { event.preventDefault(); flip(); });
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.key.toLowerCase() !== 'v') return;
      flip();
    });
  }
  setVoiceState(on) {
    if (!this.el.voiceToggle) return;
    this.el.voiceToggle.textContent = on ? '◉ VOICES ON' : '○ VOICES OFF';
    this.el.voiceToggle.classList.toggle('off', !on);
    this.el.voiceToggle.setAttribute('aria-pressed', String(Boolean(on)));
  }
  bindMusicToggle(onToggle) {
    const flip = () => this.setMusicState(onToggle());
    this.el.musicToggle?.addEventListener('click', (event) => { event.preventDefault(); flip(); });
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.key.toLowerCase() !== 'b') return;
      flip();
    });
  }
  setMusicState(on) {
    if (!this.el.musicToggle) return;
    this.el.musicToggle.textContent = on ? '♫ MUSIC ON' : '♫ MUSIC OFF';
    this.el.musicToggle.classList.toggle('off', !on);
    this.el.musicToggle.setAttribute('aria-pressed', String(Boolean(on)));
  }
  toggleSettings() { this.settingsOpen ? this.closeSettings() : this.openSettings(); }
  openSettings() {
    if (this.worldMapOpen) this.closeMap();
    this.el.settingsPanel?.classList.remove('hidden');
    this.settingsOpen = true;
    this.el.settingsButton?.setAttribute('aria-expanded', 'true');
    this.el.settingsClose?.focus();
  }
  closeSettings({ restoreFocus = true } = {}) {
    this.el.settingsPanel?.classList.add('hidden');
    this.settingsOpen = false;
    this.el.settingsButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.el.settingsButton?.focus();
  }
  toggleWorldMap() { this.worldMapOpen ? this.closeMap() : this.openMap(); }
  openMap() {
    if (this.settingsOpen) this.closeSettings({ restoreFocus: false });
    this.el.worldMap?.classList.remove('hidden');
    this.worldMapOpen = true;
    this.el.mapTitle?.classList.add('expanded');
  }
  closeMap() { this.el.worldMap?.classList.add('hidden'); this.worldMapOpen = false; this.el.mapTitle?.classList.remove('expanded'); }
  startGame() { this.el.intro.classList.add('hidden'); }
  completeGame(scrap, missions = 10) {
    if (this.el.finalScrap) this.el.finalScrap.textContent = scrap;
    if (this.el.finalMissions) this.el.finalMissions.textContent = String(missions).padStart(2,'0');
    if (this.el.completeCopy) this.el.completeCopy.textContent = `You carried ${scrap} pieces of scrap and ${missions} linked jobs across Waterside. Vardee’s name is spoken. Kormah’s ledger is open. Tenneh, Boakai and Sia will carry it from here.`;
    this.el.complete.classList.remove('hidden');
  }
  showInteraction(text) { this.el.interactionText.textContent = text; this.el.interaction.classList.remove('hidden'); }
  hideInteraction() { this.el.interaction.classList.add('hidden'); }
  toast(text, duration = 2400) { clearTimeout(this.toastTimer); this.el.toast.textContent = text; this.el.toast.classList.remove('hidden'); this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), duration); }
  subtitle(text, seconds = 4) { clearTimeout(this.subtitleTimer); this.el.subtitle.textContent = text; this.el.subtitle.classList.remove('hidden'); this.subtitleTimer = setTimeout(() => this.el.subtitle.classList.add('hidden'), seconds * 1000); }
  updateQuest(mission, scrap) {
    this.el.progressLabel.textContent = mission.progress(scrap);
    this.el.progressBar.style.width = `${mission.percent(scrap)}%`;
  }
  updateStatus({ resolve, pulse, player, target, missionTitle, npcs = null }) {
    this.el.resolveBar.style.width = `${resolve}%`;
    this.el.resolveNumber.textContent = Math.ceil(resolve);
    this.el.pulse.textContent = pulse >= 35 ? 'SCRAP PULSE READY' : 'PULSE RECHARGING';
    const dot = document.querySelector('.pulse-dot');
    if (dot) dot.style.background = pulse >= 35 ? 'var(--teal)' : '#61736b';
    const B = this.worldBounds;
    const range = B * 2;
    // minimap
    if (this.el.mapPlayer) {
      this.el.mapPlayer.style.left = `${((player.x + B) / range) * 100}%`;
      this.el.mapPlayer.style.top = `${((player.z + B) / range) * 100}%`;
    }
    if (this.el.objective) {
      this.el.objective.style.left = `${((target.x + B) / range) * 100}%`;
      this.el.objective.style.top = `${((target.z + B) / range) * 100}%`;
    }
    // world map (expanded)
    if (this.el.worldMapPlayer) {
      this.el.worldMapPlayer.style.left = `${((player.x + B) / range) * 100}%`;
      this.el.worldMapPlayer.style.top = `${((player.z + B) / range) * 100}%`;
    }
    if (this.el.worldMapObjective) {
      this.el.worldMapObjective.style.left = `${((target.x + B) / range) * 100}%`;
      this.el.worldMapObjective.style.top = `${((target.z + B) / range) * 100}%`;
      if (this.el.worldMapObjectiveLabel && missionTitle) this.el.worldMapObjectiveLabel.textContent = missionTitle.toUpperCase();
    }
    // update small npc markers on minimap for platform visibility
    const npcMap = {
      kollie: npcs?.kollie?.position || { x: -4, z: -3 },
      tenneh: npcs?.tenneh?.position || { x: 16, z: 13 },
      boakai: npcs?.boakai?.position || { x: 32, z: -3 },
      vardee: npcs?.vardee?.position || { x: -22, z: -16 },
    };
    Object.entries(npcMap).forEach(([id, pos]) => {
      const el = document.getElementById(`map-npc-${id}`);
      if (el) {
        el.style.left = `${((pos.x + B) / range) * 100}%`;
        el.style.top = `${((pos.z + B) / range) * 100}%`;
      }
    });
  }
  updateWorldInfo({ time, label }) { this.el.worldTime.textContent = time; this.el.weather.textContent = label; }
  setCameraView(label) { this.el.camera.textContent = label; }
}

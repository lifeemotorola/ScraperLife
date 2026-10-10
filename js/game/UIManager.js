export class UIManager {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      intro: $('intro'), complete: $('complete'), start: $('start-button'), restart: $('restart-button'),
      interaction: $('interaction'), interactionText: $('interaction-text'), toast: $('toast'), subtitle: $('subtitle'),
      questTitle: $('quest-title'), questDescription: $('quest-description'), progressLabel: $('progress-label'), progressBar: $('progress-bar'),
      resolveBar: $('resolve-bar'), resolveNumber: $('resolve-number'), pulse: $('pulse-status'),
      worldTime: $('world-time'), weather: $('weather-label'), camera: $('camera-label'),
      mapPlayer: $('map-player'), objective: document.querySelector('.map-objective'), finalScrap: $('final-scrap'), finalMissions: $('final-missions'),
      mapPanel: $('map-panel'), worldMap: $('world-map'), worldMapPlayer: $('world-map-player'), worldMapObjective: $('world-map-objective'), worldMapObjectiveLabel: $('world-map-objective-label'), closeWorldMap: $('close-world-map'), mapTitle: $('map-title'),
      missionList: $('mission-list'), missionCount: $('mission-count'), missionCountDetail: $('mission-count-detail'), completeCopy: $('complete-copy'),
      touchMap: $('touch-map'),
    };
    this.worldBounds = 48; // matches PhysicsEngine limit + water offset; platform expanded to 92 units
    this.worldMapOpen = false;
  }

  bindStart(onStart, onRestart) {
    this.el.start.addEventListener('click', onStart);
    this.el.restart.addEventListener('click', onRestart);
    // Platform map: click minimap, press M/ESC, mobile MAP button
    this.el.mapPanel?.addEventListener('click', () => this.toggleWorldMap());
    this.el.mapPanel?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleWorldMap(); }});
    this.el.closeWorldMap?.addEventListener('click', () => this.closeMap());
    this.el.worldMap?.addEventListener('click', (e) => { if (e.target === this.el.worldMap) this.closeMap(); });
    this.el.touchMap?.addEventListener('click', () => this.toggleWorldMap());
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); this.toggleWorldMap(); }
      if (e.key === 'Escape' && this.worldMapOpen) this.closeMap();
    });
  }
  toggleWorldMap() { this.worldMapOpen ? this.closeMap() : this.openMap(); }
  openMap() { this.el.worldMap?.classList.remove('hidden'); this.worldMapOpen = true; this.el.mapTitle?.classList.add('expanded'); }
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
  updateQuest(mission, scrap, missionSystem) {
    this.el.questTitle.textContent = mission.title;
    this.el.questDescription.textContent = mission.description;
    this.el.progressLabel.textContent = mission.progress(scrap);
    this.el.progressBar.style.width = `${mission.percent(scrap)}%`;
    if (missionSystem) {
      const count = missionSystem.progressText || `${String(mission.order||1).padStart(2,'0')} / 10`;
      if (this.el.missionCount) this.el.missionCount.textContent = count;
      if (this.el.missionCountDetail) this.el.missionCountDetail.textContent = `${missionSystem.orderIndex} of ${missionSystem.totalMissions} missions`;
      this.renderMissionList(missionSystem);
    }
  }
  renderMissionList(missionSystem) {
    if (!this.el.missionList || !missionSystem.allMissionsStatus) return;
    const items = missionSystem.allMissionsStatus();
    this.el.missionList.innerHTML = items.map(item =>
      `<div class="mission-item ${item.state}"><b>${String(item.order).padStart(2,'0')}</b> ${item.title}</div>`
    ).join('');
  }
  updateStatus({ resolve, pulse, player, target, missionTitle }) {
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
      'kollie': { x: -4, z: -3 },
      'tenneh': { x: 16, z: 13 },
      'boakai': { x: 21, z: -3 },
      'vardee': { x: -22, z: -16 },
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

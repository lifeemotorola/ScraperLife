export class UIManager {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      intro: $('intro'), complete: $('complete'), start: $('start-button'), restart: $('restart-button'),
      interaction: $('interaction'), interactionText: $('interaction-text'), toast: $('toast'), subtitle: $('subtitle'),
      questTitle: $('quest-title'), questDescription: $('quest-description'), progressLabel: $('progress-label'), progressBar: $('progress-bar'),
      resolveBar: $('resolve-bar'), resolveNumber: $('resolve-number'), pulse: $('pulse-status'),
      worldTime: $('world-time'), weather: $('weather-label'), camera: $('camera-label'),
      mapPlayer: $('map-player'), objective: document.querySelector('.map-objective'), finalScrap: $('final-scrap'),
    };
  }

  bindStart(onStart, onRestart) { this.el.start.addEventListener('click', onStart); this.el.restart.addEventListener('click', onRestart); }
  startGame() { this.el.intro.classList.add('hidden'); }
  completeGame(scrap) { this.el.finalScrap.textContent = scrap; this.el.complete.classList.remove('hidden'); }
  showInteraction(text) { this.el.interactionText.textContent = text; this.el.interaction.classList.remove('hidden'); }
  hideInteraction() { this.el.interaction.classList.add('hidden'); }
  toast(text, duration = 2400) { clearTimeout(this.toastTimer); this.el.toast.textContent = text; this.el.toast.classList.remove('hidden'); this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), duration); }
  subtitle(text, seconds = 4) { clearTimeout(this.subtitleTimer); this.el.subtitle.textContent = text; this.el.subtitle.classList.remove('hidden'); this.subtitleTimer = setTimeout(() => this.el.subtitle.classList.add('hidden'), seconds * 1000); }
  updateQuest(mission, scrap) {
    this.el.questTitle.textContent = mission.title;
    this.el.questDescription.textContent = mission.description;
    this.el.progressLabel.textContent = mission.progress(scrap);
    this.el.progressBar.style.width = `${mission.percent(scrap)}%`;
  }
  updateStatus({ resolve, pulse, player, target }) {
    this.el.resolveBar.style.width = `${resolve}%`;
    this.el.resolveNumber.textContent = Math.ceil(resolve);
    this.el.pulse.textContent = pulse >= 35 ? 'SCRAP PULSE READY' : 'PULSE RECHARGING';
    const dot = document.querySelector('.pulse-dot');
    dot.style.background = pulse >= 35 ? 'var(--teal)' : '#61736b';
    this.el.mapPlayer.style.left = `${((player.x + 29) / 58) * 100}%`;
    this.el.mapPlayer.style.top = `${((player.z + 29) / 58) * 100}%`;
    this.el.objective.style.left = `${((target.x + 29) / 58) * 100}%`;
    this.el.objective.style.top = `${((target.z + 29) / 58) * 100}%`;
  }
  updateWorldInfo({ time, label }) { this.el.worldTime.textContent = time; this.el.weather.textContent = label; }
  setCameraView(label) { this.el.camera.textContent = label; }
}

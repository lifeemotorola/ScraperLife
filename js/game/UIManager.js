import { isEditableTarget } from './InputManager.js';
import { UPGRADE_DEFINITIONS } from '../systems/InventorySystem.js';
import { CHARACTER_DOSSIERS, DISTRICT_INTEL } from '../data/dossier.js';

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
      minimap: $('minimap'),
      mapPanel: $('map-panel'), worldMap: $('world-map'), worldMapPlayer: $('world-map-player'), worldMapObjective: $('world-map-objective'), worldMapObjectiveLabel: $('world-map-objective-label'), closeWorldMap: $('close-world-map'), mapTitle: $('map-title'),
      settingsButton: $('settings-button'), settingsPanel: $('settings-panel'), settingsClose: $('settings-close'),
      completeCopy: $('complete-copy'),
      touchMap: $('touch-map'), voiceToggle: $('voice-toggle'), musicToggle: $('music-toggle'),
      // Scavenger Journal & Workbench
      journalButton: $('journal-button'), journalPanel: $('journal-panel'), journalClose: $('journal-close'),
      tabUpgrades: $('tab-upgrades'), tabDossier: $('tab-dossier'), tabIntel: $('tab-intel'),
      sectionUpgrades: $('journal-content-upgrades'), sectionDossier: $('journal-content-dossier'), sectionIntel: $('journal-content-intel'),
      salvageCount: $('salvage-points-count'), upgradesList: $('upgrades-list'), dossierList: $('dossier-list'), intelList: $('intel-list'),
      touchJournal: $('touch-journal'), touchDash: $('touch-dash'),
    };
    this.worldBounds = 48; // matches PhysicsEngine limit + water offset; platform expanded to 92 units
    this.worldMapOpen = false;
    this.settingsOpen = false;
    this.journalOpen = false;
    this.activeJournalTab = 'upgrades';
    this.onCraftCallback = null;
    this.inventoryRef = null;
    this.missionsRef = null;

    // Touch players have no E key; the interaction prompt should name the button they do have.
    if (matchMedia('(pointer: coarse)').matches) {
      const key = this.el.interaction?.querySelector('kbd');
      if (key) key.textContent = 'USE';
    }
  }

  bindStart(onStart, onRestart) {
    this.el.start?.addEventListener('click', onStart);
    this.el.restart?.addEventListener('click', onRestart);

    this.el.settingsButton?.addEventListener('click', () => this.toggleSettings());
    this.el.settingsClose?.addEventListener('click', () => this.closeSettings());
    this.el.settingsPanel?.addEventListener('click', (event) => {
      if (event.target === this.el.settingsPanel) this.closeSettings();
    });

    // Journal & Workbench
    this.el.journalButton?.addEventListener('click', () => this.toggleJournal());
    this.el.journalClose?.addEventListener('click', () => this.closeJournal());
    this.el.journalPanel?.addEventListener('click', (event) => {
      if (event.target === this.el.journalPanel) this.closeJournal();
    });
    this.el.touchJournal?.addEventListener('click', () => this.toggleJournal());

    this.el.tabUpgrades?.addEventListener('click', () => this.switchJournalTab('upgrades'));
    this.el.tabDossier?.addEventListener('click', () => this.switchJournalTab('dossier'));
    this.el.tabIntel?.addEventListener('click', () => this.switchJournalTab('intel'));

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
      // Typing a name or code must not open the map or journal.
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape') {
        if (this.settingsOpen) { event.preventDefault(); this.closeSettings(); return; }
        if (this.journalOpen) { event.preventDefault(); this.closeJournal(); return; }
        if (this.worldMapOpen) { event.preventDefault(); this.closeMap(); return; }
      }
      if (this.settingsOpen) return;
      if (event.key.toLowerCase() === 'm' && !this.journalOpen) { event.preventDefault(); this.toggleWorldMap(); }
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); this.toggleJournal(); }
    });
  }

  // Scavenger Journal & Workbench
  bindJournalHandlers({ onCraft, inventory, missions }) {
    this.onCraftCallback = onCraft;
    this.inventoryRef = inventory;
    this.missionsRef = missions;
  }

  toggleJournal() {
    this.journalOpen ? this.closeJournal() : this.openJournal();
  }

  openJournal() {
    if (this.settingsOpen) this.closeSettings({ restoreFocus: false });
    if (this.worldMapOpen) this.closeMap();
    this.renderJournal();
    this.el.journalPanel?.classList.remove('hidden');
    this.journalOpen = true;
    this.el.journalButton?.setAttribute('aria-expanded', 'true');
    this.el.journalClose?.focus();
  }

  closeJournal({ restoreFocus = true } = {}) {
    this.el.journalPanel?.classList.add('hidden');
    this.journalOpen = false;
    this.el.journalButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.el.journalButton?.focus();
  }

  switchJournalTab(tabName) {
    this.activeJournalTab = tabName;
    const tabs = [
      { name: 'upgrades', button: this.el.tabUpgrades, section: this.el.sectionUpgrades },
      { name: 'dossier', button: this.el.tabDossier, section: this.el.sectionDossier },
      { name: 'intel', button: this.el.tabIntel, section: this.el.sectionIntel },
    ];
    tabs.forEach(({ name, button, section }) => {
      const active = name === tabName;
      button?.classList.toggle('active', active);
      button?.setAttribute('aria-selected', String(active));
      section?.classList.toggle('hidden', !active);
    });
  }

  renderJournal() {
    if (!this.inventoryRef) return;
    const inv = this.inventoryRef;
    if (this.el.salvageCount) {
      this.el.salvageCount.textContent = `${inv.salvagePoints} UNIT${inv.salvagePoints === 1 ? '' : 'S'}`;
    }

    // Render Upgrades
    if (this.el.upgradesList) {
      this.el.upgradesList.innerHTML = '';
      Object.values(UPGRADE_DEFINITIONS).forEach((def) => {
        const card = document.createElement('div');
        const installed = inv.hasUpgrade(def.id);
        const canAfford = inv.canCraft(def.id);
        card.className = `upgrade-card ${installed ? 'installed' : ''}`;

        let btnHtml = '';
        if (installed) {
          btnHtml = `<button class="upgrade-btn installed" disabled>✓ INSTALLED</button>`;
        } else if (canAfford) {
          btnHtml = `<button class="upgrade-btn craftable" data-id="${def.id}">INSTALL MOD [${def.cost} SCRAP]</button>`;
        } else {
          const needed = def.cost - inv.salvagePoints;
          btnHtml = `<button class="upgrade-btn locked" disabled>NEED ${needed} MORE SCRAP</button>`;
        }

        card.innerHTML = `
          <div class="upgrade-top">
            <div class="upgrade-icon">${def.icon}</div>
            <div class="upgrade-meta">
              <span class="upgrade-category">${def.category}</span>
              <h4 class="upgrade-title">${def.name}</h4>
              <p class="upgrade-desc">${def.description}</p>
            </div>
          </div>
          <div class="upgrade-footer">
            <span class="upgrade-cost">COST: ${def.cost} SALVAGE</span>
            ${btnHtml}
          </div>
        `;
        const btn = card.querySelector('.upgrade-btn.craftable');
        if (btn) {
          btn.addEventListener('click', () => {
            if (this.onCraftCallback?.(def.id)) {
              this.renderJournal();
            }
          });
        }
        this.el.upgradesList.appendChild(card);
      });
    }

    // Render Dossiers (lazy once if empty)
    if (this.el.dossierList && this.el.dossierList.children.length === 0) {
      this.el.dossierList.innerHTML = '';
      CHARACTER_DOSSIERS.forEach((char) => {
        const card = document.createElement('div');
        card.className = 'dossier-card';
        card.innerHTML = `
          <div class="dossier-top">
            <h4 class="dossier-name">${char.name}</h4>
            <span class="dossier-status ${char.status}">${char.status}</span>
          </div>
          <span class="dossier-role">${char.role}</span>
          <span class="dossier-district">📍 ${char.district}</span>
          <p class="dossier-bio">${char.bio}</p>
        `;
        this.el.dossierList.appendChild(card);
      });
    }

    // Render Intel
    if (this.el.intelList) {
      this.el.intelList.innerHTML = '';
      if (this.missionsRef) {
        const step = this.missionsRef.mission;
        const activeCard = document.createElement('div');
        activeCard.className = 'intel-card';
        activeCard.style.borderLeftColor = 'var(--teal)';
        activeCard.innerHTML = `
          <span class="eyebrow" style="color:var(--teal)">CURRENT JOB // STEP ${this.missionsRef.progressText}</span>
          <h4 class="intel-title">${step.title}</h4>
          <p class="intel-desc">${step.instruction || 'Follow the platform tracking marker.'}</p>
        `;
        this.el.intelList.appendChild(activeCard);
      }
      DISTRICT_INTEL.forEach((intel) => {
        const card = document.createElement('div');
        card.className = 'intel-card';
        card.innerHTML = `
          <span class="eyebrow">${intel.tag}</span>
          <h4 class="intel-title">${intel.title}</h4>
          <p class="intel-desc">${intel.description}</p>
        `;
        this.el.intelList.appendChild(card);
      });
    }
  }

  // Radar ping on minimap
  showRadarPing(worldPos) {
    if (!this.radarPingMarker) {
      this.radarPingMarker = document.createElement('i');
      this.radarPingMarker.className = 'map-scrap-ping pulsing';
      this.el.minimap?.appendChild(this.radarPingMarker);
    }
    const B = this.worldBounds;
    const range = B * 2;
    const left = `${((worldPos.x + B) / range) * 100}%`;
    const top = `${((worldPos.z + B) / range) * 100}%`;
    this.radarPingMarker.style.left = left;
    this.radarPingMarker.style.top = top;
    this.radarPingMarker.classList.remove('hidden');
  }

  hideRadarPing() {
    this.radarPingMarker?.classList.add('hidden');
  }

  // Settings button on desktop and touch; V remains an optional keyboard shortcut.
  bindVoiceToggle(onToggle) {
    const flip = () => this.setVoiceState(onToggle());
    this.el.voiceToggle?.addEventListener('click', (event) => { event.preventDefault(); flip(); });
    window.addEventListener('keydown', (event) => {
      if (isEditableTarget(event.target)) return;
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
      if (isEditableTarget(event.target)) return;
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
    if (this.journalOpen) this.closeJournal({ restoreFocus: false });
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
    if (this.journalOpen) this.closeJournal({ restoreFocus: false });
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

  setRemoteDots(players) {
    const B = this.worldBounds;
    const range = B * 2;
    const minimap = this.el.mapPlayer?.parentElement;
    const grid = document.getElementById('world-map-grid');
    if (!this.remoteDots) this.remoteDots = new Map();
    const seen = new Set();
    for (const player of players) {
      seen.add(player.id);
      let dots = this.remoteDots.get(player.id);
      if (!dots) {
        const mini = document.createElement('i');
        mini.className = 'map-remote';
        const world = document.createElement('div');
        world.className = 'world-map-point remote';
        const pin = document.createElement('b');
        const label = document.createElement('span');
        world.append(pin, label);
        minimap?.append(mini);
        grid?.append(world);
        dots = { mini, world, label };
        this.remoteDots.set(player.id, dots);
      }
      const left = `${((player.x + B) / range) * 100}%`;
      const top = `${((player.z + B) / range) * 100}%`;
      dots.mini.style.left = left; dots.mini.style.top = top;
      dots.world.style.left = left; dots.world.style.top = top;
      dots.label.textContent = `${player.name.toUpperCase()} · ${(player.characterId || '').toUpperCase()}`;
    }
    for (const [id, dots] of this.remoteDots) {
      if (seen.has(id)) continue;
      dots.mini.remove();
      dots.world.remove();
      this.remoteDots.delete(id);
    }
  }

  updateStatus({ resolve, maxResolve = 100, pulse, player, target, missionTitle, npcs = null }) {
    const pct = Math.max(0, Math.min(100, (resolve / maxResolve) * 100));
    this.el.resolveBar.style.width = `${pct}%`;
    this.el.resolveNumber.textContent = Math.ceil(resolve);
    this.el.pulse.textContent = pulse >= 35 ? 'SCRAP PULSE READY' : 'PULSE RECHARGING';
    const dot = document.querySelector('.pulse-dot');
    if (dot) dot.style.background = pulse >= 35 ? 'var(--teal)' : '#61736b';
    const B = this.worldBounds;
    const range = B * 2;
    if (this.el.mapPlayer) {
      this.el.mapPlayer.style.left = `${((player.x + B) / range) * 100}%`;
      this.el.mapPlayer.style.top = `${((player.z + B) / range) * 100}%`;
    }
    if (this.el.objective) {
      this.el.objective.style.left = `${((target.x + B) / range) * 100}%`;
      this.el.objective.style.top = `${((target.z + B) / range) * 100}%`;
    }
    if (this.el.worldMapPlayer) {
      this.el.worldMapPlayer.style.left = `${((player.x + B) / range) * 100}%`;
      this.el.worldMapPlayer.style.top = `${((player.z + B) / range) * 100}%`;
    }
    if (this.el.worldMapObjective) {
      this.el.worldMapObjective.style.left = `${((target.x + B) / range) * 100}%`;
      this.el.worldMapObjective.style.top = `${((target.z + B) / range) * 100}%`;
      if (this.el.worldMapObjectiveLabel && missionTitle) this.el.worldMapObjectiveLabel.textContent = missionTitle.toUpperCase();
    }
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

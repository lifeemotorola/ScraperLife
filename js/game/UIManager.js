import { isEditableTarget } from './InputManager.js';
import { UPGRADE_DEFINITIONS } from '../systems/InventorySystem.js';
import { CHARACTER_DOSSIERS, DISTRICT_INTEL } from '../data/dossier.js';
import { MUSIC_INTEL, RADIO_NEWS_BULLETINS } from '../data/musicIntel.js';

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
      mapPanel: $('map-panel'), worldMap: $('world-map'), worldMapGrid: $('world-map-grid'), worldMapPlayer: $('world-map-player'), worldMapObjective: $('world-map-objective'), worldMapObjectiveLabel: $('world-map-objective-label'), closeWorldMap: $('close-world-map'), mapTitle: $('map-title'),
      settingsButton: $('settings-button'), settingsPanel: $('settings-panel'), settingsClose: $('settings-close'),
      completeCopy: $('complete-copy'),
      touchMap: $('touch-map'), voiceToggle: $('voice-toggle'), musicToggle: $('music-toggle'),
      // Radio Station
      radioLine: $('radio-station-line'), radioTrackName: $('radio-track-name'), radioTuneBtn: $('radio-tune-btn'), radioNewsBtn: $('radio-news-btn'), radioTuneSettingsBtn: $('radio-tune-settings-btn'),
      // Scavenger Journal & Workbench
      journalButton: $('journal-button'), journalPanel: $('journal-panel'), journalClose: $('journal-close'),
      tabUpgrades: $('tab-upgrades'), tabDossier: $('tab-dossier'), tabIntel: $('tab-intel'), tabRadioIntel: $('tab-radio-intel'),
      sectionUpgrades: $('journal-content-upgrades'), sectionDossier: $('journal-content-dossier'), sectionIntel: $('journal-content-intel'), sectionRadioIntel: $('journal-content-radio-intel'),
      salvageCount: $('salvage-points-count'), upgradesList: $('upgrades-list'), dossierList: $('dossier-list'), intelList: $('intel-list'), radioIntelList: $('radio-intel-list'), radioIntelStats: $('radio-intel-stats'), radioNewsList: $('radio-news-list'),
      touchJournal: $('touch-journal'), touchDash: $('touch-dash'),
    };
    // The minimap is a window of 2 × worldBounds metres, centred on the player (the world has no edge).
    this.worldBounds = 48;
    this.mapCentre = { x: 0, z: 0 };
    this.worldMapOpen = false;
    this.settingsOpen = false;
    this.journalOpen = false;
    this.activeJournalTab = 'upgrades';
    this.onCraftCallback = null;
    this.onMapPulseCallback = null;
    this.onTuneRadioCallback = null;
    this.onAirNewsCallback = null;
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
    this.el.tabRadioIntel?.addEventListener('click', () => this.switchJournalTab('radio'));

    // Radio station tuning
    this.el.radioTuneBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onTuneRadioCallback?.();
    });
    this.el.radioNewsBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onAirNewsCallback?.();
    });
    this.el.radioLine?.addEventListener('click', (event) => {
      if (event.target !== this.el.radioTuneBtn && event.target !== this.el.radioNewsBtn) this.onTuneRadioCallback?.();
    });
    this.el.radioTuneSettingsBtn?.addEventListener('click', () => {
      this.onTuneRadioCallback?.();
    });

    // Map: clicking on the map pulses the game!
    this.el.minimap?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.triggerMapPulse(event, false);
    });
    this.el.mapTitle?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleWorldMap();
    });
    this.el.mapPanel?.addEventListener('click', (event) => {
      if (this.el.mapTitle && (event.target === this.el.mapTitle || this.el.mapTitle.contains(event.target))) {
        this.toggleWorldMap();
      } else {
        this.triggerMapPulse(event, false);
      }
    });
    this.el.mapPanel?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.toggleWorldMap(); }
    });
    this.el.worldMapGrid?.addEventListener('click', (event) => {
      this.triggerMapPulse(event, true);
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
      if (event.key.toLowerCase() === 'r' && !event.repeat) { event.preventDefault(); this.onTuneRadioCallback?.(); }
      if (event.key.toLowerCase() === 'n' && !event.repeat) { event.preventDefault(); this.onAirNewsCallback?.(); }
    });
  }

  // Radio Station
  bindRadioTune(onTune) {
    this.onTuneRadioCallback = onTune;
  }

  bindAirNews(onAirNews) {
    this.onAirNewsCallback = onAirNews;
  }

  setRadioTrack(track) {
    if (!track) return;
    if (this.el.radioTrackName) {
      this.el.radioTrackName.textContent = `${track.title.toUpperCase()} — ${track.artist.toUpperCase()}`;
    }
    if (this.el.radioTuneSettingsBtn) {
      this.el.radioTuneSettingsBtn.textContent = `📻 ${track.station} // ${track.title.toUpperCase()}`;
    }
  }

  // Map Pulse
  bindMapPulse(onPulse) {
    this.onMapPulseCallback = onPulse;
  }

  triggerMapPulse(event, isWorldMap = false) {
    this.onMapPulseCallback?.();
    const container = isWorldMap ? this.el.worldMapGrid : this.el.minimap;
    if (!container) return;
    const rect = container.getBoundingClientRect?.() || { left: 0, top: 0 };
    const x = (event?.clientX !== undefined && rect.left !== undefined)
      ? (event.clientX - rect.left)
      : (container.clientWidth || 100) / 2;
    const y = (event?.clientY !== undefined && rect.top !== undefined)
      ? (event.clientY - rect.top)
      : (container.clientHeight || 100) / 2;

    const ripple = document.createElement('i');
    ripple.className = 'map-click-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    container.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  // Scavenger Journal & Workbench
  bindJournalHandlers({ onCraft, inventory, missions, music = null, unlockedMusicPoints = null, onTuneTrack = null, onAirNews = null }) {
    this.onCraftCallback = onCraft;
    this.inventoryRef = inventory;
    this.missionsRef = missions;
    this.musicRef = music;
    this.unlockedMusicPointsRef = unlockedMusicPoints;
    this.onTuneTrackCallback = onTuneTrack;
    if (onAirNews) this.onAirNewsCallback = onAirNews;
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
      { name: 'radio', button: this.el.tabRadioIntel, section: this.el.sectionRadioIntel },
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

    // Render Radio Broadcasts & Music Intel
    this.renderRadioIntel();
  }

  renderRadioIntel() {
    const currentTrack = this.musicRef?.currentTrack?.();
    const unlocked = this.unlockedMusicPointsRef || new Set();

    // Render Radio News Bulletins
    if (this.el.radioNewsList) {
      this.el.radioNewsList.innerHTML = '';
      RADIO_NEWS_BULLETINS.forEach((bulletin) => {
        const isHeard = unlocked.has(`news-${bulletin.id}`);
        const card = document.createElement('div');
        card.className = `radio-news-card ${isHeard ? 'unlocked' : ''}`;
        const dialogueLines = bulletin.steps.map((s) => `
          <div class="radio-dialogue-turn ${s.speaker.includes('KPANNAH') ? 'female-host' : 'male-host'}">
            <b>${s.speaker}:</b> ${s.line}
          </div>
        `).join('');

        card.innerHTML = `
          <div class="radio-news-card-head">
            <span class="radio-news-card-cat">${bulletin.category}</span>
            <span class="radio-news-card-status">${isHeard ? '✓ HEARD (+1 SALVAGE)' : '📢 BROADCAST READY'}</span>
          </div>
          <h4 class="radio-news-card-title">${bulletin.headline}</h4>
          <div class="radio-news-dialogue-box">
            ${dialogueLines}
          </div>
          <button class="radio-air-news-btn" type="button">▶ AIR THIS NEWS BULLETIN</button>
        `;

        card.querySelector('.radio-air-news-btn')?.addEventListener('click', () => {
          this.onAirNewsCallback?.(bulletin.id);
          this.closeJournal();
        });

        this.el.radioNewsList.appendChild(card);
      });
    }

    if (!this.el.radioIntelList) return;
    this.el.radioIntelList.innerHTML = '';

    let totalPoints = 0;
    let unlockedPoints = 0;

    Object.values(MUSIC_INTEL).forEach((item) => {
      const isCurrent = currentTrack?.id === item.id;
      const card = document.createElement('div');
      card.className = `radio-intel-card ${isCurrent ? 'now-playing' : ''}`;

      const residentIds = Object.keys(item.npcQuotes || {});
      totalPoints += residentIds.length + 1; // 1 broadcast + 1 per resident
      const broadcastUnlocked = unlocked.has(`broadcast-${item.id}`);
      if (broadcastUnlocked) unlockedPoints += 1;

      const pointsHtml = item.culturalPoints.map((pt) => `<li>${pt}</li>`).join('');

      const quotesHtml = residentIds.map((npcId) => {
        const quote = item.npcQuotes[npcId];
        const isUnlocked = unlocked.has(`${npcId}-${item.id}`);
        if (isUnlocked) unlockedPoints += 1;
        const npcName = npcId.toUpperCase();
        return `
          <div class="npc-commentary-row ${isUnlocked ? 'unlocked' : 'locked'}">
            <div class="npc-commentary-head">
              <span class="npc-commentary-name">👤 ${npcName}</span>
              <span class="npc-commentary-status">${isUnlocked ? '✓ POINT COLLECTED (+1 SALVAGE)' : '🔒 TALK TO ' + npcName}</span>
            </div>
            <p class="npc-commentary-text">“${quote}”</p>
          </div>
        `;
      }).join('');

      const cohostHtml = (item.cohostDialogue || []).map((step) => `
        <div class="radio-dialogue-turn ${step.speaker.includes('KPANNAH') ? 'female-host' : 'male-host'}">
          <b>${step.speaker}:</b> “${step.line}”
        </div>
      `).join('');

      card.innerHTML = `
        <div class="radio-card-header">
          <div>
            <div class="radio-card-badges">
              <span class="radio-badge-station">${item.station}</span>
              <span class="radio-badge-genre">${item.genre}</span>
              ${isCurrent ? '<span class="radio-badge-live">● ON AIR NOW</span>' : ''}
            </div>
            <h3 class="radio-card-title">${item.title}</h3>
            <h4 class="radio-card-artist">BY ${item.artist.toUpperCase()}</h4>
          </div>
          <button class="radio-tune-track-btn" data-track-id="${item.id}" type="button">
            ${isCurrent ? '▶ PLAYING NOW' : '📻 TUNE TRACK ❯'}
          </button>
        </div>

        <div class="radio-broadcast-quote">
          <div class="radio-broadcast-head">
            <span class="radio-broadcast-tag">📻 LIVE AIRWAVES BANTER // ${item.broadcaster}</span>
            <span class="radio-broadcast-status">${broadcastUnlocked ? '✓ BROADCAST RECORDED' : '🔒 LISTEN ON RADIO'}</span>
          </div>
          <div class="radio-cohost-conversation">
            ${cohostHtml || `<p class="radio-broadcast-p">${item.broadcastLine}</p>`}
          </div>
        </div>

        <div class="radio-points-block">
          <h5 class="radio-points-heading">WHAT WE KNOW ABOUT THIS MUSIC:</h5>
          <ul class="radio-points-list">
            ${pointsHtml}
          </ul>
        </div>

        <div class="radio-residents-block">
          <h5 class="radio-residents-heading">WATERSIDE VOICES // RESIDENT PERSPECTIVES:</h5>
          <div class="npc-commentary-grid">
            ${quotesHtml}
          </div>
        </div>
      `;

      card.querySelector('.radio-tune-track-btn')?.addEventListener('click', () => {
        this.onTuneTrackCallback?.(item.id);
        this.renderRadioIntel();
      });

      this.el.radioIntelList.appendChild(card);
    });

    if (this.el.radioIntelStats) {
      this.el.radioIntelStats.textContent = `${unlockedPoints} / ${totalPoints} MUSIC POINTS DISCOVERED`;
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
    const left = `${((worldPos.x - this.mapCentre.x + B) / range) * 100}%`;
    const top = `${((worldPos.z - this.mapCentre.z + B) / range) * 100}%`;
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

  // House names, drawn on the expanded world map at each house's position. They are re-placed
  // every frame with the other map points (see the HUD update), so they follow the map centre.
  setPlaceNames(places = []) {
    const grid = this.el.worldMapGrid;
    this.placeMarkers?.forEach((marker) => marker.world.remove());
    this.placeMarkers = [];
    for (const { x, z, label } of places) {
      if (!label || !grid) continue;
      const world = document.createElement('div');
      world.className = 'world-map-point place';
      const pin = document.createElement('b');
      const text = document.createElement('span');
      text.textContent = label;
      world.append(pin, text);
      grid.append(world);
      this.placeMarkers.push({ x, z, world });
    }
    this.positionPlaceMarkers();
  }

  positionPlaceMarkers() {
    if (!this.placeMarkers?.length) return;
    const B = this.worldBounds;
    const range = B * 2;
    for (const marker of this.placeMarkers) {
      const u = (marker.x - this.mapCentre.x + B) / range;
      const v = (marker.z - this.mapCentre.z + B) / range;
      marker.world.style.left = `${u * 100}%`;
      marker.world.style.top = `${v * 100}%`;
      marker.world.hidden = u < 0 || u > 1 || v < 0 || v > 1;
    }
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
      const left = `${((player.x - this.mapCentre.x + B) / range) * 100}%`;
      const top = `${((player.z - this.mapCentre.z + B) / range) * 100}%`;
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
    this.mapCentre = { x: player.x, z: player.z };
    if (this.el.mapPlayer) {
      this.el.mapPlayer.style.left = `${((player.x - this.mapCentre.x + B) / range) * 100}%`;
      this.el.mapPlayer.style.top = `${((player.z - this.mapCentre.z + B) / range) * 100}%`;
    }
    if (this.el.objective) {
      this.el.objective.style.left = `${((target.x - this.mapCentre.x + B) / range) * 100}%`;
      this.el.objective.style.top = `${((target.z - this.mapCentre.z + B) / range) * 100}%`;
    }
    if (this.el.worldMapPlayer) {
      this.el.worldMapPlayer.style.left = `${((player.x - this.mapCentre.x + B) / range) * 100}%`;
      this.el.worldMapPlayer.style.top = `${((player.z - this.mapCentre.z + B) / range) * 100}%`;
    }
    this.positionPlaceMarkers();
    if (this.el.worldMapObjective) {
      this.el.worldMapObjective.style.left = `${((target.x - this.mapCentre.x + B) / range) * 100}%`;
      this.el.worldMapObjective.style.top = `${((target.z - this.mapCentre.z + B) / range) * 100}%`;
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
        el.style.left = `${((pos.x - this.mapCentre.x + B) / range) * 100}%`;
        el.style.top = `${((pos.z - this.mapCentre.z + B) / range) * 100}%`;
      }
    });
  }

  updateWorldInfo({ time, label }) { this.el.worldTime.textContent = time; this.el.weather.textContent = label; }
  setCameraView(label) { this.el.camera.textContent = label; }
}

import { MISSION_STEPS, MISSION_ORDER, TOTAL_MISSIONS } from '../data/missions.js';

export class MissionSystem {
  constructor(inventory) { this.inventory = inventory; this.phase = 'gather'; this.ledgerCollected = false; this.vardeeConfronted = false; }
  get mission() {
    if (this.phase === 'gather' && this.inventory.hasScrap(7)) return MISSION_STEPS.return;
    return MISSION_STEPS[this.phase];
  }
  get totalMissions() { return TOTAL_MISSIONS; }
  get orderIndex() { return MISSION_ORDER.indexOf(this.phase) + 1; }
  get canRepair() { return this.phase === 'gather' && this.inventory.hasScrap(7); }
  get progressText() { const idx = this.orderIndex; return `${String(idx).padStart(2,'0')} / ${String(TOTAL_MISSIONS).padStart(2,'0')}`; }

  // Platform helper for UI
  allMissionsStatus() {
    return MISSION_ORDER.map((id, idx) => {
      const step = MISSION_STEPS[id];
      const currentIdx = MISSION_ORDER.indexOf(this.phase);
      let state = 'upcoming';
      if (idx < currentIdx) state = 'done';
      else if (idx === currentIdx) state = 'active';
      // special case for gather->return display
      if (id === 'gather' && this.inventory.hasScrap(7) && this.phase === 'gather') state = 'done';
      if (id === 'return' && this.phase === 'gather' && this.inventory.hasScrap(7)) state = 'active';
      return { id, title: step.title, order: step.order, state };
    });
  }

  repairRadio() { if (!this.canRepair) return false; this.phase = 'mentor'; return true; }
  speakWithKollie() { if (this.phase !== 'mentor') return false; this.phase = 'market'; return true; }
  speakWithTenneh() {
    if (this.phase === 'market') { this.phase = 'complete'; return true; }
    if (this.phase === 'finale') { this.phase = 'finale_complete'; return true; }
    return false;
  }
  completeToDocks() { if (this.phase !== 'complete') return false; this.phase = 'docks'; return true; }
  speakWithBoakai() { if (this.phase !== 'docks') return false; this.phase = 'boakai'; return true; }
  enterWarehouse() { if (this.phase !== 'boakai') return false; this.phase = 'warehouse'; return true; }
  collectLedger() { if (this.phase !== 'warehouse') return false; this.ledgerCollected = true; this.phase = 'vardee'; return true; }
  confrontVardee() { if (this.phase !== 'vardee') return false; this.vardeeConfronted = true; this.phase = 'finale'; return true; }
  is(phase) { return this.phase === phase; }
  isComplete() { return this.phase === 'finale_complete'; }
}

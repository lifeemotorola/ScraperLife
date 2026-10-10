import { MISSION_STEPS } from '../data/missions.js';

export class MissionSystem {
  constructor(inventory) { this.inventory = inventory; this.phase = 'gather'; }
  get mission() {
    if (this.phase === 'gather' && this.inventory.hasScrap(7)) return MISSION_STEPS.return;
    return MISSION_STEPS[this.phase];
  }
  get canRepair() { return this.phase === 'gather' && this.inventory.hasScrap(7); }
  repairRadio() { if (!this.canRepair) return false; this.phase = 'mentor'; return true; }
  speakWithKollie() { if (this.phase !== 'mentor') return false; this.phase = 'market'; return true; }
  speakWithTenneh() { if (this.phase !== 'market') return false; this.phase = 'complete'; return true; }
  is(phase) { return this.phase === phase; }
}

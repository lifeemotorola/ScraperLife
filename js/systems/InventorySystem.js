export const UPGRADE_DEFINITIONS = {
  radar_echo: {
    id: 'radar_echo',
    name: 'Echo Sonar Radar',
    cost: 2,
    icon: '📡',
    category: 'SCANNER',
    description: 'Scrap Pulse emits an electromagnetic echo that tracks uncollected salvage and pings their location on your compass and map.',
  },
  kinetic_coil: {
    id: 'kinetic_coil',
    name: 'Kinetic Evade Coil',
    cost: 2,
    icon: '⚡',
    category: 'MOBILITY',
    description: 'Installs micro-capacitors into Markie’s boots, supercharging the Quick Dash (Q / DASH) with longer distance and faster cooldown.',
  },
  pulse_overcharge: {
    id: 'pulse_overcharge',
    name: 'Overcharged Pulse',
    cost: 3,
    icon: '💥',
    category: 'ELECTRONICS',
    description: 'Amplifies Scrap Pulse stun radius to 8.2m, extends watch disruption duration to 7.5s, and speeds up pulse recharge by 35%.',
  },
  insulated_vest: {
    id: 'insulated_vest',
    name: 'Insulated Scraper Vest',
    cost: 3,
    icon: '🛡️',
    category: 'DEFENSE',
    description: 'Reinforces Markie’s work jacket with composite lining. Increases Max Resolve to 135 and enables passive recovery.',
  },
};

export class InventorySystem {
  constructor() {
    this.scrap = 0;
    this.salvagePoints = 0;
    this.upgrades = new Set();
  }

  collectScrap() {
    this.scrap += 1;
    this.salvagePoints += 1;
    return this.scrap;
  }

  hasScrap(amount) {
    return this.scrap >= amount;
  }

  hasUpgrade(id) {
    return this.upgrades.has(id);
  }

  canCraft(id) {
    const def = UPGRADE_DEFINITIONS[id];
    if (!def) return false;
    if (this.upgrades.has(id)) return false;
    return this.salvagePoints >= def.cost;
  }

  craft(id) {
    const def = UPGRADE_DEFINITIONS[id];
    if (!def || !this.canCraft(id)) return false;
    this.salvagePoints -= def.cost;
    this.upgrades.add(id);
    return true;
  }
}

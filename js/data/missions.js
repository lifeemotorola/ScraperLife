export const MISSION_STEPS = {
  gather: {
    id: 'gather',
    title: 'The Weight of Truth',
    description: 'Old Man Kollie needs parts to power his radio. Search Waterside for usable scrap.',
    progress: (scrap) => `SCRAP ${scrap} / 7`,
    percent: (scrap) => Math.min(100, scrap / 7 * 100),
    order: 1,
  },
  return: {
    id: 'return',
    title: 'Bring Back the Signal',
    description: 'Return seven usable pieces of scrap to Old Man Kollie’s workshop.',
    progress: () => 'SCRAP READY // RADIO SHOP',
    percent: () => 100,
    order: 2,
  },
  mentor: {
    id: 'mentor',
    title: 'What Kollie Knows',
    description: 'The radio is alive. Speak with Old Man Kollie about Markie’s parents.',
    progress: () => 'RADIO // ONLINE',
    percent: () => 72,
    order: 3,
  },
  market: {
    id: 'market',
    title: 'Market Eyes',
    description: 'Find Tenneh at Waterside Market. She may know who has been watching Markie.',
    progress: () => 'OBJECTIVE // WATERSIDE MARKET',
    percent: () => 86,
    order: 4,
  },
  complete: {
    id: 'complete',
    title: 'A Name in the Dark',
    description: 'Tenneh has named Vardee and Kormah. You have a first lead — now cross-check it at the docks.',
    progress: () => 'CHAPTER 1 // COMPLETE',
    percent: () => 100,
    order: 5,
  },
  docks: {
    id: 'docks',
    title: 'Harbor Lights',
    description: 'The harbor never sleeps. Find Boakai at the eastern docks — he trades in tools and whispers.',
    progress: () => 'OBJECTIVE // EAST DOCKS — BOAKAI',
    percent: () => 18,
    order: 6,
  },
  boakai: {
    id: 'boakai',
    title: 'The Fixer’s Price',
    description: 'Boakai will talk, but the old ledger in Warehouse 6 is his proof. Bring it to him.',
    progress: () => 'RETRIEVE // WAREHOUSE 6 LEDGER',
    percent: () => 42,
    order: 7,
  },
  warehouse: {
    id: 'warehouse',
    title: 'Ledger of Rust',
    description: 'Warehouse 6 holds what Vardee tried to bury. Get inside, find the rusted ledger.',
    progress: () => 'SEARCH // WAREHOUSE 6 [3, -23]',
    percent: () => 65,
    order: 8,
  },
  vardee: {
    id: 'vardee',
    title: 'Every Street Has a Price',
    description: 'The ledger names Vardee. Confront him at the old interchange before Kormah erases it.',
    progress: () => 'CONFRONT // VARDEE AT INTERCHANGE',
    percent: () => 88,
    order: 9,
  },
  finale: {
    id: 'finale',
    title: 'The City Still Remembers',
    description: 'You have the words. Return to Tenneh and Sia — the market must hear them together.',
    progress: () => 'FINALE // RETURN TO MARKET',
    percent: () => 100,
    order: 10,
  },
};

export const MISSION_ORDER = ['gather','return','mentor','market','complete','docks','boakai','warehouse','vardee','finale'];

// Platform helper: get next mission in chain
export function getMissionByOrder(order) {
  return Object.values(MISSION_STEPS).find(m => m.order === order);
}
export const TOTAL_MISSIONS = MISSION_ORDER.length;

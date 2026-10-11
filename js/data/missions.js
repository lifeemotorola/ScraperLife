// Season One mission chain. Chapter titles follow the "Scraper Life: The City Still Remembers"
// draft; the chapter number in each comment matches the draft's chapter headings.
export const MISSION_STEPS = {
  gather: {
    id: 'gather',
    title: 'Seven Pieces', // Ch. 1
    description: 'Old Man Kollie needs parts to power his radio. Search Waterside for seven good pieces of scrap.',
    progress: (scrap) => `SCRAP ${scrap} / 7`,
    percent: (scrap) => Math.min(100, scrap / 7 * 100),
    order: 1,
  },
  return: {
    id: 'return',
    title: 'Bring Back the Signal', // Ch. 2
    description: 'Return seven usable pieces of scrap to Old Man Kollie’s workshop.',
    progress: () => 'SCRAP READY // RADIO SHOP',
    percent: () => 100,
    order: 2,
  },
  mentor: {
    id: 'mentor',
    title: 'What Kollie Knows', // Ch. 3
    description: 'The radio is alive. Speak with Old Man Kollie about Markie’s parents.',
    progress: () => 'RADIO // ONLINE',
    percent: () => 72,
    order: 3,
  },
  market: {
    id: 'market',
    title: 'Market Eyes', // Ch. 4
    description: 'Find Tenneh at Waterside Market. She may know who has been watching Markie.',
    progress: () => 'OBJECTIVE // WATERSIDE MARKET',
    percent: () => 86,
    order: 4,
  },
  complete: {
    id: 'complete',
    title: 'A Name in the Dark', // Ch. 4 (end)
    description: 'Tenneh has named Vardee and Kormah. You have a first lead — now cross-check it at the docks.',
    progress: () => 'CHAPTER 1 // COMPLETE',
    percent: () => 100,
    order: 5,
  },
  docks: {
    id: 'docks',
    title: 'Harbor Lights', // Ch. 5
    description: 'The harbor never sleeps. Find Boakai at the eastern docks — he trades in tools and whispers.',
    progress: () => 'OBJECTIVE // EAST DOCKS — BOAKAI',
    percent: () => 18,
    order: 6,
  },
  boakai: {
    id: 'boakai',
    title: 'The Fixer’s Price', // Ch. 5 (end)
    description: 'Boakai knows where Warehouse 6 keeps its ledger. Ask him where to look for it.',
    progress: () => 'ASK // BOAKAI FOR THE LOCATION',
    percent: () => 30,
    order: 7,
  },
  rival: {
    id: 'rival',
    title: 'The Rival’s Road', // Ch. 6
    description: 'Jallah has been watching the road to Warehouse 6. He remembers the night the street changed. Find him.',
    progress: () => 'OBJECTIVE // JALLAH — OLD HARBOR ROAD',
    percent: () => 40,
    order: 8,
  },
  warehouse: {
    id: 'warehouse',
    title: 'Ledger of Rust', // Ch. 7
    description: 'Warehouse 6 holds what Vardee tried to bury. Get inside, find the rusted ledger.',
    progress: () => 'SEARCH // WAREHOUSE 6 [3, -23]',
    percent: () => 55,
    order: 9,
  },
  copies: {
    id: 'copies',
    title: 'Copies of Every Paper', // Ch. 8
    description: 'The ledger is the only proof. Take it to Boakai and have every page copied before Kormah’s office can reach it.',
    progress: () => 'COPY // BOAKAI — EAST DOCKS',
    percent: () => 65,
    order: 10,
  },
  vardee: {
    id: 'vardee',
    title: 'Every Street Has a Price', // Ch. 9
    description: 'The ledger names Vardee. Confront him at the old interchange before Kormah erases it.',
    progress: () => 'CONFRONT // VARDEE AT INTERCHANGE',
    percent: () => 75,
    order: 11,
  },
  loose_end: {
    id: 'loose_end',
    title: 'A Loose End', // Ch. 10
    description: 'Togar has seen a warning that was real. He knows where a runner hid the delivery slips. Hear him out.',
    progress: () => 'TALK // TOGAR',
    percent: () => 88,
    order: 12,
  },
  finale: {
    id: 'finale',
    title: 'The City Still Remembers', // Ch. 11–12
    description: 'You have the words. Return to Tenneh and Sia — the market must hear them together.',
    progress: () => 'FINALE // RETURN TO MARKET',
    percent: () => 100,
    order: 13,
  },
};

export const MISSION_ORDER = ['gather','return','mentor','market','complete','docks','boakai','rival','warehouse','copies','vardee','loose_end','finale'];

// Platform helper: get next mission in chain
export function getMissionByOrder(order) {
  return Object.values(MISSION_STEPS).find(m => m.order === order);
}
export const TOTAL_MISSIONS = MISSION_ORDER.length;

export const MISSION_STEPS = {
  gather: {
    id: 'gather',
    title: 'The Weight of Truth',
    description: 'Old Man Kollie needs parts to power his radio. Search Waterside for usable scrap.',
    progress: (scrap) => `SCRAP ${scrap} / 7`,
    percent: (scrap) => Math.min(100, scrap / 7 * 100),
  },
  return: {
    id: 'return',
    title: 'Bring Back the Signal',
    description: 'Return seven usable pieces of scrap to Old Man Kollie’s workshop.',
    progress: () => 'SCRAP READY // RADIO SHOP',
    percent: () => 100,
  },
  mentor: {
    id: 'mentor',
    title: 'What Kollie Knows',
    description: 'The radio is alive. Speak with Old Man Kollie about Markie’s parents.',
    progress: () => 'RADIO // ONLINE',
    percent: () => 72,
  },
  market: {
    id: 'market',
    title: 'Market Eyes',
    description: 'Find Tenneh at Waterside Market. She may know who has been watching Markie.',
    progress: () => 'OBJECTIVE // WATERSIDE MARKET',
    percent: () => 86,
  },
  complete: {
    id: 'complete',
    title: 'A Name in the Dark',
    description: 'Tenneh has named Vardee and Kormah. The first real lead is yours.',
    progress: () => 'CHAPTER COMPLETE',
    percent: () => 100,
  },
};

export const DIALOGUE = {
  opening: 'OLD MAN KOLLIE: “Your parents taught me that a broken thing can still carry a signal. Bring seven parts. Then we talk.”',
  firstScrap: 'FLOMO: “See? The city throws away things that still have value. Same with people.”',
  allScrap: 'OLD MAN KOLLIE: “I see the signal, Markie. Bring those pieces to the workshop.”',
  radioFixed: 'OLD MAN KOLLIE: “Good. Now the old radio can speak again. Come closer, my boy.”',
  truth: 'OLD MAN KOLLIE: “Your parents did not die by chance. Vardee moved the streets; Kormah made the papers disappear.”',
  tenneh: 'TENNEH: “I saw Vardee’s men at the market. If you chase this truth, Markie, do not chase it alone.”',
  boakai: 'BOAKAI: “You want truth? Then fetch me the ledger they left in Warehouse 6. Paper does not lie, people do.”',
  warehouse: 'MARKIE: “This ledger... names, payments, a date. The night my parents died.”',
  vardeeConfront: 'VARDEE: “You think a boy with scrap can rewrite this city? Kormah owns the stamp, I own the streets.”',
  finale: 'TENNEH: “We will make the market hear it, Markie. And Garmai will make sure the docks remember too.”',
  siaThanks: 'SIA: “Mister Markie, will this keep us safe? I want to stay in school.”',
  garmaiWhisper: 'GARMAI: “Every trader already whispers your name. Be careful who you trust with it.”',
  flomoSupport: 'FLOMO: “You are not alone, brother. I will watch your back at the interchange.”',
  togarWarning: 'TOGAR: “Vardee does not forgive loose ends. Walk away, Markie.”',
  jallahRival: 'JALLAH: “You want respect? Take it from Vardee, not from me.”',
};

// Story roster is data-driven so future missions can use the same names and roles.
export const CHARACTER_ROSTER = [
  { id: 'markie', name: 'Markie Kollie', role: 'Protagonist', description: '22-year-old survivor seeking the truth behind his parents’ deaths.' },
  { id: 'kollie', name: 'Old Man Kollie', role: 'Mentor', description: 'Elder who knew Markie’s parents.' },
  { id: 'tenneh', name: 'Tenneh', role: 'Love interest', description: 'Strong-willed market woman who keeps Markie grounded.' },
  { id: 'flomo', name: 'Flomo', role: 'Best friend', description: 'Loyal but reckless; the first person to make Markie laugh.' },
  { id: 'vardee', name: 'Vardee', role: 'Antagonist', description: 'Gang leader controlling parts of the street economy.' },
  { id: 'musu', name: 'Musu', role: 'Mother — flashbacks', description: 'Her memory drives Markie forward.' },
  { id: 'kormah', name: 'Kormah', role: 'Corrupt official', description: 'A politician connected to the cover-up.' },
  { id: 'sia', name: 'Sia', role: 'Street kid', description: 'A child Markie wants to keep safe.' },
  { id: 'boakai', name: 'Boakai', role: 'Equipment fixer', description: 'Neutral trader of scarce tools and information.' },
  { id: 'garmai', name: 'Garmai', role: 'Information broker', description: 'Tenneh’s sister; she hears every market secret.' },
  { id: 'togar', name: 'Togar', role: 'Lieutenant', description: 'Vardee’s enforcer, with a possible redemption arc.' },
  { id: 'jallah', name: 'Jallah', role: 'Rival', description: 'Competes with Markie for territory and respect.' },
];

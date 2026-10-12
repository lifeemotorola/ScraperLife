export const DIALOGUE = {
  opening: 'OLD MAN KOLLIE: “Your parents taught me that a broken thing can still carry a signal. Bring seven parts. Then we talk.”',
  firstScrap: 'FLOMO: “See? The city throws away things that still have value. Same with people.”',
  allScrap: 'OLD MAN KOLLIE: “I see the signal, Markie. Bring those pieces to the workshop.”',
  radioFixed: 'OLD MAN KOLLIE: “Good. Now the old radio can speak again. Come closer, my boy.”',
  truth: 'OLD MAN KOLLIE: “Your parents did not die by chance. Vardee moved the streets; Kormah made the papers disappear.”',
  kollieParents: 'OLD MAN KOLLIE: “Your mother carried signals in her voice. Your father built them into machines. You carry both, Markie. Now go find what the city tried to bury.”',
  tenneh: 'TENNEH: “I saw Vardee’s men at the market. If you chase this truth, Markie, do not chase it alone.”',
  boakai: 'BOAKAI: “You want truth? Then fetch me the ledger they left in Warehouse 6. Paper does not lie, people do.”',
  boakaiProof: 'BOAKAI: “Kormah’s stamp is on every page of that ledger. Bring me the paper, and the docks will say his name out loud.”',
  warehouse: 'MARKIE: “This ledger... names, payments, a date. The night my parents died.”',
  markieResolve: 'MARKIE: “I did not come this far to walk away. My parents’ names will be spoken in this city again.”',
  vardeeConfront: 'VARDEE: “You think a boy with scrap can rewrite this city? Kormah owns the stamp, I own the streets.”',
  finale: 'TENNEH: “We will make the market hear it, Markie. And Garmai will make sure the docks remember too.”',
  tennehTogether: 'TENNEH: “Together, then. When the market speaks the truth, no one can bury it again.”',
  siaThanks: 'SIA: “Mister Markie, will this keep us safe? I want to stay in school.”',
  siaHope: 'SIA: “When I am big, I will fix radios like Mister Kollie. And I will tell everyone what Markie did for us.”',
  garmaiWhisper: 'GARMAI: “Every trader already whispers your name. Be careful who you trust with it.”',
  flomoSupport: 'FLOMO: “You are not alone, brother. I will watch your back at the interchange.”',
  togarWarning: 'TOGAR: “Vardee does not forgive loose ends. Walk away, Markie.”',
  jallahRival: 'JALLAH: “You want respect? Take it from Vardee, not from me.”',
  kormah: 'KORMAH: “Keep a copy of every paper, Markie. The city has a habit of losing things.”',
  // Season One draft beats without a recorded clip yet; they play through the browser voice.
  boakaiLocation: 'BOAKAI: “Warehouse 6, past the old harbor road. Paper does not lie. People do. And paper can be made to lie too.”',
  jallahWarehouse: 'JALLAH: “You’re asking the wrong person. But maybe you’re finally asking the right question.”',
  jallahNight: 'JALLAH: “A few years ago, people were told to clear a route. Some went. Some didn’t. The papers said everybody had been warned.”',
  togarSlips: 'TOGAR: “I saw a copy of that warning before it vanished. I should have spoken. A runner kept the delivery slips. Don’t make me into a good man because I finally did one right thing.”',
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

// Ambient street talk: what two characters say to each other when they run into one another on
// the platform (js/systems/CrowdSystem.js). These are NOT mission lines — they carry no speaker
// tag because the line floats over the speaker's head, and the subtitle bar adds the name.
//   greetings — anyone can open with one of these
//   replies   — the short answer the other person gives back
//   lectures  — what a `voice: 'lecturer'` character says instead (see character_palettes.json)
// Every pool has a `default`, so a character added later always has something to say.
export const SMALL_TALK = {
  greetings: {
    default: [
      'Ehn, my people. You good?',
      'Morning. The sea quiet today.',
      'You walking far?',
      'The light come back on your side?',
      'They say rain coming before evening.',
      'Small small, we move.',
    ],
    markie: [
      'Morning. You need anything fixed?',
      'I got two spare capacitors if your radio dead.',
      'Careful near the interchange today.',
      'Kollie send his greetings.',
    ],
    kollie: [
      'Peace, my child. The morning is a good sign.',
      'You eat before you walk so far?',
      'Sit small. The day is long.',
      'The radio transceiver is singing clean today. Good music in the air.',
    ],
    tenneh: [
      'Ehn, my sister! The market open early today.',
      'You come to buy or you come to look?',
      'Markie, you too thin. Come and eat.',
      'You hear 94.7 FM? MC Caro shaking the whole market!',
    ],
    flomo: [
      'Oo, my man! Where you going with that bag?',
      'I got a story for you, but you must not laugh.',
      'Walk with me small.',
      'Meek Mill and Lil Baby on the radio! That bass shaking my boots!',
    ],
    sia: [
      'Look what I find in the scrap field!',
      'You fix it, Markie? You fix everything.',
      'I can carry it. I strong!',
      'The radio playing so sweet today! Makes me want to dance!',
    ],
    garmai: [
      'You hear the thing they saying at the market?',
      'Careful who you greet in the open.',
      'Information is not free. For you, small price.',
      'Knowledge is in the streets, but rhythm rules the market.',
    ],
    boakai: [
      'Parts come in this morning. Good ones.',
      'You need a battery or you need a miracle?',
      'Price is price, my friend.',
      'Turn that workshop radio up small. Good rhythm for dock work.',
    ],
    jallah: [
      'You walking in my street today?',
      'Respect is respect. You got yours?',
      'Move easy, Markie.',
    ],
    togar: [
      'Keep moving. Nothing to see here.',
      'That name is not for shouting in the open.',
      'You should not be standing here.',
    ],
    vardee: [
      'Look who still breathing.',
      'This street remembers everybody.',
      'You got courage. Small one.',
    ],
    watch: [
      'The boss want this road clear.',
      'You pass here every day, ehn?',
      'Move along, my friend.',
    ],
    musu: [
      'Markie, wash your hands before you touch that radio.',
      'Your father will be home before the rain. Come sit with me.',
    ],
    kormah: [
      'Public service is a long road. Learn who signs the papers.',
      'The city is not run by feelings, my friend.',
    ],
  },
  replies: {
    default: [
      'Ehn, true talk.',
      'I hear you.',
      'Small small.',
      'Na so it be.',
      'God bless your way.',
      'Okay, my people.',
    ],
    markie: ['I will remember that.', 'Kollie taught me the same.', 'I hear you, truly.'],
    kollie: ['The old ears still hear, my child.', 'Truth does not hurry.', 'Go easy, my boy.'],
    tenneh: ['I will keep it for you.', 'The market does not lie.', 'Come back before dark.'],
    flomo: ['Oo! Say it again!', 'You serious?', 'I go tell everybody.'],
    sia: ['I go remember that one!', 'You promise?', 'Ehn!'],
    garmai: ['I will remember who told me.', 'That is worth something.', 'Keep your voice small.'],
    boakai: ['Bring it, I price it.', 'Tools do not argue.', 'Fair enough.'],
    jallah: ['We go see.', 'Respect, then.', 'Na so.'],
    togar: ['Do not make me come back here.', 'I hear you.', 'Walk.'],
    vardee: ['Everything has a price.', 'We will see, small boy.', 'The street decides.'],
    watch: ['I hear.', 'Yes, boss.', 'Move.'],
    musu: ['I will, Mama.', 'I hear you.'],
    kormah: ['The office will review it.', 'I understand.'],
  },
  lectures: {
    default: [
      'Listen well, because I will not say it twice.',
      'The old way still works, if you have patience for it.',
      'Everybody talks in Waterside. Few of them teach.',
    ],
    kollie: [
      'A radio carries the truth. Be like the radio, my child.',
      'Your father said: a broken thing still carries a signal.',
      'Patience is not weakness. The tide returns without shouting.',
      'Learn each part’s name; no one can cheat you at market.',
    ],
    garmai: [
      'Every secret passes through the market. Learn which one to buy.',
      'A name spoken openly is a name used against you. Whisper.',
      'Kormah signs the paper. Vardee takes the money. Know both.',
    ],
    togar: [
      'Courage is choosing where you stand, not standing still.',
      'I buried boys who talked loud on the wrong street. Learn.',
      'Vardee does not shout. That is the thing to fear.',
    ],
    vardee: [
      'This street feeds people. Do not confuse it with your feelings.',
      'Everybody here takes something. That is the truth.',
      'Your parents knew the price of things. That is why they are gone.',
    ],
    kormah: [
      'A city is forms and signatures. Keep copies of everything.',
      'The court remembers the number at the bottom of the page.',
      'Call it corruption. I call it the price of the lights.',
    ],
  },
};

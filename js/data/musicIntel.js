/**
 * Monrovia 94.7 Waterside FM Broadcast, News Bulletins & Music Intel
 * All voice dialogues are loaded from real .wav audio files in assets/radioVoices/
 * Players can replace any .wav file in assets/radioVoices/ with their own voice recordings.
 */

const radioWav = (name) => new URL(`../../assets/radioVoices/${name}`, import.meta.url).href;

export const MUSIC_INTEL = {
  'caro-money': {
    id: 'caro-money',
    title: 'Pillz (Money)',
    artist: 'MC Caro ft. Pillz',
    station: '94.7 WATERSIDE FM',
    genre: 'Monrovia Hip-Hop / Kolokwa Drill',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “WATERSIDE 94.7 FM! Gabriel and Kpannah holding down the airwaves! MC Caro and Pillz dropping raw Monrovia truth!”',
    cohostDialogue: [
      { speaker: 'DJ GABRIEL', line: 'Hold on, hold on, cut the noise! Kpannah, you know what time it is when this bass starts vibrating my coffee cup!', seconds: 8.6, audio: radioWav('caro_1_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Look at you, Gabriel, acting like you can dance! You know Monrovia Queen MC Caro don’t play no games on the mic!', seconds: 6.8, audio: radioWav('caro_2_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Pillz dropped that heavy street rhythm! Caro is talking to every scrapper and market seller sweating for clean money!', seconds: 7.7, audio: radioWav('caro_3_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'That’s right! No dirty syndicate shortcuts in Sector 04! If you are chasing that honest paper today, turn Waterside 94.7 FM all the way up!', seconds: 9.4, audio: radioWav('caro_4_kpannah.wav') },
    ],
    culturalPoints: [
      'MC Caro is the undisputed Queen of Liberian Hip-Hop, celebrated across West Africa for razor-sharp Kolokwa wordplay and social advocacy.',
      'Raised in West Point and New Kru Town, Caro built her career through grassroots street freestyle battles rather than political sponsorship.',
      '“Money” contrasts the hard, honest labor of market sellers and young scrappers against corrupt officials who trade community resources for bribes.',
      'Featured artist Pillz delivers the hypnotic Liberian bass groove that became an instant street anthem across Monrovia’s youth quarters.',
    ],
    npcQuotes: {
      tenneh: 'MC Caro don’t take nonsense from anybody in this city! That is how a market woman survives. When she says money, she means honest sweat, not Vardee’s dirty handouts.',
      kollie: 'Listen to the frequency on Caro’s voice. That is Monrovia copper wire—pure, resonant, impossible to snap. Good music keeps the young people focused on the truth.',
      flomo: 'Caro and Pillz! Markie, you hear how she rides that rhythm? That’s West Point energy! Nobody in West Africa can rap faster with so much wisdom.',
      boakai: 'Pillz laid down a heavy bassline on this one. It echoes all the way through the cargo containers down at the old harbor pier.',
      sia: 'Mister Markie, when MC Caro plays on the big shop speaker, all the girls in the market stop and sing every word! She makes us feel strong!',
      garmai: 'Caro knows who has real money in Monrovia and who is just wearing rented clothes. She sees right through the politicians.',
    },
  },

  'meek-lemon-pepper': {
    id: 'meek-lemon-pepper',
    title: 'Lemon Pepper Freestyle',
    artist: 'Meek Mill',
    station: '94.7 WATERSIDE FM',
    genre: 'East Coast Street Rap',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “94.7 WATERSIDE FM! Meek Mill tearing up the Lemon Pepper Freestyle with pure street hunger!”',
    cohostDialogue: [
      { speaker: 'DJ GABRIEL', line: 'Kpannah, I gotta be honest with you. Every time Meek Mill gets on a track, I feel like running through a concrete wall!', seconds: 7.9, audio: radioWav('lemon_1_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Gabriel, please, the last time you ran you were out of breath before reaching the studio door! But look at Meek though—three whole minutes without even pausing to breathe!', seconds: 8.9, audio: radioWav('lemon_2_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'That is real Philadelphia hunger! Surviving the blocks, beating corrupt court cases, and standing tall against the system.', seconds: 7.7, audio: radioWav('lemon_3_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'True talk. That pain in his voice? Every young person in Monrovia carrying heavy burdens understands it word for word.', seconds: 7.1, audio: radioWav('lemon_4_kpannah.wav') },
    ],
    culturalPoints: [
      'Meek Mill hijacked Drake and Rick Ross’s iconic soulful instrumental to deliver a non-stop, breath-defying clinic on street trauma and redemption.',
      'Lyrically documents his decade-long battle against a biased criminal justice system in Pennsylvania, sparking international criminal justice reform.',
      'Emphasizes self-reliance, loyalty to neighborhood roots, and refusing to allow oppressive authorities to dictate one’s destiny.',
      'Direct parallel to Markie Kollie navigating corrupt police patrols and fabricated syndicates along the Mesurado riverbanks.',
    ],
    npcQuotes: {
      boakai: 'Meek Mill understands what it means to be locked down by false paperwork. Same way Kormah and Vardee try to trap us with rigged harbor manifests.',
      flomo: 'That freestyle is too smooth! Meek didn’t even take a breath between the bars. That is how I run when Vardee’s watch blows their whistle at the interchange!',
      kollie: 'The boy speaks of growing up without a father to guide his footsteps. That pain can either make you bitter or make you a master craftsman, Markie.',
      tenneh: 'He talks about buying his people houses and lifting his block out of poverty. That is what a real brother does when he succeeds.',
      garmai: 'Meek says: ‘I was fighting cases, they was taking vacations.’ In Monrovia, the big men eat while the small scrappers pay the fine.',
      sia: 'The music sounds like flying over the city at sunset! It makes you feel like nobody can catch you!',
    },
  },

  'meek-on-my-soul': {
    id: 'meek-on-my-soul',
    title: 'On My Soul',
    artist: 'Meek Mill',
    station: '94.7 WATERSIDE FM',
    genre: 'Soul-Trap / Street Testament',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “WATERSIDE AIRWAVES: Meek Mill’s ‘On My Soul’. A sacred street oath that personal integrity cannot be purchased!”',
    cohostDialogue: [
      { speaker: 'DJ KPANNAH', line: 'Gabriel, bring the studio fader down small. Let the people feel this melody.', seconds: 4.4, audio: radioWav('soul_1_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'You know this one touches the spirit, Kpannah. Meek Mill swearing On My Soul.', seconds: 8.0, audio: radioWav('soul_2_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Because out here in Waterside, Vardee and his gang think everything is for sale. But a clean conscience? That has no price tag.', seconds: 7.8, audio: radioWav('soul_3_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Preach, Mama Kpannah! Swear on your soul, keep your hands clean, and let no man buy your loyalty.', seconds: 9.6, audio: radioWav('soul_4_gabriel.wav') },
    ],
    culturalPoints: [
      'A solemn, gospel-infused street ballad where Meek Mill pledges his soul and legacy to never compromise his moral code.',
      'Contrasts transient material flash with the enduring weight of a family’s honorable name.',
      'In Monrovia’s scrap economy, your word and your reputation are the only currency that water damage and market fire cannot destroy.',
      'Resonates directly with Markie’s sworn mission to clear his deceased parents’ names and expose the shipping conspiracy.',
    ],
    npcQuotes: {
      kollie: 'When a man says ‘On My Soul’, heaven and earth write it down. Your parents said the same thing when they refused to falsify the harbor records for Kormah.',
      tenneh: 'Soul is something Vardee and his thugs will never understand. They have stolen cash, but their spirits are dry like cracked mud.',
      flomo: 'On My Soul! You hear that hunger, Markie? It makes you want to grab your tools and build an empire out of rusty iron!',
      garmai: 'In my line of work, people sell their secrets for two dollars. But the one who keeps his soul owns this city.',
      boakai: 'That song plays in the engine rooms of the trawlers down at the pier. You work with your hands, but you endure with your soul.',
      sia: 'Mister Markie, Old Man Kollie said your parents’ souls are watching over your workbench right now.',
    },
  },

  'meek-polo': {
    id: 'meek-polo',
    title: 'Polo and Shell Tops',
    artist: 'Meek Mill',
    station: '94.7 WATERSIDE FM',
    genre: 'Classic Philly Hip-Hop',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “94.7 WATERSIDE FM: Gabriel and Kpannah bringing vintage corner roots with Meek Mill’s ‘Polo and Shell Tops’!”',
    cohostDialogue: [
      { speaker: 'DJ GABRIEL', line: 'Wait a minute, Kpannah! Look at the market below our window! Why is everybody walking like they are in a fashion show?', seconds: 9.3, audio: radioWav('polo_1_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Ah, Gabriel, you didn’t hear? Tenneh just unbundled fresh vintage Adidas and Ralph Lauren collars straight off the Freeport ship!', seconds: 7.3, audio: radioWav('polo_2_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Polo and Shell Tops! Vintage corner swag! Even if you only got five Liberian dollars for cold water, you dress like royalty!', seconds: 11.4, audio: radioWav('polo_3_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'That is the Monrovia code, Gabriel! You can be broke in your pockets, but your dignity must always be pressed and ironed!', seconds: 6.5, audio: radioWav('polo_4_kpannah.wav') },
    ],
    culturalPoints: [
      'An affectionate tribute to classic 1990s Philadelphia corner fashion: Ralph Lauren Polo collars paired with Adidas shell-toe sneakers.',
      'Celebrates dignity and sartorial self-respect, reminding listeners that pride begins with how you carry yourself before wealth arrives.',
      'Connects American street culture with Monrovia’s vibrant thrift boutique culture along Waterside and Rally Time Market.',
      'Highlighting the craftsmanship of recycling, tailoring, and wearing clothes with resilience and swagger.',
    ],
    npcQuotes: {
      tenneh: 'Polo and Shell Tops! Go check my boutique stall near the stairs, Markie. I have vintage collars straight from the Freeport shipping containers!',
      flomo: 'Markie, next scrap dividend we cash out, we getting matching shell tops! We going to strut down Waterside like harbor barons!',
      sia: 'Mister Flomo tried to do the dance from that song yesterday and tripped over a water pipe! But the rhythm is sweet sweet!',
      kollie: 'Style is fine, but make sure your boots have steel reinforcement when you walk near the scrap shears in Warehouse 6.',
      boakai: 'Those shell tops were indestructible rubber. We used to patch trawler gasket seals with old shoe soles back in the dock strikes.',
      garmai: 'Clothes can be armor. When you dress sharp, the watch hesitates for half a second before questioning you.',
    },
  },

  'meek-sharing-locations': {
    id: 'meek-sharing-locations',
    title: 'Sharing Locations',
    artist: 'Meek Mill ft. Lil Baby & Lil Durk',
    station: '94.7 WATERSIDE FM',
    genre: 'High-Octane Street Trap',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “94.7 WATERSIDE FM ALERT: Meek Mill, Lil Baby, and Lil Durk joining forces on ‘Sharing Locations’!”',
    cohostDialogue: [
      { speaker: 'DJ KPANNAH', line: 'Gabriel! Grab your microphone before the speaker blows up! This kick drum is rattling my teeth!', seconds: 5.2, audio: radioWav('sharing_1_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Meek, Lil Baby, and Durk! Triple threat heavy artillery on Waterside 94.7 FM!', seconds: 7.4, audio: radioWav('sharing_2_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'You see how they move in a triangle? Nobody gets left behind when the pressure turns up. That is how scrappers survive!', seconds: 6.0, audio: radioWav('sharing_3_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Hear that, Markie? Keep your transceiver frequency shared with your crew and watch out for watch patrols!', seconds: 6.2, audio: radioWav('sharing_4_gabriel.wav') },
    ],
    culturalPoints: [
      'A historic street collaboration uniting three regional rap titans: Meek Mill (Philadelphia), Lil Baby (Atlanta), and Lil Durk (Chicago).',
      'Propelled by rapid 808 percussion and interlocking verses discussing electronic surveillance, squad loyalty, and tactical survival.',
      'Parallels Markie’s transceiver radar pulse and GPS pinging system—knowing the exact coordinates of allies and patrol enemies in real time.',
      'Emphasizes that solo hustlers get picked off by syndicates, while organized crews with shared intel survive and thrive.',
    ],
    npcQuotes: {
      flomo: 'Sharing Locations! Markie, that is literally your radar ping! Every time you pulse the scrap transceiver, we are sharing locations across the sector!',
      tenneh: 'Lil Baby, Durk, and Meek... you see how they share the bread and move as one? That is how our community takes down Vardee’s watch.',
      sia: 'The beat is bouncing like fireworks! When my courier run is fast like this song, Vardee’s patrol can never lay a hand on me!',
      garmai: 'Sharing coordinates is dangerous in Waterside if the wrong watch enforcer intercepts your frequency. Keep your radar encrypted, Markie.',
      boakai: 'That kick drum is louder than a hydraulic ship crane. You play that near the harbor pier and the entire deck shakes.',
      kollie: 'Information without trust is a liability. Know who holds your frequency before you broadcast your location.',
    },
  },

  'nasty-c-uok': {
    id: 'nasty-c-uok',
    title: 'UOK',
    artist: 'Nasty C',
    station: '94.7 WATERSIDE FM',
    genre: 'African Hip-Hop / Soul',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “94.7 WATERSIDE FM: Nasty C with ‘UOK’. An open letter to his late mother Ivy in the stars.”',
    cohostDialogue: [
      { speaker: 'DJ GABRIEL', line: 'Kpannah, take the mic for a second. This next record needs a gentle voice.', seconds: 4.9, audio: radioWav('uok_1_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Yes, Gabriel... South Africa’s golden boy Nasty C, singing UOK straight to his mother Ivy in the stars.', seconds: 6.8, audio: radioWav('uok_2_kpannah.wav') },
      { speaker: 'DJ GABRIEL', line: 'Losing a mother when you are just a baby... that kind of hole never closes, but he turned all that grief into a masterpiece.', seconds: 7.9, audio: radioWav('uok_3_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'To everyone on this platform who lost their parents—especially our brother Markie working his bench—know that love never dies.', seconds: 7.0, audio: radioWav('uok_4_kpannah.wav') },
    ],
    culturalPoints: [
      'A landmark emotional record from South African rap phenom Nasty C, dedicated to his mother Ivy who passed away when he was an infant.',
      'Celebrated across Africa as a masterwork of vulnerability, proving that African hip-hop can honor grief and ancestral memory with gentle grace.',
      'Direct emotional resonance with Markie Kollie’s lifelong grief for his mother Musu, whose voice still echoes in his transceiver.',
      'Reminds scrappers that surviving hardship is not about hardening your heart into stone, but protecting the love that gave you life.',
    ],
    npcQuotes: {
      kollie: 'When Nasty C made UOK, he was sending a signal straight into the heavens. That is what your transceiver is for too, Markie—listening to what was lost.',
      tenneh: 'Every time this song comes on 94.7 FM, I think of your mother Musu. She was the gentlest soul on this riverbank, Markie. She would be so proud of you.',
      flomo: 'Even the tough watch boys put their batons down when UOK plays. A mother’s love is the only thing stronger than iron in this city.',
      sia: 'Mister Markie, Nasty C is asking his mama if she is okay up in the clouds. Do you think my parents can hear our music from up there too?',
      garmai: 'Grief is a heavy cargo to carry on these docks. But when you turn it into melody like this boy did in Durban, it turns into light.',
      boakai: 'Nasty C from South Africa... it is good to hear African brothers speaking truth across the continent straight into Monrovia.',
    },
  },

  'platform-loop': {
    id: 'platform-loop',
    title: 'Platform Theme (Waterside Instrumental)',
    artist: 'Kollie Radio Works',
    station: '94.7 WATERSIDE FM',
    genre: 'Afro-Instrumental / Platform Ambient',
    broadcaster: 'DJ GABRIEL & DJ KPANNAH',
    broadcastLine: 'DJ GABRIEL: “WATERSIDE 94.7 FM: The heartbeat of Monrovia with Gabriel and Kpannah. Dawn over the Mesurado.”',
    cohostDialogue: [
      { speaker: 'DJ GABRIEL', line: 'Waterside 94.7 FM! Dawn mist is burning off the Mesurado river, and the morning seagulls are screaming!', seconds: 7.5, audio: radioWav('platform_1_gabriel.wav') },
      { speaker: 'DJ KPANNAH', line: 'Old Man Kollie’s soldering iron is already smoking, Gabriel! Wake up, drink your hot ginger tea, and let’s go get this bread!', seconds: 7.1, audio: radioWav('platform_2_kpannah.wav') },
    ],
    culturalPoints: [
      'The original ambient pulse of Waterside Platform, recorded through Old Man Kollie’s restored vacuum-tube transceiver.',
      'Captures the tranquil dawn fog rolling off the Mesurado River before the morning market awakens.',
      'Features harmonic resonance tuned to 60-hertz electrical transformers found in early West African coastal ports.',
    ],
    npcQuotes: {
      kollie: 'Listen to the background tone, Markie. That is 60-hertz river resonance. When you know that sound, you never get lost in the sea fog.',
      tenneh: 'The morning peace before the shouts and bargaining begin. Cherish it while the sea is calm.',
      flomo: 'Kollie’s workshop sounds! That’s the sound of us getting ready to conquer another day in Sector 04.',
      boakai: 'The harbor engine hum. Means the generators are running and work is ready to begin.',
      sia: 'It sounds like waking up to sunshine when the rain finally stops!',
      garmai: 'The quiet before the storm. That’s when the smartest deals are struck.',
    },
  },
};

/**
 * 94.7 Waterside FM News Bulletins
 * Breaking radio news sessions voiced in back-and-forth dialogue by co-hosts DJ Gabriel and DJ Kpannah.
 * Loaded directly from custom PCM-16 .wav audio files in assets/radioVoices/
 */
export const RADIO_NEWS_BULLETINS = [
  {
    id: 'news-tariffs',
    headline: 'SECTOR 04 COMMODITY & SCRAP TARIFF REPORT',
    category: 'MARKET DISPATCH',
    steps: [
      { speaker: 'DJ GABRIEL', line: 'Hold the music, hold the music! Waterside 94.7 FM breaking market dispatch!', seconds: 6.6, audio: radioWav('news_tariffs_1.wav') },
      { speaker: 'DJ KPANNAH', line: 'Gabriel, Tenneh sent word from the central market: clean copper scrap jumped fifteen percent this morning!', seconds: 6.0, audio: radioWav('news_tariffs_2.wav') },
      { speaker: 'DJ GABRIEL', line: 'Fifteen percent?! I am grabbing my wrench and heading to the piles right now!', seconds: 5.2, audio: radioWav('news_tariffs_3.wav') },
      { speaker: 'DJ KPANNAH', line: 'Sit your behind down, Gabriel, you have a radio show to host! Plus, watch patrols are snooping near the bridge, so scrappers, conceal your copper!', seconds: 8.6, audio: radioWav('news_tariffs_4.wav') },
    ],
  },
  {
    id: 'news-harbor',
    headline: 'OLD DOCKS & WAREHOUSE 6 SURVEILLANCE ALERT',
    category: 'INVESTIGATIVE FLASH',
    steps: [
      { speaker: 'DJ KPANNAH', line: 'Gabriel, emergency whisper just came across our studio transceiver from the Old Docks!', seconds: 5.0, audio: radioWav('news_harbor_1.wav') },
      { speaker: 'DJ GABRIEL', line: 'What is going down, Kpannah? Don’t tell me Boakai dropped another crate in the water!', seconds: 4.7, audio: radioWav('news_harbor_2.wav') },
      { speaker: 'DJ KPANNAH', line: 'No! Vardee’s top enforcers were caught trying to burn shipping manifests behind Warehouse 6! Someone is terrified of what is inside that ledger!', seconds: 8.2, audio: radioWav('news_harbor_3.wav') },
      { speaker: 'DJ GABRIEL', line: 'The walls are closing in on the syndicate, Waterside! Keep your eyes peeled and your tools ready!', seconds: 5.6, audio: radioWav('news_harbor_4.wav') },
    ],
  },
  {
    id: 'news-weather',
    headline: 'COASTAL WEATHER & ATLANTIC SQUALL WARNING',
    category: 'MARINE BULLETIN',
    steps: [
      { speaker: 'DJ GABRIEL', line: 'Weather radar update over Monrovia: massive Atlantic rain clouds coming in fast from the West Point shore!', seconds: 7.2, audio: radioWav('news_weather_1.wav') },
      { speaker: 'DJ KPANNAH', line: 'Old Man Kollie phoned the booth with emergency advice: cover your electronics with heavy rubber tarps! Salt rain eats transformer coils for breakfast!', seconds: 8.4, audio: radioWav('news_weather_2.wav') },
      { speaker: 'DJ GABRIEL', line: 'You heard the elder! Don’t let your salvage short-circuit in the mud! Stay dry and keep the music loud!', seconds: 7.3, audio: radioWav('news_weather_3.wav') },
    ],
  },
  {
    id: 'news-community',
    headline: 'STREET HEROES // ALLEY COURIER SHOUTOUT',
    category: 'COMMUNITY BEAT',
    steps: [
      { speaker: 'DJ KPANNAH', line: 'Shoutout time on 94.7 FM! We gotta give flowers to our favorite alley runner, little Sia!', seconds: 6.1, audio: radioWav('news_community_1.wav') },
      { speaker: 'DJ GABRIEL', line: 'What did Sia do this morning, Kpannah?', seconds: 2.5, audio: radioWav('news_community_2.wav') },
      { speaker: 'DJ KPANNAH', line: 'She outran three watch officers carrying a bag of salvaged radio tubes, then gave two loaves of sweet bread to the harbor elders!', seconds: 6.9, audio: radioWav('news_community_3.wav') },
      { speaker: 'DJ GABRIEL', line: 'That is our girl! The watch has guns and badges, but Waterside has heart and speed! More fire on your radio right now!', seconds: 9.8, audio: radioWav('news_community_4.wav') },
    ],
  },
];

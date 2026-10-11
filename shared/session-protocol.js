// Shared by the Durable Object (server/session-room.js), the browser client
// (js/multiplayer/*) and tools/multiplayer-check.mjs. Keep it free of DOM and Worker APIs.
//
// A session is a room with a short join code. Players in a session share presence only: where
// they are, which character they picked, chat and gestures. Story progress, scrap and NPC state
// stay local to each player, so one player's missions never change another player's game.

// Characters a player can take in a session. Each can be held by one player at a time.
// These match the palette ids in assets/models/character_palettes.json. Vardee, Kormah, Musu
// and the street watch are not playable.
export const PLAYABLE_CHARACTERS = Object.freeze([
  'markie', 'kollie', 'tenneh', 'flomo', 'sia', 'garmai', 'boakai', 'jallah', 'togar',
]);
export const DEFAULT_CHARACTER = 'markie';
export const MAX_MEMBERS = PLAYABLE_CHARACTERS.length;

export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 240;
export const CHAT_RATE = Object.freeze({ count: 5, windowMs: 5000 });
export const MAX_MESSAGE_BYTES = 2048;
export const GESTURES = Object.freeze(['wave']);

// Unambiguous alphabet (no 0/O, 1/I/L) so codes can be read aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

// Positions are world units. The platform is ~92 wide; anything further out is a bad client.
export const WORLD_LIMIT = 100;

export function isPlayableCharacter(id) {
  return typeof id === 'string' && PLAYABLE_CHARACTERS.includes(id);
}

export function isValidCode(code) {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

// `random` returns an array of unsigned 32-bit integers. The default uses Web Crypto.
export function generateCode(random = defaultRandom) {
  const values = random(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
  }
  return code;
}

function defaultRandom(count) {
  const buffer = new Uint32Array(count);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
}

// Strips control characters and collapses whitespace. Falls back when nothing usable is left.
export function cleanName(raw, fallback = 'Player') {
  const text = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return text || fallback;
}

export function cleanChat(raw) {
  const text = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT_LENGTH)
    .trim();
  return text || null;
}

const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));

// Validates a presence update. Returns null for anything malformed.
export function cleanState(message) {
  const { x, z, f, m, r } = message || {};
  if (![x, z, f].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return {
    x: clamp(x, WORLD_LIMIT),
    z: clamp(z, WORLD_LIMIT),
    f: Math.atan2(Math.sin(f), Math.cos(f)),   // wrap to (-PI, PI]
    m: m ? 1 : 0,
    r: r ? 1 : 0,
  };
}

// Sliding-window limiter. Keeps timestamps, so it can be saved in a socket attachment.
export function chatAllowed(timestamps, now, rate = CHAT_RATE) {
  const recent = timestamps.filter((at) => now - at < rate.windowMs);
  if (recent.length >= rate.count) return { allowed: false, timestamps: recent };
  recent.push(now);
  return { allowed: true, timestamps: recent };
}

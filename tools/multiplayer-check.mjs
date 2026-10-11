// Multiplayer regression check: protocol rules, then a WebSocket end-to-end run against a live server.
//
//   node tools/multiplayer-check.mjs                     # protocol tests + E2E on http://localhost:5173
//   MULTIPLAYER_BASE=https://example.workers.dev node tools/multiplayer-check.mjs
//
// The E2E part needs `npm run dev` (or `wrangler dev`) running. Node 22 provides the global WebSocket.
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import {
  MAX_MEMBERS, PLAYABLE_CHARACTERS, CODE_LENGTH, CODE_ALPHABET,
  chatAllowed, cleanChat, cleanName, generateCode, isPlayableCharacter, isValidCode,
} from '../shared/session-protocol.js';

const BASE = (process.env.MULTIPLAYER_BASE || 'http://localhost:5173').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(60)} ${detail}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Raw HTTP upgrade request: the only way to read the refusal status (404/409) from Node,
// since the WebSocket API hides it and fetch() will not send an Upgrade header.
function upgradeStatus(code) {
  const url = new URL(`${BASE}/ws?session=${encodeURIComponent(code)}`);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
    });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    // The local dev server drops the socket on a refused upgrade instead of replying, so report that.
    req.on('error', (error) => (/socket hang up|ECONNRESET/.test(error.message) ? resolve('dropped') : reject(error)));
    req.setTimeout(5000, () => { req.destroy(new Error('upgrade timed out')); });
    req.end();
  });
}

// ---- Protocol rules (pure functions, no server) ----
{
  check('playable roster has at least 2 characters', PLAYABLE_CHARACTERS.length >= 2, String(PLAYABLE_CHARACTERS.length));
  check('isPlayableCharacter accepts a roster id', isPlayableCharacter(PLAYABLE_CHARACTERS[0]));
  check('isPlayableCharacter rejects unknown ids', !isPlayableCharacter('nobody') && !isPlayableCharacter(undefined));
  check('isValidCode accepts a generated code', isValidCode(generateCode()));
  check('isValidCode rejects short and lowercase codes', !isValidCode('ABC') && !isValidCode('abcdef'));
  const code = generateCode(() => new Uint32Array([0, 1, 2, 3, 4, 5]));
  check('generateCode uses the code alphabet and length',
    code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)), code);
  check('cleanName trims and falls back', cleanName('   ', 'Player') === 'Player' && cleanName('  Ama  ') === 'Ama');
  check('cleanName caps length', cleanName('x'.repeat(200)).length <= 16);
  check('cleanChat drops empty text and caps length', cleanChat('   ') === null && cleanChat('y'.repeat(999)).length <= 240);

  let stamps = [];
  const now = 100000;
  let allowedCount = 0;
  for (let i = 0; i < 6; i += 1) {
    const result = chatAllowed(stamps, now + i);
    stamps = result.timestamps;
    if (result.allowed) allowedCount += 1;
  }
  check('chat rate allows 5 messages in the window, blocks the 6th', allowedCount === 5, `allowed=${allowedCount}`);
  check('chat rate recovers after the window', chatAllowed(stamps, now + 6000).allowed);
}

// ---- WebSocket helpers ----
function openSocket(code, name) {
  const ws = new WebSocket(`${WS_BASE}/ws?session=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    inbox.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.test(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  };
  const closed = new Promise((resolve) => { ws.onclose = (event) => resolve(event.code); });
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('socket error'));
  });
  opened.catch(() => {});   // callers that expect a refusal await `closed` instead
  const next = (test, ms = 3000) => new Promise((resolve, reject) => {
    const existing = inbox.find(test);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => {
      waiters.splice(waiters.findIndex((w) => w.resolve === done), 1);
      reject(new Error('timed out waiting for message'));
    }, ms);
    const done = (message) => { clearTimeout(timer); resolve(message); };
    waiters.push({ test, resolve: done });
  });
  return { ws, inbox, opened, closed, next };
}

async function createSession() {
  const response = await fetch(`${BASE}/api/sessions`, { method: 'POST' });
  const body = await response.json();
  return { status: response.status, code: body.code };
}

// ---- E2E ----
try {
  const probe = await fetch(`${BASE}/api/sessions/AAAAAA`).catch(() => null);
  if (!probe) throw new Error(`no server at ${BASE}; start \`npm run dev\` first`);

  // Unknown session: HTTP lookup is 404.
  const missing = await fetch(`${BASE}/api/sessions/QQQQQQ`);
  check('unknown session lookup returns 404', missing.status === 404, String(missing.status));

  // Create, then join with two players.
  const created = await createSession();
  check('create returns 201 with a code', created.status === 201 && isValidCode(created.code), `${created.status} ${created.code}`);
  const code = created.code;

  const info = await (await fetch(`${BASE}/api/sessions/${code}`)).json();
  check('lookup of a live session reports 0 members', info.code === code && info.members === 0 && info.full === false);

  const a = openSocket(code, 'Ama');
  const b = openSocket(code, 'Kofi');
  await Promise.all([a.opened, b.opened]);
  const welcomeA = await a.next((m) => m.type === 'welcome');
  const welcomeB = await b.next((m) => m.type === 'welcome');
  check('both players receive a welcome with their own id',
    welcomeA.you?.id && welcomeB.you?.id && welcomeA.you.id !== welcomeB.you.id);
  const aId = welcomeA.you.id;
  const bId = welcomeB.you.id;

  // Unique character claim.
  a.ws.send(JSON.stringify({ type: 'pick', characterId: 'tenneh' }));
  await a.next((m) => m.type === 'roster' && m.members.some((x) => x.id === aId && x.characterId === 'tenneh'));
  check('first player claims a character (roster shows it)', true);

  b.ws.send(JSON.stringify({ type: 'pick', characterId: 'tenneh' }));
  const refused = await b.next((m) => m.type === 'error' && m.code === 'taken');
  check('second player is refused a taken character', Boolean(refused));

  b.ws.send(JSON.stringify({ type: 'pick', characterId: 'flomo' }));
  await b.next((m) => m.type === 'roster' && m.members.some((x) => x.id === bId && x.characterId === 'flomo'));
  check('second player claims a different character', true);

  // Presence relay: state from A reaches B with A's id, and not echoed back to A.
  a.ws.send(JSON.stringify({ type: 'state', x: 3.5, z: -2, f: 1.2, m: 1, r: 0 }));
  const relayed = await b.next((m) => m.type === 'state' && m.id === aId);
  check('position update relays to the other player', relayed.x === 3.5 && relayed.z === -2, JSON.stringify({ x: relayed.x, z: relayed.z }));
  await sleep(150);
  const echoed = a.inbox.some((m) => m.type === 'state' && m.id === aId);
  check('position update is not echoed to its sender', !echoed);

  // Chat relay.
  a.ws.send(JSON.stringify({ type: 'chat', text: 'Come see the market!' }));
  const chat = await b.next((m) => m.type === 'chat' && m.text === 'Come see the market!');
  check('chat relays to the other player with sender name', chat.name === 'Ama', chat.name);

  // Gesture relay.
  a.ws.send(JSON.stringify({ type: 'gesture', name: 'wave' }));
  const gesture = await b.next((m) => m.type === 'gesture' && m.name === 'wave');
  check('gesture relays to the other player', Boolean(gesture));

  // Chat rate limit: a burst from one sender trips slow-down.
  const burst = openSocket(code, 'Burst');
  await burst.opened;
  await burst.next((m) => m.type === 'welcome');
  for (let i = 0; i < 8; i += 1) burst.ws.send(JSON.stringify({ type: 'chat', text: `spam ${i}` }));
  const slow = await burst.next((m) => m.type === 'error' && m.code === 'slow-down');
  check('chat burst is rate-limited with slow-down', Boolean(slow));
  burst.ws.close(1000, 'done');

  // Leave: closing A updates B's roster.
  a.ws.close(1000, 'left');
  await a.closed;
  const after = await b.next((m) => m.type === 'roster' && !m.members.some((x) => x.id === aId));
  check('leaving player disappears from the roster', Boolean(after));

  // Capacity: fill the room, then the next player gets 409.
  const filled = [b];
  for (let i = filled.length; i < MAX_MEMBERS; i += 1) {
    const extra = openSocket(code, `P${i}`);
    await extra.opened;
    filled.push(extra);
  }
  await sleep(300);
  const fullInfo = await (await fetch(`${BASE}/api/sessions/${code}`)).json();
  check(`session reports full at ${MAX_MEMBERS} members`, fullInfo.full === true, `members=${fullInfo.members}`);
  const overflow = await upgradeStatus(code);
  // 409 from the Worker in production; the local dev server reports a dropped socket. Both mean refused.
  check('the next upgrade is refused (409, or dropped by the dev server)', overflow === 409 || overflow === 'dropped', String(overflow));
  for (const extra of filled) extra.ws.close(1000, 'done');

  // Unknown session on the socket route: refused with 404.
  const unknownUpgrade = await upgradeStatus('QQQQQQ');
  // The browser checks GET /api/sessions/:code first, which returns 404 (checked above). The dev server
  // drops refused upgrades, so accept that too; a 101 would mean the room accepted an unknown code.
  check('upgrade to an unknown session is refused (404, or dropped)', unknownUpgrade === 404 || unknownUpgrade === 'dropped', String(unknownUpgrade));
} catch (error) {
  failures.push('E2E');
  console.log(`FAIL  E2E aborted: ${error.message}`);
}

if (failures.length) {
  console.log(`\nmultiplayer-check: ${failures.length} failing`);
  process.exit(1);
}
console.log('\nmultiplayer-check: all checks passed');

// One Durable Object per session code. It holds the live WebSocket connections, the character
// claims and the relayed presence. Per-player data lives in the WebSocket attachment, so it
// survives hibernation without storage writes on every movement update.
import {
  GESTURES, MAX_MEMBERS, MAX_MESSAGE_BYTES,
  chatAllowed, cleanChat, cleanName, cleanState, isPlayableCharacter,
} from '../shared/session-protocol.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export class SessionRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Internal routes, reached only from the Worker in server/worker.js.
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (await this.ctx.storage.get('code')) return json({ error: 'Session already exists' }, 409);
      await this.ctx.storage.put('code', String(body.code || ''));
      return json({ ok: true }, 201);
    }

    if (url.pathname === '/info' && request.method === 'GET') {
      const code = await this.ctx.storage.get('code');
      if (!code) return json({ error: 'No session with that code' }, 404);
      const count = this.ctx.getWebSockets().length;
      return json({ code, members: count, full: count >= MAX_MEMBERS });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket upgrade' }, 426);
      const code = await this.ctx.storage.get('code');
      if (!code) return json({ error: 'No session with that code' }, 404);
      const sockets = this.ctx.getWebSockets();
      if (sockets.length >= MAX_MEMBERS) return json({ error: 'This session is full' }, 409);

      const name = cleanName(url.searchParams.get('name'), 'Player');
      const usedSeats = new Set(sockets.map((ws) => ws.deserializeAttachment()?.seat));
      let seat = 0;
      while (usedSeats.has(seat)) seat += 1;

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.serializeAttachment({
        id: crypto.randomUUID().slice(0, 8),
        name,
        characterId: null,
        seat,
        placed: false,   // true once the player has sent a real position
        x: 0, z: 0, f: 0, m: 0, r: 0,
        chatTimes: [],
      });
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({
        type: 'welcome',
        code,
        you: this.publicMember(server),
        members: this.members(),
      }));
      this.broadcastRoster(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'Not found' }, 404);
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message.type !== 'string') return;
    const me = ws.deserializeAttachment();

    switch (message.type) {
      case 'pick': {
        const characterId = message.characterId;
        if (!isPlayableCharacter(characterId)) return this.error(ws, 'bad-character', 'That character cannot be played.');
        const holder = this.ctx.getWebSockets().find((other) => other !== ws && other.deserializeAttachment()?.characterId === characterId);
        if (holder) return this.error(ws, 'taken', `${holder.deserializeAttachment().name} already has that character.`);
        ws.serializeAttachment({ ...me, characterId });
        this.broadcastRoster();
        return undefined;
      }

      case 'state': {
        const state = cleanState(message);
        if (!state) return;
        ws.serializeAttachment({ ...me, ...state, placed: true });
        this.broadcast({ type: 'state', id: me.id, ...state }, ws);
        return undefined;
      }

      case 'chat': {
        const text = cleanChat(message.text);
        if (!text) return;
        const { allowed, timestamps } = chatAllowed(me.chatTimes || [], Date.now());
        ws.serializeAttachment({ ...me, chatTimes: timestamps });
        if (!allowed) return this.error(ws, 'slow-down', 'Slow down — a few messages at a time.');
        this.broadcast({
          type: 'chat', id: me.id, name: me.name, characterId: me.characterId, text, at: Date.now(),
        });
        return undefined;
      }

      case 'gesture': {
        if (!GESTURES.includes(message.name) || !me.characterId) return;
        this.broadcast({ type: 'gesture', id: me.id, name: message.name }, ws);
        return undefined;
      }

      default:
        return undefined;
    }
  }

  webSocketClose(ws) {
    this.broadcastRoster(ws);
  }

  webSocketError(ws) {
    this.broadcastRoster(ws);
  }

  publicMember(ws) {
    const { id, name, characterId, seat, placed, x, z, f, m, r } = ws.deserializeAttachment();
    return { id, name, characterId: characterId || null, seat, placed: Boolean(placed), x, z, f, m, r };
  }

  // Everyone currently connected, optionally leaving out one socket (the one that just closed).
  members(exclude = null) {
    return this.ctx.getWebSockets().filter((ws) => ws !== exclude).map((ws) => this.publicMember(ws));
  }

  broadcastRoster(exclude = null) {
    this.broadcast({ type: 'roster', members: this.members(exclude) }, exclude);
  }

  broadcast(message, exclude = null) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try { ws.send(payload); } catch { /* a dead socket is cleaned up by its close handler */ }
    }
  }

  error(ws, code, message) {
    ws.send(JSON.stringify({ type: 'error', code, message }));
  }
}


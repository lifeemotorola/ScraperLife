// Browser side of a session: one WebSocket to /ws, JSON messages, and a small reconnect loop so a
// dropped mobile connection rejoins the same session with the same character.
// Every URL here is relative to the page, so it works on localhost and on the preview host.

const RECONNECT_DELAYS = [600, 1200, 2500, 5000, 8000];

export class SessionError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.code = code;
  }
}

export async function createSession() {
  const response = await fetch('/api/sessions', { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.code) throw new SessionError(body.error || 'Could not create a session.', 'create-failed');
  return body.code;
}

// Cheap pre-check so the join screen can say *why* a code will not work.
export async function checkSession(code) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(code)}`);
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) throw new SessionError('No session with that code.', 'not-found');
  if (!response.ok) throw new SessionError(body.error || 'Could not check that session.', 'check-failed');
  if (body.full) throw new SessionError('That session is full.', 'full');
  return body;
}

export class SessionClient {
  constructor(handlers = {}) {
    this.handlers = handlers;     // { onWelcome, onRoster, onState, onChat, onGesture, onStatus, onError }
    this.socket = null;
    this.code = null;
    this.name = null;
    this.characterId = null;      // remembered so a reconnect restores the pick
    this.connected = false;
    this.closedByUser = false;
    this.attempt = 0;
    this.welcomed = false;
    this.reconnectTimer = null;
    this.you = null;
  }

  get url() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = new URLSearchParams({ session: this.code, name: this.name });
    return `${protocol}//${location.host}/ws?${query}`;
  }

  // Resolves once the server sends `welcome`. Rejects if the room refuses us (bad code, full).
  connect(code, name) {
    this.code = String(code || '').toUpperCase();
    this.name = name;
    this.closedByUser = false;
    this.attempt = 0;
    return new Promise((resolve, reject) => {
      this.resolveFirst = resolve;
      this.rejectFirst = reject;
      this.open();
    });
  }

  open() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.connected = true;
      this.attempt = 0;
      this.handlers.onStatus?.('connected');
      // Restore the pick after a reconnect; the server gives us a new member id each time.
      if (this.characterId) this.send({ type: 'pick', characterId: this.characterId });
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onerror = () => { /* onclose follows and carries the reason */ };
    socket.onclose = (event) => {
      this.connected = false;
      if (this.closedByUser) { this.handlers.onStatus?.('closed'); return; }
      if (!this.welcomed) {
        // Never got in: a 404/409 from the room arrives as a failed upgrade, so tell the user why.
        this.rejectFirst?.(new SessionError(event.reason || 'Could not reach that session. Check the code and try again.', 'unreachable'));
        this.rejectFirst = null;
        return;
      }
      this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (this.attempt >= RECONNECT_DELAYS.length) {
      this.handlers.onStatus?.('lost');
      return;
    }
    const delay = RECONNECT_DELAYS[this.attempt];
    this.attempt += 1;
    this.handlers.onStatus?.('reconnecting');
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  receive(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    switch (message.type) {
      case 'welcome':
        this.you = message.you;
        this.welcomed = true;
        this.resolveFirst?.(message);
        this.resolveFirst = null;
        this.rejectFirst = null;
        this.handlers.onWelcome?.(message);
        break;
      case 'roster': this.handlers.onRoster?.(message.members); break;
      case 'state': this.handlers.onState?.(message); break;
      case 'chat': this.handlers.onChat?.(message); break;
      case 'gesture': this.handlers.onGesture?.(message); break;
      case 'error':
        if (message.code === 'taken' || message.code === 'bad-character') this.characterId = null;
        this.handlers.onError?.(message);
        break;
      default: break;
    }
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  pick(characterId) {
    this.characterId = characterId;
    this.send({ type: 'pick', characterId });
  }

  sendState(state) { this.send({ type: 'state', ...state }); }
  sendChat(text) { this.send({ type: 'chat', text }); }
  sendGesture(name) { this.send({ type: 'gesture', name }); }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, 'left');
    this.socket = null;
    this.connected = false;
    this.welcomed = false;
  }
}

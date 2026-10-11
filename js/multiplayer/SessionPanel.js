import { checkSession, createSession, SessionClient, SessionError } from './SessionClient.js';
import { MAX_MEMBERS, PLAYABLE_CHARACTERS, cleanName, isValidCode } from '../../shared/session-protocol.js';
import { characterName, characterRole } from './RemotePlayers.js';

const NAME_KEY = 'scraperlife.playerName';
const MAX_LOG_LINES = 60;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Everything multiplayer shows on screen: the lobby (create or join a session, pick a character),
// the player roster with character portraits, and chat. Network traffic goes through SessionClient;
// the game is told about roster, presence, chat and gestures through `hooks`.
export class SessionPanel {
  constructor({ portraits, getAssets, hooks = {} }) {
    this.portraits = portraits;
    this.getAssets = getAssets;     // () => Promise<{ shared, palettes }>
    this.hooks = hooks;
    this.client = null;
    this.code = null;
    this.me = null;                 // this player's server member record (welcome.you)
    this.members = [];
    this.started = false;
    this.portraitUrls = new Map();

    this.el = {
      lobby: document.getElementById('session-lobby'),
      join: document.getElementById('session-join'),
      room: document.getElementById('session-room'),
      name: document.getElementById('session-name'),
      code: document.getElementById('session-code'),
      create: document.getElementById('session-create'),
      joinButton: document.getElementById('session-join-button'),
      error: document.getElementById('session-error'),
      back: document.getElementById('session-back'),
      codeDisplay: document.getElementById('session-code-display'),
      copy: document.getElementById('session-copy'),
      hint: document.getElementById('session-hint'),
      grid: document.getElementById('character-grid'),
      members: document.getElementById('session-members'),
      start: document.getElementById('session-start'),
      leave: document.getElementById('session-leave'),
      hud: document.getElementById('session-roster'),
      rosterCode: document.getElementById('roster-code'),
      rosterCount: document.getElementById('roster-count'),
      rosterList: document.getElementById('roster-list'),
      rosterStatus: document.getElementById('roster-status'),
      wave: document.getElementById('session-wave'),
      chat: document.getElementById('session-chat'),
      log: document.getElementById('chat-log'),
      form: document.getElementById('chat-form'),
      input: document.getElementById('chat-input'),
      chatToggle: document.getElementById('chat-toggle'),
      playTogether: document.getElementById('play-together-button'),
    };
    this.bind();
  }

  bind() {
    const { el: nodes } = this;
    nodes.name.value = localStorage.getItem(NAME_KEY) || '';
    nodes.playTogether?.addEventListener('click', () => this.open());
    nodes.create.addEventListener('click', () => this.withBusy(nodes.create, () => this.create()));
    nodes.joinButton.addEventListener('click', () => this.withBusy(nodes.joinButton, () => this.join()));
    nodes.code.addEventListener('keydown', (event) => { if (event.key === 'Enter') this.join(); });
    nodes.back.addEventListener('click', () => this.close());
    nodes.copy.addEventListener('click', () => this.copyLink());
    nodes.start.addEventListener('click', () => this.startTogether());
    nodes.leave.addEventListener('click', () => this.leave());
    nodes.wave?.addEventListener('click', () => this.wave());
    nodes.form.addEventListener('submit', (event) => { event.preventDefault(); this.sendChat(); });
    nodes.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); nodes.input.blur(); }
      event.stopPropagation();   // keep typing out of the game's movement keys
    });
    nodes.chatToggle?.addEventListener('click', () => this.toggleChat());
    // Enter opens chat during play, and Escape leaves it, without stealing keys from the game.
    window.addEventListener('keydown', (event) => {
      if (!this.started || event.code !== 'Enter') return;
      if (document.activeElement === nodes.input) return;
      if (this.isBlockingUi()) return;
      event.preventDefault();
      this.openChat();
    });

    // A shared link (?join=CODE) opens the lobby with the code already filled in.
    const join = new URLSearchParams(location.search).get('join');
    if (join && isValidCode(join.toUpperCase())) {
      nodes.code.value = join.toUpperCase();
      this.open();
    }
  }

  isBlockingUi() {
    return ['settings-panel', 'world-map'].some((id) => {
      const panel = document.getElementById(id);
      return panel && !panel.classList.contains('hidden');
    });
  }

  async withBusy(button, task) {
    button.disabled = true;
    try { await task(); } finally { button.disabled = false; }
  }

  open() {
    this.el.lobby.classList.remove('hidden');
    this.el.join.classList.toggle('hidden', Boolean(this.client));
    this.el.room.classList.toggle('hidden', !this.client);
    this.el.back.classList.toggle('hidden', Boolean(this.client));
    this.setError('');
    this.el.name.focus();
  }

  close() {
    if (this.client) return;
    this.el.lobby.classList.add('hidden');
  }

  setError(message) {
    this.el.error.textContent = message;
    this.el.error.classList.toggle('hidden', !message);
  }

  playerName() {
    const name = cleanName(this.el.name.value, 'Player');
    localStorage.setItem(NAME_KEY, name);
    return name;
  }

  async create() {
    this.setError('');
    try {
      const code = await createSession();
      await this.enter(code);
    } catch (error) {
      this.setError(error.message || 'Could not create a session.');
    }
  }

  async join() {
    this.setError('');
    const code = this.el.code.value.trim().toUpperCase();
    if (!isValidCode(code)) {
      this.setError('Session codes are six letters or numbers.');
      return;
    }
    try {
      await checkSession(code);
      await this.enter(code);
    } catch (error) {
      this.setError(error instanceof SessionError ? error.message : 'Could not join that session.');
    }
  }

  async enter(code) {
    const name = this.playerName();
    this.code = code;
    this.client = new SessionClient({
      onWelcome: (welcome) => this.onWelcome(welcome),
      onRoster: (members) => this.onRoster(members),
      onState: (state) => this.hooks.onState?.(state),
      onChat: (message) => this.onChat(message),
      onGesture: (message) => this.hooks.onGesture?.(message),
      onStatus: (status) => this.onStatus(status),
      onError: (message) => this.onError(message),
    });
    const welcome = await this.client.connect(code, name);
    // A reconnect re-runs onWelcome; the first welcome is what moves the lobby to the room view.
    this.el.codeDisplay.textContent = code;
    this.el.join.classList.add('hidden');
    this.el.back.classList.add('hidden');
    this.el.room.classList.remove('hidden');
    this.appendLog('system', `Joined session ${code}. Pick a character to play.`);
    this.updateChatUrl(code);
    this.renderPicker();
  }

  onWelcome(welcome) {
    this.me = welcome.you;
    this.members = welcome.members || this.members;
    if (this.started) this.hooks.onRoster?.(this.members, this.me);
  }

  onRoster(members) {
    this.members = members;
    const me = members.find((member) => member.id === this.me?.id);
    if (me) this.me = me;
    this.updateCards();
    this.renderRoster();
    this.hooks.onRoster?.(members, this.me);
  }

  onStatus(status) {
    const messages = {
      connected: '',
      reconnecting: 'RECONNECTING…',
      lost: 'CONNECTION LOST — RELOAD TO REJOIN',
      closed: '',
    };
    if (this.el.rosterStatus) this.el.rosterStatus.textContent = messages[status] ?? '';
    // 'connected' also fires on the first open, so only report it after a drop.
    if (status === 'reconnecting') { this.dropped = true; this.appendLog('system', 'Connection dropped. Reconnecting…'); }
    if (status === 'connected' && this.dropped) { this.dropped = false; this.appendLog('system', 'Reconnected.'); }
  }

  onError(message) {
    if (message.code === 'taken' || message.code === 'bad-character') {
      this.setError(message.message);
      this.updateCards();
      this.updateStartButton();
      return;
    }
    this.appendLog('system', message.message);
  }

  holderOf(characterId) {
    return this.members.find((member) => member.characterId === characterId && member.id !== this.me?.id) || null;
  }

  async portraitFor(characterId) {
    if (!this.portraitUrls.has(characterId)) {
      this.portraitUrls.set(characterId, this.getAssets().then(({ shared, palettes }) => {
        if (!shared) return null;
        return this.portraits.portrait(characterId, shared, palettes);
      }).catch(() => null));
    }
    return this.portraitUrls.get(characterId);
  }

  // A portrait <img> that fills in once the close-up is rendered; until then, the character's initial.
  portraitNode(characterId, className = 'portrait') {
    const wrap = el('span', { class: `${className} portrait-empty`, text: characterName(characterId).charAt(0) });
    this.portraitFor(characterId).then((url) => {
      if (!url) return;
      const img = el('img', { src: url, alt: `${characterName(characterId)} portrait`, draggable: 'false' });
      wrap.classList.remove('portrait-empty');
      wrap.textContent = '';
      wrap.append(img);
    });
    return wrap;
  }

  renderPicker() {
    this.el.grid.replaceChildren(...PLAYABLE_CHARACTERS.map((characterId) => {
      const card = el('button', {
        type: 'button', class: 'character-card', 'data-character': characterId,
        onclick: () => this.pick(characterId),
      }, [
        this.portraitNode(characterId, 'card-portrait'),
        el('span', { class: 'card-name', text: characterName(characterId) }),
        el('span', { class: 'card-role', text: characterRole(characterId) }),
        el('span', { class: 'card-state' }),
      ]);
      return card;
    }));
    this.updateCards();
    this.renderMembers();
    this.updateStartButton();
  }

  updateCards() {
    const mine = this.me?.characterId || null;
    for (const card of this.el.grid.querySelectorAll('.character-card')) {
      const characterId = card.dataset.character;
      const holder = this.holderOf(characterId);
      const taken = Boolean(holder);
      card.disabled = taken;
      card.classList.toggle('taken', taken);
      card.classList.toggle('mine', mine === characterId);
      card.querySelector('.card-state').textContent = mine === characterId ? 'YOU' : taken ? `TAKEN · ${holder.name}` : 'FREE';
    }
    this.renderMembers();
    // Every roster change can confirm or clear a pick, so Start must follow it.
    this.updateStartButton();
  }

  renderMembers() {
    if (!this.el.members) return;
    const others = this.members.filter((member) => member.id !== this.me?.id);
    const count = this.members.length;
    this.el.members.textContent = `${count} of ${MAX_MEMBERS} in this session` + (others.length ? ` · ${others.map((m) => m.name).join(', ')}` : '');
  }

  updateStartButton() {
    const picked = Boolean(this.me?.characterId);
    this.el.start.disabled = !picked;
    this.el.hint.textContent = picked
      ? `Playing as ${characterName(this.me.characterId)}. Start when everyone is ready.`
      : 'Choose a character. Nobody else in the session can take the one you pick.';
  }

  // The pick is only shown once the server confirms it in the roster, so a refused pick never
  // leaves the lobby claiming a character this player does not have.
  pick(characterId) {
    if (this.holderOf(characterId)) return;
    this.client.pick(characterId);
  }

  // Leaves the lobby and starts the game as the picked character.
  startTogether() {
    if (!this.me?.characterId) return;
    this.started = true;
    this.el.lobby.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.chat.classList.remove('hidden');
    this.el.chatToggle?.classList.remove('hidden');
    this.el.rosterCode.textContent = this.code;
    this.renderRoster();
    this.appendLog('system', `You are ${characterName(this.me.characterId)}. Press ENTER to chat.`);
    this.hooks.onStart?.({ code: this.code, characterId: this.me.characterId, name: this.me.name, seat: this.me.seat, you: this.me });
    this.hooks.onRoster?.(this.members, this.me);
  }

  renderRoster() {
    if (!this.el.rosterList) return;
    this.el.rosterCount.textContent = `${this.members.length}/${MAX_MEMBERS}`;
    this.el.rosterList.replaceChildren(...this.members.map((member) => {
      const isMe = member.id === this.me?.id;
      const status = !member.characterId ? 'choosing…' : member.m ? (member.r ? 'running' : 'walking') : 'here';
      return el('li', { class: `roster-item${isMe ? ' me' : ''}` }, [
        member.characterId ? this.portraitNode(member.characterId, 'roster-portrait') : el('span', { class: 'roster-portrait portrait-empty', text: '?' }),
        el('span', { class: 'roster-text' }, [
          el('b', { text: `${member.name}${isMe ? ' (you)' : ''}` }),
          el('small', { text: member.characterId ? `${characterName(member.characterId)} · ${status}` : 'choosing a character…' }),
        ]),
      ]);
    }));
  }

  wave() {
    if (!this.started) return;
    this.client.sendGesture('wave');
    this.hooks.onWaveSelf?.();
  }

  sendChat() {
    const text = this.el.input.value.trim();
    if (!text || !this.client) return;
    this.client.sendChat(text);
    this.el.input.value = '';
  }

  onChat(message) {
    const isMe = message.id === this.me?.id;
    const who = `${message.name}${message.characterId ? ` (${characterName(message.characterId)})` : ''}`;
    this.appendLog(isMe ? 'me' : 'peer', message.text, who);
    this.hooks.onChat?.(message, isMe);
  }

  appendLog(kind, text, who = null) {
    const line = el('p', { class: `chat-line ${kind}` }, [
      who ? el('b', { text: `${who}: ` }) : null,
      text,
    ]);
    this.el.log.append(line);
    while (this.el.log.children.length > MAX_LOG_LINES) this.el.log.firstElementChild.remove();
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  openChat() {
    this.el.chat.classList.add('open');
    this.el.chatToggle?.classList.add('active');
    this.el.input.focus();
  }

  toggleChat() {
    if (this.el.chat.classList.contains('open')) {
      this.el.chat.classList.remove('open');
      this.el.chatToggle?.classList.remove('active');
      this.el.input.blur();
    } else {
      this.openChat();
    }
  }

  copyLink() {
    const link = `${location.origin}${location.pathname}?join=${this.code}`;
    navigator.clipboard?.writeText(link).then(
      () => this.setHint('Link copied. Anyone with it can join this session.'),
      () => this.setHint(link),
    );
  }

  setHint(text) {
    this.el.hint.textContent = text;
  }

  updateChatUrl(code) {
    const url = new URL(location.href);
    url.searchParams.set('join', code);
    history.replaceState(null, '', url);
  }

  leave() {
    this.client?.close();
    const url = new URL(location.href);
    url.searchParams.delete('join');
    location.href = url.toString();
  }
}

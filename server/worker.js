// Worker entry. Static pages come from the assets binding; /api/sessions and /ws go to the
// session Durable Objects. The same entry runs under `npm run dev` (workerd via the Cloudflare
// Vite plugin) and after `npm run deploy`.
import { generateCode, isValidCode } from '../shared/session-protocol.js';

export { SessionRoom } from './session-room.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sessions') {
      if (request.method !== 'POST') return json({ error: 'Use POST to create a session' }, 405);
      // Collisions are astronomically unlikely, but a retry costs nothing.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateCode();
        const room = env.SESSIONS.get(env.SESSIONS.idFromName(code));
        const created = await room.fetch('https://session.internal/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (created.status === 201) return json({ code }, 201);
      }
      return json({ error: 'Could not create a session. Try again.' }, 503);
    }

    const info = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (info && request.method === 'GET') {
      const code = info[1].toUpperCase();
      if (!isValidCode(code)) return json({ error: 'Session codes are six characters' }, 400);
      const room = env.SESSIONS.get(env.SESSIONS.idFromName(code));
      return room.fetch('https://session.internal/info');
    }

    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('session') || '').toUpperCase();
      if (!isValidCode(code)) return json({ error: 'Session codes are six characters' }, 400);
      const room = env.SESSIONS.get(env.SESSIONS.idFromName(code));
      // Forward the upgrade with the original query so the room can read the display name.
      return room.fetch(new Request(`https://session.internal/ws${url.search}`, request));
    }

    return env.ASSETS.fetch(request);
  },
};

import '../css/style.css';
import { Game } from './game/Game.js';

// The game must visibly explain itself when it cannot start. Historically a failed boot
// (no WebGL, file:// pages, a broken module load) left the intro screen frozen with the
// start button dead — the page looked like "the game is not opening" with no hint why.
let booted = false;

function showFatal(title, detail, hint) {
  const overlay = document.createElement('div');
  overlay.id = 'fatal-overlay';
  const card = document.createElement('section');
  card.className = 'fatal-card';

  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);

  const detailLine = document.createElement('p');
  const detailCode = document.createElement('code');
  detailCode.textContent = detail;
  detailLine.appendChild(detailCode);
  card.appendChild(detailLine);

  if (hint) {
    const hintLine = document.createElement('p');
    hintLine.className = 'fatal-hint';
    hintLine.textContent = hint;
    card.appendChild(hintLine);
  }

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'RELOAD';
  retry.addEventListener('click', () => location.reload());
  card.appendChild(retry);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// Resource errors (a module or asset that failed to download) do not bubble; a capture
// listener on window still sees them. Ignore them once the game has booted.
window.addEventListener('error', (event) => {
  if (booted) return;
  const target = event.target;
  const isResource = target instanceof Element && (target.tagName === 'SCRIPT' || target.tagName === 'LINK');
  if (isResource) {
    showFatal(
      'FAILED TO LOAD GAME FILES',
      `${target.tagName.toLowerCase()} ${target.src || target.href || 'resource'} did not load (status: ${target.error?.message || 'see console'})`,
      'Run the game through a server or the deployed site — for local play use `npm run dev` and open the URL it prints.',
    );
  } else {
    showFatal('THE GAME FAILED TO START', `${event.message}${event.filename ? ` — ${event.filename}:${event.lineno}` : ''}`);
  }
}, true);

function webgl2Available() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (location.protocol === 'file:') {
  showFatal(
    'OPEN IT THROUGH A SERVER',
    'This page uses ES modules, which browsers block on file:// pages.',
    'Start the dev server with `npm run dev` and open the URL it prints (e.g. http://localhost:5173), or use the deployed site.',
  );
} else if (!webgl2Available()) {
  showFatal(
    'WEBGL 2 IS REQUIRED',
    'Scraper Life renders a 3D city and this browser could not create a WebGL 2 context.',
    'Use a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled, and check that no extension or privacy setting is blocking WebGL.',
  );
} else {
  try {
    const game = new Game();
    game.init();
    booted = true;
  } catch (error) {
    console.error('Scraper Life failed to boot:', error);
    showFatal(
      'THE GAME FAILED TO START',
      error?.message || String(error),
      'Check the browser console for the full stack trace, then reload.',
    );
  }
}

// Lets Android browsers install Scraper Life as a fullscreen app while PC keeps using the same build.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

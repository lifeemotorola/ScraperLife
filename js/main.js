import '../css/style.css';
import { Game } from './game/Game.js';

const game = new Game();
game.init();

// Lets Android browsers install Scraper Life as a fullscreen app while PC keeps using the same build.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

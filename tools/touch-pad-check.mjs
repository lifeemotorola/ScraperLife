// End-to-end check of the touch pad and cleaned HUD against the real index.html markup:
// synthetic pointer events on the joystick produce the documented input vector, while
// map, camera, and Settings controls stay wired and the always-on control legend is gone.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? (() => ({ matches: false }));
dom.window.matchMedia ??= () => ({ matches: false });

const { MobileController } = await import(join(root, 'js/game/MobileController.js'));
const { InputManager } = await import(join(root, 'js/game/InputManager.js'));
const { UIManager } = await import(join(root, 'js/game/UIManager.js'));

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} ${detail}`);
};

const input = {
  move: { x: 0, z: 0 }, running: false, interactions: 0, pulses: 0, cameras: 0,
  setVirtualMove(x, z) { this.move = { x, z }; },
  setVirtualRunning(v) { this.running = v; },
  triggerInteract() { this.interactions++; },
  triggerPulse() { this.pulses++; },
  triggerCamera() { this.cameras++; },
};

const ui = new UIManager();
ui.bindStart(() => {}, () => {});
let voiceOn = true;
ui.bindVoiceToggle(() => (voiceOn = !voiceOn));
let musicOn = true;
ui.bindMusicToggle(() => (musicOn = !musicOn));
ui.setMusicState(musicOn);

const settingsButton = dom.window.document.getElementById('settings-button');
const settingsPanel = dom.window.document.getElementById('settings-panel');
const playerInput = new InputManager({ element: dom.window.document.body });
playerInput.setVirtualMove(.8, 0);
check('Markie can move while Settings is closed', playerInput.getMovement().x < -.7);
check('game title and always-on control legend are removed',
  !dom.window.document.querySelector('.brand')
    && !dom.window.document.querySelector('h1')
    && !dom.window.document.querySelector('.controls'));
check('map and Markie progress stay on the game HUD',
  Boolean(dom.window.document.getElementById('map-panel')
    && dom.window.document.querySelector('.quest-panel')
    && dom.window.document.getElementById('progress-bar')));
const progressPanel = dom.window.document.querySelector('.quest-panel');
check('mission chain and current-job prose are removed; scrap count stays',
  !dom.window.document.getElementById('mission-log')
    && !dom.window.document.getElementById('quest-title')
    && !dom.window.document.getElementById('quest-description')
    && progressPanel.textContent.trim() === 'SCRAP 0 / 7');
ui.updateQuest({ progress: (scrap) => `SCRAP ${scrap} / 7`, percent: (scrap) => (scrap / 7) * 100 }, 3);
check('scrap progress still updates the item count and bar',
  dom.window.document.getElementById('progress-label').textContent === 'SCRAP 3 / 7'
    && dom.window.document.getElementById('progress-bar').style.width === `${(3 / 7) * 100}%`);
settingsButton.click();
check('Settings opens the relocated keyboard, touch, and audio guide',
  ui.settingsOpen && !settingsPanel.classList.contains('hidden')
    && settingsPanel.textContent.includes('W A S D')
    && settingsPanel.textContent.includes('LEFT STICK')
    && settingsPanel.textContent.includes('Background music'));
const moveKey = new dom.window.KeyboardEvent('keydown', {
  key: 'w', code: 'KeyW', bubbles: true, cancelable: true,
});
dom.window.dispatchEvent(moveKey);
check('open Settings blocks gameplay movement', playerInput.getMovement().x === 0
  && !playerInput.keys.has('KeyW'));
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
check('map shortcut does not stack over the open Settings panel',
  !ui.worldMapOpen && dom.window.document.getElementById('world-map').classList.contains('hidden'));
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
check('Escape closes Settings', !ui.settingsOpen && settingsPanel.classList.contains('hidden'));
check('Markie movement resumes after closing Settings', playerInput.getMovement().x < -.7);
playerInput.dispose();

const controller = new MobileController(input);
check('MobileController found the pad elements', Boolean(controller.zone && controller.base && controller.knob));

const base = dom.window.document.getElementById('joystick-base');
base.getBoundingClientRect = () => ({ left: 200, top: 600, width: 116, height: 116, right: 316, bottom: 716 });
const center = { x: 258, y: 658 };

function pointer(type, x, y, id = 7) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0 });
  return event;
}

const zone = controller.zone;
zone.dispatchEvent(pointer('pointerdown', center.x, center.y - 40));   // thumb up
check('joystick up -> move forward', input.move.z < -.5 && Math.abs(input.move.x) < .05,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

zone.dispatchEvent(pointer('pointermove', center.x + 36, center.y));   // thumb right
check('joystick right -> move right', input.move.x > .9 && Math.abs(input.move.z) < .05,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

zone.dispatchEvent(pointer('pointerdown', center.x - 36, center.y, 9)); // second finger ignored
check('a second finger cannot hijack the stick', input.move.x > .9,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

zone.dispatchEvent(pointer('pointermove', center.x + 2, center.y - 3)); // resting thumb
check('dead zone holds still', input.move.x === 0 && input.move.z === 0,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

zone.dispatchEvent(pointer('pointermove', center.x + 40, center.y - 40));
check('diagonal stick input survives', Math.hypot(input.move.x, input.move.z) > .8,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

zone.dispatchEvent(pointer('pointerup', center.x + 40, center.y - 40));
check('releasing the stick stops Markie', input.move.x === 0 && input.move.z === 0,
  `vector (${input.move.x.toFixed(2)}, ${input.move.z.toFixed(2)})`);

const tap = (id, x, y) => {
  const el = dom.window.document.getElementById(id);
  el.dispatchEvent(pointer('pointerdown', x, y, 11));
  el.dispatchEvent(pointer('pointerup', x, y, 11));
  return el;
};

tap('touch-interact', 820, 690);
check('USE button triggers interact', input.interactions === 1, `interactions=${input.interactions}`);
tap('touch-pulse', 700, 700);
check('PULSE button triggers the pulse', input.pulses === 1, `pulses=${input.pulses}`);
tap('touch-camera', 860, 40);
check('CAM button cycles the camera', input.cameras === 1, `cameras=${input.cameras}`);

const run = dom.window.document.getElementById('touch-run');
run.dispatchEvent(pointer('pointerdown', 830, 600, 12));
const runOn = input.running;
run.dispatchEvent(pointer('pointerup', 830, 600, 12));
check('RUN engages while held, releases on lift', runOn === true && input.running === false,
  `held=${runOn} released=${input.running}`);

const mapButton = dom.window.document.getElementById('touch-map');
mapButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const opened = !dom.window.document.getElementById('world-map').classList.contains('hidden');
mapButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const closed = dom.window.document.getElementById('world-map').classList.contains('hidden');
check('MAP button opens and closes the platform map', opened && closed, `opened=${opened} closed=${closed}`);

settingsButton.click();
const voiceButton = dom.window.document.getElementById('voice-toggle');
voiceButton.click();
check('Settings button toggles character voices off', voiceOn === false
  && voiceButton.classList.contains('off')
  && voiceButton.getAttribute('aria-pressed') === 'false',
  `${voiceButton.textContent}, aria-pressed=${voiceButton.getAttribute('aria-pressed')}`);

const musicButton = dom.window.document.getElementById('music-toggle');
musicButton.click();
check('Settings button toggles background music off', musicOn === false
  && musicButton.classList.contains('off')
  && musicButton.getAttribute('aria-pressed') === 'false',
  `${musicButton.textContent}, aria-pressed=${musicButton.getAttribute('aria-pressed')}`);
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
check('B key toggles music back on from Settings', musicOn === true
  && musicButton.getAttribute('aria-pressed') === 'true', `enabled=${musicOn}`);

console.log(failures.length ? `\n${failures.length} touch-wiring check(s) failed.` : '\nAll touch-wiring checks passed.');
process.exit(failures.length ? 1 : 0);

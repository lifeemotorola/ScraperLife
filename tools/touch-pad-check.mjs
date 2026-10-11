// End-to-end check of the touch pad against the real index.html markup:
// synthetic pointer events on the joystick must produce the documented input vector,
// and the MAP / VOX / MUSIC / CAM buttons must be wired.
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

const vox = dom.window.document.getElementById('touch-voice');
vox.dispatchEvent(pointer('pointerdown', 800, 40, 13));
vox.dispatchEvent(pointer('pointerup', 800, 40, 13));
check('VOX button toggles voices off', vox.classList.contains('off') === true, `classes="${vox.className}"`);
check('desktop voice button mirrors the state',
  dom.window.document.getElementById('voice-toggle').textContent.includes('OFF'),
  dom.window.document.getElementById('voice-toggle').textContent);

const musicButton = dom.window.document.getElementById('touch-music');
musicButton.dispatchEvent(pointer('pointerdown', 750, 40, 14));
check('MUS button toggles background music off', musicOn === false && musicButton.classList.contains('off'),
  `enabled=${musicOn} classes="${musicButton.className}"`);
check('desktop music button mirrors the mobile state',
  dom.window.document.getElementById('music-toggle').textContent.includes('OFF')
    && dom.window.document.getElementById('music-toggle').getAttribute('aria-pressed') === 'false',
  dom.window.document.getElementById('music-toggle').textContent);
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
check('B key toggles music back on', musicOn === true
  && dom.window.document.getElementById('touch-music').getAttribute('aria-pressed') === 'true',
  `enabled=${musicOn}`);

console.log(failures.length ? `\n${failures.length} touch-wiring check(s) failed.` : '\nAll touch-wiring checks passed.');
process.exit(failures.length ? 1 : 0);

// Control-scheme regression check: "up" on the stick/keys must always walk away from the
// camera (up the screen) and the character must face the way he moves, at every camera
// angle. This is the bug that made the Android analog feel completely inverted: the
// camera used to sit in FRONT of Markie, so a held direction ran him at the screen and
// the model (authored facing +X) strafed sideways.
//
// Run with:  node tools/controls-check.mjs     (no browser, no extra dependencies)
import * as THREE from 'three';
import { InputManager } from '../js/game/InputManager.js';
import { Game, CAMERA_MODES } from '../js/game/Game.js';
import { stickVector } from '../js/game/MobileController.js';
import { Player, DAE_FORWARD_YAW } from '../js/entities/Player.js';

// --- tiny DOM stand-ins so the real classes can run outside a browser ---
const fakeElement = () => ({
  style: {},
  listeners: new Set(),
  addEventListener(type) { this.listeners.add(type); },
  removeEventListener(type) { this.listeners.delete(type); },
  setPointerCapture() {},
  hasPointerCapture() { return false; },
  releasePointerCapture() {},
});
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

const physics = { canMove: () => true, constrain() {} };

// A camera-only stand-in for Game: same fields updateCamera touches, real camera modes.
function makeCameraRig(modeIndex, cameraYaw) {
  const view = CAMERA_MODES[modeIndex];
  const rig = {
    cameraModes: CAMERA_MODES,
    cameraIndex: modeIndex,
    camera: new THREE.PerspectiveCamera(view.fov, 16 / 9, .1, 180),
    cameraTarget: new THREE.Vector3(),
    cameraLook: new THREE.Vector3(),
    cameraYaw,
    cameraPitch: 0,
    player: null,
  };
  // Pre-place the camera where the rig belongs, so the smoothing lerp does not skew the test.
  rig.camera.position.copy(new THREE.Vector3(0, 0, 0).add(view.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw)));
  return rig;
}

const STICKS = {
  up: { x: 0, z: -1 }, down: { x: 0, z: 1 }, right: { x: 1, z: 0 }, left: { x: -1, z: 0 },
  'up-right': { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
};

function run(rig, stick, frames = 200) {
  const dt = 1 / 60;
  const input = new InputManager({ element: fakeElement() });
  const player = new Player(new THREE.Scene(), new THREE.Vector3(0, 0, 0));
  rig.player = player;
  input.setVirtualMove(stick.x, stick.z);
  let velocity = new THREE.Vector3();
  for (let i = 0; i < frames; i++) {
    input.setCameraYaw(rig.viewYaw ?? rig.cameraYaw);
    const previous = player.position.clone();
    player.update(dt, input, physics, i * dt);
    velocity = player.position.clone().sub(previous).divideScalar(dt);
    Game.prototype.updateCamera.call(rig);
  }
  rig.camera.updateMatrixWorld(true);
  const basis = new THREE.Matrix4().extractRotation(rig.camera.matrixWorld);
  const screenRight = new THREE.Vector3(1, 0, 0).applyMatrix4(basis).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0).applyMatrix4(basis).normalize();
  // Where the character's face points: the DAE front is the group's local +X, corrected
  // by the mount yaw, then rotated by the group's own rotation.
  const facing = new THREE.Vector3(1, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), player.group.rotation.y + DAE_FORWARD_YAW);
  return {
    moveSpeed: velocity.length(),
    screenX: velocity.dot(screenRight),
    screenY: velocity.dot(screenUp),
    facingDotMove: velocity.length() ? facing.dot(velocity.clone().normalize()) : 1,
  };
}

const failures = [];
const check = (label, ok, detail) => {
  if (!ok) failures.push(`${label} — ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
};

for (let mode = 0; mode < CAMERA_MODES.length; mode++) {
  for (const yaw of [0, Math.PI / 2, Math.PI, -2.4, .75]) {
    const rig = makeCameraRig(mode, yaw);
    const where = `${CAMERA_MODES[mode].label} yaw=${yaw.toFixed(2)}`;

    // A camera looking down a shallow angle projects less vertical travel than a top-down
    // one, so each check asserts the direction and which axis dominates.
    const up = run(rig, STICKS.up);
    check(`${where} | stick up walks up the screen`, up.screenY > .5 && up.screenY > Math.abs(up.screenX),
      `screen delta (${up.screenX.toFixed(2)}, ${up.screenY.toFixed(2)})`);

    const down = run(makeCameraRig(mode, yaw), STICKS.down);
    check(`${where} | stick down walks down the screen`, down.screenY < -.5 && -down.screenY > Math.abs(down.screenX),
      `screen delta (${down.screenX.toFixed(2)}, ${down.screenY.toFixed(2)})`);

    const right = run(makeCameraRig(mode, yaw), STICKS.right);
    check(`${where} | stick right walks right`, right.screenX > 1 && right.screenX > Math.abs(right.screenY),
      `screen delta (${right.screenX.toFixed(2)}, ${right.screenY.toFixed(2)})`);

    const left = run(makeCameraRig(mode, yaw), STICKS.left);
    check(`${where} | stick left walks left`, left.screenX < -1 && -left.screenX > Math.abs(left.screenY),
      `screen delta (${left.screenX.toFixed(2)}, ${left.screenY.toFixed(2)})`);

    const diag = run(makeCameraRig(mode, yaw), STICKS['up-right']);
    check(`${where} | stick up-right walks up-right`, diag.screenX > .5 && diag.screenY > .5,
      `screen delta (${diag.screenX.toFixed(2)}, ${diag.screenY.toFixed(2)})`);

    check(`${where} | Markie faces the way he walks`, up.facingDotMove > .98,
      `facing·movement = ${up.facingDotMove.toFixed(3)}`);
  }
}

// A resting thumb inside the dead zone must not creep, and full deflection must be
// reachable right at the base's rim.
const resting = stickVector(6, -4, 100);
const full = stickVector(0, -100, 100);
check('dead zone ignores a resting thumb', resting.x === 0 && resting.z === 0, `start vector (${resting.x}, ${resting.z})`);
check('rim deflection sends full speed', Math.hypot(full.x, full.z) > .99, `start vector (${full.x.toFixed(2)}, ${full.z.toFixed(2)})`);

console.log(failures.length ? `\n${failures.length} control check(s) failed.` : '\nAll control checks passed.');
process.exit(failures.length ? 1 : 0);

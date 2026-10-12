// Android / touch gamepad: one floating thumbstick for movement plus the action
// cluster. The stick only produces a direction; InputManager turns that into a
// camera-relative world direction so "up" is always up on screen.
const DEAD_ZONE = .16;

// Raw knob offset (in units of the stick's radius) -> input vector.
// A resting thumb inside the dead zone produces nothing; the rest of the travel is
// re-scaled so the player still gets a full 0..1 range for slow walking.
export function stickVector(deltaX, deltaY, range) {
  const nx = deltaX / range; const nz = deltaY / range;
  const magnitude = Math.hypot(nx, nz);
  if (magnitude <= DEAD_ZONE) return { x: 0, z: 0 };
  const scaled = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
  return { x: (nx / magnitude) * scaled, z: (nz / magnitude) * scaled };
}

export class MobileController {
  constructor(input) {
    this.input = input;
    this.zone = document.getElementById('joystick-zone');
    this.base = document.getElementById('joystick-base');
    this.knob = document.getElementById('joystick-knob');
    this.activePointer = null;
    if (!this.zone || !this.base || !this.knob) return;

    this.onJoystickDown = this.onJoystickDown.bind(this);
    this.onJoystickMove = this.onJoystickMove.bind(this);
    this.onJoystickUp = this.onJoystickUp.bind(this);
    this.zone.addEventListener('pointerdown', this.onJoystickDown, { passive: false });
    this.zone.addEventListener('pointermove', this.onJoystickMove, { passive: false });
    this.zone.addEventListener('pointerup', this.onJoystickUp, { passive: false });
    this.zone.addEventListener('pointercancel', this.onJoystickUp, { passive: false });

    this.bindTap('touch-interact', () => this.input.triggerInteract());
    this.bindTap('touch-pulse', () => this.input.triggerPulse());
    this.bindTap('touch-camera', () => this.input.triggerCamera());
    this.bindTap('touch-dash', () => this.input.triggerDash?.());
    this.bindTap('touch-journal', () => this.input.triggerJournal?.());
    this.bindHold('touch-run', (active) => this.input.setVirtualRunning(active));
  }

  bindTap(id, action) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault(); event.stopPropagation();
      button.classList.add('active'); action();
      button.setPointerCapture?.(event.pointerId);
    }, { passive: false });
    const release = (event) => { button.classList.remove('active'); if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
  }

  bindHold(id, action) {
    const button = document.getElementById(id);
    if (!button) return;
    const press = (event) => { event.preventDefault(); event.stopPropagation(); button.classList.add('active'); action(true); button.setPointerCapture?.(event.pointerId); };
    const release = (event) => { button.classList.remove('active'); action(false); if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId); };
    button.addEventListener('pointerdown', press, { passive: false });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
  }

  onJoystickDown(event) {
    // Ignore extra fingers: only the pointer that grabbed the stick steers it.
    if (this.activePointer !== null) return;
    this.activePointer = event.pointerId;
    this.zone.classList.add('active');
    this.zone.setPointerCapture?.(event.pointerId);
    this.updateJoystick(event);
    event.preventDefault(); event.stopPropagation();
  }

  onJoystickMove(event) {
    if (event.pointerId !== this.activePointer) return;
    this.updateJoystick(event);
    event.preventDefault(); event.stopPropagation();
  }

  onJoystickUp(event) {
    if (event.pointerId !== this.activePointer) return;
    this.activePointer = null;
    this.zone.classList.remove('active');
    this.input.setVirtualMove(0, 0);
    this.knob.style.transform = 'translate(-50%, -50%)';
    if (this.zone.hasPointerCapture?.(event.pointerId)) this.zone.releasePointerCapture(event.pointerId);
    event.preventDefault(); event.stopPropagation();
  }

  updateJoystick(event) {
    const rect = this.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const range = rect.width * .31;
    let deltaX = event.clientX - centerX;
    let deltaY = event.clientY - centerY;
    const length = Math.hypot(deltaX, deltaY);
    if (length > range) { deltaX = (deltaX / length) * range; deltaY = (deltaY / length) * range; }
    this.knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    const { x, z } = stickVector(deltaX, deltaY, range);
    this.input.setVirtualMove(x, z);
  }
}

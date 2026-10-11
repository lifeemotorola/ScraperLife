export class InputManager {
  constructor({ onInteract, onPulse, onCamera, onLook, element } = {}) {
    this.keys = new Set();
    this.virtualMove = { x: 0, z: 0 };
    this.virtualRunning = false;
    // Yaw of the camera the player looks through. Stick/key input is interpreted in
    // this frame, so "push up" always walks away from the camera (up the screen) and
    // "push right" always walks to the right of the screen, whatever way Markie faces.
    this.cameraYaw = 0;
    this.handlers = { onInteract, onPulse, onCamera, onLook };
    this.element = element || document.body;
    this.dragging = false;
    this.lookPointer = null;
    this.lastPointer = { x: 0, y: 0 };
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.element.style.touchAction = 'none';
    this.element.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.element.addEventListener('pointermove', this.onPointerMove, { passive: false });
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
  }

  onKeyDown(event) {
    const blocked = ['Space', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (blocked.includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyE') this.handlers.onInteract?.();
    if (event.code === 'Space') this.handlers.onPulse?.();
    if (event.code === 'KeyC') this.handlers.onCamera?.();
  }

  onKeyUp(event) { this.keys.delete(event.code); }

  onPointerDown(event) {
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    // Only the first finger steers the camera. A second touch (the other thumb on the
    // D-pad/joystick side) used to yank the view because it reused this one drag state.
    if (this.lookPointer !== null) return;
    this.lookPointer = event.pointerId;
    this.dragging = true;
    this.lastPointer.x = event.clientX; this.lastPointer.y = event.clientY;
    this.element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(event) {
    if (!this.dragging || event.pointerId !== this.lookPointer) return;
    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.x = event.clientX; this.lastPointer.y = event.clientY;
    if (deltaX || deltaY) this.handlers.onLook?.(deltaX, deltaY);
    event.preventDefault();
  }

  onPointerUp(event) {
    if (event.pointerId !== this.lookPointer) return;
    this.dragging = false;
    this.lookPointer = null;
    if (this.element.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
  }

  setVirtualMove(x, z) { this.virtualMove.x = Math.max(-1, Math.min(1, x)); this.virtualMove.z = Math.max(-1, Math.min(1, z)); }
  setVirtualRunning(active) { this.virtualRunning = active; }
  setCameraYaw(yaw) { this.cameraYaw = yaw; }

  // Stick/key vector (x = right, z = down/back) rotated into the camera frame.
  // up (-z) -> camera forward, right (+x) -> camera right, at any camera angle.
  getMovement() {
    let x = this.virtualMove.x; let z = this.virtualMove.z;
    if (this.isDown('KeyW', 'ArrowUp')) z -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) z += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    const cos = Math.cos(this.cameraYaw); const sin = Math.sin(this.cameraYaw);
    const worldX = -x * cos - z * sin;
    const worldZ = x * sin - z * cos;
    return { x: worldX, z: worldZ, running: this.virtualRunning || this.isDown('ShiftLeft', 'ShiftRight') };
  }
  triggerInteract() { this.handlers.onInteract?.(); }
  triggerPulse() { this.handlers.onPulse?.(); }
  triggerCamera() { this.handlers.onCamera?.(); }
  isDown(...codes) { return codes.some((code) => this.keys.has(code)); }
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
  }
}

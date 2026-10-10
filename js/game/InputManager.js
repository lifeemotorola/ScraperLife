export class InputManager {
  constructor({ onInteract, onPulse, onCamera, onLook, element } = {}) {
    this.keys = new Set();
    this.virtualMove = { x: 0, z: 0 };
    this.virtualRunning = false;
    this.handlers = { onInteract, onPulse, onCamera, onLook };
    this.element = element || document.body;
    this.dragging = false;
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
    this.dragging = true;
    this.lastPointer.x = event.clientX; this.lastPointer.y = event.clientY;
    this.element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(event) {
    if (!this.dragging) return;
    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.x = event.clientX; this.lastPointer.y = event.clientY;
    if (deltaX || deltaY) this.handlers.onLook?.(deltaX, deltaY);
    event.preventDefault();
  }

  onPointerUp(event) {
    this.dragging = false;
    if (this.element.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
  }

  setVirtualMove(x, z) { this.virtualMove.x = Math.max(-1, Math.min(1, x)); this.virtualMove.z = Math.max(-1, Math.min(1, z)); }
  setVirtualRunning(active) { this.virtualRunning = active; }
  getMovement() {
    let x = this.virtualMove.x; let z = this.virtualMove.z;
    if (this.isDown('KeyW', 'ArrowUp')) z -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) z += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    return { x, z, running: this.virtualRunning || this.isDown('ShiftLeft', 'ShiftRight') };
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

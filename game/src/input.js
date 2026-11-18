// Keyboard + mouse input. Tracks held keys, edge-triggered presses
// (consume on read so one press fires one action), and mouse drag for
// a small camera orbit. Ignores input while a text field has focus.
export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let dragX = 0;
  let dragging = false;
  let lastX = 0;
  let enabled = true;

  function isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  function keyOf(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return k;
  }
  function onDown(e) {
    if (!enabled || isTypingTarget(e)) return;
    const k = keyOf(e);
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (!held.has(k)) pressed.add(k);
    held.add(k);
  }
  function onUp(e) {
    held.delete(keyOf(e));
  }
  function onBlur() {
    held.clear();
    pressed.clear();
    dragging = false;
  }
  function onMouseDown(e) {
    if (!enabled) return;
    dragging = true;
    lastX = e.clientX;
  }
  function onMouseMove(e) {
    if (!dragging) return;
    dragX += e.clientX - lastX;
    lastX = e.clientX;
  }
  function onMouseUp() { dragging = false; }

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onBlur();
  });

  return {
    // Held-state queries (WASD + arrows).
    get forward() { return held.has('w') || held.has('arrowup'); },
    get back() { return held.has('s') || held.has('arrowdown'); },
    get left() { return held.has('a') || held.has('arrowleft'); },
    get right() { return held.has('d') || held.has('arrowright'); },
    get run() { return held.has('shift'); },
    get handbrake() { return held.has(' '); },
    isHeld(k) { return held.has(k); },
    // Edge trigger: true once per physical press.
    wasPressed(k) {
      const key = k.length === 1 ? k.toLowerCase() : k;
      if (pressed.has(key)) { pressed.delete(key); return true; }
      return false;
    },
    // Mouse orbit, consumed by the camera each frame.
    consumeDrag() { const d = dragX; dragX = 0; return d; },
    endFrame() { pressed.clear(); },
    setEnabled(v) { enabled = v; if (!v) onBlur(); },
    detach() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}

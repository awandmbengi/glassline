// Keyboard + mouse input for GLASSLINE.
//
// Tracks which keys are held, fires edge-triggered presses exactly once
// (consumed on read, so one physical press means one action), and
// accumulates mouse drag for the camera orbit. Input is ignored while a
// text field has focus, and Space / arrows never scroll the page.
export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let enabled = true;

  // Normalise a key: single characters become lowercase ('W' -> 'w'),
  // named keys keep their spelling ('ArrowUp', 'Shift', ' ').
  function keyOf(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  function isTypingTarget(e) {
    const t = e.target;
    return Boolean(t) && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function clearState() {
    held.clear();
    pressed.clear();
    dragging = false;
  }

  function onKeyDown(e) {
    if (!enabled || isTypingTarget(e)) return;
    const k = keyOf(e);
    if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
    }
    // Edge trigger: record the press only on the first down, not repeats.
    if (!held.has(k)) pressed.add(k);
    held.add(k);
  }

  function onKeyUp(e) {
    held.delete(keyOf(e));
  }

  function onBlur() {
    clearState();
  }

  function onVisibilityChange() {
    if (document.hidden) clearState();
  }

  function onMouseDown(e) {
    if (!enabled) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseMove(e) {
    if (!dragging) return;
    dragX += e.clientX - lastX;
    dragY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    // Held-state queries (WASD + arrows, Shift to run, Space to brake).
    get forward() { return held.has('w') || held.has('ArrowUp'); },
    get back() { return held.has('s') || held.has('ArrowDown'); },
    get left() { return held.has('a') || held.has('ArrowLeft'); },
    get right() { return held.has('d') || held.has('ArrowRight'); },
    get run() { return held.has('Shift'); },
    get handbrake() { return held.has(' '); },

    isHeld(k) {
      const key = k.length === 1 ? k.toLowerCase() : k;
      return held.has(key);
    },

    // Edge trigger: true once per physical press, consumed on read.
    wasPressed(k) {
      const key = k.length === 1 ? k.toLowerCase() : k;
      if (pressed.has(key)) {
        pressed.delete(key);
        return true;
      }
      return false;
    },

    // Mouse drag since the last call, then zeroed. dx is horizontal
    // pixels, dy vertical.
    consumeDrag() {
      const out = { dx: dragX, dy: dragY };
      dragX = 0;
      dragY = 0;
      return out;
    },

    // Drop any presses not yet read (called once per frame).
    endFrame() {
      pressed.clear();
    },

    setEnabled(v) {
      enabled = v;
      if (!v) clearState();
    },

    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

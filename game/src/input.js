// Keyboard and pointer input. Held keys are read every frame; one-shot presses
// (confirm, pause, interact, punch, horn, radio, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost or
// counted twice. A key released while the tab is hidden never sends keyup:
// everything is released on blur.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_HORN = 16;
export const ACTION_RADIO = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const RADIO = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, interact: false };
  let actions = 0;

  function releaseAll() {
    held.up = held.down = held.left = held.right = held.interact = false;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (INTERACT.has(event.code)) {
      held.interact = true;
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (RADIO.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RADIO;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (INTERACT.has(event.code)) held.interact = false;
  });
  window.addEventListener('blur', releaseAll);
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Throttle: 1 forward, -1 reverse, 0 none. */
    throttle() {
      return (held.up ? 1 : 0) - (held.down ? 1 : 0);
    },
    /** Steering: -1 left, 1 right, 0 none. */
    steer() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    /** Walk direction in camera space: {x, z} each -1, 0 or 1. */
    walk() {
      return { x: (held.right ? 1 : 0) - (held.left ? 1 : 0), z: (held.down ? 1 : 0) - (held.up ? 1 : 0) };
    },
    anyHeld() {
      return held.up || held.down || held.left || held.right;
    },
    /** True while E is held down (hold-to-interact). */
    interactHeld() {
      return held.interact;
    },
    releaseAll,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

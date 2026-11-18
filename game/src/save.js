// Save / load through localStorage.
//
// Only progress, money and options are stored — a small payload. When
// storage is blocked (sandboxed iframes, private mode) every call is
// guarded and the module quietly falls back to an in-memory copy, so the
// game never crashes on a save it cannot write.
import { CONFIG } from './config.js';

const SCHEMA = 1;
const PROBE_KEY = '__glassline_probe__';

function blankState() {
  return {
    version: SCHEMA,
    missionsDone: 0,
    money: CONFIG.money.start,
    carColor: 0xc23a2e,
    volume: CONFIG.audio.master,
    muted: false,
    radioStation: 0,
    endings: [],
    freeRoam: false,
  };
}

export function createSave() {
  let memory = blankState();

  // Probe once at creation: can this environment actually use storage?
  let available = true;
  try {
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
  } catch {
    available = false;
  }

  function load() {
    // No storage at all: hand back the in-memory copy.
    if (!available) return { ...memory };
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (!raw) return blankState();
      const data = JSON.parse(raw);
      if (!data || data.version !== SCHEMA) return blankState();
      return { ...blankState(), ...data };
    } catch {
      return blankState();
    }
  }

  function save(data) {
    memory = { ...blankState(), ...data, version: SCHEMA };
    if (!available) return false;
    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(memory));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    memory = blankState();
    if (!available) return;
    try {
      localStorage.removeItem(CONFIG.saveKey);
    } catch {
      // Storage disappeared mid-game; memory is already reset.
    }
  }

  return {
    load,
    save,
    clear,
    blank: blankState,
    get available() {
      return available;
    },
  };
}

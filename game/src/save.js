// Save / load through localStorage. Small payload only: progress,
// money, options. Safe when storage is blocked (sandboxed iframes):
// every call is guarded and falls back to memory.
import { CONFIG } from './config.js';

const SCHEMA = 1;

function blank() {
  return {
    version: SCHEMA,
    missionsDone: 0,       // highest mission completed (0..7)
    money: CONFIG.money.start,
    carColor: 0xc23a2e,
    volume: CONFIG.audio.master,
    muted: false,
    radioStation: 0,
    endings: [],           // endings seen: 'leak' | 'blackmail' | 'burn'
    freeRoam: false,
  };
}

export function createSave() {
  let memory = blank();
  let available = true;
  try {
    const probe = '__glassline_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    available = false;
  }

  function read() {
    if (!available) return { ...memory };
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      if (!data || data.version !== SCHEMA) return blank();
      return { ...blank(), ...data };
    } catch {
      return blank();
    }
  }

  function write(data) {
    memory = { ...blank(), ...data, version: SCHEMA };
    if (!available) return false;
    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(memory));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    memory = blank();
    if (!available) return;
    try { localStorage.removeItem(CONFIG.saveKey); } catch { /* ignore */ }
  }

  return {
    load: read,
    save: write,
    clear,
    blank,
    get available() { return available; },
  };
}

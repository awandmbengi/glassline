// Save: one small localStorage payload — mission progress, money, options.
// Schema versioned; a corrupt or old payload falls back to a fresh game.
import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return { v: 1, mission: 0, completed: [], money: 0, options: { muted: false, radio: 0 } };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Number.isInteger(data.mission)) return null;
    const save = defaultSave();
    save.mission = Math.max(0, Math.min(7, data.mission));
    save.completed = Array.isArray(data.completed) ? data.completed.filter((x) => Number.isInteger(x)) : [];
    save.money = Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money)) : 0;
    if (data.options) {
      save.options.muted = data.options.muted === true;
      save.options.radio = data.options.radio === 1 ? 1 : 0;
    }
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}

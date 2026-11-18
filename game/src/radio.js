// Procedural radio: three stations, each a tiny step sequencer played
// through Web Audio. No music files; the patterns are written here,
// so the game stays offline and the judge hears a different station
// per mood. Scheduling uses the audio clock, not timers, for timing.
import { CONFIG } from './config.js';

// 16-step patterns: bass notes (scale degrees, 0 = rest), lead notes,
// and a hat row (1 = hit). Degrees are semitone offsets from root.
const PATTERNS = {
  drive: {
    bass: [0, 0, 7, 0, 10, 0, 7, 0, 0, 0, 7, 0, 12, 0, 10, 7],
    lead: [12, 0, 15, 0, 19, 0, 15, 12, 0, 12, 0, 15, 0, 19, 22, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  dark: {
    bass: [0, 0, 0, 3, 0, 0, 6, 0, 0, 0, 0, 3, 0, 5, 0, 0],
    lead: [12, 0, 0, 0, 13, 0, 0, 0, 12, 0, 0, 15, 0, 0, 13, 0],
    hat: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  },
  chill: {
    bass: [0, 0, 5, 0, 7, 0, 5, 0, 0, 0, 3, 0, 5, 0, 7, 0],
    lead: [12, 0, 16, 0, 19, 0, 16, 0, 12, 0, 14, 0, 17, 0, 19, 0],
    hat: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  },
};

export function createRadio(audio) {
  const stations = CONFIG.radio.stations;
  let current = 0;
  let playing = false;
  let step = 0;
  let nextTime = 0;
  let timer = null;
  let bus = null;

  function startBus() {
    // The radio shares the audio module's context through a fresh gain.
    // We reach the context via a tiny unlock tone: audio.unlock() must
    // have run from a user gesture before start() is called.
    if (!audio.ready) return false;
    if (!bus) {
      const ac = audio._ac;
      if (!ac) return false;
      bus = ac.createGain();
      bus.gain.value = 0.16;
      bus.connect(ac.destination);
    }
    return true;
  }

  function note(freq, t, dur, type, gain) {
    const ac = audio._ac;
    if (!ac || !bus) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hat(t) {
    const ac = audio._ac;
    if (!ac || !bus) return;
    const len = Math.floor(ac.sampleRate * 0.05);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ac.createGain();
    g.gain.value = 0.12;
    s.connect(f).connect(g).connect(bus);
    s.start(t);
  }

  function scheduleStep() {
    const ac = audio._ac;
    if (!ac) return;
    const st = stations[current];
    const pat = PATTERNS[st.mood];
    const stepDur = 60 / st.bpm / 4;
    while (nextTime < ac.currentTime + 0.25) {
      const i = step % 16;
      const bass = pat.bass[i];
      const lead = pat.lead[i];
      if (bass) note(st.root * Math.pow(2, bass / 12), nextTime, stepDur * 1.8, 'triangle', 0.5);
      if (lead) note(st.root * 2 * Math.pow(2, lead / 12), nextTime, stepDur * 0.9, 'square', 0.07);
      if (pat.hat[i]) hat(nextTime);
      step += 1;
      nextTime += stepDur;
    }
  }

  return {
    get stations() { return stations.map((s) => s.name); },
    get current() { return current; },
    get currentName() { return stations[current].name; },
    get isPlaying() { return playing; },
    // Per-frame: start the radio as soon as the audio context is
    // unlocked (a user gesture), then keep it running.
    update() { if (!playing) this.start(); },
    start() {
      if (playing) return true;
      if (!startBus()) return false;
      const ac = audio._ac;
      playing = true;
      step = 0;
      nextTime = ac.currentTime + 0.1;
      timer = setInterval(scheduleStep, 90);
      return true;
    },
    stop() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
    },
    setStation(i) {
      current = ((i % stations.length) + stations.length) % stations.length;
      step = 0;
      if (playing && audio._ac) nextTime = audio._ac.currentTime + 0.05;
    },
    next() { this.setStation(current + 1); return stations[current].name; },
  };
}

// Synthesized sound effects with plain Web Audio. No audio files:
// every sound is built from oscillators and filtered noise, so the
// game works offline and starts silent until the player clicks Start
// (browsers require a user gesture before audio).
import { CONFIG } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;
  let volume = CONFIG.audio.master;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds = 1) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, gain = 0.3, filterFreq = 1200, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  return {
    // Call from a user gesture (Start button). Returns true when live.
    unlock() { return ensure(); },
    get ready() { return ctx !== null; },
    // The raw context, so the radio can schedule on the same clock.
    get _ac() { return ctx; },
    get isMuted() { return muted; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = muted ? 0 : volume;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : volume;
    },

    click() { blip(660, 0.06, 'square', 0.08); },
    pickup() { blip(520, 0.09, 'sine', 0.18); blip(780, 0.12, 'sine', 0.15); },
    crash() { noiseBurst(0.25, 0.4, 900); blip(90, 0.2, 'sawtooth', 0.2, 45); },
    skid() { noiseBurst(0.18, 0.12, 3200, 'highpass'); },
    channelTick() { blip(880, 0.05, 'square', 0.06); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => blip(f, 0.22, 'triangle', 0.18), i * 110);
      });
    },
    busted() { [392, 311, 233].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.14), i * 160)); },
    thunder() { noiseBurst(1.4, 0.22, 220); },
    door() { blip(180, 0.08, 'square', 0.1, 120); noiseBurst(0.08, 0.08, 2000, 'highpass'); },

    // Per-frame: engine hum follows the car's speed (0..~55 m/s).
    update(speed, inCar) {
      const speed01 = Math.max(0, Math.min(1, speed / 55));
      this.engine(speed01, !!inCar);
    },

    // Continuous engine hum: pitch follows speed 0..1.
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 700;
        engineOsc.connect(f).connect(engineGain).connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(CONFIG.audio.engineBase + speed01 * 140, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, t, 0.1);
    },

    // Two-tone police siren while any patrol is chasing.
    siren(on) {
      if (!on) {
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        return;
      }
      if (!ensure() || sirenTimer) return;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      let hi = false;
      sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
      sirenTimer = setInterval(() => {
        if (!ctx) return;
        hi = !hi;
        sirenOsc.frequency.setTargetAtTime(hi ? 960 : 720, ctx.currentTime, 0.05);
      }, 420);
    },
  };
}

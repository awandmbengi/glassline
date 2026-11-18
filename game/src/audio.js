// Sound, all synthesized with Web Audio — no audio files. Everything starts only
// after the player clicks Start (browsers need a gesture); the game plays fine
// muted. Two tiny radio stations are step sequencers: a bass line, a pad and a
// hat, scheduled a bar ahead.
import { RADIO } from './config.js';

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let station = 0;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let radioTimer = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Rain: looped filtered noise, always on once audio starts.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.05;
      noise.connect(filter);
      filter.connect(rainGain);
      rainGain.connect(master);
      noise.start();
      // Engine hum: a sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 40;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function scheduleRadioBar() {
    if (!ctx) return;
    const st = RADIO[station];
    const stepDur = 60 / st.bpm / 2; // eighth notes
    while (nextNoteTime < ctx.currentTime + 0.4) {
      const step = stepIndex % 16;
      const degree = st.scale[(step * 7 + 3) % st.scale.length];
      const bassMidi = st.root + degree;
      // Bass on beats 0, 4, 8, 12; pad chord on 0 and 8; hat every off-beat.
      if (step % 4 === 0) tone(midiToFreq(bassMidi), stepDur * 1.8, 'triangle', 0.16, nextNoteTime - ctx.currentTime);
      if (step === 0 || step === 8) {
        tone(midiToFreq(bassMidi + 12), stepDur * 6, 'sine', 0.05, nextNoteTime - ctx.currentTime);
        tone(midiToFreq(bassMidi + 19), stepDur * 6, 'sine', 0.04, nextNoteTime - ctx.currentTime);
      }
      if (step % 2 === 1) tone(6000, 0.03, 'square', 0.02, nextNoteTime - ctx.currentTime);
      nextNoteTime += stepDur;
      stepIndex += 1;
    }
  }

  return {
    /** Call from a user gesture (the Start button). Returns false when audio is unavailable. */
    start() {
      if (!ensure()) return false;
      if (ctx.state === 'suspended') ctx.resume();
      nextNoteTime = ctx.currentTime + 0.1;
      stepIndex = 0;
      if (radioTimer === null) radioTimer = window.setInterval(scheduleRadioBar, 120);
      return true;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    setStation(index) {
      station = index === 1 ? 1 : 0;
      stepIndex = 0;
      if (ctx) nextNoteTime = ctx.currentTime + 0.05;
    },
    stationName() {
      return RADIO[station].name;
    },
    /** speed01: 0..1 of top speed. Silent when on foot (0) or muted. */
    setEngine(speed01, on) {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on && !muted ? 0.03 + speed01 * 0.05 : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(40 + speed01 * 90, t, 0.1);
    },
    setSiren(on) {
      if (!ctx) return;
      if (on && sirenOsc === null) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = muted ? 0 : 0.035;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = true;
        sirenTimer = window.setInterval(() => {
          if (sirenOsc) sirenOsc.frequency.value = high ? 920 : 700;
          high = !high;
        }, 350);
      } else if (!on && sirenOsc !== null) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
        sirenOsc.stop();
        sirenOsc.disconnect();
        sirenOsc = null;
        sirenGain = null;
      }
      if (sirenGain) sirenGain.gain.value = on && !muted ? 0.035 : 0;
    },
    blip() {
      tone(880, 0.12, 'sine', 0.12, 0, 1320);
    },
    thud() {
      tone(90, 0.18, 'sine', 0.25, 0, 45);
    },
    horn() {
      tone(370, 0.25, 'square', 0.08);
      tone(466, 0.25, 'square', 0.06);
    },
    punch() {
      tone(160, 0.08, 'square', 0.15, 0, 70);
    },
    thunder() {
      tone(55, 1.6, 'sawtooth', 0.12, 0, 30);
    },
    success() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.09));
    },
  };
}

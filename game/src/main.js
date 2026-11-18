// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, the renderer paints what is there and the HUD reads the state.
// Screens: title, play, paused, complete, ending. On title the world runs as an
// attract backdrop (traffic and rain, no player control).
//
// ?seed=N fixes the city. ?shot=overpass|intersection|drainage|dam (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { clearSave, defaultSave, loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
let save = loadSave();
const world = createWorld(createRandom(seed), save);
const renderer = createRenderer(canvas, world.state);
// Debug handle for headless play-tests (this repo's own test script).
window.__glassline = { world, get state() { return world.state; } };
const audio = createAudio();
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let muted = save ? save.options.muted : false;
let radioStation = save ? save.options.radio : 0;
audio.setMuted(muted);
audio.setStation(radioStation);
world.state.radioName = audio.stationName();

function announce(message) {
  status.textContent = message;
}

function persist() {
  const data = {
    v: 1,
    mission: Math.min(world.runner.runner.index, 7),
    completed: [...world.state.completed],
    money: world.state.money,
    options: { muted, radio: radioStation },
  };
  save = data;
  writeSave(data);
}

function setScreen(next) {
  screen = next;
}

const hud = createHud({
  onNewGame() {
    clearSave();
    save = null;
    world.reset(null);
    world.state.money = 0;
    world.state.completed = [];
    audio.start();
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    announce('Playing. Mission 1: First Drop.');
  },
  onContinue() {
    audio.start();
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    announce('Playing.');
  },
  onResume() {
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    announce('Playing.');
  },
  onRestartMission() {
    const index = world.runner.runner.index;
    world.state.player.x = -30;
    world.state.player.z = 150;
    world.state.player.y = 0;
    if (world.state.player.car) {
      world.state.player.car.speed = 0;
      world.state.player.car = null;
      world.state.player.onFoot = true;
    }
    world.police.cars = [];
    world.police.heli.active = false;
    world.police.wanted = 0;
    world.state.disguised = false;
    world.state.passenger = false;
    world.state.mara.state = 'hidden';
    world.runner.start(index);
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    hud.toast('Mission restarted.');
    announce('Playing.');
  },
  onQuitToTitle() {
    persist();
    setScreen(SCREEN_TITLE);
    hud.showTitle(save);
    announce('Title screen.');
  },
  onResetSave() {
    clearSave();
    save = null;
    world.reset(null);
    setScreen(SCREEN_TITLE);
    hud.showTitle(null);
    hud.toast('Save erased.');
  },
  onToggleMute() {
    muted = !muted;
    audio.setMuted(muted);
    document.getElementById('mute-btn').textContent = muted ? 'Sound: off' : 'Sound: on';
    persist();
  },
});

function handleEvent(ev) {
  switch (ev.type) {
    case 'mission-start':
      hud.toast(`${ev.name} — ${ev.briefing}`, 6000);
      break;
    case 'mission-complete': {
      audio.success();
      persist();
      const last = world.runner.runner.index >= 7;
      if (world.state.ending) {
        setScreen('ending');
        hud.showEnding(world.state.ending);
      } else {
        setScreen('complete');
        hud.showComplete(ev.name, ev.reward, last);
      }
      break;
    }
    case 'mission-failed':
      hud.toast(`${ev.name} failed — ${ev.reason}`, 5000);
      break;
    case 'objective':
      hud.toast(ev.text, 4000);
      break;
    case 'busted':
      hud.toast('Busted! The Veyra PD took $200. Back to the start.', 5000);
      break;
    case 'crash':
      audio.thud();
      break;
    case 'rammed':
      audio.thud();
      break;
    case 'hit-ped':
      audio.thud();
      hud.toast('You hit a pedestrian — wanted level up.', 4000);
      break;
    case 'stolen':
      audio.blip();
      hud.toast('Car stolen. Keep it clean — or don\'t.', 3000);
      break;
    case 'punch':
      audio.punch();
      break;
    case 'horn':
      audio.horn();
      break;
    case 'thunder':
      audio.thunder();
      break;
    case 'lights':
      hud.toast('The Sluice District lights up again.', 4000);
      break;
    case 'enter-car':
    case 'exit-car':
      audio.blip();
      break;
    default:
      break;
  }
}

function drainEvents() {
  for (const ev of world.state.events) handleEvent(ev);
}

function runShot(name) {
  hud.hideAllScreens();
  stageShot(name, world, renderer);
  world.state.radioName = audio.stationName();
  hud.update(world.state, SCREEN_PLAY);
  let painted = 0;
  function paint() {
    renderer.draw(SCREEN_PLAY);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

const dummyInput = {
  throttle: () => 0,
  steer: () => 0,
  walk: () => ({ x: 0, z: 0 }),
  takeActions: () => 0,
  interactHeld: () => false,
  anyHeld: () => false,
};

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        setScreen(SCREEN_PAUSED);
        // No mission to restart once the story is finished — hide the button
        // instead of letting it call startMission(7).
        document.getElementById('pause-restart').classList.toggle('hidden', !world.runner.current());
        hud.show('pause-screen');
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        setScreen(SCREEN_PLAY);
        hud.hideAllScreens();
        announce('Playing.');
      }
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      if (save) hudCallbacksOnContinue();
      else hudCallbacksOnNewGame();
    }
    if (actions & ACTION_RADIO && screen === SCREEN_PLAY) {
      radioStation = radioStation === 0 ? 1 : 0;
      audio.setStation(radioStation);
      world.state.radioName = audio.stationName();
      hud.toast(`Radio: ${audio.stationName()}`, 2500);
      persist();
    }
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      document.getElementById('mute-btn').textContent = muted ? 'Sound: off' : 'Sound: on';
      persist();
    }
    // The world consumes the rest (interact / punch) inside its own step via
    // takeActions — but takeActions was already called here, so hand the flags
    // to the world through a shared queue instead.
    pendingActions |= actions;
  }

  // The world reads one-shot actions from this queue; handleActions fills it
  // and the world's step drains it, so a press is never lost or double-counted.
  let pendingActions = 0;
  const worldInput = {
    throttle: () => input.throttle(),
    steer: () => input.steer(),
    walk: () => input.walk(),
    takeActions: () => {
      const taken = pendingActions;
      pendingActions = 0;
      return taken;
    },
    interactHeld: () => input.interactHeld(),
    anyHeld: () => input.anyHeld(),
  };

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      const useInput = screen === SCREEN_PLAY ? worldInput : dummyInput;
      while (accumulator >= STEP) {
        world.step(STEP, useInput);
        accumulator -= STEP;
        drainEvents();
      }
      // Sound follows the chase.
      const p = world.state.player;
      audio.setEngine(p.car ? Math.abs(p.car.speed) / 42 : 0, Boolean(p.car));
      audio.setSiren(world.state.police.cars.length > 0);
      world.state.radioName = audio.stationName();
    } else {
      accumulator = 0;
      audio.setEngine(0, false);
      audio.setSiren(false);
    }
    hud.update(world.state, screen);
    renderer.draw(screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED);
      document.getElementById('pause-restart').classList.toggle('hidden', !world.runner.current());
      hud.show('pause-screen');
      announce('Paused.');
    }
  });

  // Keyboard start from the title screen uses the same callbacks as the buttons.
  function hudCallbacksOnContinue() {
    audio.start();
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    announce('Playing.');
  }
  function hudCallbacksOnNewGame() {
    clearSave();
    save = null;
    world.reset(null);
    world.state.money = 0;
    world.state.completed = [];
    audio.start();
    setScreen(SCREEN_PLAY);
    hud.hideAllScreens();
    announce('Playing. Mission 1: First Drop.');
  }

  hud.showTitle(save);
  document.getElementById('mute-btn').textContent = muted ? 'Sound: off' : 'Sound: on';
  announce('GLASSLINE. Press Space or click New game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

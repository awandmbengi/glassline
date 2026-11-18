// GLASSLINE — bootstrap, game loop and state machine.
// Wires every module into one game object G, runs the loop, and owns
// the screens (menu, pause, busted, failed, ending) plus the save.
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { createRng } from './random.js';
import { createInput } from './input.js';
import { createSave } from './save.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { buildCityLayout } from './city.js';
import { createWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { shotFromUrl, applyShot } from './shots.js';

const G = {
  money: CONFIG.money.start,
  ending: null,
  shotMode: false,
  saveData: null,
};
G.layout = buildCityLayout(1337);
G.input = createInput();
G.saveApi = createSave();
G.saveData = G.saveApi.load();
G.money = G.saveData.money;
G.audio = createAudio();
G.radio = createRadio(G.audio);

const canvas = document.getElementById('game');
G.renderer = createRenderer(canvas);
G.world = createWorld(G.layout, {
  onLightning: () => G.audio.thunder(),
});
G.scene = G.world.scene;
G.vehicles = createVehicles(G.world, G.layout, G.scene);
G.people = createPeople(G.world, G.layout, G.scene);
G.police = createPolice(G.world, G.layout, G.vehicles, G.scene);
G.hud = createHud();
G.missions = createMissions(G);

// Nara on foot: amber jacket, visible in the rain.
function buildNaraMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e242a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), dark);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), jacket);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  return g;
}

G.player = {
  x: G.layout.landmarks.playerSpawn.x,
  z: G.layout.landmarks.playerSpawn.z,
  y: 0,
  heading: Math.PI,
  speed: 0,
  camYaw: Math.PI,
  car: null,
  onFoot: true,
  mesh: buildNaraMesh(),
  stun: 0,
};
G.scene.add(G.player.mesh);

let state = 'menu'; // menu | playing | paused | busted | failed | ending | shot
let stateData = null;
let nextMissionTimer = 0;
let pedRespawn = 0;

function saveGame() {
  G.saveData.missionsDone = Math.max(G.saveData.missionsDone, G.missions.doneCount);
  G.saveData.money = G.money;
  G.saveData.muted = G.audio.isMuted;
  G.saveData.radioStation = G.radio.current;
  G.saveApi.save(G.saveData);
}
G.save = saveGame;

function setState(s, data = null) {
  state = s;
  stateData = data;
}

function enterCar() {
  const p = G.player;
  if (p.car) return false;
  const car = G.vehicles.nearestCar(p.x, p.z, CONFIG.player.enterRadius, (c) => !c.isPolice || true);
  if (!car) return false;
  if (car.isPlayer) return false;
  const wasStolen = !car.stolen;
  car.stolen = true;
  car.isPlayer = true;
  p.car = car;
  p.onFoot = false;
  p.mesh.visible = false;
  G.audio.door();
  if (wasStolen) {
    G.police.addWanted(CONFIG.wanted.stealCar);
    G.hud.toast(`Kamu mencuri ${car.type === 'patrol' ? 'mobil patroli' : 'mobil'} — polisi mengejarmu!`);
  }
  // The witness rides along when she follows and is near the car.
  const wit = G.people.witness;
  if (wit && wit.following && !wit.inCar) {
    const dx = wit.x - p.x, dz = wit.z - p.z;
    if (dx * dx + dz * dz < 10 * 10) wit.inCar = true;
  }
  return true;
}

function exitCar() {
  const p = G.player;
  if (!p.car || Math.abs(p.car.speed) > 1) return false;
  const car = p.car;
  car.isPlayer = false;
  p.car = null;
  p.onFoot = true;
  p.x = car.x - Math.sin(car.heading + Math.PI / 2) * 3;
  p.z = car.z - Math.cos(car.heading + Math.PI / 2) * 3;
  p.heading = car.heading;
  p.mesh.visible = true;
  G.audio.door();
  const wit = G.people.witness;
  if (wit && wit.inCar) {
    wit.inCar = false;
    wit.following = true;
    wit.x = p.x + 1;
    wit.z = p.z + 1;
  }
  return true;
}

function startMission(id) {
  // Cancel any pending auto-start: the player (or a test) starting a
  // mission explicitly wins over the timer armed by the last completion.
  nextMissionTimer = 0;
  G.missions.abort();
  G.police.reset();
  if (G.missions.start(id)) {
    G.hud.setMission(`Misi ${id}: ${G.missions.list[id - 1].name}`);
    setState('playing');
  }
}

G.onMissionComplete = (def, reward) => {
  saveGame();
  if (def.id >= 7) return; // ending handled by onEnding
  nextMissionTimer = 2.5;
  G.hud.setMission('Jalan bebas');
};

G.onMissionFailed = (def, reason) => {
  setState('failed', { def, reason });
  showFailed(def, reason);
};

function showFailed(def, reason) {
  G.hud.setScreen(`
    <div class="panel">
      <h1>MISI GAGAL</h1>
      <p>${reason}</p>
      <p class="dim">Misi ${def.id}: ${def.name}</p>
      <button data-act="retry">Coba Lagi</button>
      <button data-act="freeroam">Jalan Bebas</button>
    </div>`);
}

G.onEnding = (ending) => {
  setState('ending', { ending });
  const texts = {
    leak: 'Kamu membocorkan datanya ke publik. Konglomerat energi itu runtuh dalam seminggu — dan Veyra akhirnya melihat siapa yang mematikan lampunya.',
    blackmail: 'Kamu memeras konglomerat itu. Uang mengalir, tapi mereka tidak pernah berhenti mengawasimu. Veyra tetap milikmu — untuk sekarang.',
    burn: 'Kamu membakar bukti itu. Tidak ada yang runtuh, tidak ada yang berubah — tapi malam ini, Veyra tidur tanpa tahu betapa dekatnya ia dengan kebenaran.',
  };
  G.hud.setScreen(`
    <div class="panel">
      <h1>${ending === 'leak' ? 'BOCORKAN' : ending === 'blackmail' ? 'PERAS' : 'BAKAR'}</h1>
      <p>${texts[ending]}</p>
      <p class="dim">GLASSLINE selesai — Nara Venn lolos. Skor akhir: $${G.money} · Misi: ${G.missions.doneCount}/7</p>
      <button data-act="freeroam">Main Bebas</button>
      <button data-act="menu">Menu Utama</button>
    </div>`);
};

function onBusted() {
  const lost = Math.min(G.money, 100);
  G.money -= lost;
  G.police.reset();
  G.player.car = null;
  G.player.onFoot = true;
  G.player.mesh.visible = true;
  G.player.x = G.layout.landmarks.playerSpawn.x;
  G.player.z = G.layout.landmarks.playerSpawn.z;
  G.player.heading = Math.PI;
  G.audio.busted();
  saveGame();
  setState('busted', { lost, missionId: G.missions.current ? G.missions.current.def.id : null });
  G.hud.setScreen(`
    <div class="panel">
      <h1>TERTANGKAP</h1>
      <p>Polisi menangkap Nara. Kamu kehilangan $${lost}.</p>
      <button data-act="retry">Coba Lagi</button>
      <button data-act="menu">Menu Utama</button>
    </div>`);
}

function showMenu() {
  const hasSave = G.saveData.missionsDone > 0;
  const cont = hasSave
    ? `<button data-act="continue">Lanjutkan — Misi ${Math.min(7, G.saveData.missionsDone + 1)}</button>`
    : '';
  G.hud.setScreen(`
    <div class="panel">
      <h1>GLASSLINE</h1>
      <p class="tag">Veyra — kota di atas badai. Nara Venn, kurir pelarian, memegang bukti yang bisa meruntuhkan konglomerat energi.</p>
      <button data-act="start">Mulai — Misi 1</button>
      ${cont}
      <button data-act="freeroam">Jalan Bebas</button>
      <p class="dim">WASD mengemudi / jalan · E masuk-keluar mobil · Spasi rem tangan · Q ganti radio · M bisu · Esc jeda</p>
      <p class="dim">7 misi · polisi + helikopter · minimap · save otomatis</p>
    </div>`);
  setState('menu');
}

function showPause() {
  G.hud.setScreen(`
    <div class="panel">
      <h1>JEDA</h1>
      <button data-act="resume">Lanjutkan</button>
      <button data-act="restart-mission">Ulangi Misi</button>
      <button data-act="menu">Menu Utama</button>
      <p class="dim">Volume: <input id="vol" type="range" min="0" max="100" value="${Math.round(G.audio.isMuted ? 0 : 50)}"> · <button data-act="mute">${G.audio.isMuted ? 'Nyalakan Suara' : 'Bisukan'}</button></p>
    </div>`);
  setState('paused');
}

function wireScreenButtons() {
  document.getElementById('screen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    G.audio.unlock();
    G.audio.click();
    if (act === 'start') {
      G.money = CONFIG.money.start;
      G.missions.setDoneCount(0);
      G.saveData.missionsDone = 0;
      G.hud.setScreen('');
      startMission(1);
    } else if (act === 'continue') {
      G.money = G.saveData.money;
      G.missions.setDoneCount(G.saveData.missionsDone);
      G.hud.setScreen('');
      startMission(Math.min(7, G.saveData.missionsDone + 1));
    } else if (act === 'freeroam') {
      G.missions.abort();
      G.police.reset();
      G.hud.setMission('Jalan bebas');
      G.hud.setObjective('Jelajahi Veyra — tidak ada misi aktif.');
      G.hud.setScreen('');
      setState('playing');
    } else if (act === 'resume') {
      G.hud.setScreen('');
      setState('playing');
    } else if (act === 'restart-mission') {
      const cur = G.missions.current;
      G.hud.setScreen('');
      if (cur) startMission(cur.def.id);
      else setState('playing');
    } else if (act === 'menu') {
      G.missions.abort();
      G.police.reset();
      showMenu();
    } else if (act === 'retry') {
      const id = stateData && stateData.missionId
        ? stateData.missionId
        : stateData && stateData.def ? stateData.def.id : null;
      G.hud.setScreen('');
      if (id) startMission(id);
      else { G.hud.setObjective('Jelajahi Veyra — tidak ada misi aktif.'); setState('playing'); }
    } else if (act === 'mute') {
      G.audio.setMuted(!G.audio.isMuted);
      showPause();
    } else if (act === 'leak' || act === 'blackmail' || act === 'burn') {
      G.missions.choose(act);
    }
  });
  document.getElementById('screen').addEventListener('input', (e) => {
    if (e.target.id === 'vol') G.audio.setVolume(Number(e.target.value) / 100);
  });
}

// Ending choice: the mission-7 choice step shows three buttons.
function maybeShowChoice() {
  const cur = G.missions.current;
  if (!cur || cur.def.id !== 7) return;
  const step = cur.steps[cur.step];
  if (!step || step.kind !== 'choice') return;
  if (state !== 'playing') return;
  G.hud.setScreen(`
    <div class="panel">
      <h1>PILIHAN TERAKHIR</h1>
      <p>Bukti itu ada di tanganmu. Apa yang kamu lakukan?</p>
      <button data-act="leak">Bocorkan datanya</button>
      <button data-act="blackmail">Peras konglomerat itu</button>
      <button data-act="burn">Bakar buktinya</button>
    </div>`);
  setState('choice');
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'playing' || state === 'shot' || state === 'choice') {
    update(dt);
  }
  if (state === 'playing' || state === 'choice') {
    G.renderer.follow(G.player, dt);
  }
  G.renderer.render(G.scene);
  G.input.endFrame();
}

function update(dt) {
  const p = G.player;
  const input = G.input;
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (state === 'playing') { showPause(); return; }
    if (state === 'paused') { G.hud.setScreen(''); setState('playing'); return; }
  }
  if (input.wasPressed('KeyM')) {
    G.audio.setMuted(!G.audio.isMuted);
    G.hud.toast(G.audio.isMuted ? 'Suara dimatikan' : 'Suara menyala');
  }
  if (input.wasPressed('KeyQ')) {
    const name = G.radio.next();
    G.hud.setRadio(name);
    G.hud.toast(`Radio: ${name}`);
  }
  if (input.wasPressed('KeyE')) {
    if (p.car) exitCar();
    else enterCar();
  }
  // Mouse drag orbits the camera.
  const drag = input.consumeDrag();
  if (drag.dx !== 0) G.renderer.addOrbit(drag.dx);
  if (drag.dy !== 0) G.renderer.resetOrbit();

  if (p.stun > 0) p.stun -= dt;

  // Movement.
  if (p.car) {
    // drive() wants numbers; the input module only has booleans.
    const driveInput = {
      throttle: (input.forward ? 1 : 0) - (input.back ? 1 : 0),
      steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
      brake: input.handbrake,
    };
    G.vehicles.drive(p.car, driveInput, dt);
    p.x = p.car.x; p.z = p.car.z; p.y = G.world.groundHeight(p.car.x, p.car.z);
    p.heading = p.car.heading;
    p.speed = p.car.speed;
    p.camYaw = p.heading + Math.PI + G.renderer.orbit;
    if (p.car.health <= 0) {
      const wreck = p.car;
      G.vehicles.remove(wreck);
      p.car = null;
      p.onFoot = true;
      p.mesh.visible = true;
      p.x = wreck.x + 3; p.z = wreck.z + 3;
      G.audio.crash(1);
      G.hud.toast('Mobilmu hancur!');
      if (G.missions.current) G.missions.fail('Mobilmu hancur.');
    }
  } else if (p.stun <= 0) {
    p.camYaw = p.heading + Math.PI + G.renderer.orbit;
    const hitBy = G.people.movePlayerOnFoot(p, input, dt, G.vehicles.cars);
    if (hitBy) {
      p.stun = 1;
      G.hud.toast('Kamu tertabrak mobil!');
      G.audio.crash(0.6);
    }
  }

  // Nara's on-foot mesh follows the player.
  if (p.onFoot) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = p.heading;
    const walk = p.speed > 0.5 ? Math.sin(performance.now() / 90) * 0.12 : 0;
    p.mesh.rotation.z = walk;
  }

  G.vehicles.update(dt, {
    onCrash: (a, b) => {
      if (a === p.car || b === p.car) G.audio.crash(0.5);
    },
  });
  // Pedestrian hit by the player's car.
  if (p.car) {
    const hit = G.people.carHitPedestrian(p.car);
    if (hit) {
      G.people.walkers.splice(G.people.walkers.indexOf(hit), 1);
      G.scene.remove(hit.mesh);
      G.police.addWanted(1);
      G.audio.crash(0.7);
      G.hud.toast('Kamu menabrak pejalan kaki! +1 bintang');
      pedRespawn = 6;
    }
  }
  if (pedRespawn > 0) {
    pedRespawn -= dt;
    if (pedRespawn <= 0) G.people.spawnWalker();
  }
  G.people.update(dt, p, G.vehicles.cars);
  G.police.update(dt, p, {
    onBusted: () => onBusted(),
    committingCrime: false,
  });
  G.missions.update(dt);
  maybeShowChoice();
  G.world.update(dt, p);
  G.audio.update(p.car ? Math.abs(p.car.speed) : 0, !!p.car);
  G.audio.siren(G.police.wanted > 0);
  G.radio.update();
  G.hud.update(G);
  if (nextMissionTimer > 0) {
    nextMissionTimer -= dt;
    if (nextMissionTimer <= 0) {
      const next = G.missions.doneCount + 1;
      if (next <= 7) startMission(next);
    }
  }
}

function boot() {
  if (G.renderer.failed) {
    document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;padding:40px"><h1>GLASSLINE</h1><p>WebGL tidak tersedia di perangkat ini.</p></div>';
    return;
  }
  G.audio.unlock();
  G.vehicles.spawnTraffic(CONFIG.traffic.count);
  G.people.spawnCrowd(CONFIG.pedestrians.count);
  // The player's starter car: a courier van parked near spawn.
  const starter = G.vehicles.spawn('courier', G.layout.landmarks.playerSpawn.x + 6, G.layout.landmarks.playerSpawn.z + 2, 0, {});
  G.hud.setRadio(G.radio.currentName);
  G.hud.setMoney(G.money);
  G.hud.setWanted(0);
  wireScreenButtons();
  const shot = shotFromUrl();
  if (shot !== null) {
    showMenu();
    G.hud.setScreen('');
    applyShot(G, shot);
    setState('shot');
    return;
  }
  // Menu backdrop: high establishing shot over the city and the dam.
  G.renderer.place(0, 130, -520, 0, 0, 0);
  showMenu();
}

// Start the loop exactly once; shot mode also loops.
requestAnimationFrame(loop);
boot();

// Debug API for automated tests (missions-test.cjs drives this).
window.__glassline = {
  G,
  state: () => state,
  startMission: (id) => startMission(id),
  freeroam: () => { G.missions.abort(); G.police.reset(); setState('playing'); },
  teleport: (x, z) => {
    const p = G.player;
    p.x = x; p.z = z;
    if (p.car) { p.car.x = x; p.car.z = z; p.car.speed = 0; }
    p.y = G.world.groundHeight(x, z);
  },
  enterCar: () => enterCar(),
  exitCar: () => exitCar(),
  giveCar: (type = 'sport') => {
    const p = G.player;
    if (p.car) return p.car;
    const car = G.vehicles.spawn(type, p.x + 2, p.z, p.heading, { isPlayer: true });
    p.car = car;
    p.onFoot = false;
    p.mesh.visible = false;
    const wit = G.people.witness;
    if (wit && wit.following && !wit.inCar) wit.inCar = true;
    return car;
  },
  choose: (e) => G.missions.choose(e),
  save: () => saveGame(),
  load: () => G.saveApi.load(),
  version: CONFIG.version,
};

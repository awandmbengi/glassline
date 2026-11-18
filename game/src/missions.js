// The seven missions of GLASSLINE. Each mission is a list of steps;
// a step completes when its condition holds. Steps: reach a point,
// enter a specific car, hold a channel, beat a timer, or make the
// final choice. Failing (busted, wrecked, timed out) restarts it.
import { CONFIG } from './config.js';

function at(x, z, r) {
  return (G) => {
    const dx = G.player.x - x, dz = G.player.z - z;
    return dx * dx + dz * dz < r * r;
  };
}
function inCar(car) {
  return (G) => G.player.car === car;
}
function inCarNear(x, z, r) {
  return (G) => {
    if (!G.player.car) return false;
    const dx = G.player.x - x, dz = G.player.z - z;
    return dx * dx + dz * dz < r * r;
  };
}

// Mission definitions. `build` spawns what the mission needs and
// returns the step list; it runs once when the mission starts.
const DEFS = [
  {
    id: 1, name: 'Van Job',
    briefing: 'Curi van servis di depot, antar perangkatnya ke Menara Komunikasi. Jangan sampai ketahuan.',
    build(G) {
      const van = G.vehicles.spawn('courier', G.layout.landmarks.vanSpawn.x, G.layout.landmarks.vanSpawn.z, 0.4, {});
      G.missionVan = van;
      return [
        { text: 'Capai van servis di depot', check: at(van.x, van.z, 8), target: { x: van.x, z: van.z, label: 'Van Servis' } },
        { text: 'Masuk ke van (E)', check: inCar(van), target: { get x() { return van.x; }, get z() { return van.z; }, label: 'Van Servis' } },
        { text: 'Antar perangkat ke Menara Komunikasi', check: inCarNear(G.layout.landmarks.tower.x, G.layout.landmarks.tower.z, 14), target: { ...G.layout.landmarks.tower, label: 'Menara Komunikasi' } },
      ];
    },
  },
  {
    id: 2, name: 'Relight',
    briefing: 'Masuk ke Depot Listrik dan nyalakan lagi satu distrik. Penjaga berpatroli — jangan menarik perhatian.',
    build(G) {
      const p = G.layout.landmarks.depotPanel;
      G.police.setWanted(1);
      return [
        { text: 'Capai panel depot', check: at(p.x, p.z, 8), target: { ...p, label: 'Panel Depot' } },
        { text: 'Tahan di panel untuk menyalakan distrik', kind: 'channel', duration: 3, target: { ...p, label: 'Panel Depot' }, check: at(p.x, p.z, 8) },
        { text: 'Tinggalkan area depot', check: (G2) => {
          const dx = G2.player.x - p.x, dz = G2.player.z - p.z;
          return dx * dx + dz * dz > 70 * 70;
        }, target: { x: p.x + 80, z: p.z, label: 'Keluar' } },
      ];
    },
  },
  {
    id: 3, name: 'Escort',
    briefing: 'Jemput saksi di pusat kota dan antar dia ke rumah aman lewat jalan layang. Polisi menutup akses.',
    build(G) {
      const w = G.layout.landmarks.witness;
      const s = G.layout.landmarks.safehouse;
      G.people.spawnWitness(w.x, w.z);
      G.police.setWanted(2);
      return [
        { text: 'Temui saksi', check: at(w.x, w.z, 6), target: { ...w, label: 'Saksi' },
          onDone(G2) { const wit = G2.people.witness; if (wit) wit.following = true; } },
        { text: 'Bawa saksi naik ke mobilmu (masuk mobil di dekatnya)', check: (G2) => !!(G2.people.witness && G2.people.witness.inCar), target: { ...w, label: 'Saksi' } },
        { text: 'Antar saksi ke rumah aman', check: (G2) => {
          const wit = G2.people.witness;
          return !!(wit && wit.inCar && G2.player.car) && (() => {
            const dx = G2.player.x - s.x, dz = G2.player.z - s.z;
            return dx * dx + dz * dz < 14 * 14;
          })();
        }, target: { ...s, label: 'Rumah Aman' } },
      ];
    },
  },
  {
    id: 4, name: 'Patrol Car',
    briefing: 'Curi mobil patroli di kantor polisi dan pakai untuk menyusup ke Pusat Kendali Lalu Lintas.',
    build(G) {
      const prec = G.layout.landmarks.precinct;
      const tc = G.layout.landmarks.trafficControl;
      const patrol = G.vehicles.spawn('patrol', prec.x + 12, prec.z, 1.2, {});
      G.missionPatrol = patrol;
      return [
        { text: 'Capai kantor polisi', check: at(prec.x, prec.z, 14), target: { ...prec, label: 'Kantor Polisi' } },
        { text: 'Curi mobil patroli (E)', check: inCar(patrol), target: { get x() { return patrol.x; }, get z() { return patrol.z; }, label: 'Mobil Patroli' },
          onDone(G2) { G2.police.setWanted(2); } },
        { text: 'Bawa mobil patroli ke Pusat Kendali', check: inCarNear(tc.x, tc.z, 14), target: { ...tc, label: 'Pusat Kendali' } },
        { text: 'Keluar dari mobil, masuk ke terminal (jalan kaki)', check: (G2) => !G2.player.car && at(tc.x + 6, tc.z + 4, 6)(G2), target: { x: tc.x + 6, z: tc.z + 4, label: 'Terminal' } },
      ];
    },
  },
  {
    id: 5, name: 'Skyline Footage',
    briefing: 'Ambil rekaman dari Menara Kaca. Lift mati — naik lewat tangga darurat, lalu kabur dengan rekamannya.',
    build(G) {
      const s = G.layout.landmarks.spire;
      return [
        { text: 'Capai Menara Kaca', check: at(s.x, s.z, 20), target: { ...s, label: 'Menara Kaca' } },
        { text: 'Masuk lobi (jalan kaki)', check: (G2) => !G2.player.car && at(s.x + 20, s.z, 8)(G2), target: { x: s.x + 20, z: s.z, label: 'Lobi' } },
        { text: 'Naik tangga darurat (tahan di tangga)', kind: 'channel', duration: 2.5, target: { x: s.x + 24, z: s.z + 6, label: 'Tangga Darurat' }, check: at(s.x + 24, s.z + 6, 12) },
        { text: 'Ambil rekaman di ruang server (tahan)', kind: 'channel', duration: 2.5, target: { x: s.x + 24, z: s.z - 6, label: 'Ruang Server' }, check: at(s.x + 24, s.z - 6, 12) },
        { text: 'Kembali ke mobil dan kabur 100 meter', check: (G2) => !!G2.player.car && (() => {
          const dx = G2.player.x - s.x, dz = G2.player.z - s.z;
          return dx * dx + dz * dz > 100 * 100;
        })(), target: { x: s.x + 120, z: s.z, label: 'Kabur' } },
      ];
    },
  },
  {
    id: 6, name: 'Flood Run',
    briefing: 'Saluran banjir terisi air. Lolos lewat saluran sebelum mobilmu mogok.',
    build(G) {
      const west = G.layout.landmarks.channelWest;
      const east = G.layout.landmarks.channelEast;
      G.floodTimer = 50;
      G.world.setWaterLevel(-2.2);
      return [
        { text: 'Masuk ke saluran barat', check: at(west.x, west.z, 12), target: { ...west, label: 'Saluran Barat' } },
        { text: 'Lolos ke saluran timur sebelum air naik!', kind: 'timed', duration: 50, target: { ...east, label: 'Saluran Timur' },
          check: at(east.x, east.z, 12),
          onTick(G2, dt, remain) {
            const t = 1 - remain / 50;
            G2.world.setWaterLevel(-2.2 + t * 4.4);
          } },
      ];
    },
  },
  {
    id: 7, name: 'The Choice',
    briefing: 'Bukti ada di tanganmu. Di ruang kendali bendungan, putuskan nasibnya.',
    build(G) {
      const gate = G.layout.landmarks.damGate;
      return [
        { text: 'Capai gerbang servis bendungan', check: at(gate.x, gate.z, 12), target: { ...gate, label: 'Gerbang Servis' } },
        { text: 'Pilih: bocorkan, peras, atau bakar bukti itu', kind: 'choice', target: { ...gate, label: 'Gerbang Servis' } },
      ];
    },
  },
];

export function createMissions(G) {
  let current = null;   // { def, steps, step, channel, timer }
  let failed = null;    // failure reason string
  let doneCount = 0;

  function start(id) {
    const def = DEFS.find((d) => d.id === id);
    if (!def) return false;
    const steps = def.build(G);
    current = { def, steps, step: 0, channel: 0, timer: null };
    failed = null;
    G.hud.showBanner(`Misi ${def.id}: ${def.name}`);
    G.hud.toast(def.briefing);
    G.hud.setObjective(steps[0].text);
    return true;
  }

  function fail(reason) {
    if (!current) return;
    failed = reason;
    G.hud.toast(`Misi gagal: ${reason}`);
    if (G.onMissionFailed) G.onMissionFailed(current.def, reason);
  }

  function complete() {
    const def = current.def;
    doneCount = Math.max(doneCount, def.id);
    const reward = CONFIG.money.missionReward[def.id - 1] || 0;
    G.money += reward;
    G.audio.missionDone();
    G.hud.showBanner(`Misi ${def.id} selesai${reward ? ` — +$${reward}` : ''}`);
    current = null;
    failed = null;
    if (G.save) G.save();
    if (G.onMissionComplete) G.onMissionComplete(def, reward);
  }

  function update(dt) {
    if (!current) return;
    const step = current.steps[current.step];
    if (!step) { complete(); return; }
    // Timed steps.
    if (step.kind === 'timed') {
      if (current.timer === null) current.timer = step.duration;
      current.timer -= dt;
      if (step.onTick) step.onTick(G, dt, Math.max(0, current.timer));
      if (current.timer <= 0) { fail('Waktu habis — air menenggelamkan mobil.'); return; }
    }
    // Channel steps: hold inside the radius for `duration`.
    if (step.kind === 'channel') {
      if (step.check(G)) {
        current.channel += dt;
        if (Math.floor(current.channel * 4) !== Math.floor((current.channel - dt) * 4)) G.audio.channelTick();
        if (current.channel >= step.duration) advance();
      } else {
        current.channel = Math.max(0, current.channel - dt * 2);
      }
      return;
    }
    // Choice steps wait for the UI (main.js calls choose()).
    if (step.kind === 'choice') return;
    // Plain steps.
    if (step.check(G)) advance();
  }

  function advance() {
    const step = current.steps[current.step];
    if (step && step.onDone) step.onDone(G);
    current.step += 1;
    current.channel = 0;
    current.timer = null;
    if (current.step >= current.steps.length) {
      complete();
    } else {
      G.audio.pickup();
      G.hud.setObjective(current.steps[current.step].text);
    }
  }

  function choose(ending) {
    if (!current || current.def.id !== 7) return false;
    const step = current.steps[current.step];
    if (!step || step.kind !== 'choice') return false;
    G.ending = ending;
    if (!G.saveData.endings.includes(ending)) G.saveData.endings.push(ending);
    complete();
    if (G.onEnding) G.onEnding(ending);
    return true;
  }

  function abort() {
    current = null;
    failed = null;
  }

  return {
    get current() { return current; },
    get currentStep() { return current ? current.steps[current.step] : null; },
    get failed() { return failed; },
    get doneCount() { return doneCount; },
    setDoneCount(n) { doneCount = n; },
    list: DEFS.map((d) => ({ id: d.id, name: d.name, briefing: d.briefing })),
    start, update, fail, complete, choose, abort,
    target() {
      const s = current ? current.steps[current.step] : null;
      return s && s.target ? s.target : null;
    },
  };
}

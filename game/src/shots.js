// Deterministic screenshot scenes (?shot=1..4). Each scene stages the
// game at a fixed moment — car, police, wanted level, objective and
// camera — then marks shot mode so the caller ignores player input
// and the shot is reproducible.
import { CONFIG } from './config.js';

const SCENES = {
  1: {
    label: 'Pelarian di Jalan Layang',
    objective: 'Capai terowongan servis',
    wanted: 2,
    setup(G) {
      // Player's sport car, already speeding along the overpass deck.
      const car = G.player.car
        || G.vehicles.spawn('sport', 0, -240, -Math.PI / 2, { isPlayer: true });
      car.x = 0;
      car.z = -240;
      car.heading = -Math.PI / 2;
      car.speed = 28;
      car.mesh.position.set(0, 18, -240);
      G.player.x = 0;
      G.player.z = -240;
      G.player.car = car;
      G.player.heading = -Math.PI / 2;
      // Two patrol cars closing in from behind on the deck.
      const p1 = G.vehicles.spawn('patrol', 24, -244, -Math.PI / 2, {});
      const p2 = G.vehicles.spawn('patrol', -34, -236, -Math.PI / 2, {});
      G.police.patrols.push(p1, p2);
      G.police.setWanted(2);
      G.renderer.place(22, 24, -230, -8, 18, -240);
    },
  },
  2: {
    label: 'Persimpangan Terkunci',
    objective: 'Putus garis pandang',
    wanted: 2,
    setup(G) {
      // Player's sedan mid-turn at the intersection, traffic around it.
      const car = G.player.car
        || G.vehicles.spawn('sedan', 0, 0, Math.PI * 0.75, { isPlayer: true });
      car.x = 0;
      car.z = 0;
      car.heading = Math.PI * 0.75;
      car.speed = 16;
      G.player.x = 0;
      G.player.z = 0;
      G.player.car = car;
      G.player.heading = car.heading;
      G.vehicles.spawn('taxi', 30, -20, Math.PI, { isTraffic: true });
      G.vehicles.spawn('sedan', -40, 30, 0, { isTraffic: true });
      // One patrol car watching the crossing.
      const p1 = G.vehicles.spawn('patrol', 26, 34, Math.PI, {});
      G.police.patrols.push(p1);
      G.police.setWanted(2);
      G.renderer.place(26, 26, 34, -6, 0, -6);
    },
  },
  3: {
    label: 'Keluar dari Mobil, Masuk ke Saluran',
    objective: 'Masuk ke saluran drainase',
    wanted: 3,
    setup(G) {
      // Abandoned courier car up on the road; the player is already
      // on foot, heading for the drainage entrance below.
      const car = G.vehicles.spawn('courier', 120, -430, Math.PI, {});
      car.x = 120;
      car.z = -430;
      car.heading = Math.PI;
      G.player.x = 126;
      G.player.z = -446;
      G.player.car = null;
      G.player.heading = Math.PI;
      G.player.onFoot = true;
      // A patrol car sweeping the channel from the north bank.
      const p1 = G.vehicles.spawn('patrol', 118, -398, Math.PI, {});
      G.police.patrols.push(p1);
      G.police.setWanted(3);
      G.renderer.place(136, 5, -456, 126, 1.5, -446);
    },
  },
  4: {
    label: 'Misi di Bawah Bendungan',
    objective: 'Aktifkan gerbang servis',
    wanted: 1,
    setup(G) {
      // Player's sport car parked by the dam; the player is on foot
      // at the service gate itself.
      const car = G.vehicles.spawn('sport', 440, 90, -Math.PI / 2, { isPlayer: true });
      car.x = 440;
      car.z = 90;
      car.heading = -Math.PI / 2;
      G.player.x = 470;
      G.player.z = 60;
      G.player.car = null;
      G.player.heading = -Math.PI / 2;
      G.player.onFoot = true;
      G.police.setWanted(1);
      G.renderer.place(452, 7, 36, 472, 2, 62);
    },
  },
};

export function shotFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    const n = parseInt(q.get('shot') || '', 10);
    return SCENES[n] ? n : null;
  } catch {
    return null;
  }
}

export function applyShot(G, n) {
  const scene = SCENES[n];
  if (!scene) return false;
  scene.setup(G);
  G.hud.setObjective(scene.objective);
  G.hud.setMission(`GLASSLINE — ${scene.label}`);
  G.hud.showBanner(scene.label);
  G.shotMode = true;
  return true;
}

export function shotList() {
  return Object.keys(SCENES).map((k) => {
    const s = SCENES[k];
    return { id: Number(k), label: s.label, objective: s.objective, wanted: s.wanted };
  });
}

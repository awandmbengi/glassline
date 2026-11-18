// GLASSLINE — one place for every tunable number in Veyra.
//
// The city is a 1200 m square centred on the origin, Y up. The dam wall
// closes the east side, flood channels cut across the south, and an
// elevated ring road crosses the north. Rain, dusk, steel blue + amber.
export const CONFIG = {
  version: '4.0.0',
  saveKey: 'glassline-save-v1',
  title: 'GLASSLINE',
  city: 'Veyra',
  hero: 'Nara Venn',

  world: {
    size: 1200,
    half: 600,
    roadGap: 120,
    roadWidth: 14,
    block: 96,
    sidewalk: 4,
    damX: 520,
    reservoirX0: 520,
    canalY: -420,
    overpassY: 18,
  },

  palette: {
    sky: 0x16222e,
    fog: 0x1a2836,
    ground: 0x232a30,
    road: 0x1b2024,
    roadLine: 0xd8a13c,
    building: 0x2c3844,
    buildingTop: 0x3a4a58,
    windowLit: 0xffb347,
    windowDark: 0x1c2836,
    dam: 0x4a5258,
    water: 0x16324a,
    canal: 0x1d2f3a,
    amber: 0xffb347,
    police: 0x2a6fd8,
    policeLight: 0xff2a2a,
    heli: 0x8a94a0,
  },

  rain: { count: 2600, speed: 90, area: 700, splash: false },
  lightning: { minGap: 9, maxGap: 26, flashMs: 140 },

  player: {
    walkSpeed: 6,
    runSpeed: 11,
    carAccel: 26,
    carBrake: 42,
    carReverse: 14,
    carMaxSpeed: 46,
    carTurn: 1.9,
    carGrip: 3.2,
    health: 100,
    enterRadius: 5,
  },

  traffic: { count: 14, speed: 9, minGap: 18 },
  pedestrians: { count: 22, speed: 1.6 },

  wanted: {
    max: 5,
    decaySeconds: 22,
    stealCar: 1,
    hitPed: 1,
    hitCar: 1,
    seenSteal: 1,
    policePerStar: 1,
    heliAt: 3,
    bustRadius: 4.5,
    bustSeconds: 2.5,
    bustSlowSpeed: 3,
  },

  money: { start: 120, missionReward: [400, 550, 700, 650, 800, 900, 0] },

  audio: { master: 0.5, engineBase: 55, sirenOn: true },

  radio: {
    stations: [
      { name: 'GLASS FM', bpm: 112, root: 55, mood: 'drive' },
      { name: 'DAM STATIC', bpm: 84, root: 49, mood: 'dark' },
      { name: 'RESERVOIR NIGHTS', bpm: 96, root: 65.41, mood: 'chill' },
    ],
  },

  missions: [
    { id: 1, name: 'Van Job', reward: 400 },
    { id: 2, name: 'Relight', reward: 550 },
    { id: 3, name: 'Escort', reward: 700 },
    { id: 4, name: 'Patrol Car', reward: 650 },
    { id: 5, name: 'Skyline Footage', reward: 800 },
    { id: 6, name: 'Flood Run', reward: 900 },
    { id: 7, name: 'The Choice', reward: 0 },
  ],

  shots: [
    { id: 1, name: 'overpass', label: 'Pelarian di Jalan Layang' },
    { id: 2, name: 'intersection', label: 'Persimpangan Terkunci' },
    { id: 3, name: 'drainage', label: 'Keluar dari Mobil, Masuk ke Saluran' },
    { id: 4, name: 'dam', label: 'Misi di Bawah Bendungan' },
  ],
};

// Tiny math helpers used across modules; no dependencies.
export function clamp(v, a, b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Interpolate between two headings along the shortest arc.
export function angleLerp(a, b, t) {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

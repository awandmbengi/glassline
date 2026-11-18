// Veyra's layout: roads, blocks, buildings, landmarks, ground height.
// Pure data — no Three.js here, so the same module can run in Node tests.
//
// The city is a 1200 x 1200 grid. Roads run along both axes every 120 m.
// The dam and reservoir close the east, a flood channel cuts the south,
// and an elevated overpass crosses the north. Everything is derived
// deterministically from the seed.
import { CONFIG } from './config.js';
import { createRng } from './random.js';

const W = CONFIG.world;

// Districts, checked in this order: reservoir and canal win over the rest.
export function districtAt(x, z) {
  if (x > W.damX - 40) return 'reservoir';
  if (z > -510 && z < -430) return 'canal';
  if (Math.abs(x) < 240 && Math.abs(z) < 240) return 'downtown';
  if (Math.abs(x) < 420 && Math.abs(z) < 420) return 'midtown';
  if (x < -380 && z > 180) return 'stilt';
  if (x < -300 && z < -300) return 'industrial';
  return 'outskirts';
}

// Ground height at a point: the overpass deck (18), the sunken flood
// channel (-4), or flat street level (0). Both have ramps at their ends.
export function groundHeight(x, z) {
  const ax = Math.abs(x);

  // Overpass deck, z in [-252, -228]; ramps where |x| runs 360 -> 420.
  if (z >= -252 && z <= -228) {
    if (ax <= 360) return W.overpassY;
    if (ax <= 420) return W.overpassY * (1 - (ax - 360) / 60);
  }

  // Flood channel, z in [-500, -440]; ramps where |x| runs 460 -> 520.
  if (z >= -500 && z <= -440) {
    if (ax <= 460) return -4;
    if (ax <= 520) return -4 * (1 - (ax - 460) / 60);
  }

  return 0;
}

// Distance from v to the nearest multiple of the road gap (roads are
// spaced every roadGap metres, starting at -half).
function distToRoadLine(v) {
  const r = ((v + W.half) % W.roadGap + W.roadGap) % W.roadGap;
  return Math.min(r, W.roadGap - r);
}

// Snap v to the nearest road centre line, clamped inside the world.
function snapToRoad(v) {
  const snapped = Math.round((v + W.half) / W.roadGap) * W.roadGap - W.half;
  return Math.max(-W.half, Math.min(W.half, snapped));
}

// Fixed points of interest. Labels are Indonesian, matching the UI.
const LANDMARKS = {
  dam: { x: 520, z: 0, label: 'Bendungan Veyra' },
  damGate: { x: 470, z: 60, label: 'Gerbang Servis Bendungan' },
  tower: { x: 180, z: -300, label: 'Menara Komunikasi' },
  depot: { x: -300, z: 240, label: 'Depot Listrik' },
  depotPanel: { x: -300, z: 210, label: 'Panel Depot' },
  precinct: { x: -360, z: -180, label: 'Kantor Polisi' },
  trafficControl: { x: 60, z: 300, label: 'Pusat Kendali Lalu Lintas' },
  spire: { x: 0, z: -60, label: 'Menara Kaca' },
  safehouse: { x: -420, z: 360, label: 'Rumah Aman' },
  drainage: { x: 120, z: -470, label: 'Akses Drainase' },
  channelWest: { x: -460, z: -470, label: 'Saluran Barat' },
  channelEast: { x: 460, z: -470, label: 'Saluran Timur' },
  vanSpawn: { x: -280, z: 200, label: 'Van Servis' },
  playerSpawn: { x: 0, z: 360, label: 'Tempat Nara' },
  witness: { x: -180, z: -60, label: 'Saksi' },
  overpassWest: { x: -360, z: -240, label: 'Layang Barat' },
  overpassEast: { x: 360, z: -240, label: 'Layang Timur' },
};

// Points that must stay free of buildings: the origin and the spawn.
const CLEAR_POINTS = [
  { x: 0, z: 0 },
  { x: LANDMARKS.playerSpawn.x, z: LANDMARKS.playerSpawn.z },
];

function overlapsClearPoint(x, z, w, d) {
  for (const p of CLEAR_POINTS) {
    if (Math.abs(x - p.x) < w / 2 + 4 && Math.abs(z - p.z) < d / 2 + 4) {
      return true;
    }
  }
  return false;
}

export function buildCityLayout(seed = 1337) {
  const rng = createRng(seed);

  // Roads: one along each axis at every multiple of roadGap, -600..600.
  const roads = [];
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    roads.push({ axis: 'x', at: v });
    roads.push({ axis: 'z', at: v });
  }

  // Buildings: one block per grid cell between the roads. Skip cells that
  // sit on the dam shore, in the flood channel, or under the overpass.
  const buildings = [];
  const colliders = [];
  for (let cellX = -W.half + W.roadGap; cellX < W.half; cellX += W.roadGap) {
    for (let cellZ = -W.half + W.roadGap; cellZ < W.half; cellZ += W.roadGap) {
      const cx = cellX + W.block / 2;
      const cz = cellZ + W.block / 2;
      if (cx > W.damX - 90) continue;
      if (cz > -510 && cz < -430) continue;
      if (cz > -260 && cz < -220) continue;

      const district = districtAt(cx, cz);
      const count = district === 'downtown' ? rng.int(2, 4) : rng.int(1, 2);
      for (let i = 0; i < count; i++) {
        const w = rng.range(18, 42);
        const d = rng.range(18, 42);
        const x = cx + rng.range(-26, 26);
        const z = cz + rng.range(-26, 26);
        if (x > W.damX - 70) continue;
        if (overlapsClearPoint(x, z, w, d)) continue;
        const h = district === 'downtown' ? rng.range(38, 95)
          : district === 'midtown' ? rng.range(14, 38)
          : district === 'stilt' ? rng.range(6, 10)
          : rng.range(8, 20);
        buildings.push({ x, z, w, d, h, district });
        colliders.push({ x, z, hw: w / 2, hd: d / 2 });
      }
    }
  }

  // The dam wall itself blocks movement.
  colliders.push({ x: W.damX + 6, z: 0, hw: 14, hd: 620 });

  return {
    seed,
    roads,
    buildings,
    colliders,
    landmarks: LANDMARKS,
    groundHeight,
    districtAt,

    // True when the point sits on a road (either axis).
    isRoad(x, z) {
      const halfWidth = W.roadWidth / 2;
      return distToRoadLine(x) <= halfWidth || distToRoadLine(z) <= halfWidth;
    },

    // Move the point onto the closest road line (snap the nearer axis).
    nearestRoadPoint(x, z) {
      const sx = snapToRoad(x);
      const sz = snapToRoad(z);
      if (Math.abs(x - sx) <= Math.abs(z - sz)) return { x: sx, z };
      return { x, z: sz };
    },

    // A random point on a random road: one coordinate on a road line,
    // the other anywhere along it.
    randomStreetPoint() {
      const onLine = rng.int(-5, 5) * W.roadGap;
      const along = rng.range(-W.half, W.half);
      if (rng.chance(0.5)) return { x: onLine, z: along };
      return { x: along, z: onLine };
    },
  };
}

// Push a circle (centre x,z, radius r) out of every building AABB.
// If the centre is inside a box, push out along the smaller penetration
// axis. The result is then clamped inside the world border.
export function collideCircle(colliders, x, z, r) {
  let px = x;
  let pz = z;

  for (const c of colliders) {
    const nx = Math.max(c.x - c.hw, Math.min(px, c.x + c.hw));
    const nz = Math.max(c.z - c.hd, Math.min(pz, c.z + c.hd));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;

    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      px = nx + (dx / d) * r;
      pz = nz + (dz / d) * r;
    } else {
      // Centre is inside the box: exit along the shallowest axis.
      const penX = c.hw + r - Math.abs(px - c.x);
      const penZ = c.hd + r - Math.abs(pz - c.z);
      if (penX < penZ) {
        px = c.x + (px >= c.x ? c.hw + r : -(c.hw + r));
      } else {
        pz = c.z + (pz >= c.z ? c.hd + r : -(c.hd + r));
      }
    }
  }

  px = Math.max(-W.half + 8, Math.min(W.half - 8, px));
  pz = Math.max(-W.half + 8, Math.min(W.half - 8, pz));
  return { x: px, z: pz };
}

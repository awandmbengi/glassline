// Veyra's layout: roads, blocks, buildings, landmarks and the height
// field. Pure data — no Three.js here, so tests can use it in Node.
// The city is a 1200x1200 grid; the dam and reservoir close the east,
// the flood channels cut the south, and an elevated overpass crosses
// the north. All positions are deterministic from the seed.
import { CONFIG } from './config.js';
import { createRng } from './random.js';

const W = CONFIG.world;

export function districtAt(x, z) {
  if (x > W.damX - 40) return 'reservoir';
  if (z < -430 && z > -510) return 'canal';
  if (Math.abs(x) < 240 && Math.abs(z) < 240) return 'downtown';
  if (Math.abs(x) < 420 && Math.abs(z) < 420) return 'midtown';
  if (x < -380 && z > 180) return 'stilt';
  if (x < -300 && z < -300) return 'industrial';
  return 'outskirts';
}

// Ground height: overpass deck 18, flood channel -4, else 0.
export function groundHeight(x, z) {
  // Overpass deck: z in [-252,-228], ramps at |x| in [360,420].
  if (z >= -252 && z <= -228) {
    const ax = Math.abs(x);
    if (ax <= 360) return 18;
    if (ax <= 420) return 18 * (1 - (ax - 360) / 60);
  }
  // Flood channel: sunken strip in the south, ramps at the ends.
  if (z >= -500 && z <= -440) {
    const ax = Math.abs(x);
    if (ax <= 460) return -4;
    if (ax <= 520) return -4 * (1 - (ax - 460) / 60);
  }
  return 0;
}

export function buildCityLayout(seed = 1337) {
  const rng = createRng(seed);
  const roads = [];
  for (let v = -600; v <= 600; v += W.roadGap) {
    roads.push({ axis: 'x', at: v }); // road running along z at x = v
    roads.push({ axis: 'z', at: v }); // road running along x at z = v
  }

  const buildings = [];
  const colliders = [];
  // One block per cell between roads; skip roads, dam, channel, overpass.
  for (let bx = -600 + W.roadGap; bx < 600; bx += W.roadGap) {
    for (let bz = -600 + W.roadGap; bz < 600; bz += W.roadGap) {
      const cx = bx + W.block / 2;
      const cz = bz + W.block / 2;
      if (cx > W.damX - 90) continue;              // reservoir shore
      if (cz < -430 && cz > -510) continue;        // flood channel
      if (cz > -260 && cz < -220) continue;        // overpass corridor
      const district = districtAt(cx, cz);
      const n = district === 'downtown' ? rng.int(2, 4) : rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const w = rng.range(18, 42);
        const d = rng.range(18, 42);
        const x = cx + rng.range(-26, 26);
        const z = cz + rng.range(-26, 26);
        if (x > W.damX - 70) continue;
        const h = district === 'downtown' ? rng.range(38, 95)
          : district === 'midtown' ? rng.range(14, 38)
          : district === 'stilt' ? rng.range(6, 10)
          : rng.range(8, 20);
        buildings.push({ x, z, w, d, h, district });
        colliders.push({ x, z, hw: w / 2, hd: d / 2 });
      }
    }
  }
  // The dam wall itself is a collider.
  colliders.push({ x: W.damX + 6, z: 0, hw: 14, hd: 620 });

  const landmarks = {
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

  return {
    seed, roads, buildings, colliders, landmarks,
    groundHeight,
    districtAt,
    isRoad(x, z) {
      const m = (v) => {
        const r = ((v % W.roadGap) + W.roadGap) % W.roadGap;
        return r < W.roadWidth / 2 || r > W.roadGap - W.roadWidth / 2;
      };
      return m(x + W.half) || m(z + W.half);
    },
    nearestRoadPoint(x, z) {
      const snap = (v) => {
        const r = Math.round((v + W.half) / W.roadGap) * W.roadGap - W.half;
        return Math.max(-W.half, Math.min(W.half, r));
      };
      // Snap to the nearer road axis.
      const dx = Math.abs(x - snap(x));
      const dz = Math.abs(z - snap(z));
      return dx < dz ? { x: snap(x), z } : { x, z: snap(z) };
    },
    randomStreetPoint() {
      const r = rng.int(-5, 5) * W.roadGap;
      const along = rng.range(-W.half, W.half);
      return rng.chance(0.5) ? { x: r, z: along } : { x: along, z: r };
    },
  };
}

// Circle vs building AABBs: push the circle out, return corrected pos.
export function collideCircle(colliders, x, z, r) {
  let px = x, pz = z;
  for (const c of colliders) {
    const nx = Math.max(c.x - c.hw, Math.min(px, c.x + c.hw));
    const nz = Math.max(c.z - c.hd, Math.min(pz, c.z + c.hd));
    const dx = px - nx, dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * r;
        pz = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest axis.
        const ox = c.hw + r - Math.abs(px - c.x);
        const oz = c.hd + r - Math.abs(pz - c.z);
        if (ox < oz) px = c.x + (px >= c.x ? c.hw + r : -(c.hw + r));
        else pz = c.z + (pz >= c.z ? c.hd + r : -(c.hd + r));
      }
    }
  }
  // World border.
  px = Math.max(-W.half + 8, Math.min(W.half - 8, px));
  pz = Math.max(-W.half + 8, Math.min(W.half - 8, pz));
  return { x: px, z: pz };
}

// Veyra's layout, as pure data: no three.js in here. Roads are a grid, the Kestrel
// overpass crosses it at y = 8, the Sluice flood channel is a sunken road at y = -2,
// and the dam wall closes the north edge with the reservoir behind it. Buildings
// are placed per block with a seeded random so the same seed builds the same city.
import { CITY, PLACES } from './config.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Ground height under a point: 0, the overpass deck/ramps, or the channel floor/ramps. */
export function groundHeight(x, z) {
  const ch = CITY.channel;
  if (x >= ch.x0 - ch.ramp && x <= ch.x1 + ch.ramp && z >= ch.z0 && z <= ch.z1) {
    // Sunken channel: floor in the middle, ramps at both ends.
    if (x < ch.x0) return ch.floor * ((x - (ch.x0 - ch.ramp)) / ch.ramp);
    if (x > ch.x1) return ch.floor * (((ch.x1 + ch.ramp) - x) / ch.ramp);
    return ch.floor;
  }
  const op = CITY.overpass;
  if (Math.abs(z) < op.halfWidth && Math.abs(x) < op.rampEnd) {
    const ax = Math.abs(x);
    if (ax <= op.deckEnd) return op.deck;
    return op.deck * ((op.rampEnd - ax) / (op.rampEnd - op.deckEnd));
  }
  return 0;
}

/** True when a point is on a driveable road strip (ground roads only). */
export function onRoad(x, z) {
  for (const r of CITY.roads) {
    if (Math.abs(x - r) < CITY.roadHalf || Math.abs(z - r) < CITY.roadHalf) return true;
  }
  return false;
}

/** True when a point is on the overpass deck or its ramps. */
export function onOverpass(x, z) {
  const op = CITY.overpass;
  return Math.abs(z) < op.halfWidth && Math.abs(x) < op.rampEnd;
}

/** True when a point is inside the flood channel (floor or ramps). */
export function inChannel(x, z) {
  const ch = CITY.channel;
  return x >= ch.x0 - ch.ramp && x <= ch.x1 + ch.ramp && z >= ch.z0 && z <= ch.z1;
}

function districtStyleAt(x, z, districts) {
  for (const d of districts) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.style;
  }
  return 'tower';
}

const BLOCK_CENTERS = [-120, -60, 0, 60, 120];

/**
 * Build the city's buildings and colliders. Each block between roads gets 1-3
 * buildings (towers in Glassworks, low stilt houses on Reservoir Row, warehouses
 * in the Sluice District, sheds in the Foundry Yard). Blocks under the overpass,
 * inside the channel, or on a mission plaza stay clear. Returns { buildings,
 * colliders } where a collider is {x0, z0, x1, z1} on the ground plane.
 */
export function buildCity(random, districts) {
  const buildings = [];
  const colliders = [];
  // The dam wall itself is a collider.
  colliders.push({ x0: -CITY.bound, z0: CITY.damZ - 8, x1: CITY.bound, z1: CITY.damZ + 8 });

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      // No buildings under the overpass or inside the channel.
      if (Math.abs(bz) < 18) continue;
      if (bx === -120 && bz === 120) continue;
      // Keep the mission plazas clear of buildings.
      let clear = false;
      for (const key of Object.keys(PLACES)) {
        const p = PLACES[key];
        if (Math.abs(p.x - bx) < 26 && Math.abs(p.z - bz) < 26) {
          clear = true;
          break;
        }
      }
      if (clear) continue;
      const style = districtStyleAt(bx, bz, districts);
      const count = style === 'tower' ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 2);
      for (let i = 0; i < count; i += 1) {
        const w = style === 'tower' ? 16 + random() * 10 : 12 + random() * 14;
        const d = style === 'tower' ? 16 + random() * 10 : 12 + random() * 14;
        const ox = (random() - 0.5) * (48 - w - 8);
        const oz = (random() - 0.5) * (48 - d - 8);
        const x = bx + ox;
        const z = bz + oz;
        let h;
        if (style === 'tower') h = 28 + random() * 52;
        else if (style === 'stilt') h = 7 + random() * 6;
        else if (style === 'warehouse') h = 9 + random() * 7;
        else h = 8 + random() * 10;
        const hue = style === 'tower' ? 0.58 + random() * 0.06 : style === 'stilt' ? 0.08 + random() * 0.04 : 0.02 + random() * 0.05;
        buildings.push({ x, z, w, d, h, style, hue, lit: 0.35 + random() * 0.65 });
        colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      }
    }
  }

  // The comms tower (tall antenna mast) and the dam are landmarks, not colliders
  // beyond the wall: the mast stands on its plaza.
  return { buildings, colliders };
}

/** Push a circle (x, z, radius) out of every AABB it overlaps. Returns true on a hit. */
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(pos.x, c.x0, c.x1);
    const cz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Dead centre: push out along the shorter axis.
        const pushLeft = pos.x - c.x0;
        const pushRight = c.x1 - pos.x;
        const pushUp = pos.z - c.z0;
        const pushDown = c.z1 - pos.z;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) pos.x = c.x0 - radius;
        else if (m === pushRight) pos.x = c.x1 + radius;
        else if (m === pushUp) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
    }
  }
  return hit;
}

/** Keep a point inside the city and south of the dam wall. */
export function clampToCity(pos) {
  pos.x = clamp(pos.x, -CITY.bound + 4, CITY.bound - 4);
  pos.z = clamp(pos.z, CITY.damZ + 12, CITY.bound - 4);
}

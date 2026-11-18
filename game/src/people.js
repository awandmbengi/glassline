// Pedestrians as plain state. They walk the sidewalks, cross at intersections,
// and run from a speeding car or a wanted chase. One who is hit hard goes down;
// hitting one is a crime, so the world watches for it.
import { CITY } from './config.js';
import { clampToCity, groundHeight } from './city.js';

const PED_COLORS = [0xd8b25a, 0x7a9ac2, 0xc27a7a, 0x8ac27a, 0xb08ac2, 0xd8d8d8, 0x5a7a8a];

export function createPed(x, z, random) {
  return {
    x, z, y: 0, heading: random() * Math.PI * 2, speed: 1.2 + random() * 0.8,
    color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
    state: 'walk', // walk | flee | down
    downTimer: 0, targetX: x, targetZ: z, active: true,
  };
}

function pickTarget(ped, random) {
  // Walk to a nearby sidewalk point: offset from a road line.
  const road = CITY.roads[Math.floor(random() * CITY.roads.length)];
  const along = (random() * 2 - 1) * 150;
  if (random() < 0.5) {
    ped.targetX = road + (random() < 0.5 ? 8 : -8);
    ped.targetZ = along;
  } else {
    ped.targetX = along;
    ped.targetZ = road + (random() < 0.5 ? 8 : -8);
  }
}

export function spawnPeds(random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const ped = createPed((random() * 2 - 1) * 160, (random() * 2 - 1) * 160, random);
    pickTarget(ped, random);
    peds.push(ped);
  }
  return peds;
}

/**
 * One step for every pedestrian. `threat` is the player car (or null): peds run
 * from it when it comes at them fast. Returns the pedestrians hit this step
 * (their indices), so the caller can count the crime once per ped.
 */
export function updatePeds(peds, dt, random, threat, threatSpeed) {
  const hit = [];
  for (let i = 0; i < peds.length; i += 1) {
    const ped = peds[i];
    if (!ped.active) continue;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        pickTarget(ped, random);
      }
      continue;
    }
    let speed = ped.speed;
    if (threat && threatSpeed > 6) {
      const dx = ped.x - threat.x;
      const dz = ped.z - threat.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 144) {
        ped.state = 'flee';
        const d = Math.sqrt(d2) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        speed = 4.5;
      }
    }
    if (ped.state === 'flee') {
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      clampToCity(ped);
      if (!threat || (ped.x - threat.x) ** 2 + (ped.z - threat.z) ** 2 > 900) ped.state = 'walk';
      continue;
    }
    // Walk toward the current target; pick a new one on arrival.
    const dx = ped.targetX - ped.x;
    const dz = ped.targetZ - ped.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 2) {
      pickTarget(ped, random);
      continue;
    }
    ped.heading = Math.atan2(dx / dist, dz / dist);
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    clampToCity(ped);
    ped.y = groundHeight(ped.x, ped.z);
    // A fast car (or the player on foot at a run) that touches a ped knocks them down.
    if (threat && threatSpeed > 4) {
      const tdx = ped.x - threat.x;
      const tdz = ped.z - threat.z;
      if (tdx * tdx + tdz * tdz < 4.5) {
        ped.state = 'down';
        ped.downTimer = 6;
        hit.push(i);
      }
    }
  }
  return hit;
}

// The wanted system: Veyra PD. Wanted 0-5 stars. Police cars spawn up to the
// wanted level and chase — ramming the player's car, or cornering the player on
// foot until the bust meter fills. At wanted 3+ a helicopter joins with a
// spotlight. Wanted decays after a while out of sight; hiding in alleys or
// switching cars helps, shooting a cop makes it worse.
import { CITY, TUNING } from './config.js';
import { createCar, driveCar } from './vehicles.js';
import { groundHeight } from './city.js';

export function createPolice(random) {
  return {
    cars: [],
    heli: { x: 0, z: 0, y: 42, heading: 0, active: false, searchTimer: 0 },
    wanted: 0,
    heat: 0, // seconds of police line-of-sight, for decay
    bust: 0, // seconds the player has been cornered on foot
    spawnTimer: 0,
    random,
  };
}

function policeTarget(police, world) {
  return world.player.car || world.player;
}

function spawnPoliceCar(police, world) {
  const target = policeTarget(police, world);
  // Spawn on a road 60-90 m away from the player, on the player's height level.
  const angle = police.random() * Math.PI * 2;
  const dist = 60 + police.random() * 30;
  let x = target.x + Math.sin(angle) * dist;
  let z = target.z + Math.cos(angle) * dist;
  x = Math.max(-170, Math.min(170, x));
  z = Math.max(-180, Math.min(170, z));
  const car = createCar(x, z, 0, 'patrol');
  car.ai = { police: true };
  police.cars.push(car);
  return car;
}

function policeCountFor(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 1;
  if (wanted === 2) return 2;
  if (wanted === 3) return 3;
  return TUNING.maxPoliceCars;
}

export function setWanted(police, level, reason) {
  const next = Math.max(0, Math.min(5, level));
  if (next > police.wanted) police.heat = 0;
  police.wanted = next;
  return reason;
}

export function addWanted(police, amount) {
  setWanted(police, police.wanted + amount);
}

/**
 * One step: spawn/despawn to match the wanted level, chase the player, and decay
 * wanted when the player stays out of sight. Returns events for the HUD:
 * {busted: bool, wantedChanged: bool}.
 */
export function updatePolice(police, world, dt) {
  const events = { busted: false, wantedChanged: false };
  const target = policeTarget(police, world);
  const player = world.player;
  const before = police.wanted;

  // Spawn up to the wanted level's car count.
  const want = policeCountFor(police.wanted);
  police.spawnTimer -= dt;
  if (police.cars.length < want && police.spawnTimer <= 0) {
    spawnPoliceCar(police, world);
    police.spawnTimer = 2.5;
  }
  if (police.cars.length > want) {
    // Despawn the furthest car first.
    police.cars.sort((a, b) => {
      const da = (a.x - target.x) ** 2 + (a.z - target.z) ** 2;
      const db = (b.x - target.x) ** 2 + (b.z - target.z) ** 2;
      return db - da;
    });
    police.cars.pop();
  }

  // Chase: steer toward the player and ram. On the overpass the police use the
  // same ramps (groundHeight handles their y).
  const others = [...world.traffic, ...police.cars, ...(player.car ? [player.car] : [])];
  for (const car of police.cars) {
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const wantHeading = Math.atan2(dx / dist, dz / dist);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2));
    const throttle = dist > 4 ? 1 : 0.4;
    const impact = driveCar(car, dt, throttle, steer, world.colliders, others);
    if (impact > 12 && world.player.car === target) {
      world.events.push({ type: 'rammed', speed: impact });
    }
  }

  // Helicopter at wanted 3+: hovers above the player, spotlight on.
  const heli = police.heli;
  if (police.wanted >= TUNING.heliAtWanted) {
    heli.active = true;
    heli.searchTimer = 0;
    const tx = target.x + 6;
    const tz = target.z - 6;
    heli.x += (tx - heli.x) * Math.min(1, dt * 0.8);
    heli.z += (tz - heli.z) * Math.min(1, dt * 0.8);
    heli.y += (46 - heli.y) * Math.min(1, dt * 0.8);
    heli.heading += dt * 0.4;
  } else if (heli.active) {
    heli.searchTimer += dt;
    if (heli.searchTimer > 4) heli.active = false;
  }

  // Line of sight: any police car within 45 m and roughly the same height level.
  let seen = false;
  for (const car of police.cars) {
    const d2 = (car.x - target.x) ** 2 + (car.z - target.z) ** 2;
    if (d2 < 2025 && Math.abs(car.y - target.y) < 12) {
      seen = true;
      break;
    }
  }
  if (heli.active) seen = true;
  if (seen) {
    police.heat = 0;
    // On foot and cornered: the bust meter fills.
    if (!player.car && police.wanted > 0) {
      let nearest = Infinity;
      for (const car of police.cars) {
        const d = Math.hypot(car.x - player.x, car.z - player.z);
        if (d < nearest) nearest = d;
      }
      if (nearest < 8) {
        police.bust += dt;
        if (police.bust >= TUNING.bustSeconds) {
          events.busted = true;
          police.bust = 0;
        }
      } else {
        police.bust = Math.max(0, police.bust - dt);
      }
    } else {
      police.bust = Math.max(0, police.bust - dt);
    }
  } else {
    police.bust = Math.max(0, police.bust - dt);
    police.heat += dt;
    if (police.heat >= TUNING.wantedDecaySeconds && police.wanted > 0) {
      police.wanted -= 1;
      police.heat = 0;
      events.wantedChanged = true;
    }
  }
  if (police.wanted !== before) events.wantedChanged = true;
  return events;
}

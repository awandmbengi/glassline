// Cars as plain state: no three.js here. Arcade physics — accelerate, steer, drift
// a little, bounce off buildings and each other. Traffic cars follow the road grid
// and turn at intersections. Kinds: sedan, taxi, van, truck, patrol, sport.
import { CITY, TUNING } from './config.js';
import { clampToCity, collideCircle, groundHeight } from './city.js';

export const KIND_SEDAN = 'sedan';
export const KIND_TAXI = 'taxi';
export const KIND_VAN = 'van';
export const KIND_TRUCK = 'truck';
export const KIND_PATROL = 'patrol';
export const KIND_SPORT = 'sport';

const CAR_COLORS = {
  sedan: [0x8a94a6, 0x5a6b7a, 0x9a7b4f, 0x4f6b5a, 0x7a4f5a],
  taxi: [0xd8a020],
  van: [0xcfd6dd, 0x8a94a6],
  truck: [0x6b5a3a, 0x4a5a6b],
  patrol: [0x1c2f4a],
  sport: [0xc23b2e, 0x2e6bc2, 0xd8c020],
};

const CAR_LENGTH = { sedan: 4.4, taxi: 4.4, van: 5.2, truck: 6.4, patrol: 4.6, sport: 4.2 };
const CAR_WIDTH = { sedan: 2.0, taxi: 2.0, van: 2.2, truck: 2.4, patrol: 2.0, sport: 2.0 };

export function carLength(kind) {
  return CAR_LENGTH[kind] || 4.4;
}

export function createCar(x, z, heading, kind, colorIndex = 0) {
  const palette = CAR_COLORS[kind] || CAR_COLORS.sedan;
  return {
    x, z, y: groundHeight(x, z), heading, speed: 0, steer: 0,
    kind, color: palette[colorIndex % palette.length],
    length: carLength(kind), width: CAR_WIDTH[kind] || 2.0,
    active: true, horn: 0, brakeLight: false,
    // Traffic AI state.
    ai: null, stuck: 0,
  };
}

/**
 * One physics step for a driven car. throttle: 1 forward, -1 reverse; steer: -1
 * left, 1 right. Returns the impact speed (0 when nothing was hit) so the caller
 * can play a thud and raise wanted on a hard hit.
 */
export function driveCar(car, dt, throttle, steer, colliders, others) {
  const maxForward = TUNING.carMaxSpeed;
  const maxReverse = TUNING.carReverse;
  if (throttle > 0) car.speed += TUNING.carAccel * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= TUNING.carBrake * dt;
    else car.speed -= TUNING.carAccel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
  }
  car.speed = Math.max(-maxReverse, Math.min(maxForward, car.speed));
  const speed01 = Math.abs(car.speed) / maxForward;
  car.heading += steer * TUNING.carTurn * speed01 * Math.sign(car.speed || 1) * dt * (car.speed < 0 ? -1 : 1);
  car.steer = steer;
  car.brakeLight = throttle < 0 && car.speed > 0.5;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx;
  car.z = nz;
  clampToCity(car);
  let impact = 0;
  if (collideCircle(colliders, car, car.length * 0.42)) {
    impact = Math.abs(car.speed);
    car.speed *= -0.25;
  }
  for (const other of others) {
    if (!other.active || other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const min = (car.length + other.length) * 0.42;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      other.x -= (dx / d) * push;
      other.z -= (dz / d) * push;
      const exchange = other.speed;
      other.speed = car.speed * 0.5;
      car.speed = exchange * 0.5;
      impact = Math.max(impact, Math.abs(car.speed));
    }
  }
  if (impact > 0) {
    // The car was pushed somewhere odd: re-ground it.
    car.x = before.x + (car.x - before.x) * 0.5;
    car.z = before.z + (car.z - before.z) * 0.5;
  }
  car.y = groundHeight(car.x, car.z);
  return impact;
}

/** Give a car a traffic route: drive along roads, turn at intersections. */
export function makeTraffic(car, random) {
  const axis = random() < 0.5 ? 'x' : 'z';
  const line = CITY.roads[Math.floor(random() * CITY.roads.length)];
  const dir = random() < 0.5 ? 1 : -1;
  car.ai = { axis, line, dir, speed: 8 + random() * 5, nextTurn: 0 };
  car.speed = car.ai.speed;
  car.heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  if (axis === 'x') {
    car.z = line;
    car.x = (random() * 2 - 1) * 150;
  } else {
    car.x = line;
    car.z = (random() * 2 - 1) * 150;
  }
  car.y = groundHeight(car.x, car.z);
}

function nearestRoad(value) {
  let best = CITY.roads[0];
  for (const r of CITY.roads) if (Math.abs(r - value) < Math.abs(best - value)) best = r;
  return best;
}

function onIntersection(car) {
  const rx = nearestRoad(car.x);
  const rz = nearestRoad(car.z);
  return Math.abs(car.x - rx) < 1.2 && Math.abs(car.z - rz) < 1.2;
}

export function updateTraffic(car, dt, random, colliders, others) {
  if (!car.ai) return;
  const ai = car.ai;
  // Crawl forward along the current road line.
  car.speed = ai.speed;
  const before = { x: car.x, z: car.z };
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  clampToCity(car);
  if (collideCircle(colliders, car, car.length * 0.42)) {
    car.x = before.x;
    car.z = before.z;
    car.heading += Math.PI;
    ai.dir *= -1;
  }
  for (const other of others) {
    if (!other.active || other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const min = (car.length + other.length) * 0.45;
    if (dx * dx + dz * dz < min * min) {
      // Stop behind the car ahead instead of piling up.
      car.x = before.x;
      car.z = before.z;
      car.speed = 0;
      return;
    }
  }
  // At an intersection, sometimes turn onto the crossing road.
  ai.nextTurn -= dt;
  if (ai.nextTurn <= 0 && onIntersection(car) && random() < 0.5) {
    ai.nextTurn = 1.5 + random() * 2;
    const turn = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.heading += turn;
    if (Math.abs(Math.sin(car.heading)) > 0.7) {
      ai.axis = 'x';
      ai.line = nearestRoad(car.z);
      car.z = ai.line;
    } else {
      ai.axis = 'z';
      ai.line = nearestRoad(car.x);
      car.x = ai.line;
    }
  }
  car.y = groundHeight(car.x, car.z);
}

/** A parked, stealable car: sits still until the player takes it. */
export function makeParked(car) {
  car.ai = { parked: true };
  car.speed = 0;
}

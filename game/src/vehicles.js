// GLASSLINE — vehicles: arcade driving, street traffic, boxy car meshes.
// Veyra's roads are full of courier vans, taxis and patrol cars; Nara
// can steal any of them, so every car shares one simple physics model.
import * as THREE from 'three';
import { CONFIG, clamp, angleLerp } from './config.js';
import { createRng } from './random.js';

// Every drivable shape in the city. len/wid are metres, accel is
// metres per second squared, max is top speed in m/s.
export const CAR_TYPES = {
  courier: { name: 'Van Kurir', len: 5.2, wid: 2.2, color: 0xc23a2e, accel: 22, max: 38, grip: 2.6 },
  sedan: { name: 'Sedan', len: 4.4, wid: 1.9, color: 0x3a6fd8, accel: 26, max: 44, grip: 3.2 },
  taxi: { name: 'Taksi', len: 4.4, wid: 1.9, color: 0xe8b93a, accel: 25, max: 42, grip: 3.0 },
  truck: { name: 'Truk', len: 7.0, wid: 2.5, color: 0x5a6a72, accel: 16, max: 32, grip: 2.2 },
  patrol: { name: 'Patroli', len: 4.6, wid: 2.0, color: 0xe8e8e8, accel: 30, max: 50, grip: 3.6 },
  sport: { name: 'Sport', len: 4.2, wid: 1.9, color: 0x8a2be2, accel: 32, max: 54, grip: 3.8 },
};

// A car made of boxes: slab body, glass cabin, four wheels, lights.
// Patrol cars carry a roof lightbar the police module flashes.
function buildCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.15, metalness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.75, spec.len), paint);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.85, 0.6, spec.len * 0.45), glass);
  cabin.position.set(0, 1.2, -spec.len * 0.05);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  const corners = [
    [-spec.wid / 2, spec.len / 2 - 0.9],
    [spec.wid / 2, spec.len / 2 - 0.9],
    [-spec.wid / 2, -spec.len / 2 + 0.9],
    [spec.wid / 2, -spec.len / 2 + 0.9],
  ];
  for (const [wx, wz] of corners) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  const beamMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c0, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 1.0 });
  for (const wx of [-spec.wid / 2 + 0.35, spec.wid / 2 - 0.35]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), beamMat);
    head.position.set(wx, 0.62, spec.len / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(wx, 0.62, -spec.len / 2 - 0.01);
    group.add(tail);
  }

  if (type === 'patrol') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2244ff, emissiveIntensity: 1.5 }),
    );
    bar.position.set(0, 1.55, 0);
    bar.name = 'lightbar';
    group.add(bar);
  }

  return { group, wheels };
}

// Shortest signed turn from one heading to another, in (-PI, PI].
function headingDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createVehicles(world, layout, scene) {
  const rng = createRng(20240);
  const cars = [];
  let nextId = 1;

  function spawn(type, x, z, heading = 0, opts = {}) {
    const spec = CAR_TYPES[type];
    const { group, wheels } = buildCarMesh(type, opts.color ?? spec.color);
    const car = {
      id: nextId++,
      type,
      x, z, heading,
      speed: 0,
      steer: 0,
      health: 100,
      isPlayer: !!opts.isPlayer,
      isPolice: type === 'patrol',
      isTraffic: !!opts.isTraffic,
      mesh: group,
      wheels,
      target: null,
      wait: 0,
      siren: 0,
    };
    group.position.set(x, world.groundHeight(x, z), z);
    group.rotation.y = heading;
    scene.add(group);
    cars.push(car);
    return car;
  }

  function remove(car) {
    scene.remove(car.mesh);
    const idx = cars.indexOf(car);
    if (idx >= 0) cars.splice(idx, 1);
  }

  // One step of arcade driving. input is { throttle -1..1, steer -1..1, brake }.
  // A non-finite throttle/steer is treated as zero so a bad caller can
  // never poison the car's heading or position with NaN.
  function drive(car, input, dt) {
    const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
    const steerIn = Number.isFinite(input.steer) ? input.steer : 0;
    const brake = !!input.brake;
    const spec = CAR_TYPES[car.type];

    if (throttle > 0) {
      car.speed += spec.accel * throttle * dt;
    } else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= CONFIG.player.carBrake * dt;
      else car.speed += spec.accel * 0.7 * throttle * dt;
      car.speed = Math.max(-CONFIG.player.carReverse, car.speed);
    }

    // Drag bleeds speed off, and a car at rest with no input stays put.
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    car.speed = clamp(car.speed, -CONFIG.player.carReverse, spec.max);

    // Steering eases toward the input; turning only bites with speed,
    // and reverses direction when backing up.
    const steerTarget = clamp(steerIn, -1, 1);
    car.steer += (steerTarget - car.steer) * Math.min(1, 8 * dt);
    const turnRate = car.steer * CONFIG.player.carTurn
      * clamp(Math.abs(car.speed) / 8, 0, 1)
      * (car.speed >= 0 ? 1 : -1);
    car.heading += turnRate * dt * (brake ? 1.35 : 1);

    // Handbraking slides: the car keeps less of its forward travel.
    const slide = brake ? 0.35 : 1;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.x += fx * car.speed * dt * slide;
    car.z += fz * car.speed * dt * slide;

    // Walls and the city border push the car back and hurt on hard hits.
    const fixed = world.collide(car.x, car.z, Math.max(spec.len, spec.wid) / 2);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      if (Math.abs(car.speed) > 6) car.health -= Math.abs(car.speed) * 0.5;
      car.speed *= 0.35;
      car.x = fixed.x;
      car.z = fixed.z;
    }

    car.mesh.position.set(car.x, world.groundHeight(car.x, car.z), car.z);
    car.mesh.rotation.y = car.heading;
    for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 1.4;
  }

  // A traffic car picks street points, pauses now and then, and cruises
  // toward its target at the traffic speed.
  function trafficBrain(car, dt) {
    if (car.wait > 0) {
      car.wait -= dt;
      drive(car, { throttle: 0, steer: 0, brake: false }, dt);
      return;
    }
    if (!car.target) {
      car.target = layout.randomStreetPoint();
      return;
    }
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    if (Math.hypot(dx, dz) < 8) {
      if (rng.chance(0.25)) car.wait = rng.range(1, 3);
      car.target = layout.randomStreetPoint();
      return;
    }
    const want = Math.atan2(dx, dz);
    const steer = clamp(headingDiff(want, car.heading) * 1.6, -1, 1);
    const throttle = car.speed < CONFIG.traffic.speed ? 0.55 : 0;
    drive(car, { throttle, steer, brake: false }, dt);
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const p = layout.randomStreetPoint();
      const type = rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'courier']);
      spawn(type, p.x, p.z, rng.range(0, Math.PI * 2), { isTraffic: true });
    }
  }

  function nearestCar(x, z, maxDist, filter = null) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const c of cars) {
      if (filter && !filter(c)) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Two cars that overlap are pushed apart, swap some speed, and take
  // damage (plus a crash callback) on a hard hit.
  function resolveCarCollisions(onCrash) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 3.4;
        if (d >= min || d <= 0.01) continue;
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 8) {
          a.health -= rel * 0.4;
          b.health -= rel * 0.4;
          if (onCrash) onCrash(a, b, rel);
        }
        const tmp = a.speed;
        a.speed = b.speed * 0.6;
        b.speed = tmp * 0.6;
      }
    }
  }

  return {
    cars,
    spawn,
    remove,
    drive,
    spawnTraffic,
    nearestCar,
    resolveCarCollisions,
    get playerCar() { return cars.find((c) => c.isPlayer) ?? null; },
    update(dt, onCrash) {
      for (const c of cars) if (c.isTraffic) trafficBrain(c, dt);
      resolveCarCollisions(onCrash);
      // Wrecked cars leave the road; a wrecked traffic car is replaced
      // by a fresh one so the streets never empty out. The player's
      // car is never removed here.
      for (const c of [...cars]) {
        if (c.health <= 0 && !c.isPlayer) {
          const wasTraffic = c.isTraffic;
          remove(c);
          if (wasTraffic) {
            const p = layout.randomStreetPoint();
            spawn(rng.pick(['sedan', 'taxi', 'courier']), p.x, p.z, rng.range(0, Math.PI * 2), { isTraffic: true });
          }
        }
      }
    },
  };
}

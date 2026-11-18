// Vehicles: arcade car physics, traffic AI, and boxy car meshes
// built from primitives. Nara steals cars; police drive patrol cars.
// A car is { x, z, heading, speed, type, health, mesh, ... }.
import * as THREE from 'three';
import { CONFIG, clamp, angleLerp } from './config.js';
import { createRng } from './random.js';

export const CAR_TYPES = {
  courier: { name: 'Van Kurir', len: 5.2, wid: 2.2, color: 0xc23a2e, accel: 22, max: 38, grip: 2.6 },
  sedan: { name: 'Sedan', len: 4.4, wid: 1.9, color: 0x3a6fd8, accel: 26, max: 44, grip: 3.2 },
  taxi: { name: 'Taksi', len: 4.4, wid: 1.9, color: 0xe8b93a, accel: 25, max: 42, grip: 3.0 },
  truck: { name: 'Truk', len: 7.0, wid: 2.5, color: 0x5a6a72, accel: 16, max: 32, grip: 2.2 },
  patrol: { name: 'Patroli', len: 4.6, wid: 2.0, color: 0xe8e8e8, accel: 30, max: 50, grip: 3.6 },
  sport: { name: 'Sport', len: 4.2, wid: 1.9, color: 0x8a2be2, accel: 32, max: 54, grip: 3.8 },
};

function buildCarMesh(type, colorHex) {
  const t = CAR_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, 0.75, t.len), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.85, 0.6, t.len * 0.45), glassMat);
  cabin.position.set(0, 1.2, -t.len * 0.05);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-t.wid / 2, t.len / 2 - 0.9], [t.wid / 2, t.len / 2 - 0.9], [-t.wid / 2, -t.len / 2 + 0.9], [t.wid / 2, -t.len / 2 + 0.9]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c0, emissiveIntensity: 1.4 });
  for (const wx of [-t.wid / 2 + 0.35, t.wid / 2 - 0.35]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(wx, 0.62, t.len / 2 + 0.01);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 1.0 });
  for (const wx of [-t.wid / 2 + 0.35, t.wid / 2 - 0.35]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tl.position.set(wx, 0.62, -t.len / 2 - 0.01);
    g.add(tl);
  }
  if (type === 'patrol') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2244ff, emissiveIntensity: 1.5 }),
    );
    bar.position.set(0, 1.55, 0);
    bar.name = 'lightbar';
    g.add(bar);
  }
  return { group: g, wheels };
}

export function createVehicles(world, layout, scene) {
  const rng = createRng(20240);
  const cars = [];
  let nextId = 1;

  function spawn(type, x, z, heading = 0, opts = {}) {
    const t = CAR_TYPES[type];
    const { group, wheels } = buildCarMesh(type, opts.color ?? t.color);
    const car = {
      id: nextId++, type, x, z, heading,
      speed: 0, steer: 0, health: 100,
      isPlayer: !!opts.isPlayer,
      isPolice: type === 'patrol',
      isTraffic: !!opts.isTraffic,
      mesh: group, wheels,
      target: null, wait: 0,
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
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  // Arcade physics for one car. input: {throttle -1..1, steer -1..1, brake}
  // Non-finite values (a caller passing booleans by mistake) are
  // treated as zero: a NaN steer would poison heading and position.
  function drive(car, input, dt) {
    const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
    const steerIn = Number.isFinite(input.steer) ? input.steer : 0;
    const brake = !!input.brake;
    const t = CAR_TYPES[car.type];
    const grip = brake ? t.grip * 0.4 : t.grip;
    if (throttle > 0) car.speed += t.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= CONFIG.player.carBrake * dt; // braking
      else car.speed += t.accel * 0.7 * throttle * dt;               // reversing (throttle is negative)
      car.speed = Math.max(-CONFIG.player.carReverse, car.speed);
    }
    // Drag + rolling resistance.
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    car.speed = clamp(car.speed, -CONFIG.player.carReverse, t.max);
    const steerTarget = clamp(steerIn, -1, 1);
    car.steer += (steerTarget - car.steer) * Math.min(1, 8 * dt);
    const turnRate = car.steer * CONFIG.player.carTurn * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.heading += turnRate * dt * (brake ? 1.35 : 1);
    // Lateral slide when handbraking.
    const slide = brake ? 0.35 : 1;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    car.x += fx * car.speed * dt * slide;
    car.z += fz * car.speed * dt * slide;
    // Buildings + border.
    const fixed = world.collide(car.x, car.z, Math.max(t.len, t.wid) / 2);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      if (Math.abs(car.speed) > 6) car.health -= Math.abs(car.speed) * 0.5;
      car.speed *= 0.35;
      car.x = fixed.x;
      car.z = fixed.z;
    }
    car.mesh.position.set(car.x, world.groundHeight(car.x, car.z), car.z);
    car.mesh.rotation.y = car.heading;
    // Wheel spin.
    for (const w of car.wheels) w.rotation.x += car.speed * dt * 1.4;
  }

  function trafficBrain(car, dt) {
    if (car.wait > 0) { car.wait -= dt; drive(car, { throttle: 0, steer: 0, brake: false }, dt); return; }
    if (!car.target) {
      car.target = layout.randomStreetPoint();
      return;
    }
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 8) {
      if (rng.chance(0.25)) car.wait = rng.range(1, 3);
      car.target = layout.randomStreetPoint();
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.6, -1, 1);
    const targetSpeed = CONFIG.traffic.speed;
    const throttle = car.speed < targetSpeed ? 0.55 : 0;
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
      const dx = c.x - x, dz = c.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Car-car bumps: push apart, trade speed, damage on hard hits.
  function resolveCarCollisions(onCrash) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 3.4;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
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
  }

  return {
    cars,
    spawn, remove, drive, spawnTraffic, nearestCar, resolveCarCollisions,
    get playerCar() { return cars.find((c) => c.isPlayer) ?? null; },
    update(dt, onCrash) {
      for (const c of cars) if (c.isTraffic) trafficBrain(c, dt);
      resolveCarCollisions(onCrash);
      // Remove wrecks (not the player's car).
      for (const c of [...cars]) {
        if (c.health <= 0 && !c.isPlayer) {
          remove(c);
          if (c.isTraffic) {
            const p = layout.randomStreetPoint();
            spawn(rng.pick(['sedan', 'taxi', 'courier']), p.x, p.z, rng.range(0, Math.PI * 2), { isTraffic: true });
          }
        }
      }
    },
  };
}

// People: Nara on foot, pedestrians, and the witness NPC.
// Pedestrians walk the sidewalks and scatter when a car bears down.
// The witness follows Nara once picked up (mission 3).
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { createRng } from './random.js';

function buildPersonMesh(shirtColor) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), new THREE.MeshStandardMaterial({ color: 0x1e242a, roughness: 0.9 }));
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), mat);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  return g;
}

export function createPeople(world, layout, scene) {
  const rng = createRng(777);
  const walkers = [];
  let witness = null;

  function spawnWalker() {
    const p = layout.randomStreetPoint();
    const mesh = buildPersonMesh(rng.pick([0x4a7a8c, 0x8c4a5a, 0x5a8c4a, 0xc8a03a, 0x6a5a8c]));
    const w = {
      x: p.x, z: p.z, heading: rng.range(0, Math.PI * 2),
      speed: CONFIG.pedestrians.speed * rng.range(0.7, 1.3),
      mesh, flee: 0, target: layout.randomStreetPoint(),
    };
    mesh.position.set(w.x, world.groundHeight(w.x, w.z), w.z);
    scene.add(mesh);
    walkers.push(w);
    return w;
  }

  function spawnWitness(x, z) {
    const mesh = buildPersonMesh(0xd8d8d8);
    mesh.scale.setScalar(1.05);
    witness = {
      x, z, heading: 0, mesh, following: false, inCar: false,
    };
    mesh.position.set(x, world.groundHeight(x, z), z);
    scene.add(mesh);
    return witness;
  }

  // Nara on foot. Returns nothing; mutates the player object.
  function movePlayerOnFoot(player, input, dt, cars) {
    const run = input.run ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      // Movement is camera-relative: forward is away from the camera.
      // The camera sits behind the player, so forward = -Z rotated by camYaw.
      const yaw = player.camYaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = -fz, rz = fx;
      const dx = fx * mz + rx * mx;
      const dz = fz * mz + rz * mx;
      const len = Math.hypot(dx, dz);
      player.x += (dx / len) * run * dt;
      player.z += (dz / len) * run * dt;
      player.heading = Math.atan2(dx, dz);
      player.speed = run;
    } else {
      player.speed = 0;
    }
    const fixed = world.collide(player.x, player.z, 0.6);
    player.x = fixed.x;
    player.z = fixed.z;
    player.y = world.groundHeight(player.x, player.z);
    // Keep cars from running Nara over silently: a traffic car that
    // touches her on foot counts as a hit (handled by the caller via
    // the returned overlap flag).
    let hitBy = null;
    for (const c of cars) {
      const dx = c.x - player.x, dz = c.z - player.z;
      if (dx * dx + dz * dz < 3.2 * 3.2 && Math.abs(c.speed) > 3) { hitBy = c; break; }
    }
    return hitBy;
  }

  function update(dt, player, cars) {
    for (const w of walkers) {
      // Flee from a fast car nearby.
      let fx = 0, fz = 0;
      for (const c of cars) {
        const dx = w.x - c.x, dz = w.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 100 && Math.abs(c.speed) > 4) {
          const d = Math.sqrt(d2) || 1;
          fx += (dx / d) * 6; fz += (dz / d) * 6;
          w.flee = 1.2;
        }
      }
      if (w.flee > 0) {
        w.flee -= dt;
        w.x += fx * dt * 2;
        w.z += fz * dt * 2;
        w.heading = Math.atan2(fx, fz);
      } else {
        const dx = w.target.x - w.x, dz = w.target.z - w.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 6) { w.target = layout.randomStreetPoint(); continue; }
        w.x += (dx / dist) * w.speed * dt;
        w.z += (dz / dist) * w.speed * dt;
        w.heading = Math.atan2(dx, dz);
      }
      const fixed = world.collide(w.x, w.z, 0.5);
      w.x = fixed.x;
      w.z = fixed.z;
      w.mesh.position.set(w.x, world.groundHeight(w.x, w.z), w.z);
      w.mesh.rotation.y = w.heading;
    }
    // The witness follows Nara on foot, or rides in her car.
    if (witness) {
      if (witness.inCar) {
        witness.mesh.visible = false;
      } else if (witness.following) {
        const dx = player.x - witness.x, dz = player.z - witness.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.5) {
          witness.x += (dx / dist) * 5 * dt;
          witness.z += (dz / dist) * 5 * dt;
          witness.heading = Math.atan2(dx, dz);
        }
        const fixed = world.collide(witness.x, witness.z, 0.5);
        witness.x = fixed.x;
        witness.z = fixed.z;
        witness.mesh.visible = true;
        witness.mesh.position.set(witness.x, world.groundHeight(witness.x, witness.z), witness.z);
        witness.mesh.rotation.y = witness.heading;
      } else {
        witness.mesh.visible = true;
        witness.mesh.position.set(witness.x, world.groundHeight(witness.x, witness.z), witness.z);
      }
    }
  }

  return {
    walkers,
    get witness() { return witness; },
    spawnWalker, spawnWitness, movePlayerOnFoot, update,
    spawnCrowd(n) { for (let i = 0; i < n; i++) spawnWalker(); },
    clearWitness() {
      if (witness) { scene.remove(witness.mesh); witness = null; }
    },
    // A pedestrian the player's car just hit (for wanted + mission).
    carHitPedestrian(car) {
      for (const w of walkers) {
        const dx = w.x - car.x, dz = w.z - car.z;
        if (dx * dx + dz * dz < 3.0 * 3.0 && Math.abs(car.speed) > 5) return w;
      }
      return null;
    },
  };
}

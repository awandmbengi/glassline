// GLASSLINE — police: the wanted system, patrol chases, the
// helicopter, and BUSTED. Wanted stars rise on crimes and fade only
// when no patrol car (or the helicopter) can see Nara.
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';

export function createPolice(world, layout, vehicles, scene) {
  const W = CONFIG.wanted;
  let wanted = 0;
  let unseenTimer = 0;
  let bustTimer = 0;
  let busted = false;
  let heli = null;
  let heliLight = null;
  const patrols = [];

  function wantedCount() { return wanted; }

  function setWanted(n, reason = '') {
    const before = wanted;
    wanted = clamp(Math.round(n), 0, W.max);
    if (wanted > before) unseenTimer = 0;
    return wanted;
  }

  function addWanted(n, reason = '') { return setWanted(wanted + n, reason); }

  function spawnPatrol(x, z) {
    const car = vehicles.spawn('patrol', x, z, 0, {});
    car.isTraffic = false;
    patrols.push(car);
    return car;
  }

  function spawnHeli() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: CONFIG.palette.heli, roughness: 0.4, metalness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6), hullMat);
    group.add(body);

    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), darkMat);
    rotor.position.y = 1;
    rotor.name = 'rotor';
    group.add(rotor);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), hullMat);
    tail.position.set(0, 0.2, -4.5);
    group.add(tail);

    heliLight = new THREE.SpotLight(0xfff2c0, 0, 90, 0.35, 0.5, 1.2);
    heliLight.position.set(0, -1, 0);
    group.add(heliLight);
    heliLight.target = new THREE.Object3D();
    group.add(heliLight.target);

    group.position.set(0, 55, 0);
    scene.add(group);
    heli = { mesh: group, rotor, x: 0, z: 0, y: 55 };
    return heli;
  }

  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.mesh);
    heli = null;
    heliLight = null;
  }

  // Keep the patrol count at one car per wanted star, and bring the
  // helicopter in (or send it away) at the heli threshold.
  function syncPatrols() {
    const want = wanted * W.policePerStar;
    while (patrols.length < want) {
      const p = layout.randomStreetPoint();
      spawnPatrol(p.x, p.z);
    }
    while (patrols.length > want) {
      const car = patrols.pop();
      vehicles.remove(car);
    }
    if (wanted >= W.heliAt && !heli) spawnHeli();
    if (wanted < W.heliAt && heli) removeHeli();
  }

  // Chase the player and ram: full throttle from far off, easing as
  // the patrol closes in. The roof lightbar flashes red/blue.
  function policeBrain(car, player, dt) {
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 2.0, -1, 1);
    const throttle = dist > 10 ? 1 : dist > 4 ? 0.5 : 0.2;
    vehicles.drive(car, { throttle, steer, brake: false }, dt);

    const bar = car.mesh.getObjectByName('lightbar');
    if (bar) {
      const redPhase = Math.floor(performance.now() / 260) % 2 === 0;
      bar.material.emissive.setHex(redPhase ? 0xff2222 : 0x2244ff);
    }
  }

  function update(dt, player, opts = {}) {
    if (busted) return;
    syncPatrols();

    // A star fades after the player stays unseen and quiet long enough.
    let seen = false;
    for (const c of patrols) {
      const dx = player.x - c.x;
      const dz = player.z - c.z;
      if (dx * dx + dz * dz < 90 * 90) { seen = true; break; }
    }
    if (heli) seen = true;
    if (wanted > 0 && !seen && !opts.committingCrime) {
      unseenTimer += dt;
      if (unseenTimer >= W.decaySeconds) {
        wanted -= 1;
        unseenTimer = 0;
      }
    } else if (seen) {
      unseenTimer = 0;
    }

    for (const c of patrols) policeBrain(c, player, dt);

    if (heli) {
      heli.x += (player.x - heli.x) * Math.min(1, 1.4 * dt);
      heli.z += (player.z - heli.z) * Math.min(1, 1.4 * dt);
      heli.mesh.position.set(heli.x, 55, heli.z);
      heli.mesh.rotation.y += dt * 0.4;
      heli.rotor.rotation.y += dt * 22;
      heliLight.target.position.set(player.x - heli.x, -55, player.z - heli.z);
      heliLight.intensity = 60;
    }

    // BUSTED: a patrol car sits on a slow-moving player long enough.
    const playerSpeed = Math.abs(player.speed ?? 0);
    let close = false;
    for (const c of patrols) {
      const dx = player.x - c.x;
      const dz = player.z - c.z;
      if (dx * dx + dz * dz < W.bustRadius * W.bustRadius) { close = true; break; }
    }
    if (close && playerSpeed < W.bustSlowSpeed) {
      bustTimer += dt;
      if (bustTimer >= W.bustSeconds) {
        busted = true;
        if (opts.onBusted) opts.onBusted();
      }
    } else {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }
  }

  function reset(keepWanted = false) {
    for (const c of [...patrols]) vehicles.remove(c);
    patrols.length = 0;
    removeHeli();
    busted = false;
    bustTimer = 0;
    unseenTimer = 0;
    if (!keepWanted) wanted = 0;
  }

  return {
    get wanted() { return wanted; },
    get busted() { return busted; },
    get helicopter() { return heli; },
    get patrols() { return patrols; },
    wantedCount,
    setWanted,
    addWanted,
    update,
    reset,
    clearBusted() { busted = false; bustTimer = 0; },
  };
}

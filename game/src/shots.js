// The screenshot scenes behind ?shot=overpass|intersection|drainage|dam. Each one
// sets up a real world state (a mission in progress, a wanted level, police and a
// helicopter where the scene calls for them), then plays the rules forward for a
// fixed number of steps with a scripted autopilot, so the frame is what a short
// stretch of the real game looks like — and the same seed always gives the same
// frame. The camera for each shot is cinematic, not the gameplay chase cam.
//
// `world` here is the outer object createWorld returns; `s` is its live state.
import { PLACES, STEP } from './config.js';
import { groundHeight } from './city.js';
import { createCar } from './vehicles.js';
import { setWanted } from './police.js';

// A fake input for the autopilot: full throttle, no steering, no actions.
const autoInput = {
  throttle: () => 1,
  steer: () => 0,
  walk: () => ({ x: 0, z: 0 }),
  takeActions: () => 0,
  interactHeld: () => false,
  anyHeld: () => false,
};

function stepWorld(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, autoInput);
}

function putPlayerInCar(s, car) {
  s.player.car = car;
  s.player.onFoot = false;
  s.player.x = car.x;
  s.player.z = car.z;
  s.player.y = car.y;
  s.player.heading = car.heading;
  s.cameraYaw = car.heading;
  car.ai = null;
  if (!s.cars.includes(car)) s.cars.push(car);
}

function addPolice(s, x, z, heading) {
  const car = createCar(x, z, heading, 'patrol');
  car.ai = { police: true };
  car.y = groundHeight(x, z);
  s.police.cars.push(car);
  s.cars.push(car);
  return car;
}

function shotCameraFor(renderer, s, mode) {
  const p = s.player;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const rx = Math.cos(p.heading);
  const rz = -Math.sin(p.heading);
  if (mode === 'high') {
    renderer.setShotCamera({
      x: p.x - fx * 16 + rx * 8, y: p.y + 22, z: p.z - fz * 16 + rz * 8,
      lx: p.x + fx * 8, ly: p.y + 1, lz: p.z + fz * 8,
    });
  } else if (mode === 'low') {
    renderer.setShotCamera({
      x: p.x - fx * 7 + rx * 3, y: p.y + 2.6, z: p.z - fz * 7 + rz * 3,
      lx: p.x + fx * 10, ly: p.y + 1.5, lz: p.z + fz * 10,
    });
  } else if (mode === 'wide') {
    renderer.setShotCamera({
      x: p.x + 26, y: p.y + 14, z: p.z + 34,
      lx: p.x - 6, ly: p.y + 8, lz: p.z - 30,
    });
  } else {
    // chase: behind, slightly to the side, a touch high.
    renderer.setShotCamera({
      x: p.x - fx * 13 + rx * 5, y: p.y + 5.5, z: p.z - fz * 13 + rz * 5,
      lx: p.x + fx * 12, ly: p.y + 1.5, lz: p.z + fz * 12,
    });
  }
}

/**
 * Set `world` to the named scene and arm the camera. Unknown names stage the
 * overpass chase.
 */
export function stageShot(name, world, renderer) {
  const s = world.state;
  world.reset();
  const police = s.police;

  if (name === 'intersection') {
    world.runner.start(3); // 4 · Borrowed Authority
    const car = createCar(30, -18, Math.PI * 0.15, 'sport');
    car.speed = 16;
    putPlayerInCar(s, car);
    addPolice(s, 30, -58, Math.PI);
    addPolice(s, 52, -30, -Math.PI / 2);
    setWanted(police, 2);
    s.objective = { mission: '4 · Borrowed Authority', text: 'Drive through the traffic-control gate' };
    s.marker = [{ ...PLACES.trafficGate }];
    stepWorld(world, 2.5);
    shotCameraFor(renderer, s, 'high');
    return;
  }

  if (name === 'drainage') {
    world.runner.start(5); // 6 · The Flood Channel
    const car = createCar(-158, 112, Math.PI / 2, 'sedan');
    s.cars.push(car);
    s.player.x = -146;
    s.player.z = 120;
    s.player.y = groundHeight(-146, 120);
    s.player.heading = Math.PI / 2;
    s.player.onFoot = true;
    s.player.car = null;
    s.cameraYaw = Math.PI / 2;
    addPolice(s, -162, 100, Math.PI / 2);
    setWanted(police, 2);
    s.objective = { mission: '6 · The Flood Channel', text: 'Enter the flood channel' };
    s.marker = [{ ...PLACES.channelEntry }];
    s.waterLevel = 0.35;
    stepWorld(world, 2);
    shotCameraFor(renderer, s, 'low');
    return;
  }

  if (name === 'dam') {
    world.runner.start(6); // 7 · The Choice
    const car = createCar(-52, -168, Math.PI, 'sport');
    s.cars.push(car);
    s.player.x = -60;
    s.player.z = -176;
    s.player.y = groundHeight(-60, -176);
    s.player.heading = Math.PI;
    s.player.onFoot = true;
    s.player.car = null;
    s.cameraYaw = Math.PI;
    addPolice(s, -40, -150, Math.PI);
    setWanted(police, 2);
    s.objective = { mission: '7 · The Choice', text: 'Reach the dam service gate' };
    s.marker = [{ ...PLACES.damGate }];
    stepWorld(world, 2);
    shotCameraFor(renderer, s, 'wide');
    return;
  }

  // Default: 'overpass' — the cover shot. Mission 3, wanted 3, helicopter up.
  world.runner.start(2); // 3 · The Witness
  const car = createCar(-60, 0, Math.PI / 2, 'sport');
  car.speed = 30;
  putPlayerInCar(s, car);
  addPolice(s, -78, 0, Math.PI / 2);
  addPolice(s, -96, 0, Math.PI / 2);
  setWanted(police, 3);
  police.heli.active = true;
  police.heli.x = -50;
  police.heli.z = -14;
  police.heli.y = 46;
  s.objective = { mission: '3 · The Witness', text: 'Cross the overpass to the safehouse' };
  s.marker = [{ ...PLACES.safehouse }];
  stepWorld(world, 3);
  shotCameraFor(renderer, s, 'chase');
}

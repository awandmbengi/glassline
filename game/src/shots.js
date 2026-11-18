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
// `autoSteer` lets one shot steer (a turn at the intersection).
let autoSteer = 0;
const autoInput = {
  throttle: () => 1,
  steer: () => autoSteer,
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

function addPolice(s, x, z, heading, speed = 0) {
  const car = createCar(x, z, heading, 'patrol');
  car.ai = { police: true };
  car.y = groundHeight(x, z);
  car.speed = speed;
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
      x: p.x - fx * 20 + rx * 12, y: p.y + 26, z: p.z - fz * 20 + rz * 12,
      lx: p.x + fx * 10, ly: p.y + 1, lz: p.z + fz * 10,
    });
  } else if (mode === 'front-low') {
    // Ahead of the player, looking back: the player runs toward the camera with
    // the car and the police behind them in frame.
    renderer.setShotCamera({
      x: p.x + fx * 7 + rx * 5, y: p.y + 2.6, z: p.z + fz * 7 + rz * 5,
      lx: p.x - fx * 5, ly: p.y + 1.2, lz: p.z - fz * 5,
    });
  } else if (mode === 'wide') {
    renderer.setShotCamera({
      x: p.x + 30, y: p.y + 20, z: p.z + 40,
      lx: p.x - 4, ly: p.y + 16, lz: p.z - 30,
    });
  } else if (mode === 'front') {
    // Ahead of the car, looking back down the road: the chase is in frame.
    renderer.setShotCamera({
      x: p.x + fx * 17 + rx * 7, y: p.y + 4.5, z: p.z + fz * 17 + rz * 7,
      lx: p.x - fx * 4, ly: p.y + 1.5, lz: p.z - fz * 4,
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
    const car = createCar(30, -30, Math.PI / 2, 'sport');
    car.speed = 0;
    putPlayerInCar(s, car);
    addPolice(s, 30, -70, Math.PI);
    addPolice(s, 90, -30, -Math.PI / 2);
    // Two traffic cars on the crossing roads, rolling toward the intersection.
    const t1 = createCar(-30, -45, 0, 'taxi');
    t1.ai = { axis: 'z', line: -30, dir: 1, speed: 10, nextTurn: 999 };
    s.cars.push(t1);
    s.traffic.push(t1);
    const t2 = createCar(45, 30, -Math.PI / 2, 'sedan');
    t2.ai = { axis: 'x', line: 30, dir: -1, speed: 10, nextTurn: 999 };
    s.cars.push(t2);
    s.traffic.push(t2);
    setWanted(police, 2);
    s.objective = { mission: '4 · Borrowed Authority', text: 'Drive through the traffic-control gate' };
    s.marker = [{ ...PLACES.trafficGate }];
    // Drive straight into the intersection, then turn north (left) across it.
    stepWorld(world, 0.5);
    autoSteer = -1;
    stepWorld(world, 0.5);
    autoSteer = 0;
    shotCameraFor(renderer, s, 'high');
    return;
  }

  if (name === 'drainage') {
    world.runner.start(5); // 6 · The Flood Channel
    const car = createCar(-166, 112, Math.PI / 2, 'taxi');
    s.cars.push(car);
    // Stage the player just outside the channel mouth, step the world, then
    // move them into the mouth for the frame (so the step does not complete
    // mid-staging and change the objective).
    s.player.x = -160;
    s.player.z = 120;
    s.player.y = groundHeight(-160, 120);
    s.player.heading = Math.PI / 2;
    s.player.onFoot = true;
    s.player.car = null;
    s.cameraYaw = Math.PI / 2;
    addPolice(s, -176, 108, Math.PI / 2);
    setWanted(police, 2);
    s.objective = { mission: '6 · The Flood Channel', text: 'Enter the flood channel' };
    s.marker = [{ ...PLACES.channelEntry }];
    s.waterLevel = 0.35;
    stepWorld(world, 2);
    s.player.x = -146;
    s.player.z = 120;
    s.player.y = groundHeight(-146, 120);
    shotCameraFor(renderer, s, 'front-low');
    return;
  }

  if (name === 'dam') {
    world.runner.start(6); // 7 · The Choice
    const car = createCar(-52, -168, Math.PI, 'sport');
    s.cars.push(car);
    // Stage away from the gate, step, then move to the gate for the frame (so
    // the choice step does not complete mid-staging).
    s.player.x = -60;
    s.player.z = -158;
    s.player.y = groundHeight(-60, -158);
    s.player.heading = Math.PI;
    s.player.onFoot = true;
    s.player.car = null;
    s.cameraYaw = Math.PI;
    addPolice(s, -40, -140, Math.PI);
    setWanted(police, 2);
    s.objective = { mission: '7 · The Choice', text: 'Reach the dam service gate' };
    s.marker = [{ ...PLACES.damGate }];
    stepWorld(world, 2);
    s.player.x = -60;
    s.player.z = -176;
    s.player.y = groundHeight(-60, -176);
    shotCameraFor(renderer, s, 'wide');
    return;
  }

  // Default: 'overpass' — the cover shot. Mission 3, wanted 3, helicopter up.
  world.runner.start(2); // 3 · The Witness
  const car = createCar(-60, 0, Math.PI / 2, 'sport');
  car.speed = 22;
  putPlayerInCar(s, car);
  addPolice(s, -74, 0, Math.PI / 2, 32);
  addPolice(s, -86, 0, Math.PI / 2, 32);
  setWanted(police, 3);
  police.heli.active = true;
  s.objective = { mission: '3 · The Witness', text: 'Cross the overpass to the safehouse' };
  s.marker = [{ ...PLACES.safehouse }];
  stepWorld(world, 2.5);
  // Park the helicopter in frame after the chase settles: behind the player,
  // low enough to read against the city, spotlight on them.
  police.heli.x = s.player.x - 18;
  police.heli.z = s.player.z + 12;
  police.heli.y = s.player.y + 14;
  shotCameraFor(renderer, s, 'front');
}

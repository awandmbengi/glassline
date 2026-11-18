// The simulation: no drawing, no browser in here. The player on foot or in a car,
// traffic, pedestrians, the police, the mission runner, and the events the caller
// turns into HUD toasts and sounds. step() advances one fixed 1/60 s step.
import { CITY, DISTRICTS, MISSIONS, PLACES, STEP, TUNING } from './config.js';
import { buildCity, clampToCity, collideCircle, groundHeight } from './city.js';
import { createCar, driveCar, makeParked, makeTraffic, updateTraffic } from './vehicles.js';
import { spawnPeds, updatePeds } from './people.js';
import { addWanted, createPolice, setWanted, updatePolice } from './police.js';
import { createMissionRunner } from './missions.js';
import { ACTION_INTERACT, ACTION_PUNCH } from './input.js';

const PARKED_SPOTS = [
  { x: -60, z: 156, kind: 'sedan' },
  { x: 60, z: 156, kind: 'taxi' },
  { x: 156, z: -60, kind: 'sedan' },
  { x: -156, z: 30, kind: 'sedan' },
  { x: 120, z: -156, kind: 'sport' },
  { x: -30, z: -156, kind: 'taxi' },
  { x: 156, z: 120, kind: 'sedan' },
  { x: -120, z: -30, kind: 'van' },
];

export function createWorld(random, save) {
  const city = buildCity(random, DISTRICTS);
  const colliders = city.colliders;
  const police = createPolice(random);

  const player = {
    x: PLACES.start.x, z: PLACES.start.z, y: 0, heading: Math.PI,
    onFoot: true, car: null, punchTimer: 0,
  };
  player.y = groundHeight(player.x, player.z);

  const world = {
    random, colliders, buildings: city.buildings, police,
    player, cameraYaw: Math.PI,
    cars: [], traffic: [], parked: [], missionVehicle: null,
    peds: [], mara: { x: PLACES.maraPickup.x, z: PLACES.maraPickup.z, state: 'hidden' },
    passenger: false, disguised: false,
    money: save ? save.money : TUNING.moneyStart,
    completed: save ? [...save.completed] : [],
    objective: null, marker: null, holdProgress: 0,
    waterLevel: 0, ending: null, endingIndex: -1,
    time: 0, lightning: 0, lightningTimer: 8 + random() * 10,
    events: [], paused: false,
  };

  const runner = createMissionRunner(world);
  world.runner = runner;

  function spawnTraffic() {
    for (let i = 0; i < TUNING.trafficCars; i += 1) {
      const car = createCar(0, 0, 0, ['sedan', 'taxi', 'van', 'truck'][i % 4], i);
      makeTraffic(car, random);
      world.traffic.push(car);
      world.cars.push(car);
    }
  }

  function spawnParked() {
    for (const spot of PARKED_SPOTS) {
      const car = createCar(spot.x, spot.z, (random() - 0.5) * 0.6, spot.kind);
      makeParked(car);
      world.parked.push(car);
      world.cars.push(car);
    }
  }

  function spawnMissionVehicle(kind, placeKey) {
    if (world.missionVehicle) {
      world.missionVehicle.active = false;
    }
    const place = PLACES[placeKey];
    const car = createCar(place.x, place.z, 0, kind);
    makeParked(car);
    car.mission = kind;
    world.missionVehicle = car;
    world.cars.push(car);
    return car;
  }
  world.spawnMissionVehicle = spawnMissionVehicle;

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of world.cars) {
      if (!car.active || car === player.car) continue;
      if (car.ai && car.ai.police) continue; // never steal a chase car
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function witnessNear(x, z, radius) {
    for (const car of police.cars) {
      if (Math.hypot(car.x - x, car.z - z) < radius) return true;
    }
    for (const ped of world.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.z - z) < 20) return true;
    }
    return false;
  }

  function enterCar(car) {
    player.car = car;
    player.onFoot = false;
    car.ai = null; // no longer parked or traffic
    world.traffic = world.traffic.filter((c) => c !== car);
    world.parked = world.parked.filter((c) => c !== car);
    if (car.kind === 'patrol') world.disguised = true;
    world.events.push({ type: 'enter-car', kind: car.kind });
    runner.onEnterCar(car);
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.speed = 0;
    player.car = null;
    player.onFoot = true;
    player.x = car.x - Math.cos(car.heading) * 2.5;
    player.z = car.z + Math.sin(car.heading) * 2.5;
    player.heading = car.heading;
    player.y = groundHeight(player.x, player.z);
    world.disguised = false;
    if (world.passenger) {
      // Mara stays with the car she rode in.
      world.mara.x = player.x;
      world.mara.z = player.z;
      world.mara.state = 'waiting';
      world.passenger = false;
    }
    world.events.push({ type: 'exit-car' });
  }

  function stepPlayer(dt, input, actions) {
    if (player.car) {
      const car = player.car;
      const throttle = input.throttle();
      const steer = input.steer();
      const impact = driveCar(car, dt, throttle, steer, colliders, world.cars);
      if (impact > 14) {
        world.events.push({ type: 'crash', speed: impact });
        if (impact > 22 && witnessNear(car.x, car.z, 60)) addWanted(police, 1);
      }
      player.x = car.x;
      player.z = car.z;
      player.y = car.y;
      player.heading = car.heading;
      world.cameraYaw += (car.heading - world.cameraYaw) * Math.min(1, dt * 2.2);
      if (actions & ACTION_INTERACT) exitCar();
      if (actions & ACTION_PUNCH) {
        world.events.push({ type: 'horn' });
      }
    } else {
      const walk = input.walk();
      const fx = Math.sin(world.cameraYaw);
      const fz = Math.cos(world.cameraYaw);
      const rx = Math.cos(world.cameraYaw);
      const rz = -Math.sin(world.cameraYaw);
      const mx = fx * -walk.z + rx * walk.x;
      const mz = fz * -walk.z + rz * walk.x;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        const nx = player.x + (mx / len) * TUNING.walkSpeed * dt;
        const nz = player.z + (mz / len) * TUNING.walkSpeed * dt;
        const before = { x: player.x, z: player.z };
        player.x = nx;
        player.z = nz;
        clampToCity(player);
        if (collideCircle(colliders, player, 0.8)) {
          player.x = before.x;
          player.z = before.z;
        }
        const targetHeading = Math.atan2(mx / len, mz / len);
        let diff = targetHeading - player.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.heading += diff * Math.min(1, dt * 12);
        world.cameraYaw += (player.heading - world.cameraYaw) * Math.min(1, dt * 3);
      }
      player.y = groundHeight(player.x, player.z);
      if (actions & ACTION_INTERACT) {
        const car = nearestCar(4);
        if (car) {
          if (car.ai && car.ai.parked) {
            if (witnessNear(car.x, car.z, 60)) addWanted(police, 1);
            world.events.push({ type: 'stolen', kind: car.kind });
          }
          enterCar(car);
        }
      }
      if (actions & ACTION_PUNCH) {
        player.punchTimer = 0.3;
        let hitPed = null;
        for (const ped of world.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - player.x, ped.z - player.z) < 2.5) {
            hitPed = ped;
            break;
          }
        }
        if (hitPed) {
          hitPed.state = 'down';
          hitPed.downTimer = 6;
          addWanted(police, 1);
          world.events.push({ type: 'punch' });
        } else {
          world.events.push({ type: 'punch-miss' });
        }
      }
    }
    if (player.punchTimer > 0) player.punchTimer -= dt;
  }

  function step(dt, input) {
    const actions = input.takeActions();
    world.events.length = 0; // fresh events each step; the caller drains them
    world.time += dt;
    // Lightning: a flash every 8-20 s, with a thunder event for the audio.
    world.lightningTimer -= dt;
    if (world.lightningTimer <= 0) {
      world.lightning = 0.35;
      world.lightningTimer = 8 + random() * 12;
      world.events.push({ type: 'thunder' });
    }
    if (world.lightning > 0) world.lightning = Math.max(0, world.lightning - dt * 2);

    stepPlayer(dt, input, actions);

    // Traffic.
    for (const car of world.traffic) {
      updateTraffic(car, dt, random, colliders, world.cars);
    }
    // Pedestrians; the player car is the threat when it is moving fast.
    const threat = player.car && Math.abs(player.car.speed) > 4 ? player.car : null;
    const hitPeds = updatePeds(world.peds, dt, random, threat, threat ? Math.abs(threat.speed) : 0);
    if (hitPeds.length > 0) {
      addWanted(police, 1);
      world.events.push({ type: 'hit-ped', count: hitPeds.length });
    }

    // Police + wanted.
    const policeEvents = updatePolice(police, world, dt);
    if (policeEvents.busted) {
      setWanted(police, 0);
      if (player.car) {
        player.car.speed = 0;
        player.car = null;
        player.onFoot = true;
      }
      player.x = PLACES.start.x;
      player.z = PLACES.start.z;
      player.y = groundHeight(player.x, player.z);
      player.heading = Math.PI;
      world.cameraYaw = Math.PI;
      world.disguised = false;
      world.passenger = false;
      world.mara.state = 'hidden';
      runner.onBusted();
      world.events.push({ type: 'busted' });
    }
    // Disguise: in a patrol car on mission 4, the police hold off while wanted is low.
    const mission = runner.current();
    world.disguised = Boolean(
      player.car && player.car.kind === 'patrol' && mission && mission.id === 'borrowed-authority' && police.wanted <= 1,
    );

    // Missions.
    runner.update(dt, input);

    // Mission vehicle marker follows the car while the steal step is active.
    if (world.marker && world.missionVehicle && runner.step() && runner.step().kind === 'steal') {
      world.marker = [{ x: world.missionVehicle.x, z: world.missionVehicle.z, label: 'Steal the vehicle' }];
    }
    return world.events;
  }

  function reset(saveOverride) {
    // A save override of null means a fresh game; undefined keeps the save the
    // world was created with.
    const s = saveOverride === undefined ? save : saveOverride;
    world.cars = [];
    world.traffic = [];
    world.parked = [];
    world.missionVehicle = null;
    world.peds = spawnPeds(random, TUNING.pedestrians);
    world.mara = { x: PLACES.maraPickup.x, z: PLACES.maraPickup.z, state: 'hidden' };
    world.passenger = false;
    world.disguised = false;
    world.money = s ? s.money : TUNING.moneyStart;
    world.completed = s ? [...s.completed] : [];
    world.objective = null;
    world.marker = null;
    world.holdProgress = 0;
    world.waterLevel = 0;
    world.ending = null;
    world.endingIndex = -1;
    world.time = 0;
    world.events = [];
    setWanted(police, 0);
    police.cars = [];
    police.heli.active = false;
    player.x = PLACES.start.x;
    player.z = PLACES.start.z;
    player.y = groundHeight(player.x, player.z);
    player.heading = Math.PI;
    player.onFoot = true;
    player.car = null;
    world.cameraYaw = Math.PI;
    spawnTraffic();
    spawnParked();
    const startIndex = s ? Math.min(s.mission, MISSIONS.length - 1) : 0;
    runner.start(startIndex);
  }

  reset();
  return { state: world, world, step, reset, runner, STEP };
}

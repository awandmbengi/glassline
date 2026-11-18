// The 7 story missions of GLASSLINE, as a runner over the world state. Each mission
// is a list of steps (see config.js); the runner watches the player's position, the
// car they are in, and the events the world emits, and advances. Completing a
// mission pays out, saves, and unlocks the next. Being busted or running out the
// clock restarts the mission from its first step.
import { MISSIONS, PLACES } from './config.js';
import { addWanted } from './police.js';

function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function createMissionRunner(world) {
  const runner = {
    index: 0,
    stepIndex: 0,
    holdTimer: 0,
    timedLeft: 0,
    lastPlace: null,
    active: false,
    done: false,
  };

  function current() {
    return MISSIONS[runner.index] || null;
  }

  function step() {
    const mission = current();
    return mission ? mission.steps[runner.stepIndex] || null : null;
  }

  function setObjective() {
    const mission = current();
    const s = step();
    if (!mission || !s) {
      world.objective = null;
      world.marker = null;
      return;
    }
    world.objective = { mission: mission.name, text: s.text };
    if (s.kind === 'choice') {
      world.marker = s.places.map((p) => ({ ...PLACES[p], label: PLACES[p].label }));
    } else if (s.place && PLACES[s.place]) {
      world.marker = [{ ...PLACES[s.place] }];
    } else if (s.kind === 'steal') {
      const car = world.missionVehicle;
      world.marker = car ? [{ x: car.x, z: car.z, label: s.text }] : null;
    } else {
      world.marker = null;
    }
  }

  function advance() {
    const mission = current();
    runner.stepIndex += 1;
    if (runner.stepIndex >= mission.steps.length) {
      completeMission();
    } else {
      const s = step();
      if (s && s.kind === 'timed') runner.timedLeft = s.seconds;
      if (s && s.kind === 'interact') runner.holdTimer = 0;
      world.events.push({ type: 'objective', text: s ? s.text : '' });
      setObjective();
    }
  }

  function completeMission() {
    const mission = current();
    world.money += mission.reward;
    world.completed.push(runner.index);
    world.events.push({ type: 'mission-complete', name: mission.name, reward: mission.reward });
    if (runner.index === MISSIONS.length - 1) {
      runner.done = true;
      world.ending = null; // set by the choice step itself
    }
    runner.index += 1;
    runner.stepIndex = 0;
    runner.holdTimer = 0;
    runner.active = runner.index < MISSIONS.length;
    if (runner.active) {
      startMission(runner.index);
    } else {
      setObjective();
    }
  }

  function startMission(index) {
    runner.index = index;
    runner.stepIndex = 0;
    runner.holdTimer = 0;
    runner.active = true;
    const mission = MISSIONS[index];
    const s = mission.steps[0];
    if (s && s.kind === 'timed') runner.timedLeft = s.seconds;
    // Mission 1 spawns the Aurek service van; mission 4 spawns the patrol car.
    if (mission.id === 'first-drop') world.spawnMissionVehicle('van', 'vanSpawn');
    if (mission.id === 'borrowed-authority') world.spawnMissionVehicle('patrol', 'patrolSpawn');
    // Mission 3 places Mara at the pickup.
    if (mission.id === 'the-witness') {
      world.mara.state = 'waiting';
      world.mara.x = PLACES.maraPickup.x;
      world.mara.z = PLACES.maraPickup.z;
    }
    // Mission 6 resets the flood water.
    if (mission.id === 'flood-channel') world.waterLevel = 0;
    world.events.push({ type: 'mission-start', name: mission.name, briefing: mission.briefing });
    setObjective();
  }

  function failMission(reason) {
    const mission = current();
    world.events.push({ type: 'mission-failed', name: mission ? mission.name : '', reason });
    world.money = Math.max(0, world.money - 200);
    runner.stepIndex = 0;
    runner.holdTimer = 0;
    world.waterLevel = 0;
    world.mara.state = 'hidden';
    world.disguised = false;
    startMission(runner.index);
  }

  function update(dt, input) {
    if (!runner.active || runner.done) return;
    const mission = current();
    const s = step();
    if (!mission || !s) return;
    const player = world.player;
    const pos = player.car || player;

    if (s.kind === 'goto' || s.kind === 'escape') {
      const place = PLACES[s.place];
      if (place && dist2D(pos.x, pos.z, place.x, place.z) < 8) {
        if (s.kind === 'escape' && world.police.wanted < (s.wanted || 1)) {
          // Not hot enough to count as an escape — the step still completes on
          // arrival; the wanted level is set by the previous step.
        }
        advance();
      } else if (s.kind === 'escape' && s.place === 'anywhere') {
        // Mission 5: get 150 m clear of the rooftop.
        const from = PLACES[runner.lastPlace || 'rooftop'];
        if (dist2D(pos.x, pos.z, from.x, from.z) > 150) advance();
      }
    } else if (s.kind === 'steal') {
      // Completes in onEnterCar (below): the player must take the marked vehicle.
    } else if (s.kind === 'interact') {
      const place = PLACES[s.place];
      const near = player.car === null && place && dist2D(player.x, player.z, place.x, place.z) < 5;
      if (near && input.interactHeld()) {
        runner.holdTimer += dt;
        world.holdProgress = Math.min(1, runner.holdTimer / (s.hold || 2));
        if (runner.holdTimer >= (s.hold || 2)) {
          world.holdProgress = 0;
          runner.lastPlace = s.place;
          if (s.wanted) addWanted(world.police, s.wanted);
          if (mission.id === 'lights-on') world.events.push({ type: 'lights', on: true });
          advance();
        }
      } else {
        runner.holdTimer = 0;
        world.holdProgress = 0;
      }
    } else if (s.kind === 'pickup') {
      const place = PLACES[s.place];
      const mara = world.mara;
      if (mara.state === 'waiting' && player.car && dist2D(player.car.x, player.car.z, place.x, place.z) < 7 && Math.abs(player.car.speed) < 1) {
        mara.state = 'walking';
      }
      if (mara.state === 'walking') {
        // Mara walks to the player's car and gets in.
        const car = player.car;
        if (car) {
          const dx = car.x - mara.x;
          const dz = car.z - mara.z;
          const d = Math.hypot(dx, dz) || 1;
          mara.x += (dx / d) * 3 * dt;
          mara.z += (dz / d) * 3 * dt;
          if (d < 2.5) {
            mara.state = 'inCar';
            world.passenger = true;
            advance();
          }
        } else {
          mara.state = 'waiting';
        }
      }
    } else if (s.kind === 'timed') {
      runner.timedLeft -= dt;
      world.waterLevel = Math.min(1, 1 - runner.timedLeft / (s.seconds || 90));
      const place = PLACES[s.place];
      if (place && dist2D(pos.x, pos.z, place.x, place.z) < 8) {
        world.waterLevel = 0;
        advance();
      } else if (runner.timedLeft <= 0) {
        world.waterLevel = 0;
        failMission('The water took the road. Too slow.');
      }
    } else if (s.kind === 'choice') {
      for (let i = 0; i < s.places.length; i += 1) {
        const place = PLACES[s.places[i]];
        if (dist2D(pos.x, pos.z, place.x, place.z) < 9) {
          world.ending = s.endings[i];
          world.endingIndex = i;
          advance();
          return;
        }
      }
    }
  }

  /** Called by the world when the player enters a car. */
  function onEnterCar(car) {
    const s = step();
    if (!s || s.kind !== 'steal') return;
    if (world.missionVehicle && car === world.missionVehicle) {
      addWanted(world.police, 1);
      world.events.push({ type: 'stolen', kind: car.kind });
      advance();
    }
  }

  /** Called by the world when the player is busted. */
  function onBusted() {
    failMission('Busted. The Veyra PD took $200 and your afternoon.');
  }

  return {
    runner,
    current,
    step,
    start: startMission,
    update,
    onEnterCar,
    onBusted,
    failMission,
    setObjective,
  };
}

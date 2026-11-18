// GLASSLINE unit tests — pure modules, no browser.
// Run: node test.cjs   (exit 0 = all pass)
const assert = require('node:assert');

async function main() {
  const { CONFIG, clamp, lerp, dist2, angleLerp } = await import('./game/src/config.js');
  const { createRng, hashSeed } = await import('./game/src/random.js');
  const { buildCityLayout, collideCircle, districtAt, groundHeight } = await import('./game/src/city.js');
  const { CAR_TYPES } = await import('./game/src/vehicles.js');
  const { createMissions } = await import('./game/src/missions.js');
  const { createSave } = await import('./game/src/save.js');

  let n = 0;
  const ok = (cond, label) => { n++; assert.ok(cond, label); console.log(`ok ${n} - ${label}`); };

  // config
  ok(CONFIG.version === '4.0.0', 'config version is 4.0.0');
  ok(CONFIG.title === 'GLASSLINE' && CONFIG.city === 'Veyra' && CONFIG.hero === 'Nara Venn', 'game title, city and hero');
  ok(CONFIG.world.half === 600 && CONFIG.world.roadGap === 120 && CONFIG.world.size === 1200, 'world size 1200, half 600, road gap 120');
  ok(CONFIG.world.damX === 520 && CONFIG.world.canalY === -420 && CONFIG.world.overpassY === 18, 'dam, canal and overpass positions');
  ok(CONFIG.money.start === 120, 'starting money $120');
  ok(CONFIG.money.missionReward.join(',') === '400,550,700,650,800,900,0', 'mission rewards 400..900, final 0');
  ok(CONFIG.wanted.max === 5 && CONFIG.wanted.heliAt === 3 && CONFIG.wanted.decaySeconds === 22, 'wanted 5 stars, helicopter at 3, decay 22s');
  ok(CONFIG.wanted.bustRadius === 4.5 && CONFIG.wanted.bustSeconds === 2.5, 'bust radius and time');
  ok(CONFIG.traffic.count === 14 && CONFIG.pedestrians.count === 22, 'traffic and pedestrian counts');
  ok(CONFIG.player.walkSpeed === 6 && CONFIG.player.runSpeed === 11, 'walk 6, run 11');
  ok(CONFIG.player.carMaxSpeed === 46, 'player car max speed 46');
  ok(CONFIG.radio.stations.length === 3, 'three radio stations');
  ok(CONFIG.radio.stations.map((s) => s.name).join('|') === 'GLASS FM|DAM STATIC|RESERVOIR NIGHTS', 'radio station names');
  ok(CONFIG.shots.length === 4, 'four screenshot scenes');
  ok(CONFIG.rain.count === 2600, 'rain count 2600');

  // config helpers
  ok(clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2, 'clamp works');
  ok(lerp(0, 10, 0.25) === 2.5, 'lerp works');
  ok(dist2(0, 0, 3, 4) === 25, 'dist2 is squared distance');
  ok(Math.abs(angleLerp(0, Math.PI * 1.5, 0.5) - (-Math.PI / 4)) < 1e-9, 'angleLerp takes the short way round');

  // car types
  ok(Object.keys(CAR_TYPES).length === 6, 'six car types');
  ok(CAR_TYPES.patrol.max > CAR_TYPES.courier.max, 'patrol faster than courier van');
  ok(CAR_TYPES.sport.max === 54 && CAR_TYPES.sport.accel === 32, 'sport is the fastest car');
  ok(CAR_TYPES.truck.len === 7.0, 'truck is the longest car');
  ok(Object.values(CAR_TYPES).every((t) => t.name && t.len > 0 && t.max > 0), 'every car type has a name and stats');

  // random: deterministic per seed, different across seeds
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const seqA = [a.next(), a.next(), a.next()], seqB = [b.next(), b.next(), b.next()], seqC = [c.next(), c.next(), c.next()];
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), 'same seed gives same sequence');
  ok(JSON.stringify(seqA) !== JSON.stringify(seqC), 'different seed gives different sequence');
  ok(seqA.every((v) => v >= 0 && v < 1), 'rng values in [0, 1)');
  ok(createRng(7).int(5, 5) === 5, 'rng int with equal bounds');
  ok(createRng(7).pick(['x']) === 'x', 'rng pick from one item');
  ok(hashSeed('Veyra') === hashSeed('Veyra') && hashSeed('Veyra') !== hashSeed('veyra'), 'hashSeed stable and case-sensitive');
  const sh = createRng(9).shuffle([1, 2, 3, 4, 5]);
  ok(sh.length === 5 && sh.slice().sort().join(',') === '1,2,3,4,5', 'shuffle keeps every element');

  // city layout
  const layout = buildCityLayout(1337);
  const names = ['dam', 'tower', 'depot', 'precinct', 'trafficControl', 'spire', 'safehouse', 'drainage', 'channelWest', 'channelEast', 'vanSpawn', 'playerSpawn', 'witness', 'overpassWest', 'overpassEast', 'damGate', 'depotPanel'];
  for (const name of names) {
    const lm = layout.landmarks[name];
    ok(lm && Number.isFinite(lm.x) && Number.isFinite(lm.z), `landmark ${name} exists`);
    ok(Math.abs(lm.x) <= 600 && Math.abs(lm.z) <= 600, `landmark ${name} in bounds`);
  }
  ok(layout.roads.length === 22, '22 roads (11 per axis)');
  ok(layout.buildings.length > 100, 'city has over 100 buildings');
  ok(groundHeight(0, -240) === 18, 'overpass deck is 18 high');
  ok(groundHeight(0, -450) === -4, 'flood channel floor is -4');
  ok(groundHeight(0, 0) === 0, 'street level is 0');
  ok(Math.abs(groundHeight(390, -240) - 9) < 0.01, 'overpass ramp midpoint is 9');
  ok(districtAt(0, 0) === 'downtown', 'city centre is downtown');
  ok(districtAt(540, 0) === 'reservoir', 'east of the dam is reservoir');
  ok(districtAt(0, -470) === 'canal', 'south strip is canal');
  ok(districtAt(-450, 300) === 'stilt', 'far south-west corner is stilt houses');
  ok(districtAt(-450, -350) === 'industrial', 'far north-west corner is industrial');
  const buildingCollider = layout.colliders.find((cc) => cc.hw < 30 && cc.hd < 30);
  ok(buildingCollider !== undefined, 'layout has a building collider');
  const pushed = collideCircle(layout.colliders, buildingCollider.x, buildingCollider.z, 0.5);
  ok(pushed.x !== buildingCollider.x || pushed.z !== buildingCollider.z, 'a building pushes its own centre out');
  const clear = collideCircle(layout.colliders, 0, 0, 0.5);
  ok(clear.x === 0 && clear.z === 0, 'road intersection (0,0) is clear');
  const open = collideCircle(layout.colliders, layout.landmarks.playerSpawn.x, layout.landmarks.playerSpawn.z, 0.5);
  ok(open.x === layout.landmarks.playerSpawn.x && open.z === layout.landmarks.playerSpawn.z, 'player spawn is not inside a building');
  const p1 = layout.randomStreetPoint(), p2 = layout.randomStreetPoint();
  ok(Number.isFinite(p1.x) && Number.isFinite(p1.z), 'random street point is finite');
  ok(p1.x !== p2.x || p1.z !== p2.z, 'random street points vary');
  ok(layout.isRoad(0, 0), '(0,0) is a road');
  ok(!layout.isRoad(60, 60), '(60,60) is inside a block, not a road');
  const snapped = layout.nearestRoadPoint(50, 30);
  ok(snapped.x === 60 || snapped.z === 0, 'nearest road point snaps to a road line');

  // save: in Node there is no localStorage, so it falls back to memory
  const save = createSave();
  ok(save.available === false, 'save reports unavailable without localStorage');
  ok(save.load().money === 120 && save.load().missionsDone === 0, 'blank save has $120 and 0 missions');
  ok(save.save({ money: 500, missionsDone: 3 }) === false, 'save returns false when storage is blocked');
  ok(save.load().money === 500, 'in-memory save still holds the value');
  save.clear();
  ok(save.load().money === 120, 'clear resets to blank');

  // missions: seven, in order, with briefings
  const calls = { completed: [], failed: [], endings: [] };
  const fakeG = {
    missions: null,
    hud: { showBanner() {}, toast() {}, setObjective() {} },
    audio: { missionDone() {}, pickup() {}, channelTick() {} },
    police: { setWanted() {} },
    vehicles: { spawn: (type, x, z) => ({ type, x, z, heading: 0 }) },
    people: { spawnWitness() {}, witness: null },
    layout, world: { setWaterLevel() {} }, money: 0, save: null,
    saveData: { endings: [] },
    onMissionComplete: (d, r) => calls.completed.push([d.id, r]),
    onMissionFailed: (d, r) => calls.failed.push([d.id, r]),
    onEnding: (e) => calls.endings.push(e),
    player: { x: 0, z: 360, car: null },
  };
  const missions = createMissions(fakeG);
  ok(missions.list.length === 7, 'seven missions listed');
  ok(missions.list.map((m) => m.id).join(',') === '1,2,3,4,5,6,7', 'mission ids 1..7 in order');
  ok(missions.list.every((m) => m.name && m.briefing), 'every mission has a name and briefing');
  ok(missions.list[6].name === 'The Choice', 'mission 7 is The Choice');
  ok(missions.start(99) === false, 'starting an unknown mission fails');
  ok(missions.start(1) === true, 'mission 1 starts');
  ok(missions.current.def.id === 1, 'current mission is 1');
  ok(missions.target() && missions.target().label === 'Van Servis', 'mission 1 first target is the service van');
  // Drive mission 1 with the fake player: reach the van, get in, drive to the tower.
  fakeG.player.x = fakeG.layout.landmarks.vanSpawn.x;
  fakeG.player.z = fakeG.layout.landmarks.vanSpawn.z;
  missions.update(0.016);
  ok(missions.currentStep.text.includes('Masuk ke van'), 'reaching the van advances to the enter step');
  fakeG.player.car = fakeG.missionVan; // the enter step checks the exact van object
  missions.update(0.016);
  ok(missions.currentStep.text.includes('Menara Komunikasi'), 'entering the van advances to the delivery step');
  fakeG.player.x = fakeG.layout.landmarks.tower.x;
  fakeG.player.z = fakeG.layout.landmarks.tower.z;
  missions.update(0.016);
  ok(missions.doneCount === 1, 'mission 1 completes at the tower');
  ok(calls.completed.length === 1 && calls.completed[0][0] === 1 && calls.completed[0][1] === 400, 'mission 1 pays $400');
  // Mission 2 can fail.
  ok(missions.start(2) === true, 'mission 2 starts');
  missions.fail('test failure');
  ok(calls.failed.length === 1 && calls.failed[0][0] === 2, 'mission 2 failure is reported');
  // Mission 7 ends with a choice.
  ok(missions.start(7) === true, 'mission 7 starts');
  fakeG.player.car = null;
  fakeG.player.x = fakeG.layout.landmarks.damGate.x;
  fakeG.player.z = fakeG.layout.landmarks.damGate.z;
  missions.update(0.016);
  ok(missions.currentStep.kind === 'choice', 'reaching the dam gate opens the final choice');
  ok(missions.choose('leak') === true, 'choosing LEAK works');
  ok(fakeG.saveData.endings.includes('leak'), 'LEAK ending is recorded');
  ok(calls.endings[0] === 'leak', 'onEnding fires with leak');
  ok(missions.doneCount === 7, 'all 7 missions done after the choice');
  missions.abort();
  ok(missions.current === null, 'abort clears the current mission');

  console.log(`\ntest.cjs: ${n} checks passed`);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

// GLASSLINE unit tests — pure modules, no browser.
// Run: node test.cjs   (exit 0 = all pass)
const assert = require('node:assert');

async function main() {
  const { CONFIG } = await import('./game/src/config.js');
  const { createRng, hashSeed } = await import('./game/src/random.js');
  const { buildCityLayout, collideCircle } = await import('./game/src/city.js');
  const { CAR_TYPES } = await import('./game/src/vehicles.js');
  const { createMissions } = await import('./game/src/missions.js');

  let n = 0;
  const ok = (cond, label) => { n++; assert.ok(cond, label); console.log(`ok ${n} - ${label}`); };

  // config
  ok(CONFIG.version === '3.0.0', 'config version is 3.0.0');
  ok(CONFIG.world.half === 600 && CONFIG.world.roadGap === 120, 'world half 600 and road gap 120');
  ok(Object.keys(CAR_TYPES).length === 6, 'six car types');
  ok(CAR_TYPES.patrol.max > CAR_TYPES.courier.max, 'patrol faster than courier van');
  ok(CONFIG.wanted.max === 5 && CONFIG.wanted.heliAt === 3, 'wanted 5 stars, helicopter at 3');
  ok(CONFIG.money.start === 120, 'starting money $120');
  ok(CONFIG.traffic.count === 14 && CONFIG.pedestrians.count === 22, 'traffic and pedestrian counts');

  // random: deterministic per seed, different across seeds
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const seqA = [a.next(), a.next(), a.next()], seqB = [b.next(), b.next(), b.next()], seqC = [c.next(), c.next(), c.next()];
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), 'same seed gives same sequence');
  ok(JSON.stringify(seqA) !== JSON.stringify(seqC), 'different seed gives different sequence');
  ok(seqA.every((v) => v >= 0 && v < 1), 'rng values in [0, 1)');
  ok(hashSeed('Veyra') === hashSeed('Veyra') && hashSeed('Veyra') !== hashSeed('veyra'), 'hashSeed stable and case-sensitive');

  // city layout: every landmark the missions need exists and is in bounds
  const layout = buildCityLayout(1337);
  const names = ['dam', 'tower', 'depot', 'precinct', 'trafficControl', 'spire', 'safehouse', 'drainage', 'channelWest', 'channelEast', 'vanSpawn', 'playerSpawn', 'witness', 'overpassWest', 'overpassEast', 'damGate', 'depotPanel'];
  for (const name of names) {
    const lm = layout.landmarks[name];
    ok(lm && Number.isFinite(lm.x) && Number.isFinite(lm.z), `landmark ${name} exists`);
    ok(Math.abs(lm.x) <= 600 && Math.abs(lm.z) <= 600, `landmark ${name} in bounds`);
  }
  ok(layout.groundHeight(0, -240) === 18, 'overpass deck is 18 high');
  ok(layout.groundHeight(0, -450) === -4, 'flood channel floor is -4');
  ok(layout.groundHeight(0, 0) === 0, 'street level is 0');
  // collideCircle pushes a point out of a building's AABB and leaves
  // a clear road point untouched.
  const buildingCollider = layout.colliders.find((c) => c.hw < 30 && c.hd < 30);
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
  ok(layout.buildings.length > 100, 'city has over 100 buildings');

  // missions: seven, in order, with briefings
  const fakeG = { missions: null, hud: { showBanner() {}, toast() {}, setObjective() {} }, audio: { missionDone() {}, pickup() {}, channelTick() {} }, police: { setWanted() {} }, vehicles: { spawn: () => ({}) }, people: { spawnWitness() {}, witness: null }, layout, world: { setWaterLevel() {} }, money: 0, save: null, saveData: { endings: [] }, onMissionComplete: null, onMissionFailed: null, onEnding: null };
  const missions = createMissions(fakeG);
  ok(missions.list.length === 7, 'seven missions listed');
  ok(missions.list.map((m) => m.id).join(',') === '1,2,3,4,5,6,7', 'mission ids 1..7 in order');
  ok(missions.list.every((m) => m.name && m.briefing), 'every mission has a name and briefing');
  ok(missions.list[6].name === 'The Choice', 'mission 7 is The Choice');

  console.log(`\ntest.cjs: ${n} checks passed`);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

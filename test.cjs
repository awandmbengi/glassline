// GLASSLINE — local play-test + screenshot capture.
// Serves game/ on :8080, plays the full loop headlessly (title -> start -> walk
// -> steal the mission van -> drive -> mission 1 completes -> save -> reload ->
// continue -> pause), then captures the four deterministic ?shot= states as
// JPEGs into the repo's screenshots/. Run: node test.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', '..', 'bring-the-humans-work', 'node_modules', 'puppeteer'));

const REPO = __dirname;
const OUT = path.join(REPO, 'screenshots');
const BASE = 'http://localhost:8080';
const MAX_BYTES = 262144; // 256 KiB per screenshot
const SHOTS = [['overpass', '1-overpass.jpg'], ['intersection', '2-intersection.jpg'], ['drainage', '3-drainage.jpg'], ['dam', '4-dam.jpg']];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + '/index.html');
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('server did not come up');
}

const state = () => window.__glassline.state;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', ['serve.ts', '--port', '8080'], { cwd: REPO, stdio: 'pipe' });
  const errors = [];
  const failures = [];
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures.push(name);
  };
  try {
    await waitForServer();
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));

    // ---- Load + title ----
    await page.goto(BASE + '/?seed=1', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const title = await page.evaluate(() => ({
      titleVisible: !document.getElementById('title-screen').classList.contains('hidden'),
      hasWorld: Boolean(window.__glassline),
      webgl: (() => { try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2')); } catch { return false; } })(),
    }));
    console.log('title:', JSON.stringify(title));
    check('title screen visible', title.titleVisible);
    check('world handle present', title.hasWorld);
    check('webgl2 available', title.webgl);

    // ---- Start a new game ----
    await page.click('#title-new');
    await sleep(600);
    const started = await page.evaluate(() => {
      const s = window.__glassline.state;
      return {
        hudVisible: !document.getElementById('hud').classList.contains('hidden'),
        onFoot: s.player.onFoot,
        mission: s.runner.current().name,
        objective: s.objective.text,
        traffic: s.traffic.length,
        peds: s.peds.length,
        buildings: s.buildings.length,
      };
    });
    console.log('started:', JSON.stringify(started));
    check('HUD visible after start', started.hudVisible);
    check('mission 1 active', started.mission.includes('First Drop'));
    check('traffic spawned', started.traffic >= 10, `${started.traffic} cars`);
    check('pedestrians spawned', started.peds >= 15, `${started.peds} peds`);
    check('city built', started.buildings >= 30, `${started.buildings} buildings`);

    // ---- Walk forward ----
    const before = await page.evaluate(() => ({ x: window.__glassline.state.player.x, z: window.__glassline.state.player.z }));
    await page.keyboard.down('KeyW');
    await sleep(1200);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ x: window.__glassline.state.player.x, z: window.__glassline.state.player.z }));
    const walked = Math.hypot(after.x - before.x, after.z - before.z);
    check('walking moves the player', walked > 3, `${walked.toFixed(1)} m`);

    // ---- Steal the mission van (teleport next to it, then press E) ----
    await page.evaluate(() => {
      const s = window.__glassline.state;
      const van = s.missionVehicle;
      s.player.x = van.x + 2;
      s.player.z = van.z;
      s.player.y = van.y;
    });
    await page.keyboard.press('KeyE');
    await sleep(400);
    const stolen = await page.evaluate(() => {
      const s = window.__glassline.state;
      return { inCar: !s.player.onFoot, kind: s.player.car ? s.player.car.kind : null, wanted: s.police.wanted, step: s.runner.step().text };
    });
    console.log('stolen:', JSON.stringify(stolen));
    check('entered the mission van', stolen.inCar && stolen.kind === 'van');
    check('stealing raised wanted', stolen.wanted >= 1, `wanted ${stolen.wanted}`);
    check('mission advanced to delivery', stolen.step.includes('comms tower'));

    // ---- Drive the van ----
    const driveBefore = await page.evaluate(() => ({ x: window.__glassline.state.player.x, z: window.__glassline.state.player.z, speed: window.__glassline.state.player.car.speed }));
    await page.keyboard.down('KeyW');
    await sleep(2500);
    await page.keyboard.up('KeyW');
    const driveAfter = await page.evaluate(() => ({ x: window.__glassline.state.player.x, z: window.__glassline.state.player.z, speed: window.__glassline.state.player.car.speed }));
    const drove = Math.hypot(driveAfter.x - driveBefore.x, driveAfter.z - driveBefore.z);
    check('driving moves the car', drove > 10, `${drove.toFixed(1)} m, speed ${driveAfter.speed.toFixed(1)}`);

    // ---- Complete mission 1 (drive to the comms tower marker) ----
    await page.evaluate(() => {
      const s = window.__glassline.state;
      s.player.car.x = 30;
      s.player.car.z = -144;
      s.player.car.speed = 0;
      s.player.x = 30;
      s.player.z = -144;
    });
    await sleep(600);
    const m1 = await page.evaluate(() => {
      const s = window.__glassline.state;
      return { mission: s.runner.current() ? s.runner.current().name : 'ALL DONE', money: s.money, completed: s.completed, completeVisible: !document.getElementById('complete-screen').classList.contains('hidden') };
    });
    console.log('mission 1:', JSON.stringify(m1));
    check('mission 1 completed', m1.completed.includes(0) && m1.money >= 400, `money $${m1.money}`);
    check('complete screen shown', m1.completeVisible);
    await page.click('#complete-continue');
    await sleep(400);

    // ---- Save + reload + continue ----
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('glassline-save-v1') || 'null'));
    console.log('saved:', JSON.stringify(saved));
    check('save written', Boolean(saved) && saved.mission === 1 && saved.money >= 400);
    await page.reload({ waitUntil: 'load' });
    await sleep(1200);
    const reloaded = await page.evaluate(() => ({
      continueVisible: !document.getElementById('title-continue').classList.contains('hidden'),
      continueText: document.getElementById('title-continue').textContent,
    }));
    check('continue offered after reload', reloaded.continueVisible, reloaded.continueText);
    await page.click('#title-continue');
    await sleep(600);
    const continued = await page.evaluate(() => ({
      mission: window.__glassline.state.runner.current().name,
      money: window.__glassline.state.money,
    }));
    check('continue resumes mission 2', continued.mission.includes('Lights Out'), JSON.stringify(continued));

    // ---- Pause / resume ----
    await page.keyboard.press('KeyP');
    await sleep(300);
    const paused = await page.evaluate(() => !document.getElementById('pause-screen').classList.contains('hidden'));
    check('pause screen shows', paused);
    await page.keyboard.press('KeyP');
    await sleep(300);
    const resumed = await page.evaluate(() => document.getElementById('pause-screen').classList.contains('hidden'));
    check('resume hides pause', resumed);

    // ---- Wanted + police chase (force wanted 3, watch a police car close in) ----
    await page.evaluate(() => {
      const s = window.__glassline.state;
      s.police.wanted = 3;
      s.police.spawnTimer = 0;
    });
    await sleep(6000);
    const chase = await page.evaluate(() => {
      const s = window.__glassline.state;
      return { policeCars: s.police.cars.length, heli: s.police.heli.active, wanted: s.police.wanted };
    });
    console.log('chase:', JSON.stringify(chase));
    check('police cars spawn at wanted 3', chase.policeCars >= 2, `${chase.policeCars} cars`);
    check('helicopter active at wanted 3', chase.heli);

    // ---- Deterministic screenshots (first by name is the cover) ----
    for (const [shot, file] of SHOTS) {
      await page.goto(`${BASE}/?shot=${shot}&seed=1`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
      await sleep(300);
      const out = path.join(OUT, file);
      let quality = 80;
      await page.screenshot({ path: out, type: 'jpeg', quality });
      let size = fs.statSync(out).size;
      if (size > MAX_BYTES) {
        quality = 55;
        await page.screenshot({ path: out, type: 'jpeg', quality });
        size = fs.statSync(out).size;
      }
      if (size > MAX_BYTES) {
        quality = 40;
        await page.screenshot({ path: out, type: 'jpeg', quality });
        size = fs.statSync(out).size;
      }
      console.log(`shot ${shot}: ${size} bytes (q${quality}) ${size <= MAX_BYTES ? 'OK' : 'OVER LIMIT'}`);
      check(`shot ${shot} within 256 KiB`, size <= MAX_BYTES, `${size} bytes`);
    }

    await browser.close();
    console.log('page/console/request errors:', errors.length ? errors : 'none');
    check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    server.kill();
  }
  console.log(failures.length ? `FAILURES: ${failures.join(', ')}` : 'ALL CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

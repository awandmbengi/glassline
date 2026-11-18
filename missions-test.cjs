// GLASSLINE — mission smoke test (missions 2-7 + the busted path).
// Plays mission 1, then drives every later mission with real inputs (E to
// enter/steal, hold E to interact, driving to markers) and teleports only to
// move the player between far-apart spots. Run: node missions-test.cjs
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', '..', 'bring-the-humans-work', 'node_modules', 'puppeteer'));

const REPO = __dirname;
const BASE = 'http://localhost:8080';
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

(async () => {
  const server = spawn('node', ['serve.ts', '--port', '8080'], { cwd: REPO, stdio: 'pipe' });
  const errors = [];
  const failures = [];
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures.push(name);
  };
  const S = (fn) => `(() => { const s = window.__glassline.state; return (${fn})(s); })()`;
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

    await page.goto(BASE + '/?seed=1', { waitUntil: 'load', timeout: 60000 });
    await sleep(1200);
    await page.click('#title-new');
    await sleep(500);

    // Teleport helpers via the debug handle.
    const tp = async (x, z) => page.evaluate((x, z) => {
      const s = window.__glassline.state;
      const t = s.player.car || s.player;
      t.x = x; t.z = z; t.speed = 0;
      s.player.x = x; s.player.z = z;
    }, x, z);
    const tpFoot = async (x, z) => page.evaluate((x, z) => {
      const s = window.__glassline.state;
      if (s.player.car) { s.player.car.speed = 0; }
      s.player.car = null; s.player.onFoot = true;
      s.player.x = x; s.player.z = z; s.player.y = 0;
    }, x, z);
    const missionName = async () => page.evaluate(() => window.__glassline.state.runner.current() ? window.__glassline.state.runner.current().name : 'ALL DONE');
    const stepText = async () => page.evaluate(() => window.__glassline.state.runner.step().text);
    // Headless SwiftShader runs ~1 FPS and the loop caps game time at 0.25 s
    // per frame, so a 2 s hold can take 8+ s of real time. Hold E until the
    // mission step actually changes (or 20 s elapse).
    const holdEUntilStepChanges = async () => {
      const before = await stepText();
      await page.keyboard.down('KeyE');
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        if ((await stepText()) !== before) break;
      }
      await page.keyboard.up('KeyE');
      return stepText();
    };
    const completeVisible = async () => page.evaluate(() => !document.getElementById('complete-screen').classList.contains('hidden'));
    const clickContinue = async () => { await page.click('#complete-continue'); await sleep(400); };

    // ---- Mission 1 (same path as test.cjs) ----
    await page.evaluate(() => {
      const s = window.__glassline.state;
      s.player.x = s.missionVehicle.x + 2;
      s.player.z = s.missionVehicle.z;
    });
    await page.keyboard.press('KeyE');
    await sleep(400);
    await tp(30, -144);
    await sleep(800);
    check('mission 1 done', (await missionName()).includes('Lights Out'));
    await clickContinue();

    // ---- Mission 2: substation on foot (hold E), then escape ----
    await page.keyboard.press('KeyE'); // exit the van
    await sleep(300);
    await tpFoot(120, 120);
    await sleep(300);
    const m2step = await holdEUntilStepChanges();
    check('mission 2 interact relights district', m2step.includes('Sluice marker'), m2step);
    await tpFoot(-90, 90);
    await sleep(800);
    check('mission 2 done', (await missionName()).includes('The Witness'));
    check('mission 2 paid $500', (await page.evaluate(() => window.__glassline.state.money)) >= 900);
    await clickContinue();

    // ---- Mission 3: pick up Mara, cross the overpass ----
    await tpFoot(-62, 156);
    await sleep(300);
    await page.keyboard.press('KeyE'); // steal the parked sedan
    await sleep(400);
    await tp(-150, -60); // stop next to Mara
    await sleep(6000); // Mara walks to the car
    const picked = await page.evaluate(() => ({ passenger: window.__glassline.state.passenger, mara: window.__glassline.state.mara.state, step: window.__glassline.state.runner.step().text }));
    console.log('pickup:', JSON.stringify(picked));
    check('Mara picked up', picked.passenger === true, JSON.stringify(picked));
    await tp(-60, -90); // safehouse
    await sleep(800);
    check('mission 3 done', (await missionName()).includes('Borrowed Authority'));
    await clickContinue();

    // ---- Mission 4: steal the patrol car, drive the gate (disguised) ----
    await page.keyboard.press('KeyE'); // exit the car
    await sleep(300);
    await tpFoot(58, -30);
    await sleep(300);
    await page.keyboard.press('KeyE'); // steal the patrol car
    await sleep(400);
    const m4 = await page.evaluate(() => ({ inCar: !window.__glassline.state.player.onFoot, kind: window.__glassline.state.player.car && window.__glassline.state.player.car.kind, disguised: window.__glassline.state.disguised, step: window.__glassline.state.runner.step().text }));
    console.log('mission 4 steal:', JSON.stringify(m4));
    check('patrol car stolen', m4.inCar && m4.kind === 'patrol');
    check('disguised in the patrol car', m4.disguised === true);
    await tp(30, -30); // traffic-control gate
    await sleep(800);
    check('mission 4 done', (await missionName()).includes('Dead Air'));
    await clickContinue();

    // ---- Mission 5: rooftop drive on foot, helicopter, escape ----
    await page.keyboard.press('KeyE'); // exit the patrol car
    await sleep(300);
    await tpFoot(0, -90);
    await sleep(300);
    const m5step = await holdEUntilStepChanges();
    const m5 = await page.evaluate(() => ({ wanted: window.__glassline.state.police.wanted, heli: window.__glassline.state.police.heli.active, step: window.__glassline.state.runner.step().text }));
    console.log('mission 5 after grab:', JSON.stringify(m5));
    check('footage grabbed, wanted 3 + heli', m5.wanted >= 3 && m5.heli === true && m5step.includes('150 m'), JSON.stringify(m5));
    await tpFoot(-122, -30);
    await sleep(300);
    await page.keyboard.press('KeyE'); // steal a parked car to escape in
    await sleep(400);
    await tp(150, 60); // 150+ m clear of the rooftop
    await sleep(800);
    check('mission 5 done', (await missionName()).includes('Flood Channel'));
    await clickContinue();

    // ---- Mission 6: flood channel, timed ----
    await tp(-150, 120); // channel entry
    await sleep(800);
    const m6 = await page.evaluate(() => ({ step: window.__glassline.state.runner.step().text, water: window.__glassline.state.waterLevel }));
    console.log('mission 6 timed:', JSON.stringify(m6));
    check('channel timed step started', m6.step.includes('tunnel exit'), m6.step);
    await tp(-90, 120); // tunnel exit
    await sleep(800);
    check('mission 6 done', (await missionName()).includes('The Choice'));
    await clickContinue();

    // ---- Mission 7: choose the press (LEAK ending) ----
    await tp(90, -60); // press HQ
    await sleep(800);
    // The ending screen arrives via the mission-complete event, one frame
    // after the choice — poll for it (headless runs ~1 FPS).
    let ending = null;
    for (let i = 0; i < 10; i++) {
      ending = await page.evaluate(() => ({
        ending: window.__glassline.state.ending,
        endingVisible: !document.getElementById('ending-screen').classList.contains('hidden'),
        endingText: document.getElementById('ending-text').textContent,
      }));
      if (ending.endingVisible) break;
      await sleep(1000);
    }
    console.log('ending:', JSON.stringify(ending));
    check('ending screen shown', ending.endingVisible);
    check('LEAK ending chosen', (ending.endingText || '').includes('THE LEAK'), ending.endingText);
    check('all 7 missions completed', (await page.evaluate(() => window.__glassline.state.completed)).length === 7);
    await page.click('#ending-continue');
    await sleep(400);

    // Regression: after the story ends there is no mission to restart — the
    // pause menu must hide the restart button (it used to call startMission(7)
    // and crash on MISSIONS[7].steps).
    await page.keyboard.press('KeyP');
    await sleep(400);
    const restartHidden = await page.evaluate(() => document.getElementById('pause-restart').classList.contains('hidden'));
    check('restart button hidden after the story ends', restartHidden === true);
    await page.keyboard.press('KeyP');
    await sleep(400);

    // ---- Busted path (free roam): cornered on foot by the police ----
    const moneyBefore = await page.evaluate(() => window.__glassline.state.money);
    await page.keyboard.press('KeyE'); // exit the car
    await sleep(300);
    await page.evaluate(() => {
      const s = window.__glassline.state;
      s.police.wanted = 2;
    });
    await sleep(3000); // let the wanted level spawn its cars
    await page.evaluate(() => {
      const s = window.__glassline.state;
      if (s.police.cars.length > 0) {
        let best = s.police.cars[0];
        for (const c of s.police.cars) {
          if (Math.hypot(c.x - s.player.x, c.z - s.player.z) < Math.hypot(best.x - s.player.x, best.z - s.player.z)) best = c;
        }
        best.x = s.player.x + 3; best.z = s.player.z + 3; best.speed = 0;
      }
    });
    // The bust meter needs 3 s of game time (~12 s real at ~1 FPS); poll.
    let busted = null;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      busted = await page.evaluate(() => ({
        wanted: window.__glassline.state.police.wanted,
        atStart: Math.hypot(window.__glassline.state.player.x + 30, window.__glassline.state.player.z - 150) < 5,
        money: window.__glassline.state.money,
      }));
      if (busted.atStart) break;
    }
    console.log('busted:', JSON.stringify(busted), 'money before:', moneyBefore);
    check('busted respawns at start, wanted cleared', busted.atStart && busted.wanted === 0, JSON.stringify(busted));
    check('busted costs $200', busted.money === Math.max(0, moneyBefore - 200), `$${busted.money} vs $${moneyBefore}`);

    await browser.close();
    console.log('page/console errors:', errors.length ? errors : 'none');
    check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    server.kill();
  }
  console.log(failures.length ? `FAILURES: ${failures.join(', ')}` : 'ALL MISSION CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

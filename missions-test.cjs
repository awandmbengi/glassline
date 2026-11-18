// GLASSLINE headless playthrough — serves game/ and drives it in
// Chrome for Testing via puppeteer, using the debug API on
// window.__glassline. Checks: missions 1-7 completable, LEAK ending
// reachable, the busted path, save/Continue, zero page/console errors.
// Run: node missions-test.cjs   (exit 0 = all pass)
const http = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const puppeteer = require('/home/hatch/workspace/makefun/bring-the-humans-work/node_modules/puppeteer');

const GAME_DIR = join(__dirname, 'game');
const PORT = 8901;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'ok' : 'FAIL'} - ${label}`);
  if (!cond) failures++;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const path = decodeURIComponent(req.url.split('?')[0]);
      const file = join(GAME_DIR, path === '/' ? 'index.html' : path);
      if (!file.startsWith(GAME_DIR) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  const server = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__glassline, { timeout: 20000 });
    check(true, 'game boots, __glassline debug API present');

    const evalJs = (fn, ...args) => page.evaluate(fn, ...args);
    const state = () => evalJs(() => window.__glassline.state());
    const clickAct = async (act) => {
      await page.evaluate((a) => {
        const b = document.querySelector(`[data-act="${a}"]`);
        if (b) b.click();
      }, act);
    };

    // Start screen offers a new game.
    check(await page.evaluate(() => !!document.querySelector('[data-act="start"]')), 'start screen shows Mulai');
    await clickAct('freeroam');
    await sleep(500);
    check((await state()) === 'playing', 'free roam starts (state playing)');

    // Drive: give the player a car, hold W, it must move.
    const before = await evalJs(() => { const g = window.__glassline.G; window.__glassline.giveCar('sport'); return { x: g.player.x, z: g.player.z }; });
    await page.keyboard.down('KeyW');
    await sleep(4000);
    await page.keyboard.up('KeyW');
    const after = await evalJs(() => { const g = window.__glassline.G; return { x: g.player.x, z: g.player.z, speed: Math.abs(g.player.car ? g.player.car.speed : 0) }; });
    // Headless SwiftShader runs only a few frames per second and the
    // game clamps dt, so game time runs much slower than real time:
    // judge the drive by speed (the car accelerates) and any movement.
    check(after.speed > 5 && Math.hypot(after.x - before.x, after.z - before.z) > 2, `car drives (moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)}m, speed ${after.speed.toFixed(1)})`);
    // Stop the car so the next steps are deterministic.
    await evalJs(() => { const g = window.__glassline.G; if (g.player.car) g.player.car.speed = 0; });

    // Busted path: wanted 1, on foot, then keep a patrol pinned next
    // to the player (zero its speed each tick) until the bust lands.
    // Headless renders slowly, so game time runs ~half speed: allow 12s.
    await evalJs(() => { const g = window.__glassline.G; if (g.player.car) g.player.car.speed = 0; window.__glassline.exitCar(); });
    await evalJs(() => { const g = window.__glassline.G; g.police.setWanted(1); });
    await sleep(1500);
    let busted = false;
    for (let i = 0; i < 60; i++) {
      await evalJs(() => {
        const g = window.__glassline.G;
        const p = g.police.patrols[0];
        if (p) {
          p.speed = 0;
          g.player.x = p.x + 2; g.player.z = p.z; g.player.speed = 0;
        }
      });
      await sleep(200);
      if ((await state()) === 'busted') { busted = true; break; }
    }
    check(busted, 'busted path triggers when a patrol sits on a slow player');
    await clickAct('retry');
    await sleep(500);
    check((await state()) === 'playing', 'retry after busted returns to play');

    // Missions 1-7, driving the real step checks via teleport + the
    // game's own enter/exit car actions.
    const stepInfo = () => evalJs(() => {
      const g = window.__glassline.G;
      const cur = g.missions.current;
      if (!cur) return null;
      const s = cur.steps[cur.step];
      return s ? { id: cur.def.id, index: cur.step, kind: s.kind || 'reach', text: s.text, target: s.target || null, duration: s.duration || 0 } : null;
    });
    const advanceStep = async (info) => {
      const cur = () => evalJs(() => {
        const c = window.__glassline.G.missions.current;
        return c ? { id: c.def.id, index: c.step } : null;
      });
      const start = await cur();
      if (!start) return 'done';
      // Choice steps: pick LEAK.
      if (info.kind === 'choice') {
        await evalJs(() => window.__glassline.choose('leak'));
        await sleep(600);
        return (await cur()) === null ? 'done' : 'advanced';
      }
      // Remember the car the player arrived in: for "(E)" enter steps
      // it must be removed before entering, or enterCar grabs it
      // (nearest) instead of the target car.
      const isEnterStep = info.text.includes('(E)');
      await evalJs(() => {
        const g = window.__glassline.G;
        window.__oldCarId = g.player.car ? g.player.car.id : null;
      });
      // Wait (polling) for the step to advance after a strategy.
      // Channel steps need their full hold time; headless rendering
      // runs game time at roughly half speed, so allow 12s for them.
      const waitForAdvance = async (timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          await sleep(400);
          const now = await cur();
          if (!now) return 'done';
          if (now.id !== start.id || now.index !== start.index) return 'advanced';
          const s = await state();
          if (s === 'busted' || s === 'failed') return s + '-retry';
        }
        return 'timeout';
      };
      // Read the step's target fresh each time: a target car can be
      // pushed by collisions, so a snapshot from the start goes stale.
      const freshTarget = () => evalJs(() => {
        const g = window.__glassline.G;
        const cur = g.missions.current;
        if (!cur) return null;
        const s = cur.steps[cur.step];
        return s && s.target ? { x: s.target.x, z: s.target.z } : null;
      });
      const strategies = [
        async () => { // A: teleport to the target as-is
          const t = await freshTarget();
          if (t) await evalJs((tt) => window.__glassline.teleport(tt.x, tt.z), t);
        },
        async () => { // B: get out, teleport on foot
          await evalJs(() => window.__glassline.exitCar());
          const t = await freshTarget();
          if (t) await evalJs((tt) => window.__glassline.teleport(tt.x, tt.z), t);
        },
        async () => { // C: get out, drop the car the player arrived
          // in (for "(E)" steps it would win the nearest-car pick),
          // teleport, enter the car there
          await evalJs((enter) => {
            const g = window.__glassline.G;
            if (enter && window.__oldCarId != null) {
              const old = g.vehicles.cars.find((c) => c.id === window.__oldCarId);
              if (old) g.vehicles.remove(old);
            }
            window.__glassline.exitCar();
          }, isEnterStep);
          const t = await freshTarget();
          if (t) await evalJs((tt) => window.__glassline.teleport(tt.x, tt.z), t);
          await evalJs(() => window.__glassline.enterCar());
        },
        async () => { // D: take a fresh car, teleport to the target
          await evalJs(() => window.__glassline.giveCar('sport'));
          const t = await freshTarget();
          if (t) await evalJs((tt) => window.__glassline.teleport(tt.x, tt.z), t);
        },
      ];
      const timeout = info.kind === 'channel' ? 12000 : 3000;
      for (const run of strategies) {
        await run();
        const res = await waitForAdvance(timeout);
        if (res !== 'timeout') return res;
      }
      return 'stuck';
    };

    for (let id = 1; id <= 7; id++) {
      await evalJs(() => { const g = window.__glassline.G; if (g.player.car) g.player.car.speed = 0; });
      await evalJs((m) => window.__glassline.startMission(m), id);
      await sleep(400);
      let guard = 0;
      let missionDone = false;
      while (guard++ < 80) {
        const info = await stepInfo();
        if (!info) { missionDone = true; break; }
        if ((await state()) === 'busted' || (await state()) === 'failed') {
          await clickAct('retry');
          await sleep(600);
          continue;
        }
        const res = await advanceStep(info);
        console.log(`  mission ${id} step ${info.index} (${info.kind}): ${res}`);
        if (res === 'done') { missionDone = true; break; }
        if (res === 'stuck') break;
        // 'advanced' / 'busted-retry' / 'failed-retry': keep going.
      }
      check(missionDone, `mission ${id} completes`);
      if (!missionDone) break;
      const done = await evalJs(() => window.__glassline.G.missions.doneCount);
      check(done >= id, `missions.doneCount is ${done} after mission ${id}`);
      await sleep(300);
    }

    // LEAK ending.
    check((await state()) === 'ending', 'mission 7 choice reaches the ending screen');
    const ending = await evalJs(() => ({ ending: window.__glassline.G.ending, saved: window.__glassline.load().endings }));
    check(ending.ending === 'leak', 'ending is LEAK');
    check(ending.saved.includes('leak'), 'LEAK ending saved to localStorage');

    // Save / Continue: reload, the save must still be there.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__glassline, { timeout: 20000 });
    const saved = await evalJs(() => window.__glassline.load());
    check(saved.missionsDone === 7, `save persists after reload (missionsDone ${saved.missionsDone})`);
    check(saved.money > 120, `money grew from missions ($${saved.money})`);
    check(await page.evaluate(() => !!document.querySelector('[data-act="continue"]')), 'menu offers Lanjutkan after a save');
    await clickAct('continue');
    await sleep(500);
    check((await state()) === 'playing', 'Continue resumes play');
    const curMission = await evalJs(() => { const c = window.__glassline.G.missions.current; return c ? c.def.id : null; });
    check(curMission === 7, `Continue resumes at mission 7 (got ${curMission})`);

    // Screenshot scenes render without errors.
    for (const shot of [1, 2, 3, 4]) {
      await page.goto(`http://localhost:${PORT}/index.html?shot=${shot}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1500);
      check((await state()) === 'shot', `?shot=${shot} renders in shot mode`);
    }

    check(errors.length === 0, `zero page/console errors (${errors.length} seen)`);
    if (errors.length) errors.slice(0, 10).forEach((e) => console.log('  error:', e));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures === 0 ? '\nmissions-test.cjs: ALL PASS' : `\nmissions-test.cjs: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });

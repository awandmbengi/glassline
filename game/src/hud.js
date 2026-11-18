// The DOM HUD: wanted stars, money, mission + objective, a 2D minimap, speed,
// district, radio, hold-progress bar, toasts, and the title / pause / mission
// complete / ending screens. The 3D view is the canvas; this is everything else.
import { DISTRICTS, MISSIONS, PLACES, districtAt } from './config.js';
import { CITY } from './config.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(callbacks) {
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let toastTimer = null;

  function show(id) {
    el(id).classList.remove('hidden');
  }
  function hide(id) {
    el(id).classList.add('hidden');
  }
  function hideAllScreens() {
    hide('title-screen');
    hide('pause-screen');
    hide('complete-screen');
    hide('ending-screen');
  }

  function toast(text, ms = 3500) {
    const t = el('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.add('hidden'), ms);
  }

  function drawMinimap(world) {
    const s = minimap.width;
    const to = (v) => ((v + 180) / 360) * s;
    mctx.fillStyle = '#10151f';
    mctx.fillRect(0, 0, s, s);
    // Districts, faint tints.
    const tints = { Glassworks: '#223349', 'Reservoir Row': '#2a2f3a', 'Kestrel Heights': '#1c2431', 'Sluice District': '#1e2c33', 'Foundry Yard': '#2e2a22' };
    for (const d of DISTRICTS) {
      mctx.fillStyle = tints[d.name] || '#1a212c';
      mctx.fillRect(to(d.x0), to(d.z0), to(d.x1) - to(d.x0), to(d.z1) - to(d.z0));
    }
    // Roads.
    mctx.strokeStyle = '#4a5568';
    mctx.lineWidth = 3;
    for (const r of CITY.roads) {
      mctx.beginPath();
      mctx.moveTo(0, to(r));
      mctx.lineTo(s, to(r));
      mctx.stroke();
      mctx.beginPath();
      mctx.moveTo(to(r), 0);
      mctx.lineTo(to(r), s);
      mctx.stroke();
    }
    // Dam + reservoir.
    mctx.fillStyle = '#3a4552';
    mctx.fillRect(0, to(CITY.damZ - 8), s, to(16) - to(0));
    mctx.fillStyle = '#14324a';
    mctx.fillRect(0, 0, s, to(CITY.damZ - 8));
    // Channel.
    mctx.fillStyle = '#1d4a66';
    mctx.fillRect(to(CITY.channel.x0), to(CITY.channel.z0), to(CITY.channel.x1) - to(CITY.channel.x0), to(CITY.channel.z1) - to(CITY.channel.z0));
    // Markers (amber diamonds) + a line from the player to the first marker.
    const markers = world.marker || [];
    const p = world.player;
    if (markers.length > 0) {
      mctx.strokeStyle = '#ffb84d';
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.moveTo(to(p.x), to(p.z));
      mctx.lineTo(to(markers[0].x), to(markers[0].z));
      mctx.stroke();
    }
    for (const m of markers) {
      mctx.fillStyle = '#ffb84d';
      mctx.beginPath();
      mctx.moveTo(to(m.x), to(m.z) - 6);
      mctx.lineTo(to(m.x) + 5, to(m.z));
      mctx.lineTo(to(m.x), to(m.z) + 6);
      mctx.lineTo(to(m.x) - 5, to(m.z));
      mctx.closePath();
      mctx.fill();
    }
    // Mara.
    if (world.mara.state === 'waiting' || world.mara.state === 'walking') {
      mctx.fillStyle = '#2ed8b8';
      mctx.beginPath();
      mctx.arc(to(world.mara.x), to(world.mara.z), 4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police (blue) + helicopter (red ring).
    for (const car of world.police.cars) {
      mctx.fillStyle = '#3a6bff';
      mctx.beginPath();
      mctx.arc(to(car.x), to(car.z), 3.5, 0, Math.PI * 2);
      mctx.fill();
    }
    if (world.police.heli.active) {
      mctx.strokeStyle = '#ff3020';
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.arc(to(world.police.heli.x), to(world.police.heli.z), 6, 0, Math.PI * 2);
      mctx.stroke();
    }
    // Player arrow.
    mctx.save();
    mctx.translate(to(p.x), to(p.z));
    mctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)));
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(5, 6);
    mctx.lineTo(-5, 6);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function update(world, screen) {
    const p = world.player;
    const wanted = world.police.wanted;
    const stars = el('wanted');
    stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    stars.classList.toggle('hot', wanted >= 3);
    // The disguise is a real state the player can see: the stars dim and the
    // badge says the police are not on them.
    const badge = el('disguise-badge');
    if (badge) badge.classList.toggle('hidden', !world.disguised);
    stars.classList.toggle('disguised', Boolean(world.disguised));
    el('money').textContent = `$${world.money}`;
    el('district').textContent = districtAt(p.x, p.z);
    el('speed').textContent = p.car ? `${Math.round(Math.abs(p.car.speed) * 3.6)} km/h` : 'on foot';
    const mission = world.runner.current();
    el('mission-name').textContent = mission ? mission.name : 'Free roam — Veyra is yours';
    el('objective').textContent = world.objective ? world.objective.text : 'No active mission. Steal a car, explore, or start the next job from the pause menu.';
    el('radio').textContent = world.radioName || '';
    const hold = el('hold-bar');
    if (world.holdProgress > 0) {
      hold.classList.remove('hidden');
      el('hold-fill').style.width = `${Math.round(world.holdProgress * 100)}%`;
    } else {
      hold.classList.add('hidden');
    }
    drawMinimap(world);
    el('hud').classList.toggle('hidden', screen === 'title');
  }

  function showTitle(save) {
    hideAllScreens();
    show('title-screen');
    const list = el('title-missions');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const li = document.createElement('li');
      const done = save && save.completed.includes(i);
      const current = save ? i === save.mission : i === 0;
      li.textContent = `${done ? '✓' : current ? '►' : '·'} ${m.name} — $${m.reward}`;
      li.className = done ? 'done' : current ? 'current' : '';
      list.appendChild(li);
    });
    el('title-continue').classList.toggle('hidden', !save);
    if (save) el('title-continue').textContent = `Continue — mission ${save.mission + 1} ($${save.money})`;
  }

  function showComplete(name, reward, last) {
    hideAllScreens();
    show('complete-screen');
    el('complete-text').textContent = `${name} complete — $${reward} earned.`;
    el('complete-continue').textContent = last ? 'Keep driving — free roam' : 'Next mission';
  }

  function showEnding(text) {
    hideAllScreens();
    show('ending-screen');
    el('ending-text').textContent = text;
  }

  // Wire the buttons.
  el('title-new').addEventListener('click', () => callbacks.onNewGame());
  el('title-continue').addEventListener('click', () => callbacks.onContinue());
  el('pause-resume').addEventListener('click', () => callbacks.onResume());
  el('pause-restart').addEventListener('click', () => callbacks.onRestartMission());
  el('pause-quit').addEventListener('click', () => callbacks.onQuitToTitle());
  el('pause-reset').addEventListener('click', () => callbacks.onResetSave());
  el('pause-mute').addEventListener('click', () => callbacks.onToggleMute());
  el('complete-continue').addEventListener('click', () => callbacks.onResume());
  el('ending-continue').addEventListener('click', () => callbacks.onResume());
  el('mute-btn').addEventListener('click', () => callbacks.onToggleMute());

  return { update, toast, showTitle, showComplete, showEnding, hideAllScreens, show, hide };
}

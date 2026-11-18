// GLASSLINE HUD — the DOM overlay plus a 2D canvas minimap. Screens
// (start, pause, busted, failed, ending) are DOM panels toggled by id.
// The minimap sketches roads, the reservoir, the mission waypoint,
// police dots, the helicopter and the player arrow from live state.
// Every element lookup is guarded: a missing node just means that
// readout is skipped, never a crash.
import { CONFIG } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    wanted: $('wanted'), money: $('money'), mission: $('mission'),
    objective: $('objective'), speed: $('speed'), health: $('health'),
    banner: $('banner'), toast: $('toast'), radio: $('radio'),
    map: $('minimap'), screen: $('screen'),
  };
  const mapCtx = el.map ? el.map.getContext('2d') : null;
  let bannerTimer = null;
  let toastTimer = null;

  // Big centre message that fades on its own after 3.2 s.
  function showBanner(text) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 3200);
  }

  // Smaller corner note, on screen a little longer (5.2 s).
  function toast(text) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 5200);
  }

  // Full-screen panel: empty html hides it, anything else shows it.
  function setScreen(html) {
    if (!el.screen) return;
    if (!html) { el.screen.innerHTML = ''; el.screen.classList.remove('show'); return; }
    el.screen.innerHTML = html;
    el.screen.classList.add('show');
  }

  // Top-down sketch of Veyra: roads as a grid, water east of the dam,
  // a pulsing waypoint, police, helicopter and the player arrow.
  function drawMinimap(G) {
    if (!mapCtx) return;
    const S = el.map.width;
    const half = CONFIG.world.half;
    const to = (v) => ((v + half) / (half * 2)) * S;
    mapCtx.clearRect(0, 0, S, S);
    mapCtx.fillStyle = 'rgba(10,18,26,0.82)';
    mapCtx.fillRect(0, 0, S, S);
    // Road grid.
    mapCtx.strokeStyle = 'rgba(160,180,200,0.55)';
    mapCtx.lineWidth = 2;
    for (let v = -half; v <= half; v += CONFIG.world.roadGap) {
      mapCtx.beginPath(); mapCtx.moveTo(to(v), 0); mapCtx.lineTo(to(v), S); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, to(v)); mapCtx.lineTo(S, to(v)); mapCtx.stroke();
    }
    // Reservoir east of the dam wall.
    mapCtx.fillStyle = 'rgba(40,90,140,0.8)';
    mapCtx.fillRect(to(CONFIG.world.damX), 0, S - to(CONFIG.world.damX), S);
    // Mission waypoint: pulsing amber ring with a dark centre.
    const t = G.missions.target();
    if (t) {
      const pulse = 6 + Math.sin(performance.now() / 300) * 2;
      mapCtx.fillStyle = '#ffb347';
      mapCtx.beginPath(); mapCtx.arc(to(t.x), to(t.z), pulse, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#1a1a1a';
      mapCtx.beginPath(); mapCtx.arc(to(t.x), to(t.z), 2.5, 0, Math.PI * 2); mapCtx.fill();
    }
    // Patrol cars in blue.
    mapCtx.fillStyle = '#3a8cff';
    for (const c of G.police.patrols) {
      mapCtx.beginPath(); mapCtx.arc(to(c.x), to(c.z), 3, 0, Math.PI * 2); mapCtx.fill();
    }
    // Helicopter in red, when one is up.
    if (G.police.helicopter) {
      mapCtx.fillStyle = '#ff5a5a';
      mapCtx.beginPath(); mapCtx.arc(to(G.police.helicopter.x), to(G.police.helicopter.z), 4, 0, Math.PI * 2); mapCtx.fill();
    }
    // Player arrow, rotated to the heading.
    const px = to(G.player.x), pz = to(G.player.z);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(Math.PI - G.player.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6); mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    showBanner, toast, setScreen,

    setObjective(t) { if (el.objective) el.objective.textContent = t || ''; },
    setMission(t) { if (el.mission) el.mission.textContent = t || ''; },
    setMoney(n) { if (el.money) el.money.textContent = `$${n}`; },
    setRadio(name) { if (el.radio) el.radio.textContent = name || ''; },

    setWanted(n) {
      if (!el.wanted) return;
      el.wanted.textContent = '★'.repeat(n) + '☆'.repeat(Math.max(0, CONFIG.wanted.max - n));
      el.wanted.classList.toggle('hot', n >= 3);
    },

    update(G) {
      this.setWanted(G.police.wanted);
      this.setMoney(G.money);
      const car = G.player.car;
      if (el.speed) {
        el.speed.textContent = car
          ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h`
          : (G.player.speed > 0.5 ? 'jalan' : '');
      }
      if (el.health) {
        // On foot there is no vehicle to damage, so show a full 100%.
        const h = car ? Math.max(0, Math.round(car.health)) : 100;
        el.health.textContent = `kendaraan ${h}%`;
        el.health.classList.toggle('low', h < 30);
      }
      drawMinimap(G);
    },
  };
}

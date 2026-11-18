// The HUD: DOM overlay plus a 2D canvas minimap. Screens (start,
// pause, busted, failed, ending) are DOM panels toggled by id.
// The minimap draws roads, the player arrow, the waypoint, police
// dots and the helicopter — all from live game state.
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

  function showBanner(text) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 3200);
  }

  function toast(text) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 5200);
  }

  function setScreen(html) {
    if (!el.screen) return;
    if (!html) { el.screen.innerHTML = ''; el.screen.classList.remove('show'); return; }
    el.screen.innerHTML = html;
    el.screen.classList.add('show');
  }

  function drawMinimap(G) {
    if (!mapCtx) return;
    const S = el.map.width;
    const half = CONFIG.world.half;
    const to = (v) => ((v + half) / (half * 2)) * S;
    mapCtx.clearRect(0, 0, S, S);
    mapCtx.fillStyle = 'rgba(10,18,26,0.82)';
    mapCtx.fillRect(0, 0, S, S);
    // Roads.
    mapCtx.strokeStyle = 'rgba(160,180,200,0.55)';
    mapCtx.lineWidth = 2;
    for (let v = -half; v <= half; v += CONFIG.world.roadGap) {
      mapCtx.beginPath(); mapCtx.moveTo(to(v), 0); mapCtx.lineTo(to(v), S); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, to(v)); mapCtx.lineTo(S, to(v)); mapCtx.stroke();
    }
    // Reservoir + dam.
    mapCtx.fillStyle = 'rgba(40,90,140,0.8)';
    mapCtx.fillRect(to(CONFIG.world.damX), 0, S - to(CONFIG.world.damX), S);
    // Waypoint.
    const t = G.missions.target();
    if (t) {
      const pulse = 6 + Math.sin(performance.now() / 300) * 2;
      mapCtx.fillStyle = '#ffb347';
      mapCtx.beginPath(); mapCtx.arc(to(t.x), to(t.z), pulse, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#1a1a1a';
      mapCtx.beginPath(); mapCtx.arc(to(t.x), to(t.z), 2.5, 0, Math.PI * 2); mapCtx.fill();
    }
    // Police dots.
    mapCtx.fillStyle = '#3a8cff';
    for (const c of G.police.patrols) {
      mapCtx.beginPath(); mapCtx.arc(to(c.x), to(c.z), 3, 0, Math.PI * 2); mapCtx.fill();
    }
    if (G.police.helicopter) {
      mapCtx.fillStyle = '#ff5a5a';
      mapCtx.beginPath(); mapCtx.arc(to(G.police.helicopter.x), to(G.police.helicopter.z), 4, 0, Math.PI * 2); mapCtx.fill();
    }
    // Player arrow.
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
      if (el.speed) el.speed.textContent = car ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h` : (G.player.speed > 0.5 ? 'jalan' : '');
      if (el.health) {
        const h = car ? Math.max(0, Math.round(car.health)) : 100;
        el.health.textContent = `kendaraan ${h}%`;
        el.health.classList.toggle('low', h < 30);
      }
      drawMinimap(G);
    },
  };
}

// Builds Veyra in Three.js from the city layout: ground texture,
// instanced buildings and streetlights, the dam and reservoir, the
// overpass, rain and lightning. All art is procedural — no image files.
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { groundHeight, collideCircle } from './city.js';

const W = CONFIG.world;
const P = CONFIG.palette;

function makeGroundTexture(layout) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + W.half) / W.size) * S;
  g.fillStyle = '#232a30';
  g.fillRect(0, 0, S, S);
  // City blocks: slightly varied asphalt.
  const rng = { s: 42, next() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; } };
  for (let x = -W.half; x < W.half; x += W.roadGap) {
    for (let z = -W.half; z < W.half; z += W.roadGap) {
      const v = 34 + Math.floor(rng.next() * 10);
      g.fillStyle = `rgb(${v},${v + 5},${v + 8})`;
      g.fillRect(toPx(x + W.roadWidth / 2), toPx(z + W.roadWidth / 2), toPx(W.block) - toPx(0), toPx(W.block) - toPx(0));
    }
  }
  // Flood channel (south) and reservoir (east).
  g.fillStyle = '#152630';
  g.fillRect(toPx(-520), toPx(-500), toPx(520) - toPx(-520), toPx(-440) - toPx(-500));
  g.fillStyle = '#12283e';
  g.fillRect(toPx(W.damX), 0, S - toPx(W.damX), S);
  // Roads.
  g.fillStyle = '#181d21';
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    g.fillRect(toPx(v - W.roadWidth / 2), 0, toPx(W.roadWidth) - toPx(0), S);
    g.fillRect(0, toPx(v - W.roadWidth / 2), S, toPx(W.roadWidth) - toPx(0));
  }
  // Lane markings: amber dashes on the main avenues.
  g.fillStyle = '#d8a13c';
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    for (let d = -W.half; d < W.half; d += 24) {
      g.fillRect(toPx(v) - 2, toPx(d), 4, 12);
      g.fillRect(toPx(d), toPx(v) - 2, 12, 4);
    }
  }
  // Overpass deck.
  g.fillStyle = '#20262c';
  g.fillRect(toPx(-420), toPx(-252), toPx(420) - toPx(-420), toPx(-228) - toPx(-252));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFacadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2c3844';
  g.fillRect(0, 0, 128, 256);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      const lit = rnd() < 0.42;
      g.fillStyle = lit ? (rnd() < 0.75 ? '#ffb347' : '#ffd9a0') : '#141d28';
      g.fillRect(x, y, 8, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(layout, hooks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 120, 900);

  const hemi = new THREE.HemisphereLight(0x8fa8c0, 0x1a2027, 0.75);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xbfd4e6, 0.9);
  moon.position.set(-300, 500, -200);
  scene.add(moon);
  const flash = new THREE.DirectionalLight(0xdfeaff, 0);
  flash.position.set(200, 400, 300);
  scene.add(flash);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W.size, W.size),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(layout), roughness: 0.92, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Buildings, instanced.
  const facade = makeFacadeTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85, metalness: 0.1 });
  const buildings = new THREE.InstancedMesh(bGeo, bMat, layout.buildings.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  layout.buildings.forEach((b, i) => {
    pos.set(b.x, groundHeight(b.x, b.z), b.z);
    sc.set(b.w, b.h, b.d);
    m4.compose(pos, q, sc);
    buildings.setMatrixAt(i, m4);
    const tint = b.district === 'downtown' ? 0.9 + (i % 5) * 0.05
      : b.district === 'stilt' ? 0.75 : 0.85;
    col.setRGB(tint, tint * 1.02, tint * 1.08);
    buildings.setColorAt(i, col);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Streetlights along the avenues.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30383f, roughness: 0.7 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x443311, emissive: P.amber, emissiveIntensity: 1.6 });
  const spots = [];
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    for (let d = -W.half + 30; d < W.half; d += 60) {
      spots.push([v + W.roadWidth / 2 + 2, d]);
      spots.push([d, v + W.roadWidth / 2 + 2]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
  spots.forEach(([x, z], i) => {
    const y = groundHeight(x, z);
    pos.set(x, y + 3.5, z); sc.set(1, 1, 1);
    m4.compose(pos, q, sc);
    poles.setMatrixAt(i, m4);
    pos.set(x, y + 7, z);
    m4.compose(pos, q, sc);
    lamps.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(lamps);

  // The dam wall + reservoir water.
  const dam = new THREE.Mesh(
    new THREE.BoxGeometry(16, 46, W.size),
    new THREE.MeshStandardMaterial({ color: P.dam, roughness: 0.9 }),
  );
  dam.position.set(W.damX + 8, 20, 0);
  scene.add(dam);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(W.size - W.damX - 16, W.size),
    new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.25, metalness: 0.4, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(W.damX + 16 + (W.size - W.damX - 16) / 2, 1.2, 0);
  scene.add(water);

  // Flood-channel water.
  const channelWater = new THREE.Mesh(
    new THREE.PlaneGeometry(1040, 60),
    new THREE.MeshStandardMaterial({ color: 0x14324a, roughness: 0.3, metalness: 0.3, transparent: true, opacity: 0.85 }),
  );
  channelWater.rotation.x = -Math.PI / 2;
  channelWater.position.set(0, -2.2, -470);
  scene.add(channelWater);

  // Overpass deck + pillars.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(840, 2, 24),
    new THREE.MeshStandardMaterial({ color: 0x272e35, roughness: 0.85 }),
  );
  deck.position.set(0, 17, -240);
  scene.add(deck);
  const pillarGeo = new THREE.BoxGeometry(3, 17, 3);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x39424b, roughness: 0.9 });
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, 15);
  for (let i = 0; i < 15; i++) {
    pos.set(-420 + i * 60, 8.5, -240); sc.set(1, 1, 1);
    m4.compose(pos, q, sc);
    pillars.setMatrixAt(i, m4);
  }
  pillars.instanceMatrix.needsUpdate = true;
  scene.add(pillars);

  // Landmarks: comms tower (with blinking beacon) and the glass spire.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 5, 90, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6, metalness: 0.4 }),
  );
  tower.position.set(layout.landmarks.tower.x, 45, layout.landmarks.tower.z);
  scene.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }),
  );
  beacon.position.set(layout.landmarks.tower.x, 92, layout.landmarks.tower.z);
  scene.add(beacon);
  const spire = new THREE.Mesh(
    new THREE.BoxGeometry(34, 130, 34),
    new THREE.MeshStandardMaterial({ color: 0x3d5a74, roughness: 0.25, metalness: 0.55, emissive: 0x0a1a28, emissiveIntensity: 0.5 }),
  );
  spire.position.set(layout.landmarks.spire.x, 65, layout.landmarks.spire.z);
  scene.add(spire);

  // Rain: points falling in a box around the focus.
  const rainCount = CONFIG.rain.count;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  const rainVel = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * CONFIG.rain.area;
    rainPos[i * 3 + 1] = Math.random() * 120;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.rain.area;
    rainVel[i] = CONFIG.rain.speed * (0.7 + Math.random() * 0.6);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9fb6cc, size: 0.55, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  scene.add(rain);

  let boltTimer = CONFIG.lightning.minGap + Math.random() * 8;
  let flashLeft = 0;
  let waterLevel = -2.2;

  return {
    scene,
    groundHeight,
    collide: (x, z, r) => collideCircle(layout.colliders, x, z, r),
    setWaterLevel(h) {
      waterLevel = h;
      channelWater.position.y = h;
    },
    get waterLevel() { return waterLevel; },
    update(dt, focus) {
      // Rain falls around the focus point.
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < rainCount; i++) {
        arr[i * 3 + 1] -= rainVel[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3] = focus.x + (Math.random() - 0.5) * CONFIG.rain.area;
          arr[i * 3 + 1] = 100 + Math.random() * 20;
          arr[i * 3 + 2] = focus.z + (Math.random() - 0.5) * CONFIG.rain.area;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(0, 0, 0);
      // Lightning.
      boltTimer -= dt;
      if (boltTimer <= 0) {
        boltTimer = CONFIG.lightning.minGap + Math.random() * (CONFIG.lightning.maxGap - CONFIG.lightning.minGap);
        flashLeft = CONFIG.lightning.flashMs / 1000;
        if (hooks.onLightning) hooks.onLightning();
      }
      if (flashLeft > 0) {
        flashLeft -= dt;
        flash.intensity = 2.6 * clamp(flashLeft / (CONFIG.lightning.flashMs / 1000), 0, 1);
      } else {
        flash.intensity = 0;
      }
      // Beacon blink.
      const blink = (performance.now() / 700) % 2 < 1;
      beacon.material.emissiveIntensity = blink ? 2.5 : 0.2;
    },
  };
}

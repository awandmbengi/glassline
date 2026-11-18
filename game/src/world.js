// Veyra, built in Three.js from the city layout: painted ground,
// instanced buildings and streetlights, dam and reservoir, overpass,
// rain and lightning. All art is procedural — no image files.
import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { groundHeight, collideCircle } from './city.js';

const W = CONFIG.world;
const P = CONFIG.palette;

// Paint the whole city plan onto one big canvas: blocks, roads,
// lane dashes, the flood channel, the reservoir and the overpass.
function paintGroundCanvas(layout) {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const px = (v) => ((v + W.half) / W.size) * S;
  const pxLen = (v) => (v / W.size) * S;

  ctx.fillStyle = '#232a30';
  ctx.fillRect(0, 0, S, S);

  // City blocks in slightly varied shades of asphalt.
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let bx = -W.half; bx < W.half; bx += W.roadGap) {
    for (let bz = -W.half; bz < W.half; bz += W.roadGap) {
      const shade = 34 + Math.floor(nextRand() * 10);
      ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 8})`;
      ctx.fillRect(
        px(bx + W.roadWidth / 2), px(bz + W.roadWidth / 2),
        pxLen(W.block), pxLen(W.block),
      );
    }
  }

  // Flood channel across the south, reservoir east of the dam.
  ctx.fillStyle = '#152630';
  ctx.fillRect(px(-520), px(-500), pxLen(1040), pxLen(60));
  ctx.fillStyle = '#12283e';
  ctx.fillRect(px(W.damX), 0, S - px(W.damX), S);

  // Roads as darker strips, one per grid line in each direction.
  ctx.fillStyle = '#181d21';
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    ctx.fillRect(px(v - W.roadWidth / 2), 0, pxLen(W.roadWidth), S);
    ctx.fillRect(0, px(v - W.roadWidth / 2), S, pxLen(W.roadWidth));
  }

  // Amber dashed centre lines on every avenue.
  ctx.fillStyle = '#d8a13c';
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    for (let d = -W.half; d < W.half; d += 24) {
      ctx.fillRect(px(v) - 2, px(d), 4, 12);
      ctx.fillRect(px(d), px(v) - 2, 12, 4);
    }
  }

  // Overpass deck strip.
  ctx.fillStyle = '#20262c';
  ctx.fillRect(px(-420), px(-252), pxLen(840), pxLen(24));

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One small facade texture, tiled across every building: dark concrete
// with a grid of windows, about two in five lit amber.
function paintFacadeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2c3844';
  ctx.fillRect(0, 0, 128, 256);
  let seed = 7;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      const lit = nextRand() < 0.42;
      ctx.fillStyle = lit
        ? (nextRand() < 0.75 ? '#ffb347' : '#ffd9a0')
        : '#141d28';
      ctx.fillRect(x, y, 8, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(layout, hooks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 120, 900);

  // Dusk lighting: soft hemisphere, cold moon, and a flash light
  // that stays dark until lightning strikes.
  const hemi = new THREE.HemisphereLight(0x8fa8c0, 0x1a2027, 0.75);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xbfd4e6, 0.9);
  moon.position.set(-300, 500, -200);
  scene.add(moon);
  const flash = new THREE.DirectionalLight(0xdfeaff, 0);
  flash.position.set(200, 400, 300);
  scene.add(flash);

  // Ground plane carrying the painted city plan.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W.size, W.size),
    new THREE.MeshStandardMaterial({
      map: paintGroundCanvas(layout), roughness: 0.92, metalness: 0.05,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Every building is one instance of a unit box whose base sits at y=0.
  const facade = paintFacadeCanvas();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const boxMat = new THREE.MeshStandardMaterial({
    map: facade, roughness: 0.85, metalness: 0.1,
  });
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, layout.buildings.length);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tint = new THREE.Color();
  layout.buildings.forEach((b, i) => {
    pos.set(b.x, groundHeight(b.x, b.z), b.z);
    scale.set(b.w, b.h, b.d);
    m4.compose(pos, quat, scale);
    buildings.setMatrixAt(i, m4);
    // Downtown towers catch more light; stilt houses sit in shadow.
    const t = b.district === 'downtown' ? 0.9 + (i % 5) * 0.05
      : b.district === 'stilt' ? 0.75 : 0.85;
    tint.setRGB(t, t * 1.02, t * 1.08);
    buildings.setColorAt(i, tint);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Streetlights: a pole and a glowing amber lamp on both sides of
  // every avenue, one pair every 60 metres.
  const lampSpots = [];
  for (let v = -W.half; v <= W.half; v += W.roadGap) {
    for (let d = -W.half + 30; d < W.half; d += 60) {
      lampSpots.push([v + W.roadWidth / 2 + 2, d]);
      lampSpots.push([d, v + W.roadWidth / 2 + 2]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30383f, roughness: 0.7 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x443311, emissive: P.amber, emissiveIntensity: 1.6,
  });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    const y = groundHeight(x, z);
    pos.set(x, y + 3.5, z);
    scale.set(1, 1, 1);
    m4.compose(pos, quat, scale);
    poles.setMatrixAt(i, m4);
    pos.set(x, y + 7, z);
    m4.compose(pos, quat, scale);
    lamps.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(lamps);

  // The dam wall and the reservoir water held back behind it.
  const dam = new THREE.Mesh(
    new THREE.BoxGeometry(16, 46, W.size),
    new THREE.MeshStandardMaterial({ color: P.dam, roughness: 0.9 }),
  );
  dam.position.set(W.damX + 8, 20, 0);
  scene.add(dam);
  const reservoir = new THREE.Mesh(
    new THREE.PlaneGeometry(W.size - W.damX - 16, W.size),
    new THREE.MeshStandardMaterial({
      color: P.water, roughness: 0.25, metalness: 0.4,
      transparent: true, opacity: 0.9,
    }),
  );
  reservoir.rotation.x = -Math.PI / 2;
  reservoir.position.set(
    W.damX + 16 + (W.size - W.damX - 16) / 2, 1.2, 0,
  );
  scene.add(reservoir);

  // Water sitting in the southern flood channel.
  const channelWater = new THREE.Mesh(
    new THREE.PlaneGeometry(1040, 60),
    new THREE.MeshStandardMaterial({
      color: 0x14324a, roughness: 0.3, metalness: 0.3,
      transparent: true, opacity: 0.85,
    }),
  );
  channelWater.rotation.x = -Math.PI / 2;
  channelWater.position.set(0, -2.2, -470);
  scene.add(channelWater);

  // Overpass: deck slab plus a row of pillars underneath.
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
    pos.set(-420 + i * 60, 8.5, -240);
    scale.set(1, 1, 1);
    m4.compose(pos, quat, scale);
    pillars.setMatrixAt(i, m4);
  }
  pillars.instanceMatrix.needsUpdate = true;
  scene.add(pillars);

  // Landmarks: the comms tower with its red beacon, and the glass spire.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 5, 90, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6, metalness: 0.4 }),
  );
  tower.position.set(layout.landmarks.tower.x, 45, layout.landmarks.tower.z);
  scene.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2,
    }),
  );
  beacon.position.set(layout.landmarks.tower.x, 92, layout.landmarks.tower.z);
  scene.add(beacon);
  const spire = new THREE.Mesh(
    new THREE.BoxGeometry(34, 130, 34),
    new THREE.MeshStandardMaterial({
      color: 0x3d5a74, roughness: 0.25, metalness: 0.55,
      emissive: 0x0a1a28, emissiveIntensity: 0.5,
    }),
  );
  spire.position.set(layout.landmarks.spire.x, 65, layout.landmarks.spire.z);
  scene.add(spire);

  // Rain: a cloud of points falling in a box around the focus; each
  // drop falls at its own speed and respawns at the top when it lands.
  const rainCount = CONFIG.rain.count;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  const rainSpeed = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * CONFIG.rain.area;
    rainPos[i * 3 + 1] = Math.random() * 120;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.rain.area;
    rainSpeed[i] = CONFIG.rain.speed * (0.7 + Math.random() * 0.6);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9fb6cc, size: 0.55, transparent: true, opacity: 0.55,
    sizeAttenuation: true,
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
      // Rain falls; drops that hit the ground respawn above the focus.
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < rainCount; i++) {
        arr[i * 3 + 1] -= rainSpeed[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3] = focus.x + (Math.random() - 0.5) * CONFIG.rain.area;
          arr[i * 3 + 1] = 100 + Math.random() * 20;
          arr[i * 3 + 2] = focus.z + (Math.random() - 0.5) * CONFIG.rain.area;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;

      // Lightning: wait a random gap, flash, then fade the light out.
      boltTimer -= dt;
      if (boltTimer <= 0) {
        boltTimer = CONFIG.lightning.minGap
          + Math.random() * (CONFIG.lightning.maxGap - CONFIG.lightning.minGap);
        flashLeft = CONFIG.lightning.flashMs / 1000;
        if (hooks.onLightning) hooks.onLightning();
      }
      if (flashLeft > 0) {
        flashLeft -= dt;
        flash.intensity = 2.6 * clamp(
          flashLeft / (CONFIG.lightning.flashMs / 1000), 0, 1,
        );
      } else {
        flash.intensity = 0;
      }

      // Tower beacon blinks on a ~1.4s cycle.
      const on = (performance.now() / 700) % 2 < 1;
      beacon.material.emissiveIntensity = on ? 2.5 : 0.2;
    },
  };
}

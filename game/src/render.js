// Drawing only: the world's state in, pixels out. three.js, vendored under
// game/vendor/. The city is built once from the world's building list; cars,
// pedestrians, the player, Mara and the helicopter are small groups synced from
// state each frame. Rain is a point cloud whose positions are a pure function of
// time, so the screenshot scenes are repeatable.
import * as THREE from 'three';
import { CITY, PLACES } from './config.js';
import { groundHeight } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const RAIN_COUNT = 1400;

function canvasTexture(size, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  painter(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function groundTexture() {
  return canvasTexture(1024, (g, s) => {
    const to = (v) => ((v + 180) / 360) * s;
    g.fillStyle = '#252c38';
    g.fillRect(0, 0, s, s);
    // Block interiors, slightly varied.
    for (let bx = -150; bx <= 150; bx += 60) {
      for (let bz = -150; bz <= 150; bz += 60) {
        g.fillStyle = (bx + bz) % 120 === 0 ? '#272e3a' : '#232a35';
        g.fillRect(to(bx - 24), to(bz - 24), to(48) - to(0), to(48) - to(0));
      }
    }
    // Sidewalks (lighter strips along every road).
    g.fillStyle = '#39424f';
    for (const r of CITY.roads) {
      g.fillRect(0, to(r - 9), s, to(18) - to(0));
      g.fillRect(to(r - 9), 0, to(18) - to(0), s);
    }
    // Road surface.
    g.fillStyle = '#171d27';
    for (const r of CITY.roads) {
      g.fillRect(0, to(r - 6), s, to(12) - to(0));
      g.fillRect(to(r - 6), 0, to(12) - to(0), s);
    }
    // Dashed centre lines.
    g.fillStyle = '#c8a24a';
    for (const r of CITY.roads) {
      for (let v = -174; v < 180; v += 12) {
        g.fillRect(to(v), to(r - 0.4), to(6) - to(0), to(0.8) - to(0));
        g.fillRect(to(r - 0.4), to(v), to(0.8) - to(0), to(6) - to(0));
      }
    }
    // Flood channel (sunken road, south-west).
    g.fillStyle = '#141c26';
    g.fillRect(to(-150), to(108), to(60) - to(0), to(24) - to(0));
    g.fillStyle = '#1d2f42';
    g.fillRect(to(-150), to(116), to(60) - to(0), to(8) - to(0));
    // Dam apron at the north edge.
    g.fillStyle = '#2c3440';
    g.fillRect(0, to(-195), s, to(15) - to(0));
  });
}

function windowTexture(style, seed) {
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return canvasTexture(128, (g, s) => {
    g.fillStyle = style === 'tower' ? '#2b3648' : style === 'stilt' ? '#4a3a28' : '#33302a';
    g.fillRect(0, 0, s, s);
    const cols = style === 'tower' ? 8 : 5;
    const rows = style === 'tower' ? 16 : 4;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const lit = rnd() < 0.55;
        g.fillStyle = lit ? (rnd() < 0.7 ? '#ffb84d' : '#9fd8ff') : '#12161f';
        g.fillRect(6 + c * ((s - 12) / cols), 6 + r * ((s - 12) / rows), (s - 12) / cols - 4, (s - 12) / rows - 4);
      }
    }
  });
}

function makeCarMesh(car) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: car.color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x0e1a24 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(car.width, 0.75, car.length), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(car.width * 0.85, 0.6, car.length * 0.45), glassMat);
  cabin.position.set(0, 1.15, -car.length * 0.05);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set((wx * car.width) / 2, 0.36, (wz * car.length) / 2.8);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), headMat);
    head.position.set(sx * (car.width / 2 - 0.35), 0.55, car.length / 2 + 0.01);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xc22a1e });
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), tailMat);
    tail.position.set(sx * (car.width / 2 - 0.35), 0.6, -car.length / 2 - 0.01);
    group.add(tail);
  }
  if (car.kind === 'patrol') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.55, 0);
    bar.name = 'lightbar';
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(-0.3, 1.55, 0);
    bar2.name = 'lightbar-red';
    group.add(bar2);
  }
  group.userData = { wheels, kind: car.kind };
  return group;
}

function makePersonMesh(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), mat);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a077 }));
  head.position.y = 1.65;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1c222c });
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), legMat);
    leg.position.set(sx * 0.14, 0.35, 0);
    group.add(leg);
    legs.push(leg);
  }
  group.userData = { legs };
  return group;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.FogExp2(0x0b1220, 0.0038);

  const hemi = new THREE.HemisphereLight(0x8fb0d8, 0x1a2029, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xaac4e8, 1.1);
  moon.position.set(-60, 120, -40);
  scene.add(moon);
  const amber = new THREE.DirectionalLight(0xffb84d, 0.25);
  amber.position.set(80, 40, 80);
  scene.add(amber);

  // Ground with the painted road grid.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Buildings, one mesh each, with procedural window textures.
  const texTower = windowTexture('tower', 11);
  const texStilt = windowTexture('stilt', 23);
  const texWare = windowTexture('warehouse', 37);
  const buildingMats = {
    tower: new THREE.MeshLambertMaterial({ map: texTower, emissive: 0xffffff, emissiveMap: texTower, emissiveIntensity: 0.55 }),
    stilt: new THREE.MeshLambertMaterial({ map: texStilt, emissive: 0xffffff, emissiveMap: texStilt, emissiveIntensity: 0.45 }),
    warehouse: new THREE.MeshLambertMaterial({ map: texWare, emissive: 0xffffff, emissiveMap: texWare, emissiveIntensity: 0.35 }),
    industrial: new THREE.MeshLambertMaterial({ map: texWare, emissive: 0xffffff, emissiveMap: texWare, emissiveIntensity: 0.35 }),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of world.buildings) {
    const mesh = new THREE.Mesh(boxGeo, buildingMats[b.style] || buildingMats.tower);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    scene.add(mesh);
    if (b.style === 'tower' && b.h > 55) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      beacon.position.set(b.x, b.h + 1, b.z);
      scene.add(beacon);
    }
  }

  // Comms tower: a tall mast with a blinking tip at the mission plaza.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 70, 8), new THREE.MeshLambertMaterial({ color: 0x5a6b7a }));
  mast.position.set(PLACES.commsTower.x, 35, PLACES.commsTower.z);
  scene.add(mast);
  const mastTip = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  mastTip.position.set(PLACES.commsTower.x, 71, PLACES.commsTower.z);
  scene.add(mastTip);

  // The dam: a huge concrete wall across the north edge, with spillway stripes.
  const dam = new THREE.Mesh(
    new THREE.BoxGeometry(380, 42, 16),
    new THREE.MeshLambertMaterial({ color: 0x3a4552 }),
  );
  dam.position.set(0, 21, CITY.damZ);
  scene.add(dam);
  for (let x = -150; x <= 150; x += 30) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8, 30, 0.5), new THREE.MeshLambertMaterial({ color: 0x2a333f }));
    stripe.position.set(x, 15, CITY.damZ + 8.2);
    scene.add(stripe);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
    lamp.position.set(x, 43, CITY.damZ + 8);
    scene.add(lamp);
  }
  // The reservoir behind the dam.
  const reservoir = new THREE.Mesh(
    new THREE.PlaneGeometry(380, 140),
    new THREE.MeshLambertMaterial({ color: 0x14324a }),
  );
  reservoir.rotation.x = -Math.PI / 2;
  reservoir.position.set(0, -1, CITY.damZ - 78);
  scene.add(reservoir);

  // Kestrel overpass: deck, barriers, pillars, ramps.
  const op = CITY.overpass;
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x1d232e });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(240, 0.8, op.halfWidth * 2), deckMat);
  deck.position.set(0, op.deck - 0.4, 0);
  scene.add(deck);
  const barrierMat = new THREE.MeshLambertMaterial({ color: 0x39424f });
  for (const sz of [-1, 1]) {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(240, 1.1, 0.4), barrierMat);
    barrier.position.set(0, op.deck + 0.5, sz * (op.halfWidth - 0.2));
    scene.add(barrier);
  }
  for (let x = -110; x <= 110; x += 22) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, op.deck, 2), barrierMat);
    pillar.position.set(x, op.deck / 2, 0);
    scene.add(pillar);
  }
  for (const sx of [-1, 1]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, op.halfWidth * 2), deckMat);
    ramp.position.set(sx * 135, op.deck / 2 - 0.4, 0);
    ramp.rotation.z = sx * Math.atan2(op.deck, 30);
    scene.add(ramp);
  }

  // Flood channel: walls and the water plane that rises during mission 6.
  const ch = CITY.channel;
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2c3644 });
  for (const sz of [ch.z0, ch.z1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ch.x1 - ch.x0 + 20, 3.5, 1), wallMat);
    wall.position.set((ch.x0 + ch.x1) / 2, -0.4, sz);
    scene.add(wall);
  }
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(ch.x1 - ch.x0 + 20, ch.z1 - ch.z0),
    new THREE.MeshLambertMaterial({ color: 0x1d4a66, transparent: true, opacity: 0.85 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((ch.x0 + ch.x1) / 2, -2.8, (ch.z0 + ch.z1) / 2);
  scene.add(water);

  // Street lamps: instanced poles + emissive heads along the roads.
  const lampPositions = [];
  for (const r of CITY.roads) {
    for (let v = -150; v <= 150; v += 30) {
      lampPositions.push([r + 8, v]);
      lampPositions.push([v, r + 8]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3440 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const headGeo = new THREE.BoxGeometry(0.9, 0.25, 0.35);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffb84d });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach(([x, z], i) => {
    m4.makeTranslation(x, groundHeight(x, z) + 3, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, groundHeight(x, z) + 6.1, z);
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // Rain: positions are a pure function of time, so staged shots repeat.
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fb8d8, size: 0.35, transparent: true, opacity: 0.55 }));
  rain.frustumCulled = false;
  scene.add(rain);
  const rainSeed = [];
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    rainSeed.push([(i * 37.13) % 120, (i * 91.7) % 60, (i * 53.29) % 120]);
  }

  // Mission beacons: a light pillar + a bobbing diamond, one per marker.
  const beacons = [];
  for (let i = 0; i < 3; i += 1) {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 30;
    group.add(pillar);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
    diamond.position.y = 8;
    diamond.name = 'diamond';
    group.add(diamond);
    group.visible = false;
    scene.add(group);
    beacons.push(group);
  }

  // Helicopter: body, tail, spinning rotor, spotlight.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
  heli.add(heliBody);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
  heliTail.position.set(0, 0.3, -4);
  heli.add(heliTail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  heli.add(rotor);
  const spot = new THREE.SpotLight(0xfff2c0, 0, 120, 0.35, 0.5, 1.2);
  heli.add(spot);
  const spotTarget = new THREE.Object3D();
  scene.add(spotTarget);
  spot.target = spotTarget;
  heli.visible = false;
  scene.add(heli);

  // The player (Nara, amber jacket), Mara (teal coat), and the pedestrians.
  const playerMesh = makePersonMesh(0xd88a1e);
  scene.add(playerMesh);
  const maraMesh = makePersonMesh(0x2e8a7a);
  scene.add(maraMesh);
  const carMeshes = new Map();
  const pedMeshes = new Map();

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  let shotCamera = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function syncCar(car) {
    let mesh = carMeshes.get(car);
    if (!mesh) {
      mesh = makeCarMesh(car);
      carMeshes.set(car, mesh);
      scene.add(mesh);
    }
    mesh.position.set(car.x, car.y, car.z);
    mesh.rotation.y = car.heading;
    const spin = car.speed * 0.016;
    for (const wheel of mesh.userData.wheels) wheel.rotation.x += spin;
    const bar = mesh.getObjectByName('lightbar');
    if (bar) bar.material.color.setHex(Math.floor(world.time * 4) % 2 === 0 ? 0x2244ff : 0xff2222);
    mesh.visible = car.active !== false;
    return mesh;
  }

  function syncPerson(mesh, x, y, z, heading, walking, time) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = heading;
    const swing = walking ? Math.sin(time * 9) * 0.5 : 0;
    mesh.userData.legs[0].rotation.x = swing;
    mesh.userData.legs[1].rotation.x = -swing;
  }

  function updateRain(time, cx, cz) {
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      const [sx, sy, sz] = rainSeed[i];
      const fall = (sy + time * 55) % 60;
      pos[i * 3] = cx + ((sx + time * 4) % 120) - 60;
      pos[i * 3 + 1] = 55 - fall;
      pos[i * 3 + 2] = cz + ((sz + time * 2) % 120) - 60;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function chaseCamera() {
    const p = world.player;
    const dist = p.car ? 11 : 7.5;
    const height = p.car ? 4.5 : 3.2;
    const yaw = world.cameraYaw;
    const cx = p.x - Math.sin(yaw) * dist;
    const cz = p.z - Math.cos(yaw) * dist;
    const cy = p.y + height;
    camera.position.x += (cx - camera.position.x) * 0.18;
    camera.position.y += (cy - camera.position.y) * 0.18;
    camera.position.z += (cz - camera.position.z) * 0.18;
    camera.lookAt(p.x + Math.sin(yaw) * 4, p.y + 1.5, p.z + Math.cos(yaw) * 4);
  }

  function draw(screen) {
    const p = world.player;
    const t = world.time;
    // Sync cars.
    const seen = new Set();
    for (const car of world.cars) {
      if (car.active === false) continue;
      seen.add(car);
      syncCar(car);
    }
    for (const [car, mesh] of carMeshes) {
      if (!seen.has(car)) {
        scene.remove(mesh);
        carMeshes.delete(car);
      }
    }
    // Sync pedestrians.
    const seenPeds = new Set();
    for (const ped of world.peds) {
      if (!ped.active) continue;
      seenPeds.add(ped);
      let mesh = pedMeshes.get(ped);
      if (!mesh) {
        mesh = makePersonMesh(ped.color);
        pedMeshes.set(ped, mesh);
        scene.add(mesh);
      }
      if (ped.state === 'down') {
        mesh.position.set(ped.x, ped.y + 0.3, ped.z);
        mesh.rotation.set(-Math.PI / 2, ped.heading, 0);
      } else {
        mesh.rotation.set(0, 0, 0);
        syncPerson(mesh, ped.x, ped.y, ped.z, ped.heading, ped.state !== 'walk' || true, t);
      }
      mesh.visible = true;
    }
    for (const [ped, mesh] of pedMeshes) {
      if (!seenPeds.has(ped)) {
        scene.remove(mesh);
        pedMeshes.delete(ped);
      }
    }
    // Player + Mara.
    playerMesh.visible = p.onFoot;
    if (p.onFoot) syncPerson(playerMesh, p.x, p.y, p.z, p.heading, true, t);
    const mara = world.mara;
    maraMesh.visible = mara.state === 'waiting' || mara.state === 'walking';
    if (maraMesh.visible) syncPerson(maraMesh, mara.x, groundHeight(mara.x, mara.z), mara.z, p.heading, mara.state === 'walking', t);
    // Helicopter.
    const h = world.police.heli;
    heli.visible = h.active;
    if (h.active) {
      heli.position.set(h.x, h.y, h.z);
      heli.rotation.y = h.heading;
      const rotorMesh = heli.getObjectByName('rotor');
      if (rotorMesh) rotorMesh.rotation.y += 0.9;
      spot.intensity = 900;
      spotTarget.position.set(p.x, p.y, p.z);
    } else {
      spot.intensity = 0;
    }
    // Beacons.
    const markers = world.marker || [];
    beacons.forEach((group, i) => {
      if (i < markers.length) {
        group.visible = true;
        group.position.set(markers[i].x, groundHeight(markers[i].x, markers[i].z), markers[i].z);
        const diamond = group.getObjectByName('diamond');
        if (diamond) {
          diamond.position.y = 8 + Math.sin(t * 2 + i) * 0.8;
          diamond.rotation.y += 0.03;
        }
      } else {
        group.visible = false;
      }
    });
    // Flood water rises with the mission timer.
    water.position.y = -2.8 + world.waterLevel * 2.2;
    // Lightning flash.
    moon.intensity = 1.1 + world.lightning * 6;
    hemi.intensity = 0.9 + world.lightning * 2;
    // Rain follows the player.
    updateRain(t, p.x, p.z);
    // Camera.
    if (shotCamera) {
      camera.position.set(shotCamera.x, shotCamera.y, shotCamera.z);
      camera.lookAt(shotCamera.lx, shotCamera.ly, shotCamera.lz);
    } else if (screen === SCREEN_TITLE) {
      const a = t * 0.05;
      camera.position.set(Math.sin(a) * 170, 70, Math.cos(a) * 170 - 20);
      camera.lookAt(0, 10, -60);
    } else {
      chaseCamera();
    }
    renderer.render(scene, camera);
  }

  return {
    draw,
    setShotCamera(cam) {
      shotCamera = cam;
    },
    clearShotCamera() {
      shotCamera = null;
    },
  };
}

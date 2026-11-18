// Renderer + chase camera. Third-person camera with smoothing and a
// mouse-drag orbit offset; a wider, higher shot for the deterministic
// screenshot scenes. Handles resize, pixel ratio and WebGL failure.
import * as THREE from 'three';
import { clamp, angleLerp } from './config.js';

export function createRenderer(canvas) {
  let renderer = null;
  let failed = false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    failed = true;
  }
  if (!renderer) failed = true;
  if (!failed) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  let orbit = 0;
  let camPos = new THREE.Vector3(0, 10, -14);
  let camLook = new THREE.Vector3();

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    get renderer() { return renderer; },
    get camera() { return camera; },
    get failed() { return failed; },
    get orbit() { return orbit; },
    resize,
    addOrbit(d) { orbit = clamp(orbit + d * 0.003, -0.9, 0.9); },
    resetOrbit() { orbit = 0; },
    // Chase camera: behind the player (or the car), smoothed.
    follow(player, dt) {
      const yaw = player.heading + Math.PI + orbit;
      const dist = player.car ? 13 : 8;
      const height = player.car ? 5.2 : 4.2;
      const tx = player.x - Math.sin(yaw) * dist;
      const tz = player.z - Math.cos(yaw) * dist;
      const ty = player.y + height;
      const k = 1 - Math.pow(0.0001, dt);
      camPos.x += (tx - camPos.x) * k;
      camPos.y += (ty - camPos.y) * k;
      camPos.z += (tz - camPos.z) * k;
      camLook.set(player.x, player.y + 1.6, player.z);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    },
    // Fixed cinematic camera for a screenshot scene.
    place(x, y, z, lx, ly, lz) {
      camPos.set(x, y, z);
      camLook.set(lx, ly, lz);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    },
    render(scene) {
      if (renderer) renderer.render(scene, camera);
    },
    snapshot(scene) {
      if (!renderer || !scene) return null;
      renderer.render(scene, camera);
      return canvas.toDataURL('image/jpeg', 0.85);
    },
  };
}

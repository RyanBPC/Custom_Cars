/* 3D spin view (phase 1 test): drag, keys or buttons to turn the car all the way round.
   This is an ES module (three.js needs it), so it only runs when the site is opened with start.bat.
   The rest of the site talks to it only through window.Viewer3D (see the bottom of this file). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import { WebGLPathTracer, DenoiseMaterial } from "three-gpu-pathtracer";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { STANDIN_FIT, measureWheels, updateAddons, lowFor } from "./addons3d.js";
import { fitWheels } from "./wheels3d.js";
import { addBadges } from "./badges3d.js";

const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY_TURN = THREE.MathUtils.degToRad(15);
const KEY_TILT = THREE.MathUtils.degToRad(10);
const OUTSIDE_LIMITS = { minPolarAngle: THREE.MathUtils.degToRad(5), maxPolarAngle: THREE.MathUtils.degToRad(88), minDistance: 4.2, maxDistance: 14 };

let renderer, scene, camera, controls, container, stockCar, buildCar, frameQueued = false, looping = false, dragging = false;
let split = 0.5; // where the stock/build divider is, from 0 (all build) to 1 (all stock)
let currentCarId = null, loadToken = 0, lastBuild = null, lastStock = null;
let mode3d = "360";
try { mode3d = localStorage.getItem("customizacions.mode3d") || "360"; } catch (e) {}
let pmrem, studioEnv, floor, contactShadow, sun, shadowCatcher, plate = null, carYaw = 0, plateDist = 1, skybox = null, envId = "photo", envToken = 0, envList = null;
const envCache = {}; // setting id -> Promise of { envMap, background }
const modelCache = {}; // car id -> Promise of { gltf, manifest }, or null when there's no real model yet

/* ---------- materials for the "finishes" a wrap can have ---------- */
function paintSettings(finish) {
  switch (finish) {
    // Rough finishes spread bright lights (street lamps, the sun) over the whole panel, which can wash a matte
    // colour out to white at night, so they reflect less (specularIntensity) the rougher they are.
    case "matte": return { roughness: 0.62, metalness: 0.0, clearcoat: 0, clearcoatRoughness: 0, specularIntensity: 0.25 };
    case "satin": return { roughness: 0.45, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.4, specularIntensity: 0.6 };
    case "chrome": return { roughness: 0.05, metalness: 1.0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 };
    // Metallic and pearl: tiny flakes under a smooth clear coat glint in the light (flakes), and pearl
    // shifts colour gently along curved panels (iridescence), like real Kings Red or Moonstone Grey.
    case "metallic": return { roughness: 0.38, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, flakes: true };
    case "pearl": return { roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, flakes: true, iridescence: 0.45 };
    // Colour-shift (chameleon) film: strong iridescence over a metallic base, so the colour swings along the panels.
    case "chameleon": return { roughness: 0.22, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, flakes: true, iridescence: 1 };
    // Brushed metal film: metallic with fine streaks (brushed normal map), no clear coat.
    case "brushed": return { roughness: 0.28, metalness: 0.92, clearcoat: 0, clearcoatRoughness: 0, specularIntensity: 1, brushed: true };
    // Carbon-look film: the weave picture under a gloss clear coat.
    case "carbon": return { roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, weave: true };
    default: return { roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1 }; // gloss
  }
}

// A fine random bumpy texture, made once, used as the metal flakes in metallic and pearl paint.
let flakeTex = null;
function flakeTexture() {
  if (flakeTex) return flakeTex;
  const n = 256, cv = document.createElement("canvas"); cv.width = cv.height = n;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    img.data[i * 4] = 128 + (Math.random() - 0.5) * 200; img.data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 200;
    img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  flakeTex = new THREE.CanvasTexture(cv);
  flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping; flakeTex.repeat.set(30, 30);
  return flakeTex;
}
// Carbon weave (for carbon-look wraps) and fine brushed streaks (a normal map for brushed metal), made once.
let weaveTex = null, brushTex = null;
function weaveTexture() {
  if (weaveTex) return weaveTex;
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + Math.floor(y / 2)) % 2 ? "#3a3e44" : "#16171a"; g.fillRect(x * 8, y * 8, 8, 8); }
  weaveTex = new THREE.CanvasTexture(c); weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(24, 24); weaveTex.colorSpace = THREE.SRGBColorSpace;
  return weaveTex;
}
function brushedTexture() {
  if (brushTex) return brushTex;
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) { const n = ((y * 7919) % 97) / 97 - 0.5; for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4; img.data[i] = 128; img.data[i + 1] = 128 + n * 70; img.data[i + 2] = 255; img.data[i + 3] = 255; } }
  g.putImageData(img, 0, 0);
  brushTex = new THREE.CanvasTexture(c); brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping; brushTex.repeat.set(4, 30);
  return brushTex;
}
function applyPaint(m, colour, finish) {
  const { flakes, brushed, weave, iridescence = 0, ...s } = paintSettings(finish);
  m.color.set(colour); Object.assign(m, s);
  m.iridescence = iridescence; m.iridescenceIOR = finish === "chameleon" ? 1.8 : 1.4; m.iridescenceThicknessRange = finish === "chameleon" ? [150, 900] : [250, 500];
  // Carbon-look: the weave as the paint's picture, tinted by the chosen colour (lightened so the weave shows).
  // Colour-shift: the panel edges turn to a second colour (the hue a third of the way round), so it changes as you walk round.
  if (finish === "chameleon") { const hsl = {}; m.color.getHSL(hsl); m.sheen = 1; m.sheenRoughness = 0.35; m.sheenColor = new THREE.Color().setHSL((hsl.h + 0.33) % 1, 0.9, 0.5); } else m.sheen = 0;
  if (!("ownMap" in m.userData)) m.userData.ownMap = m.map || null;
  if (weave) { m.map = weaveTexture(); m.color.lerp(new THREE.Color(0xffffff), 0.55); } else m.map = m.userData.ownMap;
  // Keep a real model's own normal map, and only swap in the flakes for metallic / pearl.
  if (!("ownNormal" in m.userData)) { m.userData.ownNormal = m.normalMap || null; m.userData.ownNormalScale = m.normalScale.clone(); }
  m.normalMap = flakes ? flakeTexture() : brushed ? brushedTexture() : m.userData.ownNormal;
  if (flakes) m.normalScale.set(0.12, 0.12); else if (brushed) m.normalScale.set(0.25, 0.25); else m.normalScale.copy(m.userData.ownNormalScale);
  m.needsUpdate = true;
}

/* ---------- stand-in car ----------
   Simple shapes, but named like the real models will be (Paint, Glass_Front, Glass_Rear, Lens_Front,
   Lens_Rear, Wheel_FL...), so the same build code will work when real cars arrive. Units: metres. */
function makeStandInCar() {
  const g = new THREE.Group(); g.name = "Car";
  const body = new THREE.Group(); body.name = "Body"; g.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ name: "Paint", color: 0xb5121b, ...paintSettings("gloss") });
  const trim = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 });
  const glassFront = new THREE.MeshPhysicalMaterial({ name: "Glass_Front", color: 0x2a3640, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, clearcoat: 1 });
  const glassRear = glassFront.clone(); glassRear.name = "Glass_Rear";
  const lensFront = new THREE.MeshStandardMaterial({ name: "Lens_Front", color: 0xf2f6ff, emissive: 0xdfe8ff, emissiveIntensity: 0.6, roughness: 0.1 });
  const lensRear = new THREE.MeshStandardMaterial({ name: "Lens_Rear", color: 0xc0161f, emissive: 0x8a0d12, emissiveIntensity: 0.6, roughness: 0.1 });

  const box = (w, h, d, mat, x, y, z, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (name) m.name = name; body.add(m); return m; };
  // Lower body and bonnet (x = length, front is +x), cabin, roof
  box(4.25, 0.55, 1.8, paint, 0, 0.62, 0, "Body_Lower");
  box(1.2, 0.12, 1.7, paint, 1.45, 0.94, 0, "Bonnet");
  // Cabin glass in two parts (front and rear), so the UK rear-only tint can be shown.
  const cabin = (pts, mat, name) => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1]));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false }); geo.translate(0, 0.9, -0.75);
    const m = new THREE.Mesh(geo, mat); m.name = name; body.add(m);
  };
  cabin([[-0.35, 0], [0.85, 0], [0.15, 0.5], [-0.35, 0.5]], glassFront, "Glass_Front");
  cabin([[-1.55, 0.05], [-0.35, 0], [-0.35, 0.5], [-1.2, 0.5]], glassRear, "Glass_Rear");
  box(1.5, 0.06, 1.42, paint, -0.55, 1.42, 0, "Roof");
  // Lights, grille, bumpers
  box(0.06, 0.12, 0.42, lensFront, 2.13, 0.75, 0.6, "Lights_Front"); box(0.06, 0.12, 0.42, lensFront, 2.13, 0.75, -0.6);
  box(0.06, 0.12, 0.45, lensRear, -2.13, 0.8, 0.6, "Lights_Rear"); box(0.06, 0.12, 0.45, lensRear, -2.13, 0.8, -0.6);
  box(0.05, 0.2, 0.7, trim, 2.13, 0.55, 0, "Grille");
  box(4.3, 0.12, 1.84, trim, 0, 0.36, 0, "Sills");

  // Wheels stay on the ground; the body moves down for "lowered".
  const wheelPos = { Wheel_FL: [1.32, 0.9], Wheel_FR: [1.32, -0.9], Wheel_RL: [-1.3, 0.9], Wheel_RR: [-1.3, -0.9] };
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ name: "Rim", color: 0xc9cdd2, metalness: 1, roughness: 0.3 });
  const caliperMat = new THREE.MeshStandardMaterial({ name: "Caliper", color: 0x4a4e54, roughness: 0.4 });
  const wheels = {};
  for (const [name, [x, z]] of Object.entries(wheelPos)) {
    const w = new THREE.Group(); w.name = name; w.position.set(x, 0.33, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 40), tyreMat); tyre.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.25, 32), rimMat); rim.rotation.x = Math.PI / 2; rim.name = "Rim";
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), caliperMat); caliper.name = "Caliper";
    caliper.position.set(0.05, 0.1, z > 0 ? 0.155 : -0.155); // just outside the rim face, so the colour shows
    w.add(tyre, rim, caliper); g.add(w); wheels[name] = { group: w, rim, caliper };
  }
  return { group: g, body, standIn: true, fit: STANDIN_FIT, paints: [paint], glassRear: [glassRear], lensFront: [lensFront], lensRear: [lensRear],
           rims: [rimMat], calipers: [caliperMat], wheels: Object.values(wheels) };
}

// Soft dark shadow under the car (a blurred ellipse is cheap and looks good).
function makeContactShadow() {
  const layer = (w, d, alpha, inner) => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), grd = x.createRadialGradient(64, 64, inner, 64, 64, 64);
    grd.addColorStop(0, `rgba(0,0,0,${alpha})`); grd.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
  };
  const g = new THREE.Group();
  const core = layer(4.9, 2.25, 0.97, 36), soft = layer(7.0, 4.0, 0.6, 8);
  core.position.y = 0.004; soft.position.y = 0.003;
  g.add(soft, core); return g; // a dark core right under the car plus a wide soft edge
}

/* ---------- set-up (only when the 3D view is first opened) ---------- */
function init(el) {
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps paint colours rich (AgX washed red out to pink)
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0; canvas.setAttribute("role", "img");
  container.prepend(canvas);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d232b);
  pmrem = new THREE.PMREMGenerator(renderer);
  studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // studio lighting, no download
  scene.environment = studioEnv;
  floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x2a313a, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  contactShadow = makeContactShadow(); scene.add(contactShadow);
  // A sun that casts a real shadow on the ground; the ground itself is invisible except for the shadow,
  // so in photo settings the shadow falls onto the photo's road.
  sun = new THREE.DirectionalLight(0xffffff, 0); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
  scene.add(sun, sun.target);
  shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.001; shadowCatcher.receiveShadow = true; shadowCatcher.visible = false;
  scene.add(shadowCatcher);

  camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 400); // a natural lens, like the human eye (~50 mm) // far enough to see the whole setting dome (radius 100)
  camera.position.set(5.6, 1.6, 6.0); // standing eye height

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.7, 0);
  controls.enablePan = false;                       // turntable: spin and zoom only
  // Look from anywhere: right over the top (5 degrees from straight down) to just above the ground.
  Object.assign(controls, OUTSIDE_LIMITS);
  controls.enableDamping = !REDUCE_MOTION; controls.dampingFactor = 0.08;
  controls.addEventListener("change", requestRender);
  controls.addEventListener("start", () => { dragging = true; startLoop(); });
  controls.addEventListener("end", () => { dragging = false; });
  controls.update();

  // Two copies of the car in the same spot: the stock one is drawn left of the divider, the build right of it.
  // They start as stand-in shapes; a real model replaces them when one exists for the chosen car.
  setCars(makeStandInCar(), makeStandInCar());

  // If the graphics chip resets (e.g. after the laptop sleeps), say so instead of showing a frozen picture.
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); message("3D paused, it should come back in a moment. If not, refresh the page."); });
  canvas.addEventListener("webglcontextrestored", () => { message(""); requestRender(); }); // three.js reloads its GPU data itself
  canvas.setAttribute("aria-describedby", "spinHint");
  plateDrag(canvas);

  canvas.addEventListener("keydown", e => {
    const k = e.key;
    if (k === "ArrowLeft") turn(-KEY_TURN); else if (k === "ArrowRight") turn(KEY_TURN);
    else if (inside && k === "ArrowUp") tilt(KEY_TILT); else if (inside && k === "ArrowDown") tilt(-KEY_TILT);
    else if (k === "+" || k === "=") zoom(0.85); else if (k === "-" || k === "_") zoom(1.18);
    else if (k === "Home") reset(); else return;
    e.preventDefault();
  });
  new ResizeObserver(resize).observe(container);
  resize();
}

/* ---------- drawing only when something changes (saves battery on laptops) ---------- */
function requestRender() {
  viewMoved();
  if (ptRunning) ptStop();
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => { frameQueued = false; draw(); updateLabel(); });
}
// Draws stock on the left of the divider and the build on the right (like the Drawing view's slider).
const DEBUG = new URLSearchParams(location.search).has("debug");
let debugEl = null, debugFrames = [];
function draw() {
  const t0 = performance.now();
  drawPasses();
  if (DEBUG) showDebug(performance.now() - t0);
}
// Developer readout (add ?debug to the address): draw calls, triangles and time per frame, to check speed.
let lastDrawAt = 0;
function showDebug(ms) {
  if (!debugEl) { debugEl = document.createElement("pre"); debugEl.className = "spin-debug"; container.append(debugEl); }
  // Time between frames while something is moving: ~16.7 ms = 60 fps. (Time inside render() alone only
  // measures handing work to the graphics chip, not how long the chip takes.)
  const now = performance.now(), gap = now - lastDrawAt; lastDrawAt = now;
  if (gap < 150) { debugFrames.push(gap); if (debugFrames.length > 60) debugFrames.shift(); }
  const avg = debugFrames.length ? debugFrames.reduce((a, b) => a + b, 0) / debugFrames.length : 0, i = renderer.info.render;
  debugEl.textContent = `calls ${i.calls}  triangles ${i.triangles.toLocaleString()}  while moving: ${avg ? (1000 / avg).toFixed(0) + " fps (" + avg.toFixed(1) + " ms/frame)" : "drag to measure"}  pixel ratio ${renderer.getPixelRatio()}`;
}
/* The 360° photo was taken from one spot, so it only looks right from there. Keeping the dome centred under
   the camera means buildings and trees never stretch or bend as you orbit or zoom; they behave like distant
   scenery, while the real ground around the car (addGround) stays put. */
function followCamera() { if (skybox) { skybox.position.x = camera.position.x; skybox.position.z = camera.position.z; } }
function drawPasses(w = container.clientWidth, h = container.clientHeight) {
  followCamera();
  const x = Math.round(w * split);
  renderer.info.autoReset = false; renderer.info.reset(); // count both passes together
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, h);
  if (x > 0) { stockCar.group.visible = true; buildCar.group.visible = false; renderer.setScissor(0, 0, x, h); renderer.render(scene, camera); }
  if (x < w) { stockCar.group.visible = false; buildCar.group.visible = true; renderer.setScissor(x, 0, w - x, h); renderer.render(scene, camera); }
  renderer.setScissorTest(false);
}
let lastMessage = "";
function message(text) { lastMessage = text; window.dispatchEvent(new CustomEvent("viewer3d-message", { detail: text })); }
// While dragging and during the short "glide" after letting go, keep updating the controls.
function startLoop() {
  if (looping) return;
  looping = true;
  const tick = () => {
    const moved = controls.update();
    if (moved || dragging) requestAnimationFrame(tick);
    else looping = false;
  };
  requestAnimationFrame(tick);
}
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (plate) placePlateCamera(); else camera.updateProjectionMatrix();
  requestRender();
}

/* ---------- turning by keys and buttons ---------- */
// Use up any leftover "glide" from a drag first, so a button press isn't undone by it.
function settle() {
  controls.enableDamping = false; controls.update(); controls.enableDamping = !REDUCE_MOTION;
}
function turn(rad) {
  if (plate) { setCarYaw(carYaw - rad); return; }
  settle();
  const off = camera.position.clone().sub(controls.target);
  off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
  camera.position.copy(controls.target).add(off);
  controls.update(); requestRender();
}
// Inside the car: look up (+) or down (-). The camera circles a point just ahead of the eyes,
// so looking up means moving the camera a touch lower round that point. Kept within the seat's limits.
function tilt(rad) {
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.phi = THREE.MathUtils.clamp(sph.phi + rad, controls.minPolarAngle, controls.maxPolarAngle);
  camera.position.copy(controls.target).add(off.setFromSpherical(sph));
  controls.update(); requestRender();
}
function zoom(f) {
  if (inside) { camera.fov = THREE.MathUtils.clamp(camera.fov * f, 40, 90); camera.updateProjectionMatrix(); requestRender(); return; }
  if (plate) { plateDist = THREE.MathUtils.clamp(plateDist * f, 0.8, 1.3); placePlateCamera(); requestRender(); return; }
  settle();
  const off = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(off.setLength(len));
  controls.update(); requestRender();
}
function reset() { if (inside) { placeInterior(); return; } if (plate) { setCarYaw(THREE.MathUtils.degToRad(plate.camera.carYaw || 0)); plateDist = 1; placePlateCamera(); requestRender(); return; } settle(); camera.position.set(5.6, 1.6, 6.0); controls.update(); requestRender(); }

// Tells screen-reader users which way the car is facing.
let carName = "car", lastLabel = "";
function angle() {
  if (plate) return Math.round(((THREE.MathUtils.radToDeg(-carYaw) % 360) + 360) % 360);
  const off = camera.position.clone().sub(controls.target);
  return Math.round(((THREE.MathUtils.radToDeg(Math.atan2(off.x, off.z)) % 360) + 360) % 360);
}
function updateLabel() {
  const label = `3D view of the ${carName}, turned ${angle()}°`;
  if (label !== lastLabel) { renderer.domElement.setAttribute("aria-label", label); lastLabel = label; } // only when it changes
}

/* ---------- real car models ----------
   A prepared model (see models/README.md) uses standard names: materials Paint, Glass_Rear, Lens_Front,
   Lens_Rear, Rim, Caliper, and top-level groups Wheel_FL/FR/RL/RR. models/<car>.json says which file to load. */
function loadModel(id, onProgress) {
  if (!(id in modelCache)) {
    modelCache[id] = fetch(`models/${id}.json`).then(r => r.ok ? r.json() : null).then(manifest => {
      if (!manifest) return null; // this car has no prepared model: the stand-in shape is expected
      const progress = e => { if (onProgress && e.lengthComputable && e.total) onProgress(Math.min(100, Math.round(e.loaded / e.total * 100))); };
      return new GLTFLoader().loadAsync(`models/${manifest.file}`, progress).then(gltf => {
        // Left-hand-drive models: mirror just the cabin (dashboard, seats, steering wheel) so it's UK right-hand drive.
        const flip = new THREE.Matrix4().makeScale(1, 1, -1);
        gltf.scene.traverse(o => { if (o.isMesh && (manifest.mirrorCabin || []).includes(o.name)) o.applyMatrix4(flip); });
        return { gltf, manifest };
      });
    }).catch(e => { console.warn("3D model failed to load:", e); return { failed: true }; });
  }
  return modelCache[id];
}

// Makes one copy of a loaded model with its own materials (so stock and build can differ), sharing the
// geometry and textures (so memory doesn't double), and finds the parts the mods change.
function rigFromModel(gltf, manifest = {}) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  gltf.scene.traverse(o => { if (o.isMesh) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) if (o.material[k]) o.material[k].anisotropy = aniso; }); // crisp textures at angles
  const g = gltf.scene.clone(true); g.name = "Car";
  const body = new THREE.Group(); body.name = "Body";
  const rig = { group: g, body, standIn: false, paints: [], glassRear: [], lensFront: [], lensRear: [], rims: [], calipers: [], wheels: [] };
  const lists = { Paint: rig.paints, Glass_Rear: rig.glassRear, Lens_Front: rig.lensFront, Lens_Rear: rig.lensRear, Rim: rig.rims, Caliper: rig.calipers };
  const copies = new Map();
  g.traverse(o => {
    if (!o.isMesh) return;
    o.material = copies.get(o.material) || (() => {
      let c = o.material.clone();
      // Paint needs clear-coat for the gloss / satin / matte / chrome finishes.
      if (o.material.name === "Paint" && !c.isMeshPhysicalMaterial) { const pm = new THREE.MeshPhysicalMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(pm, c); pm.name = "Paint"; c = pm; }
      copies.set(o.material, c);
      if (lists[c.name]) lists[c.name].push(c);
      else if ((manifest.lensRearMats || []).includes(c.name)) rig.lensRear.push(c); // a model's own tail-lamp parts named differently (BMW)
      return c;
    })();
  });
  // Everything that isn't a wheel goes into "Body", which moves down when the car is lowered.
  const wheelNodes = g.children.filter(c => /^Wheel_/.test(c.name));
  for (const c of [...g.children]) if (!wheelNodes.includes(c)) body.add(c);
  g.add(body);
  rig.wheels = wheelNodes.map(group => ({ group }));
  // Make the windows look like real glass (some models' glass looks milky under studio light).
  g.traverse(o => {
    if (o.isMesh && /^Glass_/.test(o.material.name)) {
      Object.assign(o.material, { transparent: true, opacity: 0.45, roughness: 0.02, metalness: 0.1 });
      o.material.color.set(0x1b232b); o.material.depthWrite = false; o.material.needsUpdate = true;
    }
  });
  rig.stock = {
    glassRear: rig.glassRear.map(m => ({ color: m.color.clone(), opacity: m.opacity, transparent: m.transparent })),
    lensFront: rig.lensFront.map(m => m.color.clone()), lensRear: rig.lensRear.map(m => m.color.clone()),
    rims: rig.rims.map(m => m.color.clone()), calipers: rig.calipers.map(m => ({ color: m.color.clone(), map: m.map }))
  };
  return rig;
}

function disposeRig(rig) {
  if (!rig) return;
  scene.remove(rig.group);
  rig.group.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.addon) { o.geometry.dispose(); return; } // add-on materials are shared
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); // materials are per-copy; textures stay cached
    if (rig.standIn) o.geometry.dispose();
  });
}
function setCars(stock, build) {
  ptCarChanged();
  disposeRig(stockCar); disposeRig(buildCar);
  stockCar = stock; buildCar = build;
  for (const r of [stockCar, buildCar]) { r.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); measureWheels(r); r.group.rotation.y = 0; addBeams(r); r.group.rotation.y = carYaw; }
  scene.add(stockCar.group, buildCar.group);
}

// Switches to the chosen car's real model if it has one, otherwise keeps the stand-in shape.
function showCar(id) {
  if (id === currentCarId) return;
  currentCarId = id;
  const token = ++loadToken;
  message("Loading 3D model…");
  let lastPct = -1;
  loadModel(id, pct => { if (token === loadToken && pct !== lastPct) { lastPct = pct; message(`Loading 3D model… ${pct}%`); } }).then(result => {
    if (token !== loadToken) return; // the user picked another car meanwhile
    const failed = !!(result && result.failed), found = failed ? null : result;
    if (failed) {
      const text = "Couldn't load the 3D car, so a simple shape is showing instead. Try reloading the page.";
      message(text);
      setTimeout(() => { if (token === loadToken && lastMessage === text) message(""); }, 8000); // leave any newer message alone
    } else message("");
    if (found) { const a = rigFromModel(found.gltf, found.manifest), b = rigFromModel(found.gltf, found.manifest); a.fit = b.fit = found.manifest.fit || STANDIN_FIT; a.aero = b.aero = found.manifest.aero || null; a.carId = b.carId = id; addBadges(a, found.manifest.badges); addBadges(b, found.manifest.badges); setCars(a, b); }
    else if (!stockCar.standIn) setCars(makeStandInCar(), makeStandInCar());
    window.dispatchEvent(new CustomEvent("viewer3d-model", {
      detail: found ? { standIn: false, credit: found.manifest.credit, notShown: found.manifest.notShown || [] } : { standIn: true }
    }));
    if (lastBuild) applyBuild(lastBuild, lastStock);
  });
}

/* ---------- applying the build ---------- */
function applyBuild(b, stock) {
  ptCarChanged();
  lastBuild = b; lastStock = stock;
  carName = b.name;
  if (b.id && b.id !== currentCarId) showCar(b.id);
  applyTo(buildCar, b); applyTo(stockCar, stock || b);
  requestRender();
}
const TINT_OPACITY = { 5: 0.97, 20: 0.93, 35: 0.85, 50: 0.75, 70: 0.62 };
function applyTo(p, b) {
  applyBase(p, b);
  // Add-on parts and paint effects go on after the base colours (chrome wheels override the rim colour).
  p.body.position.y += updateAddons(p, b.addons || null, p.fit || STANDIN_FIT);
  applyLights(p, b);
  // Real aftermarket wheels (modelled rims at the chosen size, with a tyre to fit); the car's own otherwise.
  const chrome = !!(b.addons && b.addons.extras.includes("Chrome wheel finish"));
  const low = b.addons && b.addons.extras.includes("Low-profile tyres") ? lowFor((b.addons.extraText || {})["Low-profile tyres"] || "") : 0;
  fitWheels(p, b.wheelsChanged && b.wheelStyle ? { style: b.wheelStyle.replace(/-/g, ""), inch: b.wheelIn, colour: b.rimColour, chrome: chrome || b.rimFinish === "chrome",
    matte: b.rimFinish === "matte-black", machined: b.rimFinish === "machined", lip: !!b.rimLip } : null, low)
    .then(changed => {
      if (!changed) return;
      // Centre caps sit on the wheel face, so they're measured again on the new wheels (the body height is already set).
      if (b.addons && b.addons.extras.includes("Centre cap swap")) updateAddons(p, b.addons, p.fit || STANDIN_FIT);
      ptCarChanged(); requestRender();
    });
}
/* Lights on at night: in a night setting the head and tail lights glow as if switched on, so the car looks
   parked with its lights on rather than dead. Smoked lenses glow dimmer; the LED upgrade is a cooler white.
   Some models' lenses are see-through covers (light shows through them in proportion to opacity), so their
   glow is boosted to match. By day the lenses go back to how the model (or the stand-in) had them. */
let lightsOn = false;
// The visitor's own Lights choice is kept apart from the night rule, so changing setting or pressing
// Photoshoot doesn't undo it: lights show when the visitor turned them on OR the setting is a night one.
let userLights = false, nightLights = false;
function syncLights() { setLightsOn(userLights || nightLights); }
function applyLights(p, b) {
  const smoked = smokeLevel(b, "Smoked headlights") > 0, led = !!(b && b.addons && b.addons.extras.includes("LED headlight upgrade"));
  const ledTail = hasLedTails(b), smokedT = smokedTails(b);
  const set = (list, colour, strength, smoked) => list.forEach(m => {
    const day = m.userData.day || (m.userData.day = { e: m.emissive.clone(), i: m.emissiveIntensity });
    if (!lightsOn) { m.emissive.copy(day.e); m.emissiveIntensity = p.standIn ? (smoked ? 0.15 : ledTail && list === p.lensRear ? 0.3 : 0.6) : day.i; return; }
    const see = m.transparent ? Math.max(m.opacity, 0.2) : 1;
    m.emissive.set(colour); m.emissiveIntensity = Math.min(8, strength * (smoked ? 0.35 : 1) / see);
  });
  set(p.lensFront, led ? 0xdde8ff : 0xfff0d8, 2, smoked);
  // LED tail lights: a darker lens by day, but a brighter, crisper red when lit.
  set(p.lensRear, ledTail ? 0xff1a22 : 0xff1414, ledTail ? 3.2 : 2.4, smokedT);
  // The beams: light on the road ahead and a red wash behind (off by day; dimmer through smoked lenses).
  if (!p.beams) return;
  p.beams.front.forEach(s => { s.color.set(led ? 0xe6eeff : 0xfff0d8); s.intensity = lightsOn ? 12 * (smoked ? 0.4 : 1) : 0; });
  (p.beams.glows || []).forEach(q => { q.visible = lightsOn; q.material.opacity = q.userData.front ? (smoked ? 0.35 : 0.85) : (smokedT ? 0.45 : ledTail ? 0.95 : 0.75); q.material.color.set(q.userData.front ? (led ? 0xe6f0ff : 0xfff4e2) : 0xff2418); });
  p.beams.rear.forEach(l => { l.intensity = lightsOn ? (ledTail ? 0.16 : 0.12) * (smokedT ? 0.5 : 1) : 0; });
}
// The "LED tail lights" extra: a lighter smoked tail lens (smoked lights stay darker) that glows brighter.
function hasLedTails(b) { return !!(b && b.addons && b.addons.extras.includes("LED tail lights")); }
// Smoke on the lenses: 0 (clear), or how dark (light 1, medium 2, dark 3). The smoked-lights mod is medium on both;
// the "Smoked headlights" and "Smoked tail lights" extras carry their own level in their wording.
function smokeLevel(b, name) {
  const t = b && b.addons && b.addons.extras.includes(name) ? ((b.addons.extraText || {})[name] || "medium") : null;
  const lv = t ? (/^light/.test(t) ? 1 : /^dark/.test(t) ? 3 : 2) : 0;
  return Math.max(lv, b && b.smoked ? 2 : 0);
}
function smokedTails(b) { return smokeLevel(b, "Smoked tail lights") > 0; }
const SMOKE_HEAD = [1, 0.5, 0.3, 0.16], SMOKE_TAIL = [1, 0.72, 0.55, 0.35], SMOKE_OPACITY = [0, 0.6, 0.72, 0.85];
/* Gives a car two headlight beams (spot lights aimed a few metres ahead and slightly down) and a small red
   light low behind it, placed from where its lenses are. They sit on the body so they drop with it, and stay
   in the scene at zero strength when off, so switching them never makes the 3D rebuild its shaders. Cars
   whose model has no separate lens parts just don't get them. */
function addBeams(rig) {
  const g = rig.group; g.updateMatrixWorld(true);
  const boxOf = mats => { const b = new THREE.Box3(); g.traverse(o => { if (o.isMesh && mats.includes(o.material)) b.expandByObject(o); }); return b; };
  const car = new THREE.Box3().setFromObject(g), size = car.getSize(new THREE.Vector3());
  const along = size.x >= size.z ? "x" : "z", across = along === "x" ? "z" : "x";
  const front = boxOf(rig.lensFront);
  rig.beams = { front: [], rear: [] };
  const local = v => rig.body.worldToLocal(v.clone());
  if (!front.isEmpty()) {
    const c = front.getCenter(new THREE.Vector3()), dir = Math.sign(c[along] - car.getCenter(new THREE.Vector3())[along]) || 1;
    const w = front.max[across] - front.min[across];
    for (const side of [front.min[across] + 0.2 * w, front.max[across] - 0.2 * w]) {
      const at = c.clone(); at[across] = side;
      const aim = at.clone(); aim[along] += dir * 14; aim.y = 0;
      const s = new THREE.SpotLight(0xfff0d8, 0, 30, 0.42, 1, 2); s.name = "Headlight_Beam"; s.castShadow = false;
      s.position.copy(local(at)); s.target.position.copy(local(aim));
      rig.body.add(s, s.target); rig.beams.front.push(s);
    }
  }
  rig.beams.glows = [];
  for (const [list, front] of [[rig.lensFront, true], [rig.lensRear, false]]) for (const lamp of lampsOf(rig, list, front)) {
    const mat = new THREE.MeshBasicMaterial({ color: front ? 0xfff4e2 : 0xff2418, map: glowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.45, lamp.w * 1.5), Math.min(0.4, lamp.h * 2.2)), mat); // never bigger than a lamp's own glow q.name = "Lamp_Glow"; q.renderOrder = 3;
    q.position.set(lamp.x + (front ? 0.02 : -0.02), lamp.y, lamp.z); q.rotation.y = front ? Math.PI / 2 : -Math.PI / 2; q.visible = false;
    q.userData.front = front; rig.body.add(q); rig.beams.glows.push(q);
  }
  // Tail lights: one small red glow just behind each lamp unit (found from the lens's own points on each
  // side of the car), so the red lands on the bumper and road right by the lights, not mid-tailgate.
  for (const lamp of rearLamps(rig)) {
    const l = new THREE.PointLight(0xff1a14, 0, 1.1, 2); l.name = "Tail_Glow"; l.castShadow = false;
    l.position.set(lamp.x - 0.12, lamp.y - 0.04, lamp.z); rig.body.add(l); rig.beams.rear.push(l);
  }
}
// A soft round glow picture (bright middle fading to nothing), made once.
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(0.6, "rgba(255,255,255,0.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (glowTex = new THREE.CanvasTexture(c));
}
// Each lamp unit (one per side) from a lens list: its outermost face along the car, middle height and side, and size.
function lampsOf(rig, list, front) {
  const fl = rig.fit && rig.fit.lamps && rig.fit.lamps[front ? "head" : "tail"];
  if (fl) return [1, -1].map(k => ({ x: fl.x, y: fl.y, z: k * fl.z, w: fl.w, h: fl.h })); // measured lamp units
  const inv = rig.body.matrixWorld.clone().invert(), p = new THREE.Vector3(), sides = { 1: [], [-1]: [] };
  rig.group.traverse(o => {
    if (!o.isMesh || !list.includes(o.material)) return;
    const P = o.geometry.attributes.position, M = o.matrixWorld.clone().premultiply(inv), step = Math.max(1, Math.floor(P.count / 2000));
    for (let i = 0; i < P.count; i += step) { p.fromBufferAttribute(P, i).applyMatrix4(M); sides[p.z >= 0 ? 1 : -1].push(p.clone()); }
  });
  const out = [];
  for (const k of [1, -1]) {
    const pts = sides[k]; if (pts.length < 3) continue;
    const box = new THREE.Box3().setFromPoints(pts), mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    out.push({ x: front ? box.max.x : box.min.x, y: mid.y, z: mid.z, w: Math.max(0.1, size.z), h: Math.max(0.05, size.y) });
  }
  return out;
}
// Where each rear lamp is, in the body's own space: the middle of the lens points on each side of the car,
// weighted towards the outer half (where the bright part of most tail lights is). Car front is +x.
function rearLamps(rig) {
  const fl = rig.fit && rig.fit.lamps && rig.fit.lamps.tail;
  if (fl) return [1, -1].map(k => ({ x: fl.x, y: fl.y, z: k * fl.z }));
  const inv = rig.body.matrixWorld.clone().invert(), p = new THREE.Vector3(), sides = { 1: [], [-1]: [] };
  rig.group.traverse(o => {
    if (!o.isMesh || !rig.lensRear.includes(o.material)) return;
    const P = o.geometry.attributes.position, M = o.matrixWorld.clone().premultiply(inv), step = Math.max(1, Math.floor(P.count / 2000));
    for (let i = 0; i < P.count; i += step) { p.fromBufferAttribute(P, i).applyMatrix4(M); sides[p.z >= 0 ? 1 : -1].push(p.clone()); }
  });
  const out = [];
  for (const k of [1, -1]) {
    const pts = sides[k]; if (!pts.length) continue;
    const box = new THREE.Box3().setFromPoints(pts), mid = box.getCenter(new THREE.Vector3());
    out.push({ x: box.min.x, y: mid.y, z: k * (Math.abs(mid.z) + (box.max.z - box.min.z) * 0.15) });
  }
  return out;
}
function setLightsOn(on) {
  if (on === lightsOn) return;
  lightsOn = on;
  if (stockCar) applyLights(stockCar, lastStock || lastBuild);
  if (buildCar) applyLights(buildCar, lastBuild);
  ptCarChanged(); requestRender();
  // The "Lights" button shows whether they're on (night settings switch them on by themselves).
  window.dispatchEvent(new CustomEvent("viewer3d-lights", { detail: { on } }));
}
function applyBase(p, b) {
  for (const m of p.paints) applyPaint(m, b.paint, b.finish);
  p.body.position.y = -(b.dropMm || 0) / 1000;
  if (p.standIn) {
    // Bigger rims with lower-profile tyres: the tyre's outer size stays the same, the rim grows.
    const rimR = 0.33 * ({ 17: 0.6, 18: 0.64, 19: 0.68, 20: 0.72, 21: 0.76 }[b.wheelIn] || 0.64);
    for (const w of p.wheels) { w.rim.scale.set(rimR, 1, rimR); w.caliper.scale.setScalar(b.bigBrake ? 1.35 : 1); }
    p.rims.forEach(m => m.color.set(b.rimColour));
    p.glassRear.forEach(m => { m.opacity = b.tint ? TINT_OPACITY[b.tint] || 0.85 : 0.55; m.color.set(b.tint ? 0x07090b : 0x2a3640); });
    p.lensFront.forEach(m => { m.color.set(b.smoked ? 0x3a4048 : 0xf2f6ff); m.emissiveIntensity = b.smoked ? 0.15 : 0.6; });
    p.lensRear.forEach(m => { m.color.set(smokedTails(b) ? 0x3a0d12 : hasLedTails(b) ? 0x6a1016 : 0xc0161f); m.emissiveIntensity = smokedTails(b) ? 0.15 : hasLedTails(b) ? 0.3 : 0.6; });
    p.calipers.forEach(m => m.color.set(b.caliper));
    return;
  }
  // Real models keep their own textures; mods tint them. Stock parts go back to the model's own colours.
  const st = p.stock;
  p.rims.forEach((m, i) => b.wheelsChanged ? m.color.set(b.rimColour).lerp(new THREE.Color(0xffffff), m.map ? 0.3 : 0) : m.color.copy(st.rims[i]));
  // Calipers can have a painted-on texture (e.g. red with a logo); a new caliper colour replaces it.
  p.calipers.forEach((m, i) => {
    if (b.brakesChanged) { m.map = null; m.color.set(b.caliper); }
    else { m.map = st.calipers[i].map; m.color.copy(st.calipers[i].color); }
    m.needsUpdate = true;
  });
  p.glassRear.forEach((m, i) => {
    if (b.tint) { m.transparent = true; m.opacity = TINT_OPACITY[b.tint] || 0.85; m.color.set(0x07090b); }
    else { m.transparent = st.glassRear[i].transparent; m.opacity = st.glassRear[i].opacity; m.color.copy(st.glassRear[i].color); }
    m.needsUpdate = true;
  });
  const smoke = (m, on, dark) => {
    if (m.userData.op0 === undefined) m.userData.op0 = m.opacity;
    if (m.transparent) m.opacity = on ? Math.max(m.userData.op0, SMOKE_OPACITY[on]) : m.userData.op0;
  };
  const hl = smokeLevel(b, "Smoked headlights"), tl = smokeLevel(b, "Smoked tail lights");
  // Smoke film: a dark see-through copy of each lens laid just over it, so the smoke shows even on clear lens covers.
  if (!p.smokeFilms) {
    p.smokeFilms = [];
    p.group.traverse(o => {
      if (!o.isMesh || o.userData.film) return;
      const front = p.lensFront.includes(o.material), rear = p.lensRear.includes(o.material); if (!front && !rear) return;
      const film = new THREE.Mesh(o.geometry, new THREE.MeshPhysicalMaterial({ color: rear ? 0x1a0204 : 0x050607, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      film.userData.film = true; film.userData.front = front; film.visible = false; film.renderOrder = 2; o.add(film); p.smokeFilms.push(film);
    });
  }
  for (const f of p.smokeFilms) { const lv = f.userData.front ? hl : tl; f.visible = lv > 0; f.material.opacity = [0, 0.42, 0.62, 0.8][lv]; }
  p.lensFront.forEach((m, i) => { m.color.copy(st.lensFront[i]).multiplyScalar(SMOKE_HEAD[hl]); smoke(m, hl); });
  p.lensRear.forEach((m, i) => { m.color.copy(st.lensRear[i]).multiplyScalar(tl ? SMOKE_TAIL[tl] : hasLedTails(b) ? 0.55 : 1); smoke(m, tl); });
}


/* ---------- real-world settings (360° HDR photos) ----------
   "photo" (the default) is the built-in studio. Others are listed in env/environments.json. Each photo lights
   the car (reflections in the paint and glass) and becomes the background, with the car standing on its ground. */
function loadEnv(id) {
  if (!envCache[id]) {
    envList = envList || fetch("env/environments.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
    envCache[id] = envList.then(list => {
      const e = list[id];
      if (!e) return null;
      return new HDRLoader().loadAsync(`env/${e.polyhaven}.hdr`).then(tex => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const envMap = pmrem.fromEquirectangular(tex).texture;
        // A sharp 8K picture for the visible 360° background (env/get_skies.py); the 2K HDR still does the lighting.
        return new THREE.TextureLoader().loadAsync(`env/sky/${id}.jpg`).then(sky => {
          sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
          sky.anisotropy = renderer.capabilities.getMaxAnisotropy();
          return { envMap, tex, sky, e };
        }, () => ({ envMap, tex, sky: null, e }));
      });
    }).catch(err => { console.warn("Setting failed to load:", err); return null; });
  }
  return envCache[id];
}
function setEnvironment(id) {
  ptCarChanged();
  if (id === envId) return;
  envId = id;
  const token = ++envToken;
  if (id === "photo" || !id) { clearSkybox(); usePlate(null); useStudio(); return; }
  message("Loading setting…");
  loadEnv(id).then(found => {
    if (token !== envToken) return;
    if (!found) { clearSkybox(); usePlate(null); useStudio(); message("This setting isn't available in 3D yet (or not downloaded: run python env/get_hdris.py)."); return; }
    message("");
    nightLights = (found.e.skyLevel || 1) < 0.5; syncLights(); // night settings dim the sky; switch the car's lights on
    clearSkybox(); // swap only once the new setting is ready, so there's never a blank background
    scene.environment = found.envMap;
    scene.environmentRotation.y = scene.backgroundRotation.y = found.e.rotation || 0; // always, so no leftover angle
    // "Photo" mode: the sharp flat photo, car turns. "360°" mode (default): look all around the place.
    if (found.e.backplate && mode3d === "photo") {
      const img = new Image();
      img.onload = () => { if (token === envToken) usePlate(found.e, id); };
      img.onerror = () => { if (token === envToken) { message("The photo for this setting isn't downloaded (run python env/get_backplates.py). Showing the 360° view instead."); show360(found); } };
      img.src = `env/backplates/${id}.jpg`;
      return;
    }
    show360(found);
  });
}
function show360(found) {
  {
    usePlate(null);
    scene.environmentRotation.y = scene.backgroundRotation.y = found.e.rotation || 0;
    // The photo becomes a dome with a flat ground, so the car stands in the place rather than floating in it.
    skybox = new GroundedSkybox(found.sky || found.tex, found.e.height || 1.7, 100); // a bigger dome stretches nearby things less
    skybox.position.y = (found.e.height || 1.7) - 0.01;
    skybox.rotation.y = found.e.rotation || 0;
    // Poly Haven's background JPGs are auto-brightened, so night ones look like day; skyLevel dims them back.
    skybox.material.color.setScalar(found.e.skyLevel || 1);
    scene.add(skybox); addGround(found.e);
    scene.background = null; floor.visible = false;
    renderer.toneMappingExposure = found.e.exposure || 1;
    requestRender();
  }
}
/* Real ground under the car. The 360° photo's own ground is smeared and out of scale close up (anything that
   stood near the camera gets stretched across it), so a sharp textured ground is laid around the car and fades
   into the photo further out. Settings name it in environments.json ("ground": texture, tile size, wet). */
let ground = null;
const groundTex = {};
function groundFade() {
  // Fully solid out to ~35% of the radius, then fades smoothly into the photo by the edge.
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "#fff"); grad.addColorStop(0.35, "#fff"); grad.addColorStop(0.75, "#555"); grad.addColorStop(1, "#000");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function addGround(e) {
  removeGround();
  const cfg = e.ground; if (!cfg) return;
  const R = 32, reps = (2 * R) / (cfg.tile || 3);
  const load = (kind, srgb) => {
    const key = cfg.texture + kind;
    if (!groundTex[key]) {
      groundTex[key] = new THREE.TextureLoader().load(`env/ground/${cfg.texture}_${kind}.jpg`, requestRender, undefined, () => { if (ground) ground.visible = false; });
      groundTex[key].wrapS = groundTex[key].wrapT = THREE.RepeatWrapping;
      groundTex[key].anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (srgb) groundTex[key].colorSpace = THREE.SRGBColorSpace;
    }
    groundTex[key].repeat.set(reps, reps);
    return groundTex[key];
  };
  const mat = new THREE.MeshStandardMaterial({
    map: load("diff", true), normalMap: load("nor"), roughnessMap: load("rough"),
    roughness: cfg.wet ? 0.3 : 1, color: new THREE.Color(cfg.tint || "#ffffff"),
    alphaMap: groundFade(), transparent: true, depthWrite: false
  });
  ground = new THREE.Mesh(new THREE.CircleGeometry(R, 96), mat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.001; ground.receiveShadow = true; ground.renderOrder = -1;
  scene.add(ground);
}
function removeGround() { if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.alphaMap.dispose(); ground.material.dispose(); ground = null; } }
// Frees the old 360° picture from graphics memory (an 8K one is ~180 MB); it's re-sent if that setting is picked again.
function clearSkybox() { removeGround(); if (skybox) { scene.remove(skybox); if (skybox.material.map) skybox.material.map.dispose(); skybox.geometry.dispose(); skybox.material.dispose(); skybox = null; } }
function useStudio() {
  message("");
  nightLights = false; syncLights(); // back to the visitor's own choice
  scene.environmentRotation.y = scene.backgroundRotation.y = 0;
  scene.environment = studioEnv; scene.background = new THREE.Color(0x1d232b);
  floor.visible = true; renderer.toneMappingExposure = 1;
  requestRender();
}


/* ---------- photo settings: a sharp real photo behind the car ----------
   The photo is shown behind a see-through 3D canvas, so it stays as sharp as the photo itself and is never
   stretched. The 3D camera copies the photo's lens (field of view), height and horizon, so the car sits on
   the photo's ground. The camera can't move around a photo, so dragging turns the car instead. */
function usePlate(e, id) {
  plate = e ? { ...e, id, camera: { fov: 70, height: 1.2, horizon: 0.42, distance: 6.5, carYaw: 35, x: 0, ...(e.camera || {}) } } : null;
  controls.enabled = !plate;
  container.style.backgroundImage = plate ? `url(env/backplates/${id}.jpg)` : "";
  container.classList.toggle("has-plate", !!plate);
  renderer.setClearColor(0x000000, plate ? 0 : 1);
  scene.background = plate ? null : scene.background;
  floor.visible = !plate && !skybox;
  shadowCatcher.visible = !!plate;
  contactShadow.children.forEach(m => { m.material.opacity = plate ? 0.85 : 1; });
  if (plate) {
    renderer.toneMappingExposure = plate.exposure || 1;
    const sunCfg = { azimuth: 140, elevation: 55, strength: 1.2, ...(plate.sun || {}) };
    const az = THREE.MathUtils.degToRad(sunCfg.azimuth), el = THREE.MathUtils.degToRad(sunCfg.elevation);
    sun.position.set(Math.sin(az) * Math.cos(el) * 12, Math.sin(el) * 12, Math.cos(az) * Math.cos(el) * 12);
    sun.intensity = sunCfg.strength;
    plateDist = 1;
    setCarYaw(THREE.MathUtils.degToRad(plate.camera.carYaw));
    placePlateCamera();
  } else {
    sun.intensity = 0;
    setCarYaw(0);
    if (inside) placeInterior();
    else { camera.fov = 26; camera.position.set(5.6, 1.6, 6.0); controls.target.set(0, 0.7, 0); controls.update(); camera.updateProjectionMatrix(); }
  }
  requestRender();
}
// Matches the photo: horizontal field of view -> vertical, then tilts the camera so the 3D horizon lands
// where the photo's horizon is.
function placePlateCamera() {
  const c = plate.camera, aspect = camera.aspect || 16 / 9;
  const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) / aspect);
  camera.fov = THREE.MathUtils.radToDeg(vfov);
  camera.position.set(c.x || 0, c.height, c.distance * plateDist);
  // Tilting the camera down moves the horizon up the picture; this puts it where the photo's horizon is.
  camera.rotation.set(Math.atan((c.horizon - 0.5) * 2 * Math.tan(vfov / 2)), 0, 0);
  camera.updateProjectionMatrix();
}
function setCarYaw(y) {
  carYaw = y;
  for (const r of [stockCar, buildCar]) if (r) r.group.rotation.y = y;
  contactShadow.rotation.y = y;
  requestRender();
}
// Dragging in a photo setting turns the car on the spot (a turntable).
function plateDrag(canvas) {
  let lastX = null;
  canvas.addEventListener("pointerdown", e => { if (!plate) return; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!plate || lastX === null || !canvas.hasPointerCapture(e.pointerId)) return;
    setCarYaw(carYaw + (e.clientX - lastX) * 0.01); lastX = e.clientX;
  });
  const end = () => { lastX = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
}

/* ---------- photo quality (path tracing) ----------
   When the camera stops, the car is redrawn by simulating real light (path tracing): reflections, soft shadows
   and light bouncing between surfaces build up over a few seconds into a photo-quality picture. Moving the camera
   switches straight back to the normal 3D. The background (360 sky, studio or photo) stays the normal one, and
   the path-traced car is laid over it with its transparent surroundings. */
let ptClean = null, ptScene = null, ptSun = null, ptCam = new THREE.PerspectiveCamera(), pt = null, ptOn = false, ptRunning = false, ptDirty = true, ptBusy = false, ptRaf = null, studioCube = null;
const PT_SAMPLES = 80; // light samples per pixel before the picture counts as finished
const PT_SHOW_AFTER = PT_SAMPLES; // only swap in the photo-quality picture once it is finished (earlier ones look grainy)
function ptMessage(state, pct = 0) { window.dispatchEvent(new CustomEvent("viewer3d-pt", { detail: { state, pct } })); }
// The lighting picture the path tracer needs: the setting's sky, or the studio turned into one.
async function ptEnvironment() {
  if (envId && envId !== "photo") { const found = await loadEnv(envId); if (found) return found.tex; }
  if (!studioCube) {
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    new THREE.CubeCamera(0.1, 100, rt).update(renderer, new RoomEnvironment());
    studioCube = rt.texture;
  }
  return studioCube;
}
// The background without the car (the car only blocks nothing and casts its shadows), for the path-traced car to sit on.
function backgroundPass() {
  followCamera();
  const w = container.clientWidth, h = container.clientHeight, mats = new Set();
  buildCar.group.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
  mats.forEach(m => { m.userData.ptCW = m.colorWrite; m.userData.ptDW = m.depthWrite; m.colorWrite = false; m.depthWrite = false; });
  stockCar.group.visible = false; buildCar.group.visible = true;
  renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
  renderer.clear(); renderer.render(scene, camera);
  mats.forEach(m => { m.colorWrite = m.userData.ptCW; m.depthWrite = m.userData.ptDW; });
}
// (Re)builds what the path tracer sees: a copy of the build car (sharing its shapes and materials) and the lighting.
async function ptPrepare() {
  if (!pt) {
    pt = new WebGLPathTracer(renderer);
    // Keep showing the normal sharp 3D until the photo-quality picture has cleaned up (early samples look grainy),
    // then fade across gently.
    pt.tiles.set(2, 2); pt.minSamples = PT_SHOW_AFTER; pt.fadeDuration = 900; pt.renderDelay = 0;
    pt.bounces = 4; pt.filterGlossyFactor = 0.5;
    pt.renderScale = 0.75; // three-quarter size: about twice as fast as full size, still sharp
    pt.rasterizeScene = true;
    pt.rasterizeSceneCallback = () => drawPasses();
    pt.renderToCanvasCallback = (target, r, quad) => {
      if (quad.material.opacity >= 1) backgroundPass();      // fully faded in: fresh background under the car
      // Show it through a noise cleaner that smooths the grain but keeps edges sharp, laid over the background.
      if (!ptClean) {
        ptClean = new FullScreenQuad(new DenoiseMaterial({ transparent: true, blending: THREE.NormalBlending, premultipliedAlpha: r.getContextAttributes().premultipliedAlpha }));
        Object.assign(ptClean.material, { sigma: 4.0, kSigma: 1.0, threshold: 0.06 });
      }
      ptClean.material.map = quad.material.map; ptClean.material.opacity = quad.material.opacity;
      const w = container.clientWidth, h = container.clientHeight, x = Math.round(w * split), ac = r.autoClear;
      r.autoClear = false; r.setScissorTest(true);
      if (x < w) { r.setScissor(x, 0, w - x, h); ptClean.render(r); }
      if (x > 0) { r.setScissor(0, 0, x, h); stockCar.group.visible = true; buildCar.group.visible = false; r.render(scene, camera); }
      r.setScissorTest(false); r.autoClear = ac;
    };
  }
  // The path tracer's copy of the car always faces the same way; turning the car (Photoshoot) turns the
  // camera, sky and sun around it instead, so a turn never needs the slow rebuild.
  ptScene = new THREE.Scene();
  const copy = buildCar.group.clone(); copy.visible = true; copy.rotation.y = 0; ptScene.add(copy);
  // Photo quality leaves the headlight beams out (their aim points don't copy across); the lenses still glow.
  const beams = []; copy.traverse(o => { if (o.isLight) beams.push(o); }); beams.forEach(o => o.removeFromParent());
  ptSun = new THREE.DirectionalLight(0xffffff, 0); ptScene.add(ptSun, ptSun.target); // matches the shadow-casting sun
  ptScene.environment = await ptEnvironment();
  ptScene.background = null;
  ptSync();
  await new Promise(r => setTimeout(r, 30)); // let "getting ready" show before the one-off setup (about a second)
  pt.setScene(ptScene, ptCam);
  ptDirty = false;
}
// Lines the path tracer's view up with the screen, in the car's own frame (the car turned by carYaw).
function ptSync() {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -carYaw);
  ptCam.copy(camera); ptCam.position.copy(camera.position).applyQuaternion(q); ptCam.quaternion.premultiply(q);
  ptCam.updateProjectionMatrix(); ptCam.updateMatrixWorld(true);
  ptScene.environmentRotation.copy(scene.environmentRotation); ptScene.environmentRotation.y -= carYaw;
  ptSun.color.copy(sun.color); ptSun.intensity = sun.intensity;
  ptSun.position.copy(sun.position).applyQuaternion(q); ptSun.target.position.set(0, 0, 0); ptSun.target.updateMatrixWorld();
}
function ptStop() {
  if (!ptRunning) return;
  ptRunning = false; cancelAnimationFrame(ptRaf); ptRaf = null; ptMessage("off");
}
// Starts building up the photo-quality picture (called once the camera has stopped).
async function ptStart() {
  if (!ptOn || ptRunning || ptBusy || !buildCar) return;
  ptBusy = true;
  try {
    if (ptDirty) { ptMessage("preparing"); await ptPrepare(); }
    ptSync(); pt.updateEnvironment(); pt.updateLights(); pt.setCamera(ptCam); pt.reset();
  } catch (e) { console.warn("Photo quality unavailable:", e); ptBusy = false; ptMessage("error"); return; }
  ptBusy = false;
  if (!ptOn) return;
  if (frameQueued) { setTimeout(ptStart, 150); return; } // a screen update is still waiting: try again once it's drawn
  ptRunning = true; ptMessage("rendering", 0);
  const tick = () => {
    ptRaf = null;
    if (!ptRunning) return;
    const t0 = performance.now(); pt.renderSample(); if (DEBUG) console.log(`[pt] sample ${pt.samples.toFixed(2)} in ${(performance.now() - t0).toFixed(0)} ms`);
    const pct = Math.min(100, Math.round(pt.samples / PT_SAMPLES * 100));
    if (pt.samples < PT_SAMPLES) { ptMessage("rendering", pct); ptRaf = requestAnimationFrame(tick); }
    else { ptRunning = false; ptMessage("done", 100); }
  };
  ptRaf = requestAnimationFrame(tick);
}
function setPhotoQuality(on) {
  ptOn = !!on;
  if (!ptOn) { ptStop(); requestRender(); return; }
  ptDirty = true; ptStart();
}
// Anything that changes the car itself means the path tracer's copy must be rebuilt.
function ptCarChanged() { ptDirty = true; ptStop(); }
window.addEventListener("viewer3d-view", () => { if (ptOn) ptStart(); });
window.addEventListener("viewer3d-addon-loaded", () => { ptCarChanged(); requestRender(); });

/* ---------- sitting inside the car ----------
   The camera goes to a seat's head height and turns on the spot to look around (it orbits a point 1 cm ahead,
   so it hardly moves). Only the build car is shown. Photo settings switch to the 360° picture while inside,
   because a flat photo can't be seen out of every window. */
let inside = null, outsideState = null;
const SEATS = { driver: [-0.42, 1.1, 0.36], passenger: [-0.42, 1.1, -0.36], rear: [-1.25, 1.08, 0.3] };
function seatPos(seat) { const f = buildCar.fit || STANDIN_FIT; return (f.seats || SEATS)[seat] || SEATS.driver; }
function placeInterior() {
  const s = seatPos(inside), body = buildCar.body;
  body.updateWorldMatrix(true, false);
  const head = body.localToWorld(new THREE.Vector3(...s));
  const ahead = body.localToWorld(new THREE.Vector3(s[0] + 1, s[1] - 0.12, s[2])).sub(head).normalize();
  camera.fov = 72; camera.near = 0.05; camera.updateProjectionMatrix();
  Object.assign(controls, { minDistance: 0.005, maxDistance: 0.02, minPolarAngle: 0.4, maxPolarAngle: 2.5, rotateSpeed: -0.35, enableZoom: false, enabled: true });
  controls.target.copy(head).addScaledVector(ahead, 0.01); camera.position.copy(head);
  controls.update(); requestRender();
}
function setInterior(seat) {
  if (seat && !inside) outsideState = { split, mode: mode3d };
  if (!seat && !inside) return;
  const wasPlate = !!plate;
  inside = seat || null;
  if (inside) {
    split = 0;
    if (wasPlate) { mode3d = "360"; const id = envId; envId = null; setEnvironment(id); } // placeInterior runs once it's ready
    else placeInterior();
    return;
  }
  // Back outside: the normal camera, divider and setting mode.
  Object.assign(controls, OUTSIDE_LIMITS, { rotateSpeed: 1, enableZoom: true });
  camera.near = 0.1; split = outsideState ? outsideState.split : 0.5;
  mode3d = outsideState ? outsideState.mode : mode3d;
  const id = envId; envId = null; setEnvironment(id);
  if (!plate && (id === "photo" || !id)) { camera.fov = 26; camera.position.set(5.6, 1.6, 6.0); controls.target.set(0, 0.7, 0); camera.updateProjectionMatrix(); controls.update(); }
  requestRender();
}

/* ---------- capturing the 3D view as a picture ("Make it a photo") ----------
   Renders just the build at 1920x1080, takes the picture straight away (so the canvas doesn't need to keep
   every frame), then puts the view back. In Photo view the background photo is drawn underneath. */
// Where the camera is now: angle, setting, view mode, seat, and the exact camera so it can be put back later.
function viewInfo() {
  const look = controls.target.clone().sub(camera.position).normalize();
  return { angle: angle(), env: envId || "photo", mode: inside ? "inside-" + inside : plate ? "photo" : "360", inside,
           pitch: inside ? Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(look.y, -1, 1)))) : null,
           cam: { pos: camera.position.toArray(), target: controls.target.toArray(), carYaw, plateDist, fov: camera.fov } };
}
// Puts the camera back exactly where viewInfo() said it was (same view mode and setting must already be showing).
function setView(c) {
  if (!c) return;
  if (plate) { setCarYaw(c.carYaw); plateDist = c.plateDist || 1; placePlateCamera(); }
  else {
    settle();
    camera.position.fromArray(c.pos); controls.target.fromArray(c.target);
    if (inside && c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    controls.update();
  }
  requestRender();
}
// Turns to an exact angle (degrees, same meaning as angle()): the car in photo settings, the camera otherwise.
function setAngle(deg) {
  const rad = THREE.MathUtils.degToRad(deg);
  if (plate) { setCarYaw(-rad); return; }
  if (inside) return;
  settle();
  const off = camera.position.clone().sub(controls.target), r = Math.hypot(off.x, off.z);
  camera.position.set(controls.target.x + r * Math.sin(rad), camera.position.y, controls.target.z + r * Math.cos(rad));
  controls.update(); requestRender();
}
// Tells the page when the camera or car has stopped moving (used by the AI Photo tab to find a saved photo).
let viewTimer = null;
function viewMoved() { clearTimeout(viewTimer); viewTimer = setTimeout(() => window.dispatchEvent(new Event("viewer3d-view")), 350); }

async function capture() {
  const W = 1920, H = 1080, oldSplit = split, oldRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  camera.aspect = W / H; if (plate) placePlateCamera(); else camera.updateProjectionMatrix();
  split = 0; drawPasses(W, H);
  const carShot = await new Promise(r => renderer.domElement.toBlob(r, "image/png"));
  split = oldSplit; renderer.setPixelRatio(oldRatio); resize();
  return { blob: await onBackplate(carShot, W, H), ...viewInfo() };
}
// In Photoshoot the real photo sits behind the see-through 3D canvas, so a saved picture needs it drawn in.
async function onBackplate(carShot, W, H) {
  if (!plate) return carShot;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const bg = new Image(); bg.src = `env/backplates/${plate.id}.jpg`; await bg.decode();
  const sc = Math.max(W / bg.naturalWidth, H / bg.naturalHeight); // same "cover" crop as the page
  g.drawImage(bg, (W - bg.naturalWidth * sc) / 2, (H - bg.naturalHeight * sc) / 2, bg.naturalWidth * sc, bg.naturalHeight * sc);
  g.drawImage(await createImageBitmap(carShot), 0, 0);
  return new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
}
// "Save picture": the build on its own (no stock half). If Photo quality has sharpened the car, that sharp
// frame is kept at screen size; otherwise a fresh 1920x1080 picture is drawn, the same as "Make it a photo".
async function snapshot() {
  if (!(ptOn && pt && !ptDirty && pt.samples >= PT_SHOW_AFTER)) return capture();
  const old = split, cv = renderer.domElement; split = 0;
  pt.renderSample(); // draws the sharp picture again (and adds one more sample) so it can be read straight away
  const carShot = await new Promise(r => cv.toBlob(r, "image/png"));
  split = old; pt.renderSample(); // put the before/after divider back on screen
  return { blob: await onBackplate(carShot, cv.width, cv.height), sharp: true, ...viewInfo() };
}

/* A flat side-on picture of the stock or built car on a clear background, for the test drive's road.
   Returns { id, url, aspect, wheels: [{ x, y, r }] } (wheel centres and radius as fractions of the picture's
   width/height, near side only, so the test drive can spin them), or null while no car is loaded. */
function profile(which) {
  if (!stockCar || !buildCar || stockCar.standIn) return null;
  const rig = which === "stock" ? stockCar : buildCar, other = rig === stockCar ? buildCar : stockCar;
  const yaw = rig.group.rotation.y; rig.group.rotation.y = 0;
  rig.group.updateMatrixWorld(true);
  const box = new THREE.Box3().expandByObject(rig.body);
  for (const w of rig.wheels) box.expandByObject(w.group);
  const pad = 0.06, left = box.min.x - pad, right = box.max.x + pad, top = box.max.y + pad, bottom = -0.01;
  const W = 1400, H = Math.round(W * (top - bottom) / (right - left));
  const cam = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 50);
  cam.position.set(0, 0, 20); cam.lookAt(0, 0, 0); // from the car's left, so the front points right
  // Only the car: no sky, ground, floor or shadows on a floor.
  const hide = [other.group, floor, contactShadow, shadowCatcher, skybox, ground].filter(Boolean), was = hide.map(o => o.visible);
  hide.forEach(o => { o.visible = false; });
  const bg = scene.background, ratio = renderer.getPixelRatio(), shown = rig.group.visible, clear = renderer.getClearAlpha();
  scene.background = null; rig.group.visible = true;
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clear(); renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL("image/png");
  scene.background = bg; rig.group.visible = shown; renderer.setClearColor(0x000000, clear); hide.forEach((o, i) => { o.visible = was[i]; });
  const wheels = rig.wheels.map(w => { const b = new THREE.Box3().setFromObject(w.group), c = b.getCenter(new THREE.Vector3()); return { c, r: (b.max.y - b.min.y) / 2 }; })
    .filter(w => w.c.z > 0)
    .map(w => ({ x: (w.c.x - left) / (right - left), y: (top - w.c.y) / (top - bottom), r: w.r / (right - left) }));
  rig.group.rotation.y = yaw; rig.group.updateMatrixWorld(true);
  renderer.setPixelRatio(ratio); resize(); requestRender();
  return { id: rig.carId, url, aspect: W / H, wheels };
}

/* ---------- what the rest of the site can call ---------- */
window.Viewer3D = {
  // Returns false if this browser can't do 3D (no WebGL), so the site can say so.
  show(el, build, stock) {
    if (!renderer) { try { init(el); } catch (e) { console.warn("3D view unavailable:", e); return false; } }
    resize(); applyBuild(build, stock); return true;
  },
  applyBuild(build, stock) { if (renderer) applyBuild(build, stock); },
  setEnvironment(id) { if (renderer) setEnvironment(id); },
  // "360" = look all around the place; "photo" = sharp flat photo behind the car, which turns instead.
  setMode(m) { mode3d = m; try { localStorage.setItem("customizacions.mode3d", m); } catch (e) {} if (renderer) { const id = envId; envId = null; setEnvironment(id); } },
  mode() { return mode3d; },
  // Developer helper for lining a photo setting up: Viewer3D.tune({ horizon: 0.44, distance: 6, carYaw: -35 })
  tune(c) { if (!plate) return null; Object.assign(plate.camera, c); if ("carYaw" in c) setCarYaw(THREE.MathUtils.degToRad(c.carYaw)); placePlateCamera(); requestRender(); return plate.camera; },
  // Sit inside: "driver", "passenger" or "rear"; null to step back out.
  interior(seat) { if (renderer) setInterior(seat); },
  inside() { return inside; },
  setSplit(f) { if (inside) return; split = Math.min(1, Math.max(0, f)); if (renderer) requestRender(); },
  angle() { return renderer ? angle() : 0; },
  view() { return renderer ? viewInfo() : null; },
  setView(c) { if (renderer) setView(c); },
  setAngle(deg) { if (renderer) setAngle(deg); },
  // Photo quality: path-trace the car whenever the camera stops. Sends "viewer3d-pt" events with progress.
  // Head and tail lights on or off (so LED or smoked lights can be compared in any setting).
  // Turning them off in a night setting is allowed too (until the setting changes).
  setLights(on) { if (!renderer) return; userLights = !!on; if (!on) nightLights = false; syncLights(); },
  lightsOn() { return lightsOn; },
  setPhotoQuality(on) { if (renderer) setPhotoQuality(on); },
  photoQuality() { return ptOn; },
  capture() { return renderer ? capture() : Promise.resolve(null); },
  // The current view as a picture to keep: { blob, sharp } (sharp = the Photo quality frame).
  snapshot() { return renderer ? snapshot() : Promise.resolve(null); },
  // Side-on picture of the "stock" or "build" car for the test drive (see profile above).
  profile(which) { return renderer ? profile(which) : null; },
  turn(deg) { if (renderer) turn(THREE.MathUtils.degToRad(deg)); },
  zoom(f) { if (renderer) zoom(f); },
  reset() { if (renderer) reset(); },
  focus() { if (renderer) renderer.domElement.focus(); }
};
// Developer access for measuring parts (only with ?debug in the address).
if (DEBUG) window.__v3d = () => ({ THREE, camera, controls, scene, renderer, buildCar, requestRender, placeInterior, ptState: () => ({ ptOn, ptRunning, ptBusy, ptDirty, frameQueued, samples: pt && pt.samples, compiling: pt && pt.isCompiling }) });
window.dispatchEvent(new Event("viewer3d-ready"));

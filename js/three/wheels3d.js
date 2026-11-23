/* Real aftermarket wheels on the 3D car. Each style is a modelled rim (models/wheels/<style>.glb, prepared by
   models/tools/prep_wheels.py: axle along Z, face towards +Z, outer diameter 1). Fitting one hides the car's own
   rim, hub and tyre, keeps its brake disc and caliper, scales the rim to the chosen size and makes a tyre whose
   outside stays the size of the original, so bigger rims get thinner sidewalls, like the real thing. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const cache = {};
const FLIP = new Set(["deepdish"]); // models whose face came out on the other side

/* ---------- modelled-in-code rims: 5-spoke, Y-spoke, split-spoke and BBS-style cross-spoke mesh ----------
   Same layout as the downloaded rims: axle along Z, face towards +Z, outer diameter 1, centred on its depth.
   A barrel with flanges, a hub with five bolts and a dark centre cap, and spokes from the hub to the barrel. */
const PROCEDURAL = { "5spoke": 1, yspoke: 1, splitspoke: 1, bbsmesh: 1 };
function bar2D(ax, ay, bx, by, wa, wb) {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, s = new THREE.Shape();
  s.moveTo(ax + nx * wa / 2, ay + ny * wa / 2); s.lineTo(bx + nx * wb / 2, by + ny * wb / 2); s.lineTo(bx - nx * wb / 2, by - ny * wb / 2); s.lineTo(ax - nx * wa / 2, ay - ny * wa / 2); s.closePath();
  return s;
}
const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
function spokeShapes(style) {
  const out = [], hub = 0.11, rim = 0.468;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * 2 * Math.PI / 5;
    if (style === "5spoke") out.push(bar2D(...at(hub, a), ...at(rim, a), 0.1, 0.13));
    if (style === "splitspoke") for (const d of [-0.075, 0.075]) out.push(bar2D(...at(hub, a + d * 0.6), ...at(rim, a + d * 0.45), 0.045, 0.055));
    if (style === "yspoke") { const mid = 0.27; out.push(bar2D(...at(hub, a), ...at(mid, a), 0.075, 0.07)); for (const d of [-0.2, 0.2]) out.push(bar2D(...at(mid - 0.01, a), ...at(rim, a + d), 0.05, 0.055)); }
    if (style === "bbsmesh") {
      for (const d of [0, Math.PI / 5]) out.push(bar2D(...at(hub, a + d), ...at(rim, a + d), 0.04, 0.03));
      for (let j = 0; j < 4; j++) { const b = a + j * Math.PI / 10; out.push(bar2D(...at(0.2, b), ...at(rim, b + 0.32), 0.022, 0.02), bar2D(...at(0.2, b), ...at(rim, b - 0.32), 0.022, 0.02)); }
    }
  }
  return out;
}
function proceduralRim(style) {
  const D = 0.42, g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ name: "Rim", color: 0xc9cdd2, metalness: 0.8, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ name: "cap", color: 0x111214, metalness: 0.3, roughness: 0.5 });
  const bolt = new THREE.MeshStandardMaterial({ name: "bolt", color: 0xb8bcc0, metalness: 1, roughness: 0.25 });
  // Barrel: (radius, depth) round the axle; the face is at z = 0, the back at -D.
  const prof = [[0.455, -D], [0.5, -D + 0.008], [0.5, -D + 0.03], [0.462, -D + 0.05], [0.455, -0.07], [0.47, -0.045], [0.5, -0.02], [0.5, -0.004], [0.488, 0.0], [0.462, -0.012]];
  const barrel = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 96); barrel.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(barrel, metal));
  const spokes = new THREE.ExtrudeGeometry(spokeShapes(style), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
  // Dish (concave face): the spokes sink towards the hub, like real wheels, so the face has depth.
  const sp = spokes.attributes.position; for (let i = 0; i < sp.count; i++) { const r = Math.hypot(sp.getX(i), sp.getY(i)); sp.setZ(i, sp.getZ(i) - 0.075 * Math.pow(Math.max(0, (0.47 - r) / 0.36), 1.4)); }
  spokes.computeVertexNormals(); spokes.translate(0, 0, -0.07); g.add(new THREE.Mesh(spokes, metal));
  // Hub face (set back with the dish), a centre cap in the centre bore, and five hex lug nuts with chamfered ends.
  const hubG = new THREE.CylinderGeometry(0.125, 0.13, 0.06, 40); hubG.rotateX(Math.PI / 2); hubG.translate(0, 0, -0.12); g.add(new THREE.Mesh(hubG, metal));
  const bore = new THREE.CylinderGeometry(0.066, 0.066, 0.02, 32, 1, true); bore.rotateX(Math.PI / 2); bore.translate(0, 0, -0.085); g.add(new THREE.Mesh(bore, dark));
  const cap = new THREE.CylinderGeometry(0.056, 0.06, 0.014, 32); cap.rotateX(Math.PI / 2); cap.translate(0, 0, -0.084); g.add(new THREE.Mesh(cap, dark));
  for (let i = 0; i < 5; i++) { const [x, y] = at(0.096, i * 2 * Math.PI / 5 + Math.PI / 10); const b = new THREE.CylinderGeometry(0.011, 0.014, 0.022, 6); b.rotateX(Math.PI / 2); b.translate(x, y, -0.082); g.add(new THREE.Mesh(b, bolt)); }
  g.traverse(o => { if (o.isMesh) o.geometry.computeVertexNormals(); });
  const holder = new THREE.Group(); g.position.z = D / 2; holder.add(g); return holder; // centred on its depth
}
function loadRim(style) {
  if (PROCEDURAL[style]) return (cache[style] = cache[style] || Promise.resolve(proceduralRim(style)));
  // Blender's up (Z) arrives as Y here, so the axle comes in along Y; turn it onto Z with the face towards +Z.
  if (!(style in cache)) cache[style] = new GLTFLoader().loadAsync(`models/wheels/${style}.glb`).then(g => { g.scene.rotation.x = Math.PI / 2; if (FLIP.has(style)) g.scene.rotation.z = Math.PI; const holder = new THREE.Group(); holder.add(g.scene); return holder; }).catch(e => { console.warn("Wheel model missing:", style, e); return null; });
  return cache[style];
}
const ORIGINAL = /^(Rim|Hub|Tyre)$/; // the car's own wheel parts that a new wheel replaces

// A tyre: rubber tread, rounded shoulders and sidewalls down to the rim, made by spinning a cross-section.
function makeTyre(rimR, outerR, width) {
  const w = width / 2, side = outerR - rimR, pts = [];
  const prof = [[rimR, -w * 0.82], [rimR + side * 0.25, -w * 0.97], [rimR + side * 0.7, -w], [outerR - 0.018, -w * 0.96], [outerR - 0.004, -w * 0.82],
                [outerR, -w * 0.5], [outerR, w * 0.5], [outerR - 0.004, w * 0.82], [outerR - 0.018, w * 0.96], [rimR + side * 0.7, w], [rimR + side * 0.25, w * 0.97], [rimR, w * 0.82]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 96); geo.rotateX(Math.PI / 2); geo.computeVertexNormals(); // spin axis Y -> axle Z
  return geo;
}
const rubber = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.88, metalness: 0 });
const lipChrome = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.06 });

// The usual UK tyre size for a Golf on each rim size, as moulded on the sidewall (no brand names).
// The per-rim tyre table lives in js/data/catalogue.js so the info card and the sidewall agree.
const TYRES = typeof TYRE_SIZE !== "undefined" ? TYRE_SIZE : {};
const labelCache = {};
// A see-through ring texture with the size lettered round it twice, slightly lighter than the rubber.
// Ring UVs are flat (the square canvas covers -outer..outer), so the text is drawn round a circle.
function sidewallTexture(text, innerFrac) {
  const key = text + "|" + innerFrac.toFixed(3);
  if (labelCache[key]) return labelCache[key];
  const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), half = S / 2;
  const band = half * (1 - innerFrac), mid = half * (1 + innerFrac) / 2;
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `bold ${Math.round(band * 0.5)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  const gap = 0.02; // extra spacing between letters, in radians
  for (const centre of [-Math.PI / 2, Math.PI / 2]) {
    const widths = [...text].map(ch => g.measureText(ch).width / mid + gap);
    let a = centre - widths.reduce((s, w) => s + w, 0) / 2;
    [...text].forEach((ch, i) => {
      const at = a + widths[i] / 2; a += widths[i];
      g.save(); g.translate(half + Math.cos(at) * mid, half + Math.sin(at) * mid); g.rotate(at + Math.PI / 2);
      g.fillText(ch, 0, 0); g.restore();
    });
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (labelCache[key] = tex);
}
// A thin lettered ring that sits just off the tyre's outer sidewall (tyre space: outer side is +Z).
function sidewallLabel(rimR, outerR, width, inch, own) {
  const side = outerR - rimR, inner = rimR + side * 0.36, outer = rimR + side * 0.84;
  const text = own || TYRES[Math.round(inch)] || `${inch >= 19 ? 235 : 225}/${Math.max(25, Math.round(((outerR - rimR) / 0.235) * 100 / 5) * 5)} R${Math.round(inch)}`;
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.78, metalness: 0, map: sidewallTexture(text, inner / outer),
    transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 1), mat);
  ring.position.z = width / 2 + 0.0015; ring.userData.wheelPart = ring.userData.ownGeo = true;
  return ring;
}

// Measures each wheel's tyre once (centre, outer radius, width, which side it's on), in the wheel's own space.
function measure(rig) {
  for (const w of rig.wheels) {
    if (w.tyreInfo) continue;
    const box = new THREE.Box3(); w.group.updateWorldMatrix(true, true);
    const inv = w.group.matrixWorld.clone().invert();
    w.group.traverse(o => { if (o.isMesh && o.material && o.material.name === "Tyre") { const b = new THREE.Box3().setFromObject(o); b.applyMatrix4(inv); box.union(b); } });
    if (box.isEmpty()) continue;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    // Each wheel can be turned inside the model, so find "outwards" (away from the car's middle) in its own space.
    const side = Math.sign(w.home ? w.home.pos.z : c.z) || 1;
    rig.group.updateWorldMatrix(true, false);
    const toWheel = inv.clone().multiply(rig.group.matrixWorld);
    const outward = new THREE.Vector3(0, 0, side).transformDirection(toWheel);
    const dims = [s.x, s.y, s.z], axle = dims.indexOf(Math.min(...dims));
    w.tyreInfo = { centre: c, outerR: Math.max(...dims.filter((_, i) => i !== axle)) / 2, width: dims[axle], outward };
  }
}
function showOriginal(w, on) { w.group.traverse(o => { if (o.isMesh && !o.userData.wheelPart && o.material && ORIGINAL.test(o.material.name)) o.visible = on; }); }
function removeFitted(w) {
  if (!w.fitted) return;
  w.group.remove(w.fitted); w.fitted.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
  w.fitted = null;
}

/* spec: { style, inch, colour (hex), chrome } to fit new wheels, or null for the car's own.
   low: how much smaller in radius low-profile tyres are (0 = normal tyres). On the car's own wheels they
   replace its tyres with thinner-walled ones round the same rim; on new wheels the tyre is made that way.
   Returns a promise that resolves when the wheels are on (the caller redraws). */
export async function fitWheels(rig, spec, low = 0) {
  if (rig.standIn) return false;
  const key = (spec ? [spec.style, spec.inch, spec.colour, !!spec.chrome, spec.matte, spec.machined, spec.lip, rig.carId].join("|") : "") + (low ? "|low" + low : "");
  if (rig.wheelKey === key) return false;
  rig.wheelKey = key;
  if (!spec) {
    for (const w of rig.wheels) { removeFitted(w); showOriginal(w, true); }
    if (low) lowOnOwnRims(rig, low);
    return true;
  }
  const model = await loadRim(spec.style);
  if (!model || rig.wheelKey !== key) return false; // missing file, or changed again while loading
  measure(rig);
  // The rim's own materials, recoloured in the chosen finish (bolts and centre caps keep theirs).
  // Finishes: gloss paint, matte (no clear coat), machined (bright diamond-cut metal) or mirror chrome.
  const finish = new THREE.MeshPhysicalMaterial(spec.chrome ? { color: 0xf2f2f2, metalness: 1, roughness: 0.06 }
    : spec.machined ? { color: 0xd9dde0, metalness: 0.95, roughness: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.05 }
    : spec.matte ? { color: spec.colour, metalness: 0.3, roughness: 0.72, clearcoat: 0 }
    : { color: spec.colour, metalness: 0.75, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.08 });
  const recolour = m => /bolt|cap|logo|silver/i.test(m.name) ? m : Object.assign(finish.clone(), { normalMap: m.normalMap || null, name: "Rim" });
  // The car's own tyre size(s) at its stock rim size; staggered cars (BMW 440i) get front and rear sizes.
  const own = typeof tyreForId === "function" ? tyreForId(rig.carId, spec.inch) : null;
  const wi = rig.wheelInfo, isFront = w => !wi || wi.list[rig.wheels.indexOf(w)].x > (wi.frontX + wi.rearX) / 2; // same order as rig.wheels
  for (const w of rig.wheels) {
    removeFitted(w);
    const t = w.tyreInfo; if (!t) continue;
    showOriginal(w, false);
    const rimD = spec.inch * 0.0254 + 0.045;              // bead seat plus the rim's flanges
    const g = new THREE.Group(); g.userData.wheelPart = true;
    const rim = model.clone(true);
    rim.traverse(o => { if (o.isMesh) { o.material = recolour(o.material); o.castShadow = true; o.receiveShadow = true; o.userData.wheelPart = true; } });
    rim.scale.setScalar(rimD);
    // Some models include a deep mounting barrel; keep the rim inside the tyre's width.
    let depth = new THREE.Box3().setFromObject(rim).getSize(new THREE.Vector3()).z;
    const fitDepth = t.width * 0.94;
    if (depth > fitDepth) { rim.scale.z = rimD * fitDepth / depth; depth = fitDepth; }
    // Face outwards, sitting just inside the tyre's outer sidewall.
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.outward);
    rim.quaternion.copy(turn);
    rim.position.copy(t.centre).addScaledVector(t.outward, t.width / 2 - 0.012 - depth / 2);
    const tyreRimR = spec.inch * 0.0254 / 2 + 0.008;
    const tyre = new THREE.Mesh(makeTyre(tyreRimR, t.outerR - low, t.width * (low ? 0.95 : 1)), rubber);
    tyre.position.copy(t.centre); tyre.quaternion.copy(turn); tyre.castShadow = true; tyre.userData.wheelPart = tyre.userData.ownGeo = true;
    // Polished lip: a bright ring round the outer edge of the rim (two-tone wheels).
    if (spec.lip) { const lip = new THREE.Mesh(new THREE.TorusGeometry(rimD / 2 - 0.012, 0.009, 10, 96), lipChrome); lip.quaternion.copy(turn); lip.position.copy(t.centre).addScaledVector(t.outward, t.width / 2 - 0.014); lip.userData.wheelPart = lip.userData.ownGeo = true; g.add(lip); }
    tyre.add(sidewallLabel(tyreRimR, t.outerR - low, t.width * (low ? 0.95 : 1), spec.inch, Array.isArray(own) ? own[isFront(w) ? 0 : 1] : own)); // size lettering on the outer sidewall
    g.add(rim, tyre);
    w.group.add(g); w.fitted = g;
  }
  return true;
}
// Low-profile tyres on the car's own rims: its tyres are swapped for ones with a thinner sidewall (smaller outside,
// same rim), slightly narrower so the tyre sits a touch stretched on the rim.
function lowOnOwnRims(rig, low) {
  measure(rig);
  for (const w of rig.wheels) {
    const t = w.tyreInfo; if (!t) continue;
    const inv = w.group.matrixWorld.clone().invert(), box = new THREE.Box3();
    w.group.traverse(o => { if (o.isMesh && o.material && o.material.name === "Rim") { const b = new THREE.Box3().setFromObject(o); b.applyMatrix4(inv); box.union(b); } });
    if (box.isEmpty()) continue;
    const s = box.getSize(new THREE.Vector3()), dims = [s.x, s.y, s.z], axle = dims.indexOf(Math.min(...dims));
    const rimR = Math.max(...dims.filter((_, i) => i !== axle)) / 2 - 0.004;
    w.group.traverse(o => { if (o.isMesh && !o.userData.wheelPart && o.material && o.material.name === "Tyre") o.visible = false; });
    const tyre = new THREE.Mesh(makeTyre(rimR, t.outerR - low, t.width * 0.95), rubber);
    tyre.position.copy(t.centre); tyre.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.outward);
    tyre.castShadow = true; tyre.userData.wheelPart = tyre.userData.ownGeo = true;
    const g = new THREE.Group(); g.userData.wheelPart = true; g.add(tyre); w.group.add(g); w.fitted = g;
  }
}

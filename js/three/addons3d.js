/* Add-on parts on the 3D car: spoilers, aero, exhaust tips, roof bars, underglow and so on.
   Parts are modelled shapes placed using each car's measurements ("fit" in models/<car>.json) and rays
   cast at the real body, so they sit on its surface. Paint changes (stripes, carbon or black roof and bonnet, vents, racing numbers) are drawn by
   the paint itself, so they follow the body exactly. Only the build car gets add-ons; the stock car never does. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Measurements for the stand-in shape (cars without a real model yet).
export const STANDIN_FIT = {
  frontX: 2.13, rearX: -2.13, frontBottomY: 0.32, rearBottomY: 0.32, sideZ: 0.9, sillY: 0.32,
  roof: { x0: -1.3, x1: 0.2, y: 1.45, halfW: 0.7, minY: 1.4 }, roofEdge: { x: -1.3, y: 1.45 },
  rearGlass: { top: [-1.2, 1.42], bottom: [-1.55, 0.97], halfW: 0.7 },
  bonnet: { x0: 0.88, x1: 2.05, minY: 0.95, halfW: 0.84, pts: [[0.9, 1.0], [2.05, 1.0]] },
  exhaust: { x: -2.13, y: 0.4, z: 0.55 }, door: { x: 0.2, y: 0.65 }
};

/* ---------- shared materials (made once, never disposed) ---------- */
const MAT = {};
function mats() {
  if (MAT.carbon) return MAT;
  // A small twill-weave picture for carbon parts.
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + Math.floor(y / 2)) % 2 ? "#2a2d31" : "#121315"; g.fillRect(x * 8, y * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6); tex.colorSpace = THREE.SRGBColorSpace;
  MAT.carbon = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  MAT.black = new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.35, clearcoat: 0.5 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.9 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 1, roughness: 0.08 });
  MAT.soot = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide });
  MAT.led = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return MAT;
}

// LED light is bright and saturated, so a paint-like colour ("purple" #5b2d86) is lifted to its LED version.
// Whites and greys become a cool white.
function ledColour(hex) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.15) return new THREE.Color(0xe6f2ff);
  return new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.9), 0.55);
}

/* ---------- small shape helpers ---------- */
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.userData.addon = true; return m; }
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
// A flat shape drawn in x/y and given thickness along z, centred on z.
function slab(points, depth, mat) {
  const s = new THREE.Shape(); s.moveTo(...points[0]); points.slice(1).forEach(p => s.lineTo(...p));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2);
  return mesh(geo, mat);
}
const sides = fn => { const g = new THREE.Group(); g.add(fn(1), fn(-1)); return g; };
/* Measuring the real body where a part goes, so it sits on the surface instead of floating or sinking.
   probe(rig, from, dir) casts one ray in the car's own space and returns where it hits (or null).
   Results are cached per car, so each spot is measured once (a ray on this model takes a few ms). */
const _rc = new THREE.Raycaster();
function probe(rig, o, d, withGlass = false) {
  const key = o.join() + "|" + d.join() + "|" + withGlass;
  rig.probes = rig.probes || new Map();
  if (rig.probes.has(key)) return rig.probes.get(key);
  if (!rig.probeMeshes) { rig.probeMeshes = []; rig.body.traverse(o2 => { if (o2.isMesh && !o2.userData.addon) rig.probeMeshes.push(o2); }); }
  rig.body.updateWorldMatrix(true, true); // the parts too: in photo settings the car is turned, and stale part positions gave skewed hits
  const m = rig.body.matrixWorld, inv = m.clone().invert();
  _rc.set(new THREE.Vector3(...o).applyMatrix4(m), new THREE.Vector3(...d).transformDirection(m));
  const meshes = withGlass ? rig.probeMeshes : rig.probeMeshes.filter(x => !/Glass/.test(x.material.name));
  const h = _rc.intersectObjects(meshes, false)[0], r = h ? h.point.clone().applyMatrix4(inv) : null;
  if (r) r.glass = /Glass/.test(h.object.material.name || ""); // the edge finder needs to know when it reaches a window
  rig.probes.set(key, r); return r;
}
const down = (rig, x, z, glass) => probe(rig, [x, 3, z], [0, -1, 0], glass);
const up = (rig, x, z) => probe(rig, [x, -1, z], [0, 1, 0]);
const fromFront = (rig, y, z) => probe(rig, [4, y, z], [-1, 0, 0]);
const fromBack = (rig, y, z) => probe(rig, [-4, y, z], [1, 0, 0]);
const fromSide = (rig, x, y, k, glass) => probe(rig, [x, y, 3 * k], [0, 0, -k], glass);
const or = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? d : v);

function bonnetY(f, x) { const p = f.bonnet.pts; if (x <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const t = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); } return p[p.length - 1][1]; }

/* ---------- spoilers shaped to the car's own rear edge ----------
   A spoiler on a real car follows the edge it's fitted to: the curve of the boot lid or the roof spoiler seen
   from above, and its height. rearEdge() finds that edge by walking rays back along the body until the surface
   drops away, at several points across the car; sweep() then runs a cross-section (the spoiler's side profile)
   along it, tapering neatly at both ends. */
// Saloons and coupés have a boot deck behind the rear window; hatchbacks don't.
const hasBoot = f => f.rearGlass && f.rearGlass.bottom[0] - f.rearX > 0.3;
// where: "roof" (the roof's back edge or roof spoiler, above the rear window) or "boot" (the boot lid's back edge).
function rearEdge(rig, f, where, n = 13) {
  const roof = where === "roof", half = roof ? f.rearGlass.halfW + 0.03 : Math.min(f.sideZ - 0.16, 0.72);
  const x0 = roof ? f.roofEdge.x + 0.1 : f.rearGlass.bottom[0] - 0.08, pts = [];
  for (let i = 0; i < n; i++) {
    const z = -half + (2 * half * i) / (n - 1);
    let prev = down(rig, x0, z, true), found = null;
    if (!prev) continue;
    for (let x = x0 - 0.03; x > x0 - 0.5; x -= 0.03) {
      const h = down(rig, x, z, true);
      if (!h || prev.y - h.y > 0.04 || (h.glass && !prev.glass)) { // the surface dropped away, or became the window: home in on the edge
        let a = prev.x, b = x;
        for (let k = 0; k < 4; k++) { const mid = (a + b) / 2, hm = down(rig, mid, z, true); if (hm && prev.y - hm.y <= 0.04 && (!hm.glass || prev.glass)) { a = mid; prev = hm; } else b = mid; }
        found = prev; break;
      }
      prev = h;
    }
    // No clear edge (a coupé roof that runs smoothly into the glass): use the measured roof edge.
    if (!found) found = roof ? (down(rig, f.roofEdge.x, z, true) || V3(f.roofEdge.x, f.roofEdge.y, z)) : prev;
    pts.push(V3(found.x, found.y, z));
  }
  // Keep the run of points across the middle that stays on the same edge: going outwards, stop where it
  // suddenly jumps (the measuring slipped off the end of the spoiler onto the window or a lamp).
  const same = (a, b) => Math.abs(a.y - b.y) < 0.1 && Math.abs(a.x - b.x) < 0.08;
  // A single odd point between two that agree is something on the roof (like a shark-fin aerial): drop it.
  for (let i = pts.length - 2; i > 0; i--) if (!same(pts[i], pts[i - 1]) && !same(pts[i], pts[i + 1]) && same(pts[i - 1], pts[i + 1])) pts.splice(i, 1);
  const mid = Math.floor(pts.length / 2); let lo = mid, hi = mid;
  while (lo > 0 && same(pts[lo - 1], pts[lo])) lo--;
  while (hi < pts.length - 1 && same(pts[hi + 1], pts[hi])) hi++;
  pts.splice(hi + 1); pts.splice(0, lo);
  // Smooth out small bumps from the measuring, keeping the ends.
  return pts.map((p, i) => i === 0 || i === pts.length - 1 ? p : V3((pts[i - 1].x + 2 * p.x + pts[i + 1].x) / 4, (pts[i - 1].y + 2 * p.y + pts[i + 1].y) / 4, p.z));
}
/* Runs a closed side profile (points [back, up] in metres, back = towards the rear of the car) along edge points
   that go across the car. The profile shrinks over the last `taper` of each end, so the ends are rounded off
   instead of cut square. */
function sweep(edge, prof, mat, taper = 0.08) {
  if (edge.length < 2) return new THREE.Group(); // couldn't measure the edge on this car
  const n = edge.length, m = prof.length, pos = [], uv = [], idx = [];
  const cu = prof.reduce((s, p) => s + p[0], 0) / m, cv = prof.reduce((s, p) => s + p[1], 0) / m;
  // More rings near the ends for the taper: resample the edge at finer steps there.
  const ts = []; for (let i = 0; i <= 60; i++) { const s = i / 60; ts.push(0.5 - 0.5 * Math.cos(Math.PI * s)); }
  const at = t => { const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), r = f - i; return edge[i].clone().lerp(edge[i + 1], r); };
  const rings = ts.map(t => {
    const e = at(t), s = Math.min(1, Math.min(t, 1 - t) / taper), k = 0.15 + 0.85 * Math.sqrt(s);
    return prof.map(([u, v]) => V3(e.x - (cu + (u - cu) * k), e.y + cv + (v - cv) * k, e.z));
  });
  const span = edge[0].distanceTo(edge[n - 1]);
  rings.forEach((r, ri) => r.forEach((p, j) => { pos.push(p.x, p.y, p.z); uv.push(ts[ri] * span * 4, j / m); })); // carbon weave about 4 repeats a metre
  const P = i => V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  const centreOf = r => rings[r].reduce((s, p) => s.add(p), V3(0, 0, 0)).divideScalar(m);
  // Each triangle is wound so its face points away from `inside` (a point inside the part).
  const tri = (a, b, c, inside) => { const n_ = P(b).sub(P(a)).cross(P(c).sub(P(a))); if (n_.dot(P(a).sub(inside)) >= 0) idx.push(a, b, c); else idx.push(a, c, b); };
  for (let r = 0; r < rings.length - 1; r++) {
    const ctr = centreOf(r).add(centreOf(r + 1)).multiplyScalar(0.5);
    for (let j = 0; j < m; j++) { const a = r * m + j, b = r * m + (j + 1) % m, c = a + m, d = b + m; tri(a, b, d, ctr); tri(a, d, c, ctr); }
  }
  for (const [r, dz] of [[0, 1], [rings.length - 1, -1]]) { // end caps
    const ctr = centreOf(r), ci = pos.length / 3; pos.push(ctr.x, ctr.y, ctr.z); uv.push(ts[r] * span * 4, 0.5);
    const inside = ctr.clone(); inside.z += dz;
    for (let j = 0; j < m; j++) tri(ci, r * m + j, r * m + (j + 1) % m, inside);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, mat);
}
const shine = rig => rig.paints[0]; // body-coloured parts use the car's own paint

/* ---------- the parts. Each returns a shape in the car's own space (front is +x, ground is y = 0). ---------- */
const PARTS = {
  // Lip: a slim carbon blade (about 5 cm deep, a few mm thick) along the back edge, flicked up slightly.
  // Hatchbacks: on the roof spoiler's edge. Saloons and coupés: on the boot lid's edge.
  "spoiler:lip": (f, rig) => sweep(rearEdge(rig, f, hasBoot(f) ? "boot" : "roof"),
    [[-0.03, -0.002], [0.02, 0.004], [0.052, 0.012], [0.056, 0.016], [0.05, 0.017], [0.02, 0.009], [-0.03, 0.005]], mats().carbon, 0.04),
  // Ducktail: a body-coloured kick-up that grows out of the edge, curving up to a sharp lip.
  "spoiler:ducktail": (f, rig) => sweep(rearEdge(rig, f, hasBoot(f) ? "boot" : "roof"),
    [[-0.14, -0.01], [-0.06, 0.004], [0.0, 0.016], [0.05, 0.036], [0.085, 0.058], [0.092, 0.064], [0.084, 0.064], [0.04, 0.046], [-0.04, 0.022], [-0.14, 0.006]], shine(rig), 0.1),
  // Roof spoiler extension (hatchbacks especially): a painted blade carrying the roof line about 15 cm further back,
  // dropping slightly over the rear window, with a gloss black underside and a thin upturned edge.
  "spoiler:roof-ext": (f, rig) => {
    const e = rearEdge(rig, f, "roof"), g = new THREE.Group();
    g.add(sweep(e, [[-0.05, 0.002], [0.04, -0.006], [0.12, -0.02], [0.158, -0.026], [0.162, -0.016], [0.12, -0.008], [0.04, 0.008], [-0.05, 0.012]], hasBoot(f) ? mats().black : shine(rig), 0.05));
    g.add(sweep(e, [[-0.02, -0.004], [0.15, -0.03], [0.15, -0.026], [-0.02, 0.0]], mats().black, 0.06));
    return g;
  },
  // Pedestal wing: a body-coloured wing on two short stands, mid-height above the boot or tailgate.
  "spoiler:pedestal": (f, rig) => {
    const g = new THREE.Group(), boot = hasBoot(f), legZ = Math.min(0.42, f.rearGlass.halfW - 0.12);
    const bx = boot ? (f.rearGlass.bottom[0] + f.rearX) / 2 + 0.05 : f.rearGlass.bottom[0] - 0.03;
    const feet = [1, -1].map(k => down(rig, bx, k * legZ) || V3(bx, f.rearGlass.bottom[1], k * legZ));
    const footY = Math.min(feet[0].y, feet[1].y), y = footY + 0.13, x = bx - 0.03, span = Math.min(1.3, 2 * f.rearGlass.halfW + 0.05);
    const edge = []; for (let i = 0; i <= 8; i++) { const z = -span / 2 + span * i / 8; edge.push(V3(x - 0.012 * (z * z) / (span * span / 4), y, z)); } // slight sweep back at the tips
    g.add(sweep(edge, [[-0.07, 0.0], [-0.04, 0.016], [0.02, 0.022], [0.08, 0.02], [0.11, 0.028], [0.115, 0.024], [0.09, 0.008], [0.02, -0.004], [-0.05, -0.004]], shine(rig), 0.03));
    for (const k of [1, -1]) {
      const foot = feet[k > 0 ? 0 : 1], h = y - foot.y + 0.004;
      // A stand: wider at the foot, narrowing to the wing, leaning back slightly.
      const st = slab([[0.07, 0], [-0.06, 0], [-0.03, h], [0.04, h]], 0.022, shine(rig));
      st.position.set(foot.x - 0.01, foot.y - 0.006, k * legZ); g.add(st);
    }
    return g;
  },
  // GT wing (swan-neck): a thin carbon aerofoil blade, nose down and trailing edge up, with carbon end plates.
  // Two slim black aluminium uprights stand on the boot lid (hatchbacks: the tailgate just under the rear window),
  // rise in front of the blade, arch back over it and hook down onto its top surface, like a real swan-neck wing.
  "spoiler:gt-wing": (f, rig) => {
    const m = mats(), g = new THREE.Group(), boot = hasBoot(f);
    const span = Math.min(1.5, 2 * f.sideZ - 0.2), legZ = Math.min(0.45, span / 2 - 0.25);
    const fx = boot ? f.rearGlass.bottom[0] - 0.12 : f.rearGlass.bottom[0] - 0.03;
    const feet = [1, -1].map(k => down(rig, fx, k * legZ) || V3(fx, f.rearGlass.bottom[1], k * legZ));
    const footY = Math.min(feet[0].y, feet[1].y), chord = 0.25, aoa = 0.14;
    const y = boot ? footY + 0.3 : Math.max(f.roofEdge.y + 0.03, footY + 0.25), x = fx - chord / 2 - 0.05; // blade centre
    // Aerofoil: rounded nose at the front (-back), flat-ish underside, thin trailing edge. Points are [back, up].
    const foil = [[-0.5, 0], [-0.47, 0.045], [-0.38, 0.085], [-0.2, 0.115], [0.05, 0.11], [0.3, 0.075], [0.5, 0.02], [0.5, 0.004],
      [0.3, 0.0], [0.05, -0.012], [-0.2, -0.03], [-0.38, -0.03], [-0.47, -0.016]]
      .map(([u, v]) => [u * chord, v * chord]).map(([u, v]) => [u * Math.cos(aoa) - v * Math.sin(aoa), u * Math.sin(aoa) + v * Math.cos(aoa)]);
    const edge = []; for (let i = 0; i <= 10; i++) { const z = -span / 2 + span * i / 10; edge.push(V3(x - 0.02 * (z * z) / (span * span / 4), y, z)); }
    g.add(sweep(edge, foil, m.carbon, 0.004));
    const top = y + 0.11 * chord; // top of the blade near mid-chord
    for (const k of [1, -1]) {
      // End plate: a carbon plate a little bigger than the blade's side, raked at the back.
      const ex = x - 0.02;
      const ep = slab([[ex + 0.14, y - 0.035], [ex + 0.145, y + 0.03], [ex - 0.02, y + 0.075], [ex - 0.15, y + 0.07], [ex - 0.16, y - 0.01], [ex - 0.1, y - 0.045]], 0.007, m.carbon);
      ep.position.z = k * (span / 2 + 0.0035); g.add(ep);
      // Upright: a curved strip along a swan-neck path, about 3 cm wide and 1.2 cm thick.
      const foot = feet[k > 0 ? 0 : 1], xa = x - 0.01;
      const path = new THREE.CatmullRomCurve3([V3(foot.x, foot.y - 0.01, 0), V3(foot.x - 0.005, (foot.y + top) / 2, 0), V3(foot.x - 0.012, top + 0.022, 0),
        V3((foot.x + xa) / 2, top + 0.045, 0), V3(xa, top + 0.024, 0), V3(xa - 0.003, top - 0.004, 0)]).getPoints(40);
      const w = 0.016, L = [], R = [];
      path.forEach((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], t = V3(b.x - a.x, b.y - a.y, 0).normalize();
        const ww = i < 6 ? w * (1.6 - 0.1 * i) : w; // a little wider at the foot
        L.push([p.x - t.y * ww, p.y + t.x * ww]); R.push([p.x + t.y * ww, p.y - t.x * ww]);
      });
      const up = slab([...L, ...R.reverse()], 0.012, m.black); up.position.z = k * legZ; g.add(up);
      g.add(box(0.14, 0.01, 0.07, m.black, foot.x, foot.y + 0.002, k * legZ)); // mounting plate on the boot
    }
    return g;
  },
  bodykit: (f, rig) => { const g = new THREE.Group(); g.add(frontLip(f, rig), sideSkirts(f, rig), diffuser(f, rig)); return g; },
  widebody: (f, rig) => {
    // Bolt-on over-fenders (unpainted black, like most kits): a wide flare swept round each wheel's axle, about 6-8 cm
    // proud of the body at its edge, thick where it meets the body, with bolts along it.
    const m = mats(), g = new THREE.Group(), r = rig.wheelInfo.r;
    const fender = namedMat("fender", () => new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: 0.55, clearcoat: 0.3 }));
    const profile = [[0.22, -0.006], [0.19, 0.03], [0.14, 0.062], [0.1, 0.078], [0.07, 0.08], [0.052, 0.06], [0.046, 0.02], [0.05, -0.006]].map(([a, h]) => new THREE.Vector2(r + a, h));
    const arc = Math.PI + 0.6, geo = new THREE.LatheGeometry(profile, 48, Math.PI / 2 - 0.3, arc); geo.rotateX(Math.PI / 2); geo.computeVertexNormals();
    for (const w of rig.wheelInfo.list) {
      const k = Math.sign(w.z) || 1, sd = fromSide(rig, w.x, w.y + r + 0.08, k), z = sd ? Math.abs(sd.z) : f.sideZ;
      const flare = new THREE.Group(); flare.position.set(w.x, w.y, k * (z - 0.01)); if (k < 0) flare.rotation.y = Math.PI;
      flare.add(mesh(geo, fender));
      for (let i = 0; i < 11; i++) { const a = Math.PI / 2 - 0.2 + (i / 10) * (arc - 0.25), rr = r + 0.165; flare.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10).rotateX(Math.PI / 2), m.chrome, rr * Math.sin(a), -rr * Math.cos(a), 0.05)); }
      g.add(flare);
    }
    return g;
  },
  exhaust: f => tips(f, [f.exhaust.z], 0.055),
  "Quad exhaust tips": f => tips(f, [f.exhaust.z - 0.065, f.exhaust.z + 0.065], 0.045),
  "Side-exit exhaust": (f, rig) => {
    const m = mats();
    return sides(k => { const g = new THREE.Group(); const t = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 24, 1, true), m.chrome); t.rotation.x = Math.PI / 2; g.add(t, mesh(new THREE.CircleGeometry(0.044, 24), m.soot, 0, 0, 0.03 * k)); g.position.set(rig.wheelInfo.rearX + rig.wheelInfo.r + 0.2, f.sillY - 0.01, k * (f.sideZ + 0.03)); return g; });
  },
  "LED underglow": (f, rig, spec) => {
    // LED strips round the underside light the road in the car's own shape: even under the car, fading
    // softly about half a metre out on every side (not one bright spot in the middle).
    const len = f.frontX - f.rearX, wid = 2 * f.sideZ, pad = 0.7, PL = len + 2 * pad, PW = wid + 2 * pad;
    const key = "under|" + PL.toFixed(2) + "|" + PW.toFixed(2), m = mats();
    if (!m[key]) {
      const W = 512, H = Math.round(512 * PW / PL), c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"), img = g.createImageData(W, H), a = len / 2 - 0.15, b = wid / 2 - 0.08, r = 0.3, sig = 0.26;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const x = Math.abs((px + 0.5) / W * PL - PL / 2), z = Math.abs((py + 0.5) / H * PW - PW / 2);
        const qx = Math.max(0, x - (a - r)), qz = Math.max(0, z - (b - r)), d = Math.hypot(qx, qz) - r; // distance outside the car's rounded outline
        const v = d <= 0 ? 0.9 : 0.9 * Math.exp(-(d * d) / (2 * sig * sig)), i = (py * W + px) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * v);
      }
      g.putImageData(img, 0, 0);
      m[key] = new THREE.CanvasTexture(c);
    }
    const mat = new THREE.MeshBasicMaterial({ color: ledColour(spec.glow || "#22c8ff"), map: m[key], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const p = mesh(new THREE.PlaneGeometry(PL, PW), mat, (f.frontX + f.rearX) / 2, 0.012, 0);
    p.rotation.x = -Math.PI / 2; p.castShadow = false; p.renderOrder = 2; p.userData.ground = true; p.userData.ownMaterials = true; // on the ground, not on the body
    return p;
  },
  "Front canards": (f, rig) => {
    // Dive planes on each bumper corner: a rounded carbon blade, set along the corner's curve,
    // sticking out diagonally and pitched nose-down, two per side (the upper one smaller).
    const m = mats(), s2 = new THREE.Shape();
    s2.moveTo(-0.075, 0); s2.lineTo(0.065, 0); s2.quadraticCurveTo(0.045, 0.05, 0.005, 0.078); s2.quadraticCurveTo(-0.04, 0.072, -0.075, 0.03); s2.lineTo(-0.075, 0);
    const geo = new THREE.ExtrudeGeometry(s2, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 10 }); geo.translate(0, 0, -0.002);
    const cx = f.frontX - 0.15, cz = f.sideZ - 0.15, n = Math.SQRT1_2;
    return sides(k => {
      const g = new THREE.Group();
      for (const [dy, sc] of [[0.1, 1], [0.2, 0.8]]) {
        const y = f.frontBottomY + dy, hit = probe(rig, [cx + 2 * n, y, k * (cz + 2 * n)], [-n, 0, -k * n]) || V3(cx, y, k * cz);
        const yaw = new THREE.Group(); yaw.position.set(hit.x - 0.004 * n, y, hit.z - k * 0.004 * n); yaw.rotation.y = k * 0.7;
        const pitch = new THREE.Group(); pitch.rotation.z = -0.12; yaw.add(pitch);
        const c = mesh(geo, m.carbon); c.rotation.x = k * Math.PI / 2; c.scale.setScalar(sc); pitch.add(c);
        g.add(yaw);
      }
      return g;
    });
  },
  "Rally mud flaps": (f, rig) => {
    const g = new THREE.Group(), flap = namedMat("flap", () => new THREE.MeshStandardMaterial({ color: 0xb3171d, roughness: 0.8 }));
    for (const w of rig.wheelInfo.list) {
      const x = w.x - rig.wheelInfo.r - 0.06, z = w.z, top = Math.min(or((up(rig, x, z) || {}).y, 0.32), 0.42);
      g.add(box(0.008, top - 0.06, 0.26, flap, x, (top + 0.06) / 2, z));
    }
    return g;
  },
  "Roof rack": (f, rig) => {
    const m = mats(), g = new THREE.Group(), r = f.roof, len = r.x1 - r.x0 - 0.3, mid = (r.x0 + r.x1) / 2, z = r.halfW - 0.06;
    const feetY = [-0.6, -0.45, 0.45, 0.6].map(dx => down(rig, mid + dx, z)).filter(Boolean).map(h => h.y);
    const base = feetY.length ? Math.min(...feetY) : r.y - 0.01, railY = base + 0.07;
    g.add(sides(k => box(len, 0.03, 0.03, m.black, mid, railY, k * z)));
    for (const dx of [-0.45, 0.45]) {
      const fy = or((down(rig, mid + dx, z) || {}).y, base);
      g.add(box(0.045, 0.025, 2 * z + 0.08, m.black, mid + dx, railY + 0.03, 0));
      g.add(sides(k => box(0.07, railY - fy + 0.01, 0.045, m.black, mid + dx, (railY + fy) / 2, k * z)));
    }
    return g;
  },
  "LED light bar": (f, rig) => {
    const m = mats(), g = new THREE.Group(), x = f.roof.x1 - 0.15, w = Math.min(1.0, 2 * f.roof.halfW - 0.1), fz = w / 2 - 0.08;
    const fy = Math.min(...[1, -1].map(k => or((down(rig, x - 0.02, k * fz) || {}).y, f.roof.y))), y = fy + 0.09;
    g.add(box(0.07, 0.07, w, m.black, x, y, 0), box(0.004, 0.045, w - 0.04, m.led, x + 0.037, y, 0));
    g.add(sides(k => box(0.05, y - fy, 0.03, m.black, x - 0.02, (y + fy) / 2 - 0.02, k * fz)));
    return g;
  },
  "Air scoop": (f, rig) => {
    const m = mats(), x = f.bonnet.x0 + (f.bonnet.x1 - f.bonnet.x0) * 0.45, y = or((down(rig, x, 0) || {}).y, bonnetY(f, x)), yb = or((down(rig, x - 0.38, 0) || {}).y, bonnetY(f, x - 0.38));
    const s = slab([[0, -0.01], [0, 0.07], [-0.38, -0.01]], 0.34, m.black);
    s.rotation.z = Math.atan2(yb - y, -0.38) + Math.PI; s.position.set(x, y, 0);
    const g = new THREE.Group(); g.add(s);
    const mouth = box(0.005, 0.055, 0.3, m.soot, x + 0.003, y + 0.03, 0); g.add(mouth);
    return g;
  },
  "Rear window louvres": f => {
    const m = mats(), g = new THREE.Group(), [tx, ty] = f.rearGlass.top, [bx, by] = f.rearGlass.bottom;
    const len = Math.hypot(tx - bx, ty - by), nx = -(ty - by) / len, ny = (tx - bx) / len; // outward (back and up)
    const w = 2 * f.rearGlass.halfW - 0.1;
    for (let t = 0.12; t < 0.95; t += 0.1) {
      const s = box(0.05, 0.006, w, m.black, tx + (bx - tx) * t - nx * 0.03, ty + (by - ty) * t + Math.abs(ny) * 0.03, 0);
      g.add(s);
    }
    g.add(sides(k => { const r = box(len, 0.012, 0.025, m.black, (tx + bx) / 2 - nx * 0.03, (ty + by) / 2 + Math.abs(ny) * 0.03, k * w / 2); r.rotation.z = Math.atan2(ty - by, tx - bx); return r; }));
    return g;
  }
};
// Exhaust tips at both back corners; zs are distances from the middle.
function tips(f, zs, r) {
  const m = mats(), g = new THREE.Group();
  for (const k of [1, -1]) for (const z of zs) {
    const t = mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.14, 28, 1, true), m.chrome, f.exhaust.x, f.exhaust.y - 0.02, k * z); t.rotation.z = Math.PI / 2;
    const end = mesh(new THREE.CircleGeometry(r * 0.98, 28), m.soot, f.exhaust.x - 0.06, f.exhaust.y - 0.02, k * z); end.rotation.y = -Math.PI / 2;
    g.add(t, end);
  }
  return g;
}

/* ---------- more parts: lights, protection bars, plates, tyres and the cabin ---------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// A tube through points (bars, cages, snorkels).
function tube(pts, r, mat, closed = false) { return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), closed, "catmullrom", 0.1), Math.max(8, pts.length * 10), r, 10, closed), mat); }
// A flat strap from a to b (w wide, t thick).
function bar(a, b, w, t, mat) {
  const A = V3(...a), B = V3(...b), m = box(w, t, A.distanceTo(B), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.lookAt(B); return m;
}
// Headlight line (measured): from its inner edge to its outer edge on the +z side; mirrored for the other side.
function headLine(f) { return f.headlight || { inner: [1.88, 0.73, 0.64], outer: [1.72, 0.73, 0.81] }; }
function alongHead(f, k, mk) {
  const h = headLine(f), a = V3(...h.inner), b = V3(...h.outer); a.z *= k; b.z *= k;
  const m = mk(a.distanceTo(b)); m.position.copy(a).add(b).multiplyScalar(0.5); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); return m;
}
// Plate styles (the "Styled number plates" part): finish of the letters, shape, border and side badge.
export const PLATE_SHAPES = { standard: [0.52, 0.111], short: [0.33, 0.111], square: [0.279, 0.203], bike: [0.229, 0.178] };
const plateCache = {};
// UK plate lettering: tall and narrow (like the Charles Wright plate font), with the usual gap in "AB12 CDE".
// Wide plates have one line; square and bike plates two ("AB12" over "CDE").
function drawPlateLetters(g, text, Wp, Hp, left) {
  const bare = text.replace(/\s+/g, ""), shown = /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(bare) ? bare.slice(0, 4) + " " + bare.slice(4) : text;
  const font = px => `bold ${px}px "Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  const lines = Wp / Hp > 2.2 ? [shown] : (shown.includes(" ") ? shown.split(" ") : [shown.slice(0, Math.ceil(shown.length / 2)), shown.slice(Math.ceil(shown.length / 2))]);
  const lh = Hp / lines.length, px = Math.round(lh * 0.78), cx = left + (Wp - left) / 2;
  g.font = font(px);
  lines.forEach((ln, i) => {
    const sx = Math.min(0.8, (Wp - left - 30) / Math.max(1, g.measureText(ln).width));
    g.save(); g.scale(sx, 1); g.fillText(ln, cx / sx, lh * i + lh * 0.5 + px * 0.36); g.restore();
  });
}
function plateTexture(text, rear, st = {}, W = 0.52, H = 0.111) {
  const key = [text, rear, JSON.stringify(st), W, H].join("|");
  if (plateCache[key]) return plateCache[key];
  const Wp = Math.round(W * 1000), Hp = Math.round(H * 1000), c = document.createElement("canvas"); c.width = Wp; c.height = Hp; const g = c.getContext("2d");
  g.fillStyle = rear ? "#f7d117" : "#fff"; g.fillRect(0, 0, Wp, Hp);
  // a soft sheen across the plate, like the acrylic face
  const sheen = g.createLinearGradient(0, 0, 0, Hp); sheen.addColorStop(0, "rgba(255,255,255,.18)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(0,0,0,.05)");
  g.fillStyle = sheen; g.fillRect(0, 0, Wp, Hp);
  const badge = st.badge || "uk", left = badge === "none" ? 0 : 44;
  if (badge !== "none") {
    g.fillStyle = "#1d4bb5"; g.fillRect(0, 0, 44, Hp);
    if (badge === "flag") { // a small Union flag over the UK letters
      const fx = 6, fy = 10, fw = 32, fh = 20;
      g.fillStyle = "#012169"; g.fillRect(fx, fy, fw, fh);
      g.strokeStyle = "#fff"; g.lineWidth = 4; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + fw, fy + fh); g.moveTo(fx + fw, fy); g.lineTo(fx, fy + fh); g.stroke();
      g.strokeStyle = "#c8102e"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#fff"; g.fillRect(fx + fw / 2 - 4, fy, 8, fh); g.fillRect(fx, fy + fh / 2 - 4, fw, 8);
      g.fillStyle = "#c8102e"; g.fillRect(fx + fw / 2 - 2, fy, 4, fh); g.fillRect(fx, fy + fh / 2 - 2, fw, 4);
    }
    g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("UK", 22, Hp - 16);
  }
  // printed letters only on standard plates; raised ones are separate 3D layers
  if (!st.finish || st.finish === "standard") { g.fillStyle = "#111"; drawPlateLetters(g, text, Wp, Hp, left); }
  const border = { black: "#111", silver: "#c0c4c8", red: "#c8102e", blue: "#1d4bb5", carbon: "#2a2a2c" }[st.border];
  g.strokeStyle = border || "#222"; g.lineWidth = border ? 9 : 4; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, Wp - g.lineWidth, Hp - g.lineWidth);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (plateCache[key] = t);
}
// Raised letters: a mask (letters only) and, for gel letters, a domed normal map made from the blurred mask.
function letterTextures(text, st, W, H) {
  const key = ["L", text, st.badge, W, H].join("|");
  if (plateCache[key]) return plateCache[key];
  const Wp = Math.round(W * 1000), Hp = Math.round(H * 1000), left = (st.badge || "uk") === "none" ? 0 : 44;
  const c = document.createElement("canvas"); c.width = Wp; c.height = Hp; const g = c.getContext("2d");
  g.fillStyle = "#fff"; drawPlateLetters(g, text, Wp, Hp, left);
  const mask = new THREE.CanvasTexture(c); mask.anisotropy = 8;
  // height = blurred letters; normals from its slope, so the gel catches the light like a rounded resin dome
  const h = document.createElement("canvas"); h.width = Wp; h.height = Hp; const hg = h.getContext("2d");
  hg.fillStyle = "#000"; hg.fillRect(0, 0, Wp, Hp); hg.filter = "blur(3px)"; hg.drawImage(c, 0, 0);
  const src = hg.getImageData(0, 0, Wp, Hp).data, n = hg.createImageData(Wp, Hp), H_ = (x, y) => src[(Math.min(Hp - 1, Math.max(0, y)) * Wp + Math.min(Wp - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
    const dx = (H_(x - 1, y) - H_(x + 1, y)) * 3, dy = (H_(x, y + 1) - H_(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), i = (y * Wp + x) * 4;
    n.data[i] = (dx / l * 0.5 + 0.5) * 255; n.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; n.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; n.data[i + 3] = 255;
  }
  hg.filter = "none"; hg.putImageData(n, 0, 0);
  const normal = new THREE.CanvasTexture(h);
  return (plateCache[key] = { mask, normal });
}
// Writing around a tyre's sidewall (like raised white letters).
let tyreTex = null; const tyreTexts = {};
function tyreLetters(r0, r1, words) {
  if (words) { // other lettering, made once per wording
    if (!tyreTexts[words]) { const c = document.createElement("canvas"); c.width = 1024; c.height = 48; const g = c.getContext("2d"); g.fillStyle = "#f2f0ea"; g.font = "bold 34px Arial, sans-serif"; g.textBaseline = "middle"; for (let i = 0; i < 2; i++) g.fillText(words, 20 + i * 512, 26); tyreTexts[words] = new THREE.CanvasTexture(c); tyreTexts[words].colorSpace = THREE.SRGBColorSpace; }
  }
  if (!tyreTex) {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 48; const g = c.getContext("2d");
    g.fillStyle = "#e9e6dc"; g.font = "bold 34px Arial, sans-serif"; g.textBaseline = "middle";
    for (let i = 0; i < 2; i++) g.fillText("ALL-TERRAIN  ·  A/T  ", 20 + i * 512, 26);
    tyreTex = new THREE.CanvasTexture(c); tyreTex.colorSpace = THREE.SRGBColorSpace;
  }
  const seg = 96, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; for (const [r, v] of [[r0, 0], [r1, 1]]) { pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); uv.push(i / seg, v); } }
  for (let i = 0; i < seg; i++) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const m = mesh(geo, new THREE.MeshStandardMaterial({ map: words ? tyreTexts[words] : tyreTex, transparent: true, roughness: 0.8, side: THREE.DoubleSide })); m.castShadow = false; return m;
}
// ---- the bucket seat's shapes ----
// Shell width (half, w) and bolster depth (d) up the seat, from the hips (0) to the top of the headrest (1).
const BUCKET = [[0, 0.27, 0.17], [0.12, 0.275, 0.17], [0.3, 0.25, 0.11], [0.5, 0.265, 0.13], [0.62, 0.27, 0.15], [0.72, 0.2, 0.08], [0.78, 0.15, 0.06], [0.86, 0.145, 0.09], [0.96, 0.135, 0.08], [1, 0.1, 0.05]];
function bucketAt(t) { for (let i = 1; i < BUCKET.length; i++) if (t <= BUCKET[i][0]) { const [a, w0, d0] = BUCKET[i - 1], [b, w1, d1] = BUCKET[i], f = (t - a) / (b - a), e = f * f * (3 - 2 * f); return [w0 + (w1 - w0) * e, d0 + (d1 - d0) * e]; } return [0.1, 0.05]; }
const headTilt = t => 0.05 * Math.pow(Math.max(0, (t - 0.72) / 0.28), 2); // the headrest leans forward a little
// The back: a U across the seat (round the back, forward to the bolster tips) swept up its height.
// inset moves it inside the shell (for the padded insert); spread and the height range trim it.
function bucketBack(H, inset, spread, t0, t1) {
  const N = 30, M = 32, pos = [], uv = [], idx = [];
  for (let r = 0; r <= N; r++) {
    const t = t0 + (t1 - t0) * r / N, [w, d] = bucketAt(t), y = t * H;
    for (let q = 0; q <= M; q++) {
      const u = q / M, th = (u * 2 - 1) * spread * Math.PI / 2;
      const ww = Math.max(0.05, w - inset), dd = Math.max(0.01, d - inset * 0.6);
      pos.push(inset + dd * (1 - Math.cos(th)) + headTilt(t), y, ww * Math.sin(th)); uv.push(u, (t - t0) / (t1 - t0));
    }
  }
  for (let r = 0; r < N; r++) for (let q = 0; q < M; q++) { const a = r * (M + 1) + q, b = a + 1, c2 = a + M + 1, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// The shell's front edge on one side, up the bolster tips and over the top.
function bucketEdge(H, side) {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, [w, d] = bucketAt(t); pts.push(V3(d + headTilt(t), t * H, side * w)); }
  for (let i = 1; i <= 6; i++) { const th = side * (Math.PI / 2) * (1 - i / 6), [w, d] = bucketAt(1); pts.push(V3(d * (1 - Math.cos(th)) + headTilt(1), H, w * Math.sin(th))); }
  return pts;
}
// Cushion: a padded seat with raised side bolsters and a rolled front edge, on a gloss shell pan.
function bucketCushion(c, xb, zc, pad, shell) {
  const L = c.frontSeatX + 0.36 - xb, W = 0.27, y0 = c.seatY + 0.0, N = 16, M = 24, pos = [], uv = [], idx = [];
  for (let r = 0; r <= N; r++) {
    const a = r / N, x = xb + 0.02 + a * L, roll = a > 0.85 ? Math.pow((a - 0.85) / 0.15, 2) * 0.04 : 0;
    for (let q = 0; q <= M; q++) {
      const u = q / M, z = (u * 2 - 1) * W, e = Math.abs(u * 2 - 1), bol = e > 0.6 ? Math.pow((e - 0.6) / 0.4, 1.5) * 0.08 * (1 - a * 0.4) : 0;
      const drop = e > 0.97 ? (e - 0.97) / 0.03 * 0.07 : 0; // the outer edge turns down
      pos.push(x, y0 + 0.07 + bol - roll - drop, zc + z); uv.push(u, a);
    }
  }
  for (let r = 0; r < N; r++) for (let q = 0; q < M; q++) { const a = r * (M + 1) + q, b = a + 1, c2 = a + M + 1, d2 = c2 + 1; idx.push(a, b, c2, b, d2, c2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group(); g.add(mesh(geo, pad));
  g.add(box(L, 0.05, 2 * W + 0.02, shell, xb + 0.02 + L / 2, y0 + 0.01, zc)); // the shell's seat pan under it
  return g;
}
// Fabric: black, with a darker grey stitched centre panel (red stitching) and pleats.
function bucketFabric() {
  return picture(256, 256, (g, w, h) => {
    g.fillStyle = "#1c1d20"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)"; g.fillRect((i * 97) % w, (i * 57) % h, 2, 2); }
    const x0 = w * 0.34, x1 = w * 0.66; g.fillStyle = "#2f3136"; g.fillRect(x0, 0, x1 - x0, h);
    for (let y = 12; y < h; y += 22) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x0, y, x1 - x0, 2); }
    g.strokeStyle = "#c8161d"; g.lineWidth = 2; g.setLineDash([5, 4]);
    for (const x of [x0 - 4, x1 + 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
}
function cabinOf(f) { return f.cabin || { seatY: 0.62, frontSeatX: -0.2, rearSeatX: -0.95, seatZ: 0.36, headrestX: -0.45, headrestY: 1.3, roofInY: 1.4, wheel: [0.35, 1.0, 0.36], dashX: 0.6 }; }
function namedMat(key, make) { const m = mats(); return m[key] || (m[key] = make()); }
const redMat = () => namedMat("red", () => new THREE.MeshStandardMaterial({ color: 0xc8161d, roughness: 0.7 }));

Object.assign(PARTS, {
  "LED headlight upgrade": f => { const m = mats(); return sides(k => { const s = alongHead(f, k, len => box(0.012, 0.012, len, m.led)); s.position.x -= 0.012; return s; }); },
  "Halo headlights": f => {
    const m = mats(), h = headLine(f);
    return sides(k => { const g = new THREE.Group(); for (const t of [0.3, 0.72]) { const p = V3(...h.inner).lerp(V3(...h.outer), t); p.z *= k; p.x -= 0.015; const ring = mesh(new THREE.TorusGeometry(0.036, 0.004, 8, 40), m.led, p.x, p.y, p.z); ring.rotation.y = Math.PI / 2 + k * 0.75; ring.castShadow = false; g.add(ring); } return g; });
  },
  "Sequential indicators": f => { const amber = namedMat("amber", () => new THREE.MeshBasicMaterial({ color: 0xffa21a })); return sides(k => { const s = alongHead(f, k, len => box(0.01, 0.01, len * 0.9, amber)); s.position.y -= 0.035; s.position.x -= 0.01; return s; }); },
  "Headlight eyelids": f => { const m = mats(); return sides(k => { const s = alongHead(f, k, len => box(0.05, 0.012, len + 0.02, m.black)); s.position.y += 0.05; s.position.x += 0.008; return s; }); },
  "Bull bar": (f, rig) => {
    const m = mats(), x = or((fromFront(rig, 0.45, 0) || {}).x, f.frontX) + 0.07, y0 = f.frontBottomY + 0.02, g = new THREE.Group();
    g.add(tube([[x - 0.05, y0, -0.42], [x, y0 + 0.25, -0.44], [x + 0.02, y0 + 0.42, -0.3], [x + 0.02, y0 + 0.44, 0], [x + 0.02, y0 + 0.42, 0.3], [x, y0 + 0.25, 0.44], [x - 0.05, y0, 0.42]], 0.028, m.black));
    g.add(tube([[x - 0.02, y0 + 0.2, -0.43], [x + 0.03, y0 + 0.22, 0], [x - 0.02, y0 + 0.2, 0.43]], 0.022, m.black));
    return g;
  },
  Snorkel: (f, rig) => {
    const m = mats(), g = new THREE.Group(), r = 0.042;
    // Points up the front wing and A-pillar, each pushed out to the measured surface.
    const path = [[1.25, 0.78], [1.1, 0.95], [0.85, 1.15], [0.6, 1.32], [0.42, 1.42]].map(([x, y]) => { const h = fromSide(rig, x, y, 1, true); return [x, y, (h ? h.z : f.sideZ - (y - 0.8) * 0.4) + r + 0.005]; });
    const top = path[path.length - 1];
    g.add(tube([...path, [top[0], top[1] + 0.1, top[2]]], r, m.black));
    g.add(box(0.16, 0.09, 0.1, m.black, top[0] + 0.04, top[1] + 0.12, top[2]));
    return g;
  },
  "Tow strap": (f, rig) => { const y = f.frontBottomY + 0.08, x = or((fromFront(rig, y, -0.45) || {}).x, f.frontX); const t = mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 24), redMat(), x + 0.02, y, -0.45); t.scale.set(1, 1.6, 0.35); t.rotation.y = Math.PI / 2; return t; },
  // Detachable UK tow bar: a black swan-neck arm curving out from under the middle of the rear bumper to a 50mm ball, plus a 13-pin socket.
  "Tow bar": (f, rig) => {
    const m = mats(), g = new THREE.Group(), steel = namedMat("towSteel", () => new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.9, roughness: 0.35 }));
    const ub = up(rig, f.rearX + 0.14, 0), ry = ub ? Math.min(ub.y, f.rearBottomY + 0.06) : f.rearBottomY, hb = fromBack(rig, f.rearBottomY + 0.08, 0), bx = hb ? hb.x : f.rearX;
    const ballX = bx - 0.1, ballY = Math.max(ry + 0.07, 0.3);
    g.add(tube([[bx + 0.16, ry - 0.025, 0], [bx + 0.02, ry - 0.05, 0], [bx - 0.07, ry - 0.03, 0], [ballX, ballY - 0.06, 0]], 0.017, m.black));
    const collar = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.035, 16), m.black, ballX, ballY - 0.045, 0);
    const ball = mesh(new THREE.SphereGeometry(0.025, 20, 14), steel, ballX, ballY, 0);
    g.add(collar, ball, box(0.03, 0.03, 0.12, m.black, bx + 0.02, ry - 0.05, -0.05));
    const socket = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 16), m.black, bx - 0.005, ry - 0.045, -0.12); socket.rotation.z = Math.PI / 2;
    g.add(socket, box(0.006, 0.05, 0.05, m.black, bx - 0.027, ry - 0.04, -0.12));
    return g;
  },
  "Uprated intercooler": (f, rig) => {
    const mat = namedMat("cooler", () => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 16; const g = c.getContext("2d"); g.fillStyle = "#9aa0a6"; g.fillRect(0, 0, 64, 16); g.fillStyle = "#4a4f55"; for (let x = 0; x < 64; x += 3) g.fillRect(x, 0, 1, 16);
      const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1);
      return new THREE.MeshStandardMaterial({ map: t, metalness: 0.7, roughness: 0.4 });
    });
    const y = f.frontBottomY + 0.12, x = or((fromFront(rig, y, 0.3) || {}).x, f.frontX - 0.1);
    return box(0.015, 0.11, 0.9, mat, x - 0.004, y, 0);
  },
  "Window visors": (f, rig) => {
    const vis = namedMat("visor", () => new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0.88, roughness: 0.1, clearcoat: 1 }));
    const w = f.visor || { y: 1.3, front: [-0.3, 0.45], rear: [-1.05, -0.35], tilt: 0.45 };
    return sides(k => { const g = new THREE.Group(); for (const [a, b] of [w.front, w.rear]) { const h = fromSide(rig, (a + b) / 2, w.y, k, true), z = h ? Math.abs(h.z) : 0.64; const v = box(b - a, 0.06, 0.006, vis, (a + b) / 2, w.y, k * (z + 0.025)); v.rotation.x = -k * w.tilt; g.add(v); } return g; });
  },
  // UK plates, white at the front and yellow at the back, showing the car's reg. Every car has them unless
  // the build takes one off ("Front plate delete" / "Rear plate delete").
  "Number plates": (f, rig, s) => {
    const g = new THREE.Group(), text = (s.plate || "CUSTOM").trim().toUpperCase().slice(0, 8), pl = f.plates || { front: 0.44, rear: 0.6 };
    const ST = s.plateStyle || {}, [W, H] = PLATE_SHAPES[ST.shape] || PLATE_SHAPES.standard, raisedOn = ST.finish && ST.finish !== "standard";
    // Raised letters on a plate face: geoAt(d) gives the face's shape d metres out. 4D laser-cut letters are a stack of
    // thin letter layers 3 mm deep (dark sides, matte top); gel letters are a glossy clear-coated dome on top.
    const raised = (parent, geoAt, rear) => {
      if (!raisedOn) return;
      const { mask, normal } = letterTextures(text, ST, W, H);
      const lay = (d, mat) => { const m = new THREE.Mesh(geoAt(d), mat); m.castShadow = true; parent.add(m); };
      if (ST.finish === "4d" || ST.finish === "4dgel") {
        const side = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, alphaMap: mask, transparent: true, alphaTest: 0.4 });
        for (let d = 0.0005; d < 0.003; d += 0.0005) lay(d, side);
        if (ST.finish === "4d") lay(0.003, new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.35, metalness: 0.1, alphaMap: mask, transparent: true, alphaTest: 0.4 }));
      }
      if (ST.finish === "gel" || ST.finish === "4dgel")
        lay(ST.finish === "gel" ? 0.0012 : 0.0034, new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02,
          normalMap: normal, normalScale: new THREE.Vector2(1.4, rear ? 1.4 : 1.4), alphaMap: mask, transparent: true, alphaTest: 0.4 }));
    };
    // Real plates: flat, rigid, 6 mm thick with dark edges. Each one sits at the panel's angle, just in front of the
    // most raised point behind it (checked across its whole area), so nothing pokes through and it never bends.
    const T = 0.006, edge = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 });
    const place = (rear, y, exact, mat, w = W, h = H) => {
      if (exact) y = exact.at[1]; // the mount's measured height (fit.plates.frontAt / rearAt)
      const hit = (dy, z) => { const r = rear ? fromBack(rig, y + dy, z) : fromFront(rig, y + dy, z); return r ? r.x : null; };
      let slope;
      if (exact) slope = -exact.normal[1] / exact.normal[0];
      else { const t = hit(h / 2, 0), b_ = hit(-h / 2, 0); slope = t !== null && b_ !== null ? Math.max(-0.3, Math.min(0.3, (t - b_) / h)) : 0; }
      let x0 = null;
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 12; j++) {
        const dy = -h / 2 + h * i / 6, z = -w / 2 + w * j / 12, x = hit(dy, z); if (x === null) continue;
        const v = x - dy * slope; x0 = x0 === null ? v : rear ? Math.min(x0, v) : Math.max(x0, v);
      }
      if (x0 === null) { x0 = rear ? f.rearX : f.frontX; slope = 0; }
      const holder = new THREE.Group(), gap = 0.003 + T / 2;
      holder.position.set(x0 + (rear ? -gap : gap), y, 0); holder.rotation.z = -Math.atan(slope);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), mat === rig.paints[0] ? mat : [edge, edge, edge, edge, mat, edge]);
      m.rotation.y = rear ? -Math.PI / 2 : Math.PI / 2; m.castShadow = true; holder.add(m);
      if (mat !== rig.paints[0]) raised(m, d => new THREE.PlaneGeometry(w, h).translate(0, 0, T / 2 + d), rear);
      return holder;
    };
    const plateMat = rear => new THREE.MeshStandardMaterial({ map: plateTexture(text, rear, ST, W, H), roughness: 0.3 });
    // Cars whose model has its own plate panels (the Golf's blank plates, fit.plates.panel = that part's name): the plate
    // face is laid exactly over the panel's own front faces, so it has the panel's real shape and thickness.
    // A panel is a part name, or { mesh, uv: [u0, v0, u1, v1] } to take just the faces using that patch of its texture (the Fiesta's rear recess).
    const onPanel = (rear, yc, mat, spec) => {
      const name = spec.mesh || spec, box_ = spec.uv;
      let src = null; rig.body.traverse(o => { if (o.isMesh && o.name === name) src = o; });
      if (!src) return null;
      rig.body.updateWorldMatrix(true, true);
      const toBody = src.matrixWorld.clone().premultiply(rig.body.matrixWorld.clone().invert()), sg = src.geometry, sp = sg.attributes.position, ix = sg.index, tu = sg.attributes.uv;
      const tri = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), out = rear ? -1 : 1;
      for (let i = 0; i < (ix ? ix.count : sp.count); i += 3) {
        const k = [0, 1, 2].map(j => ix ? ix.getX(i + j) : i + j);
        a.fromBufferAttribute(sp, k[0]).applyMatrix4(toBody); b.fromBufferAttribute(sp, k[1]).applyMatrix4(toBody); c.fromBufferAttribute(sp, k[2]).applyMatrix4(toBody);
        const ctr = a.clone().add(b).add(c).divideScalar(3), nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (box_) { const u = (tu.getX(k[0]) + tu.getX(k[1]) + tu.getX(k[2])) / 3, v = (tu.getY(k[0]) + tu.getY(k[1]) + tu.getY(k[2])) / 3; if (u < box_[0] || u > box_[2] || v < box_[1] || v > box_[3]) continue; }
        else if (Math.abs(ctr.z) > 0.32 || Math.abs(ctr.y - yc) > 0.09 || ctr.x * out < 1.5 || nrm.x * out < 0.6) continue;
        tri.push(a.clone(), b.clone(), c.clone());
      }
      if (!tri.length) return null;
      const box = new THREE.Box3().setFromPoints(tri), pos = [], uv = [];
      for (const v of tri) {
        pos.push(v.x + out * 0.0015, v.y, v.z);
        uv.push(rear ? (v.z - box.min.z) / (box.max.z - box.min.z) : (box.max.z - v.z) / (box.max.z - box.min.z), (v.y - box.min.y) / (box.max.y - box.min.y));
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      if (mat !== rig.paints[0]) raised(m, d => { const g2 = geo.clone(), pp = g2.attributes.position, nn = g2.attributes.normal; for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) + nn.getX(i) * d, pp.getY(i) + nn.getY(i) * d, pp.getZ(i) + nn.getZ(i) * d); return g2; }, rear);
      return m;
    };
    for (const [rear, off, at, yy] of [[false, s.extras.includes("Front plate delete"), pl.frontAt, pl.front], [true, s.extras.includes("Rear plate delete"), pl.rearAt, pl.rear]]) {
      const spec = (!ST.shape || ST.shape === "standard") && ((rear ? pl.panelRear : pl.panelFront) || pl.panel); // other shapes go flat
      const panel = spec && onPanel(rear, yy, off ? rig.paints[0] : plateMat(rear), spec);
      if (panel) { g.add(panel); continue; } // taken off: the panel is body colour, like a smoothed-over plate mount
      if (!off) g.add(place(rear, yy, at, plateMat(rear)));
      // Cars whose model has its own blank plate (the Golf): a body-coloured cover hides it when the plate comes off.
      else if (pl.cover) g.add(place(rear, yy, at, rig.paints[0], W + 0.02, H + 0.015));
    }
    return g; // materials aren't disposed with the part: the cover uses the car's own paint
  },
  "Raised white letters": (f, rig, s) => {
    const g = new THREE.Group(), out = s.wheelOut || 0;
    for (const w of rig.wheelInfo.list) { const k = Math.sign(w.z), t = tyreLetters(w.r * 0.86, w.r * 0.95, "PERFORMANCE  ·  RADIAL  "); t.position.set(w.x, w.y, k * (f.tyreZ || f.sideZ) + k * (out + 0.004)); if (k < 0) t.rotation.y = Math.PI; g.add(t); }
    g.userData.ground = true; g.userData.ownMaterials = true; return g;
  },
  "All-terrain tyres": (f, rig, s) => {
    const g = new THREE.Group(), out = s.wheelOut || 0;
    for (const w of rig.wheelInfo.list) { const k = Math.sign(w.z), t = tyreLetters(w.r * 0.8, w.r * 0.93); t.position.set(w.x, w.y, k * (f.tyreZ || f.sideZ) + k * (out + 0.004)); g.add(t); }
    g.userData.ground = true; g.userData.ownMaterials = true; return g;
  },
  // ---- cabin ----
  "Roll cage": f => {
    const c = cabinOf(f), m = namedMat("cage", () => new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.4, roughness: 0.35 }));
    const x = c.headrestX - 0.12, top = c.roofInY - 0.04, z = 0.6, g = new THREE.Group(), r = 0.02;
    g.add(tube([[x, 0.35, -z], [x, top - 0.08, -z], [x, top, -z + 0.08], [x, top, z - 0.08], [x, top - 0.08, z], [x, 0.35, z]], r, m)); // main hoop
    g.add(tube([[x, 0.4, -z + 0.05], [x, top - 0.05, z - 0.05]], r * 0.9, m)); // diagonal
    for (const k of [1, -1]) {
      g.add(tube([[x, top - 0.04, k * (z - 0.04)], [x - 0.9, 0.55, k * (z - 0.05)]], r * 0.9, m)); // back stays
      g.add(tube([[x, top - 0.02, k * (z - 0.04)], [0.25, top - 0.03, k * (z - 0.06)], [0.8, 0.8, k * 0.66]], r * 0.9, m)); // along the roof and A-pillar
      g.add(tube([[x, 0.42, k * z], [0.6, 0.55, k * (z + 0.02)]], r * 0.9, m)); // door bar
    }
    return g;
  },
  "Bucket seats": (f, rig) => {
    // Fixed-back FIA-style buckets over the front seats: one rounded gloss shell wrapping the shoulders and hips, a tall
    // headrest tilted slightly forward, harness slots at shoulder height, a padded fabric insert with a stitched centre
    // panel, and a padded cushion with raised sides. The back reclines a little; the car's own seats are hidden.
    const c = cabinOf(f), g = new THREE.Group(), H = c.headrestY + 0.12 - c.seatY;
    const shell = namedMat("bucketShell", () => new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }));
    const pad = namedMat("bucketPad", () => new THREE.MeshStandardMaterial({ map: bucketFabric(), roughness: 0.95, side: THREE.DoubleSide }));
    const slotMat = namedMat("bucketSlot", () => new THREE.MeshBasicMaterial({ color: 0x020203 }));
    for (const k of [1, -1]) {
      const zc = k * c.seatZ, xb = c.headrestX - 0.08;
      const seat = new THREE.Group(); seat.position.set(xb, c.seatY - 0.02, zc); seat.rotation.z = 0.14; // reclined back
      seat.add(mesh(bucketBack(H, 0, 1, 0, 1), shell));                                 // the shell
      seat.add(mesh(bucketBack(H, 0.024, 0.86, 0.04, 0.95), pad));                      // the padded insert, inside it
      for (const side of [-1, 1]) seat.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bucketEdge(H, side)), 48, 0.013, 8, false), shell)); // rolled shell edges
      for (const s2 of [-1, 1]) { const sl = mesh(new THREE.BoxGeometry(0.012, 0.075, 0.05), slotMat); sl.position.set(0.03, H * 0.66, s2 * 0.085); seat.add(sl); } // harness slots
      g.add(seat);
      g.add(bucketCushion(c, xb, zc, pad, shell));
    }
    return g;
  },
  "Racing harnesses": (f, rig, s) => {
    const c = cabinOf(f), g = new THREE.Group(), red = redMat(), buckets = s && s.extras && s.extras.includes("Bucket seats");
    const H = c.headrestY + 0.1 - c.seatY, lean = Math.sin(0.14), xb = c.headrestX - 0.06, base = c.seatY - 0.04;
    // The seat's front surface at a height: the bucket's face, or the car's own seat (measured).
    const faceX = (y, z) => {
      if (buckets) return c.headrestX - 0.08 + 0.024 + 0.012 - (y - (c.seatY - 0.02)) * lean; // the bucket insert's face
      const h = probe(rig, [c.frontSeatX + 0.7, y, z], [-1, 0, 0]); return (h && h.x > xb - 0.1 && h.x < c.frontSeatX + 0.5 ? h.x : xb + 0.13) + 0.008;
    };
    const lapY = z => { if (buckets) return c.seatY + 0.065; const h = probe(rig, [c.frontSeatX - 0.05, c.seatY + 0.4, z], [0, -1, 0]); return (h && h.y > c.seatY - 0.1 ? h.y : c.seatY + 0.06) + 0.006; };
    const strap = pts => { for (let i = 1; i < pts.length; i++) g.add(bar(pts[i - 1], pts[i], 0.048, 0.004, red)); };
    for (const k of [1, -1]) {
      const zc = k * c.seatZ, ly = lapY(zc), bx = xb + 0.3, buckle = [bx, ly + 0.012, zc];
      const topY = buckets ? c.seatY - 0.02 + (c.headrestY + 0.12 - c.seatY) * 0.68 : c.headrestY - 0.1; // through the slots
      for (const s2 of [1, -1]) {
        const z = zc + s2 * 0.085;
        // Shoulder strap: from behind the seat, over the top (through the slot on a bucket), down the face to the buckle.
        strap([[faceX(topY, z) - 0.09, topY - 0.12, z], [faceX(topY, z) - 0.01, topY + 0.01, z], [faceX(topY - 0.2, z), topY - 0.2, zc + s2 * 0.07], [faceX(ly + 0.18, zc) + 0.03, ly + 0.15, zc + s2 * 0.045], buckle]);
        // Lap strap: from the hip, along the cushion, to the buckle.
        strap([[xb + 0.06, ly + 0.05, zc + s2 * 0.23], [xb + 0.16, ly + 0.02, zc + s2 * 0.17], buckle]);
      }
      // Crotch strap: up from the front of the cushion to the buckle.
      strap([[bx + 0.13, ly - 0.005, zc], buckle]);
      const disc = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 24), mats().chrome, bx, ly + 0.02, zc); g.add(disc);
    }
    return g;
  },
  "Sport steering wheel": (f, rig, s) => {
    const t = textOf(s, "Sport steering wheel"), c = cabinOf(f), [x, y, z] = c.wheel, r = c.wheelR || 0.178, tilt = 0.38, g = new THREE.Group();
    const n = V3(-Math.cos(tilt), Math.sin(tilt), 0), up = V3(Math.sin(tilt), Math.cos(tilt), 0);
    // The ring's own axes: up the wheel (y), towards the driver (z), across (x), so "top" and "bottom" are the wheel's.
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(up.clone().cross(n), up, n));
    const grip = /carbon/.test(t) ? mats().carbon : /leather/.test(t) ? namedMat("wheelLeather", () => new THREE.MeshPhysicalMaterial({ color: 0x18191b, roughness: 0.5, clearcoat: 0.2 })) : namedMat("alcantara", () => new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.95 }));
    const flat = !/round/.test(t), marker = /no (?:top )?marker/.test(t) ? null : colourIn((t.match(/([a-z0-9-]+(?: [a-z0-9-]+)?) (?:top )?marker/) || [0, ""])[1], "#b5121b");
    const stitch = /stitch/.test(t) ? colourIn((t.match(/([a-z0-9-]+(?: [a-z0-9-]+)?) (?:contrast )?stitch/) || [0, ""])[1], "#b5121b") : null; // the words just before "stitching"
    // The rim: a ring with the bottom cut flat (a straight bar across) when flat-bottomed.
    const arc = flat ? Math.PI * 2 - 1.1 : Math.PI * 2, ring = new THREE.TorusGeometry(r, 0.021, 12, 64, arc); ring.rotateZ(-Math.PI / 2 + (flat ? 0.55 : 0));
    const rim = mesh(ring, grip, x, y, z); rim.quaternion.copy(q); g.add(rim);
    if (flat) { const chord = 2 * r * Math.sin(0.55), bar = mesh(new THREE.CylinderGeometry(0.021, 0.021, chord, 12), grip); bar.rotation.z = Math.PI / 2; const hold = new THREE.Group(); hold.position.set(x, y, z); hold.quaternion.copy(q); bar.position.set(0, -r * Math.cos(0.55), 0); hold.add(bar); g.add(hold); }
    if (marker) { const mark = box(0.03, 0.05, 0.03, new THREE.MeshStandardMaterial({ color: marker, roughness: 0.7 })); mark.position.set(x, y, z).addScaledVector(up, r); mark.quaternion.copy(q); g.add(mark); }
    if (stitch) { const st = mesh(new THREE.TorusGeometry(r, 0.0035, 6, 96, arc), new THREE.MeshStandardMaterial({ color: stitch, roughness: 0.8 })); st.geometry.rotateZ(-Math.PI / 2 + (flat ? 0.55 : 0)); st.position.set(x, y, z).addScaledVector(n, -0.019); st.quaternion.copy(q); g.add(st); }
    g.userData.ownMaterials = false; return g;
  },
  "Short shifter": f => { const m = mats(), c = cabinOf(f), [x, y] = c.gear || [0.12, 0.6], g = new THREE.Group(); g.add(box(0.012, 0.09, 0.012, m.black, x, y + 0.045, 0), mesh(new THREE.SphereGeometry(0.028, 20, 14), m.chrome, x, y + 0.1, 0)); return g; },
  "Sound system upgrade": f => {
    const m = mats(), c = cabinOf(f), x = c.bootX || -1.68, g = new THREE.Group();
    g.add(box(0.32, 0.32, 0.9, m.rubber, x, 0.62, 0));
    for (const z of [-0.22, 0.22]) { const s = mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.04, 32), m.black, x + 0.17, 0.62, z); s.rotation.z = Math.PI / 2; g.add(s, mesh(new THREE.SphereGeometry(0.035, 16, 10), m.chrome, x + 0.19, 0.62, z)); }
    return g;
  },
  "Dash cam": f => { const m = mats(), c = cabinOf(f), p = c.mirror || [0.4, 1.31, 0], g = new THREE.Group(); g.add(box(0.05, 0.045, 0.08, m.black, p[0] + 0.07, p[1] - 0.01, p[2] + 0.1)); const lens = mesh(new THREE.CircleGeometry(0.012, 16), m.soot, p[0] + 0.096, p[1] - 0.01, p[2] + 0.1); lens.rotation.y = Math.PI / 2; g.add(lens); return g; },
  "LED ambient interior lighting": (f, rig, s) => {
    const c = cabinOf(f), mat = new THREE.MeshBasicMaterial({ color: s.ambient || "#3aa8ff", toneMapped: false }), g = new THREE.Group();
    g.add(tube([[c.dashX - 0.04, 0.84, -0.62], [c.dashX - 0.1, 0.86, 0], [c.dashX - 0.04, 0.84, 0.62]], 0.004, mat));
    for (const k of [1, -1]) g.add(tube([[c.dashX - 0.1, 0.82, k * 0.7], [-0.4, 0.8, k * 0.72], [-1.15, 0.8, k * 0.7]], 0.004, mat));
    g.traverse(o => { o.castShadow = false; }); g.userData.ownMaterials = true; return g;
  }
});

/* ---------- cosmetic extras: trim, grilles, bonnet wrap, centre caps and the cabin ----------
   Each reads its colour or finish from what the user chose (s.extraText[name], e.g. "tan leather seat covers"). */
const textOf = (s, name) => ((s.extraText || {})[name] || "").toLowerCase();
// The colour named first in a part's text, as a hex value (COLOURS is the site's colour list), else the fallback.
function coloursIn(text) {
  if (typeof registerCustomColours === "function") registerCustomColours(text);
  const list = typeof COLOURS !== "undefined" ? COLOURS : [], found = [];
  for (const [n, h] of list) { const re = new RegExp("\\b" + n.replace(/-/g, "\\-") + "\\b", "g"); let m; while ((m = re.exec(text))) found.push([m.index, n.length, h]); }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = []; let end = -1;
  for (const [i, l, h] of found) if (i >= end) { out.push(h); end = i + l; } // longest name wins where names overlap ("light grey")
  return out;
}
const colourIn = (text, fallback) => coloursIn(text)[0] || fallback;
// Surfaces that aren't paint, glass, lights or wheels: trim, grilles and the cabin.
function trimTriangles(rig) { return rig.trimTris || (rig.trimTris = copyTriangles(rig, m => !rig.paints.includes(m) && !/Glass|Lens|Rim|Tyre|Caliper|Disc|Hub|Plate/i.test(m.name || ""))); }
function brushed(g, w, h) { g.fillStyle = "#8d9196"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${(y * 7919) % 3 ? "255,255,255" : "40,44,48"},${0.05 + ((y * 104729) % 9) / 100})`; g.fillRect(0, y, w, 1); } }
// Front lip (splitter): traced round the bottom of the front bumper, sticking out about 6 cm past it, with a short
// upturned front face, in gloss black. Ends taper where the bumper turns back at the corners.
function frontLip(f, rig) {
  const fb = up(rig, f.frontX - 0.15, 0), y0 = fb ? fb.y : f.frontBottomY, w = f.sideZ - 0.14, edge = [];
  for (let i = 0; i <= 16; i++) {
    const z = -w + 2 * w * i / 16, h = fromFront(rig, y0 + 0.03, z); if (!h) continue;
    const u = up(rig, h.x - 0.05, z), y = u && Math.abs(u.y - y0) < 0.08 ? u.y : y0;
    edge.push(V3(h.x, y - 0.002, z));
  }
  return sweep(edge, [[0.14, 0], [0.14, -0.018], [-0.07, -0.018], [-0.084, -0.01], [-0.086, 0.032], [-0.074, 0.036], [-0.066, 0.006], [0.0, 0.0]], mats().black, 0.1);
}
// Rear diffuser: a gloss black plate under the back bumper between the exhaust tips, kicking up and out past it, with fins.
function diffuser(f, rig) {
  const m = mats(), g = new THREE.Group(), rb = up(rig, f.rearX + 0.15, 0), ry = rb ? rb.y : f.rearBottomY;
  const back = fromBack(rig, ry + 0.03, 0), bx = back ? back.x : f.rearX, dw = Math.max(0.6, 2 * f.exhaust.z - 0.22);
  const plate = slab([[bx + 0.3, ry - 0.004], [bx - 0.05, ry + 0.03], [bx - 0.05, ry + 0.016], [bx + 0.3, ry - 0.02]], dw, m.black); g.add(plate);
  for (let i = 0; i < 6; i++) { const z = -dw / 2 + 0.04 + i * (dw - 0.08) / 5; const fin = slab([[bx + 0.28, ry - 0.01], [bx - 0.04, ry + 0.02], [bx - 0.045, ry - 0.06], [bx + 0.02, ry - 0.07]], 0.008, m.black); fin.position.z = z; g.add(fin); }
  return g;
}
// Side skirts on their own (the aero kit has them too).
function sideSkirts(f, rig) {
  const m = mats(), xs = rig.wheelInfo, x0 = xs.rearX + xs.r + 0.04, x1 = xs.frontX - xs.r - 0.04;
  return sides(k => {
    const xm = (x0 + x1) / 2, sb = up(rig, xm, k * (f.sideZ - 0.06)), yb = sb ? sb.y : f.sillY - 0.05;
    const sf = fromSide(rig, xm, yb + 0.04, k), zo = sf ? Math.abs(sf.z) : f.sideZ;
    const sec = new THREE.Shape();
    sec.moveTo(zo - 0.06, yb + 0.012); sec.lineTo(zo + 0.014, yb + 0.012); sec.lineTo(zo + 0.026, yb - 0.022); sec.lineTo(zo + 0.03, yb - 0.05); sec.lineTo(zo + 0.058, yb - 0.064); sec.lineTo(zo + 0.056, yb - 0.074); sec.lineTo(zo - 0.06, yb - 0.066);
    const sk = mesh(new THREE.ExtrudeGeometry(sec, { depth: x1 - x0, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 }), m.carbon); sk.rotation.y = -Math.PI / 2; sk.position.set(x1, 0, 0);
    if (k < 0) sk.scale.x = -1;
    return sk;
  });
}
/* The window line: where the side glass meets the door top, found at points along each side by measuring
   from the side (glass above, paint below), then a thin strip of chrome or carbon laid along it. */
function windowLine(f, rig) {
  if (rig.beltLine) return rig.beltLine;
  const xs = rig.wheelInfo, out = { 1: [], [-1]: [] }, yTop = f.roofEdge.y - 0.22;
  for (const k of [1, -1]) for (let i = 0; i <= 14; i++) {
    const x = xs.rearX + xs.r * 0.6 + (xs.frontX - xs.r - 0.25 - xs.rearX - xs.r * 0.6) * i / 14;
    const hi = fromSide(rig, x, yTop, k, true);
    if (!hi || !hi.glass) continue; // a pillar here, not a window
    let a = yTop, b = 0.7, last = hi;
    if ((fromSide(rig, x, b, k, true) || {}).glass) continue;
    for (let n = 0; n < 7; n++) { const y = (a + b) / 2, h = fromSide(rig, x, y, k, true); if (h && h.glass) { a = y; last = h; } else b = y; }
    out[k].push(V3(x, a, last.z));
  }
  return (rig.beltLine = out);
}
function windowStrip(f, rig, mat) {
  const line = windowLine(f, rig), g = new THREE.Group();
  for (const k of [1, -1]) {
    const pts = line[k]; if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p.x, p.y + 0.003, p.z + k * 0.006)));
    g.add(mesh(new THREE.TubeGeometry(curve, pts.length * 8, 0.0065, 8, false), mat));
  }
  return g;
}
// A grille finish over the front's black plastic (grille and bumper openings), seen from the front.
function grilleSkin(f, rig, kind) {
  const tex = kind === "carbon" ? picture(256, 256, (g, w, h) => weave(g, w, h, 16), true) : kind[0] === "#" ? picture(16, 16, (g, w, h) => { g.fillStyle = kind; g.fillRect(0, 0, w, h); }, true) : picture(128, 222, (g, w, h) => {
    g.fillStyle = "#3a3d42"; g.fillRect(0, 0, w, h); g.fillStyle = "#070708";
    const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.fill(); };
    for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, h / 2], [0, h], [w, h]]) hex(cx, cy, w * 0.56);
  }, true);
  const top = f.bonnet ? f.bonnet.minY - 0.02 : 0.75, pl = f.plates || {}, py = pl.frontAt ? pl.frontAt.at[1] : pl.front || 0.45;
  const onPlate = c => Math.abs(c.y - py) < 0.085 && Math.abs(c.z) < 0.3;
  return skin(rig, (c, n) => n.x > 0.45 && c.x > f.frontX - 0.4 && Math.abs(c.z) < 0.6 && c.y > f.frontBottomY + 0.03 && c.y < top && !onPlate(c),
    (x, y, z) => [z / 0.04, y / 0.07], tex, kind === "carbon" || kind[0] === "#" ? { roughness: 0.3 } : { roughness: 0.5, metalness: 0.3, clearcoat: 0 }, trimTriangles(rig), 0.12);
}
// Copies the chosen triangles (lifted slightly off the surface) with a plain material: for re-covering seats.
// A seat cover picture, one tile about 20 cm across: pleats (leather), diamonds (quilted) or a weave (cloth), stitched.
function seatPicture(kind, col, stitch) {
  return picture(256, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    const shade = a => `rgba(0,0,0,${a})`, light = a => `rgba(255,255,255,${a})`;
    if (kind === "cloth") { for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = (x + y) % 8 ? shade(0.12) : light(0.05); g.fillRect(x, y, 2, 2); } }
    if (kind === "alcantara") { for (let i = 0; i < 2500; i++) { g.fillStyle = i % 2 ? shade(0.06) : light(0.04); g.fillRect((i * 97) % w, (i * 57) % h, 2, 2); } }
    const sew = (pts) => { g.strokeStyle = stitch || shade(0.35); g.lineWidth = stitch ? 2 : 1.5; g.setLineDash([5, 4]); g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke(); g.setLineDash([]); };
    if (kind === "quilted") { for (let k = -w; k < 2 * w; k += 48) { sew([[k, 0], [k + h, h]]); sew([[k, h], [k + h, 0]]); } }
    else { for (let x = 32; x < w; x += 64) { g.fillStyle = shade(0.18); g.fillRect(x - 2, 0, 4, h); sew([[x - 6, 0], [x - 6, h]]); sew([[x + 6, 0], [x + 6, h]]); } }
  }, true);
}
function flatSkin(T, keep, mat) {
  const P = T.pos, N = T.nrm, oP = [], oN = [], oU = [], c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < P.length; t += 9) {
    c.set((P[t] + P[t + 3] + P[t + 6]) / 3, (P[t + 1] + P[t + 4] + P[t + 7]) / 3, (P[t + 2] + P[t + 5] + P[t + 8]) / 3);
    nn.set(N[t] + N[t + 3] + N[t + 6], N[t + 1] + N[t + 4] + N[t + 7], N[t + 2] + N[t + 5] + N[t + 8]).normalize();
    if (!keep(c, nn)) continue;
    // Picture coordinates: across the seat (z) by height for upright faces, by length for flat ones (about 20 cm a tile).
    const flat = Math.abs(nn.y) > 0.6;
    for (let j = 0; j < 9; j += 3) { oP.push(P[t + j] + N[t + j] * 0.0008, P[t + j + 1] + N[t + j + 1] * 0.0008, P[t + j + 2] + N[t + j + 2] * 0.0008); oN.push(N[t + j], N[t + j + 1], N[t + j + 2]); oU.push(P[t + j + 2] / 0.2, (flat ? P[t + j] : P[t + j + 1]) / 0.2); }
  }
  if (!oP.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(oP, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(oN, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(oU, 2));
  const m = new THREE.Mesh(geo, mat); m.userData.addon = true; m.receiveShadow = true; return m;
}
Object.assign(PARTS, {
  "Side skirts": (f, rig) => sideSkirts(f, rig),
  // Painted mirror caps: a colour, or the car's own colour ("body-coloured").
  "Coloured mirror caps": (f, rig, s) => {
    const t = textOf(s, "Coloured mirror caps"), col = /body/.test(t) ? "#" + rig.paints[0].color.getHexString() : colourIn(t, "#b5121b");
    const tex = picture(64, 64, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); }, true);
    return skin(rig, (c, n) => n.x > 0 && Math.abs(c.z) > f.sideZ - 0.06 && c.y > 0.9 && c.y < 1.2 && c.x > 0.35 && c.x < 0.75, (x, y, z) => [y, z], tex);
  }, // cars with fitted aero parts use those instead (AERO below)
  "Chrome window trim": (f, rig) => windowStrip(f, rig, mats().chrome),
  "Carbon window trim": (f, rig) => windowStrip(f, rig, mats().carbon),
  // Honeycomb mesh or carbon-look: drawn over the black plastic of the grille and the lower bumper openings.
  "Honeycomb mesh grille": (f, rig) => grilleSkin(f, rig, "honeycomb"),
  "Carbon grille": (f, rig) => grilleSkin(f, rig, "carbon"),
  "Body-colour grille": (f, rig) => grilleSkin(f, rig, "#" + rig.paints[0].color.getHexString()),
  // Sport grille: honeycomb mesh with a thin red line across the top, like a hot hatch's.
  "Sport grille": (f, rig) => {
    const g = grilleSkin(f, rig, "honeycomb"), top = (f.bonnet ? f.bonnet.minY - 0.02 : 0.75) - 0.03, pts = [];
    for (let i = 0; i <= 12; i++) { const z = -0.5 + i / 12; const h = fromFront(rig, top, z); if (h) pts.push(V3(h.x + 0.004, top, z)); }
    if (pts.length > 2) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0045, 6, false), namedMat("grilleRed", () => new THREE.MeshStandardMaterial({ color: 0xd0141c, roughness: 0.35 }))));
    return g;
  },
  "Gloss black window trim": (f, rig) => windowStrip(f, rig, mats().black),
  "Brushed window trim": (f, rig) => windowStrip(f, rig, namedMat("brushedTrim", () => new THREE.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 0.9, roughness: 0.32 }))),
  // Bonnet wrap: just the bonnet in a gloss or matte colour, or carbon-look vinyl.
  "Bonnet wrap": (f, rig, s) => {
    const t = textOf(s, "Bonnet wrap"), b = f.bonnet, col = colourIn(t, "#0b0c0e");
    const kind = /carbon/.test(t) ? "carbon" : /matte?|satin/.test(t) ? "matte" : "gloss";
    const tex = kind === "carbon" ? picture(1024, Math.round(1024 * 2 * b.halfW / (b.x1 - b.x0)), (g, w, h) => weave(g, w, h, 150)) : picture(64, 64, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); });
    const props = kind === "matte" ? { roughness: 0.7, clearcoat: 0 } : kind === "carbon" ? {} : { roughness: 0.2 };
    return skin(rig, (c, n) => n.y > 0.35 && Math.abs(n.z) < 0.6 && c.y > b.minY, (x, y, z) => [(x - b.x0) / (b.x1 - b.x0), (z + b.halfW) / (2 * b.halfW)], tex, props);
  },
  // Centre caps: a coloured cap with a bright edge on each wheel's hub, set on the wheel face found by measuring.
  "Centre cap swap": (f, rig, s) => {
    const t = textOf(s, "Centre cap swap"), col = /chrome|silver/.test(t) ? null : colourIn(t, "#111214");
    const mat = col ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1, metalness: 0.2 }) : mats().chrome;
    const ring = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.15 });
    const g = new THREE.Group(), rc = new THREE.Raycaster();
    rig.group.updateMatrixWorld(true);
    const toGroup = rig.group.matrixWorld.clone().invert();
    for (const w of rig.wheels) {
      const meshes = []; w.group.traverse(o => { if (o.isMesh && o.visible && !/Tyre/.test(o.material.name || "") && !(o.geometry.type === "LatheGeometry")) meshes.push(o); });
      const box = new THREE.Box3(); meshes.forEach(o => box.expandByObject(o)); if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3()), k = Math.sign(c.clone().applyMatrix4(toGroup).z) || 1;
      const outW = V3(0, 0, k).transformDirection(rig.group.matrixWorld);
      rc.set(c.clone().addScaledVector(outW, 1), outW.clone().negate());
      const hit = rc.intersectObjects(meshes, false)[0]; if (!hit) continue;
      const p = hit.point.applyMatrix4(toGroup), cap = new THREE.Group();
      cap.position.set(p.x, p.y, p.z + k * 0.003); if (k < 0) cap.rotation.y = Math.PI;
      const disc = mesh(new THREE.CylinderGeometry(0.03, 0.031, 0.008, 32), mat); disc.rotation.x = Math.PI / 2; cap.add(disc);
      cap.add(mesh(new THREE.TorusGeometry(0.03, 0.0025, 8, 32), ring, 0, 0, 0.004));
      g.add(cap);
    }
    g.userData.ground = true; g.userData.ownMaterials = true; return g; // on the wheels, which aren't on the body
  },
  // ---- cabin ----
  // Seat covers: the seats' own surfaces re-covered in leather or Alcantara; two-tone puts the second colour on the centre panels.
  "Seat covers": (f, rig, s) => {
    const full = textOf(s, "Seat covers"), [t, st = ""] = full.split(" with "), c = cabinOf(f), cols = coloursIn(t);
    const kind = /alcantara|suede/.test(t) ? "alcantara" : /cloth/.test(t) ? "cloth" : /quilt|diamond/.test(t) ? "quilted" : "leather", alc = kind === "alcantara" || kind === "cloth";
    const main = /\btan\b|saddle|cognac/.test(t) ? "#9a6236" : cols[0] || "#18191b", second = /two[- ]?tone/.test(t) ? (cols[1] || "#b5121b") : main;
    const stitch = /stitch/.test(st) ? colourIn(st, "#b5121b") : null;
    const cover = col => new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: seatPicture(kind, col, stitch), roughness: alc ? 0.95 : 0.45, sheen: alc ? 0.6 : 0, sheenColor: new THREE.Color(col), clearcoat: alc ? 0 : 0.15, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const inSeat = p => {
      const front = p.x > c.headrestX - 0.14 && p.x < c.frontSeatX + 0.3 && Math.abs(Math.abs(p.z) - c.seatZ) < 0.23;
      const rear = p.x > c.rearSeatX - 0.36 && p.x < c.rearSeatX + 0.3 && Math.abs(p.z) < 0.56;
      const [wx, wy, wz] = c.wheel, nearWheel = Math.hypot(p.x - wx, p.y - wy) < 0.26 && Math.abs(p.z - wz) < 0.25; // the steering wheel
      return (front || rear) && !nearWheel && p.y > c.seatY - 0.1 && p.y < c.headrestY + 0.06;
    };
    const lining = (p, n) => (n.y < -0.4 && p.y > c.headrestY - 0.1) || p.y > c.roofInY - 0.12; // the roof lining and pillar tops aren't seat
    // Centre panels: the middle of each front seat and of each outer rear place.
    const centre = p => p.x > c.headrestX - 0.14 ? Math.abs(Math.abs(p.z) - c.seatZ) < 0.12 : Math.abs(Math.abs(p.z) - 0.36) < 0.12;
    const T = trimTriangles(rig), g = new THREE.Group();
    for (const [want, col] of [[true, second], [false, main]]) { const m = flatSkin(T, (p, n) => inSeat(p) && !lining(p, n) && centre(p) === want, cover(col)); if (m) g.add(m); }
    g.userData.ownMaterials = true; return g;
  },
  // Dashboard trim: a band of carbon, brushed aluminium or piano black across the dash, at the level of the air vents.
  "Dashboard trim": (f, rig, s) => {
    const t = textOf(s, "Dashboard trim"), c = cabinOf(f), kind = /alu|brushed|metal/.test(t) ? "brushed" : /piano|gloss black/.test(t) ? "piano" : /wood/.test(t) ? "wood" : /painted/.test(t) ? "painted" : "carbon";
    const yc = c.wheel[1] - 0.1, y0 = yc - 0.035, y1 = yc + 0.035, drv = c.wheel[2];
    const tex = picture(512, 64, (g, w, h) => {
      if (kind === "carbon") return weave(g, w, h, 64);
      if (kind === "brushed") return brushed(g, w, h);
      if (kind === "wood") { g.fillStyle = "#5a3418"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${y % 7 < 3 ? "30,14,4" : "140,84,40"},${0.18 + 0.12 * Math.sin(y * 0.9)})`; g.fillRect(0, y, w, 1); } return; }
      g.fillStyle = kind === "painted" ? colourIn(t, "#b5121b") : "#050506"; g.fillRect(0, 0, w, h);
    });
    const props = { side: THREE.DoubleSide, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...(kind === "brushed" ? { metalness: 0.9, roughness: 0.35, clearcoat: 0 } : kind === "piano" || kind === "painted" ? { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 } : kind === "wood" ? { roughness: 0.25, clearcoat: 1 } : { roughness: 0.3 }) };
    return skin(rig, (p, n) => n.x < -0.35 && p.x > c.dashX - 0.15 && p.x < c.dashX + 0.15 && p.y > y0 - 0.03 && p.y < y1 + 0.03 && Math.abs(p.z) < 0.7 && Math.abs(p.z) > 0.14 && Math.abs(p.z - drv) > 0.2, // the dash face, not the centre console
      (x, y, z) => [(z + 0.7) / 1.4, (y - y0) / (y1 - y0)], tex, props, trimTriangles(rig));
  },
  // Floor mats: carpet mats in each footwell with a coloured edge, laid on the floor found by measuring.
  "Floor mats": (f, rig, s) => {
    const t = textOf(s, "Floor mats"), c = cabinOf(f), rubber = /rubber/.test(t), e = t.match(/with (.+?) edging/), edge = rubber ? "#121314" : colourIn(e ? e[1] : t, "#b5121b"), g = new THREE.Group();
    const ridges = rubber && picture(64, 64, (g2, w, h) => { g2.fillStyle = "#151617"; g2.fillRect(0, 0, w, h); g2.fillStyle = "#2a2c2f"; for (let y = 4; y < h; y += 12) g2.fillRect(0, y, w, 4); }, true);
    const carpet = new THREE.MeshStandardMaterial({ color: rubber ? 0xffffff : 0x141416, map: ridges || null, roughness: rubber ? 0.7 : 0.98 }), trim = new THREE.MeshStandardMaterial({ color: edge, roughness: 0.6 });
    if (ridges) ridges.repeat.set(8, 8);
    // Embroidered badge: the car's model badge stitched in the edging colour near the heel.
    const badge = /embroider/.test(t) && picture(256, 96, (g2, w, h) => { g2.fillStyle = rubber ? "#d0d0d0" : edge; g2.font = "bold 64px Arial, sans-serif"; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText(({ golf: "GTI", bmw440i: "M", fiesta: "ST" })[rig.carId] || "", w / 2, h / 2); });
    const outline = (L, W) => { const sh = new THREE.Shape(), r = 0.04; sh.moveTo(-L / 2 + r, -W / 2); sh.lineTo(L / 2 - r, -W / 2); sh.quadraticCurveTo(L / 2, -W / 2, L / 2, -W / 2 + r); sh.lineTo(L / 2, W / 2 - r); sh.quadraticCurveTo(L / 2, W / 2, L / 2 - r, W / 2); sh.lineTo(-L / 2 + r, W / 2); sh.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - r); sh.lineTo(-L / 2, -W / 2 + r); sh.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + r, -W / 2); return sh; };
    // Front: the footwell ahead of the seat. Rear: the floor between the front seat backs and the rear seat, measured from
    // below seat height so the rays reach the floor, not a cushion.
    for (const [x, L, from, max] of [[c.frontSeatX + 0.42, 0.42, 0.6, 0.55], [c.rearSeatX + 0.5, 0.26, 0.42, 0.4]]) for (const k of [1, -1]) {
      const z = k * c.seatZ, a = probe(rig, [x + L / 2 - 0.04, from, z], [0, -1, 0]), b = probe(rig, [x - L / 2 + 0.04, from, z], [0, -1, 0]);
      if (!a || !b || a.y > max || b.y > max) continue;
      const holder = new THREE.Group(); holder.position.set(x, (a.y + b.y) / 2 + 0.004, z); holder.rotation.z = Math.atan2(a.y - b.y, L - 0.08);
      const base = mesh(new THREE.ExtrudeGeometry(outline(L, 0.38), { depth: 0.006, bevelEnabled: false }), trim); base.rotation.x = Math.PI / 2; base.position.y = 0.006; holder.add(base);
      const top = mesh(new THREE.ExtrudeGeometry(outline(L - 0.03, 0.35), { depth: 0.004, bevelEnabled: false }), carpet); top.rotation.x = Math.PI / 2; top.position.y = 0.01; holder.add(top);
      if (badge) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.052), new THREE.MeshStandardMaterial({ map: badge, transparent: true, alphaTest: 0.3, roughness: 0.9 })); b.rotation.x = -Math.PI / 2; b.rotation.z = -Math.PI / 2; b.position.set(-L / 2 + 0.07, 0.0115, 0); holder.add(b); }
      g.add(holder);
    }
    g.userData.ownMaterials = true; return g;
  }
});

// Extra parts shown by changing the paint, wheels or ride height instead of adding a shape.
const PAINT_EXTRAS = ["Carbon-fibre bonnet", "Carbon roof", "Two-tone black roof", "Bonnet vents", "Wing vents", "Racing numbers", "Decals and graphics", "Carbon mirror caps", "Gloss black mirror caps", "Custom graphic wrap", "Paint protection film", "Ceramic coating", "Windscreen sun strip"];
const OTHER_EXTRAS = ["Smoked headlights", "Low-profile tyres", "Caliper paint", "Smoked tail lights", "Wheel spacers", "Negative camber setup", "Chrome wheel finish", "Lift kit", "Chrome delete and black badges", "Gloss black grille", "Front plate delete", "Rear plate delete", "Private number plate", "Styled number plates"];
// Every extra part (by its name in EXTRA_PARTS) that the 3D view can show.
export const SHOWN_EXTRAS = [...Object.keys(PARTS).filter(k => !k.includes(":") && !/^(bodykit|widebody|exhaust)$/.test(k)), ...PAINT_EXTRAS, ...OTHER_EXTRAS];

/* ---------- paint-on effects as thin "skins" on the body ----------
   Stripes, carbon panels, two-tone roof, vents, decals, racing numbers and graphic wraps are real surfaces:
   the body's own paint triangles in that area are copied, lifted 1.5 mm and given a picture, projected flat
   from above, the side or the front. The picture's see-through parts let the real paint show, so the edges are
   crisp wherever the triangles fall, and both the normal 3D and photo quality (path tracing) can see them. */
function paintTriangles(rig) { return rig.paintTris || (rig.paintTris = copyTriangles(rig, m => rig.paints.includes(m))); }
function glassTriangles(rig) { return rig.glassTris || (rig.glassTris = copyTriangles(rig, m => /Glass/.test(m.name || ""))); }
function copyTriangles(rig, pick) {
  rig.body.updateWorldMatrix(true, true);
  const inv = rig.body.matrixWorld.clone().invert(), pos = [], nrm = [], v = new THREE.Vector3(), n = new THREE.Vector3();
  rig.body.traverse(o => {
    if (!o.isMesh || o.userData.addon || !pick(o.material)) return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, idx = g.index;
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), NM = new THREE.Matrix3().getNormalMatrix(M);
    const count = idx ? idx.count : P.count;
    for (let i = 0; i < count; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(P, k).applyMatrix4(M); pos.push(v.x, v.y, v.z);
      if (N) { n.fromBufferAttribute(N, k).applyMatrix3(NM).normalize(); nrm.push(n.x, n.y, n.z); } else nrm.push(0, 1, 0);
    }
  });
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
}
// keep(centre, normal): which triangles to copy; uv(point): where the picture lands (0-1 = inside the picture).
function skin(rig, keep, uv, tex, matProps = {}, T = paintTriangles(rig), maxEdge = Infinity) {
  const P = T.pos, N = T.nrm, oP = [], oN = [], oU = [], c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < P.length; t += 9) {
    c.set((P[t] + P[t + 3] + P[t + 6]) / 3, (P[t + 1] + P[t + 4] + P[t + 7]) / 3, (P[t + 2] + P[t + 5] + P[t + 8]) / 3);
    nn.set(N[t] + N[t + 3] + N[t + 6], N[t + 1] + N[t + 4] + N[t + 7], N[t + 2] + N[t + 5] + N[t + 8]).normalize();
    if (!keep(c, nn)) continue;
    if (maxEdge < Infinity && [[0, 3], [3, 6], [6, 0]].some(([a, b]) => Math.hypot(P[t + a] - P[t + b], P[t + a + 1] - P[t + b + 1], P[t + a + 2] - P[t + b + 2]) > maxEdge)) continue;
    const uvs = [0, 3, 6].map(j => uv(P[t + j], P[t + j + 1], P[t + j + 2]));
    if (tex.wrapS !== THREE.RepeatWrapping && (uvs.every(q => q[0] < 0) || uvs.every(q => q[0] > 1) || uvs.every(q => q[1] < 0) || uvs.every(q => q[1] > 1))) continue; // wholly outside the picture (tiled pictures cover everything)
    for (let j = 0; j < 9; j += 3) {
      oP.push(P[t + j] + N[t + j] * 0.0015, P[t + j + 1] + N[t + j + 1] * 0.0015, P[t + j + 2] + N[t + j + 2] * 0.0015);
      oN.push(N[t + j], N[t + j + 1], N[t + j + 2]); oU.push(...uvs[j / 3]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(oP, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(oN, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(oU, 2));
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, alphaTest: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...matProps });
  const m = new THREE.Mesh(geo, mat); m.userData.addon = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.ownMaterials = true; return g;
}
// A picture to paint on a skin: draw(ctx, w, h) fills it; the outer pixels stay see-through so edges are clean.
function picture(w, h, draw, repeat = false) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  draw(g, w, h);
  if (!repeat) g.clearRect(0, 0, w, 2), g.clearRect(0, h - 2, w, 2), g.clearRect(0, 0, 2, h), g.clearRect(w - 2, 0, 2, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}
function weave(g, w, h, cells) { const s = w / cells; for (let y = 0; y * s < h; y++) for (let x = 0; x < cells; x++) { g.fillStyle = (x + Math.floor(y / 2)) % 2 ? "#2b2e33" : "#111214"; g.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s)); } }
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }
const top = n => n.y > 0.35 && Math.abs(n.z) < 0.6, sideOf = k => n => n.z * k > 0.55;

const SKINS = {
  stripes: (f, rig, s) => {
    // Two stripes nose to tail: over the front bumper, bonnet, roof, tailgate or boot and rear bumper.
    // The picture is long (along the car), so its see-through border is only a few mm at each end;
    // the stripes run a little past both ends, so they wrap right round the bumpers.
    const W = 0.25, L0 = f.rearX - 0.15, L = f.frontX - f.rearX + 0.3, col = s.stripes;
    const tex = picture(256, 1024, (g, w, h) => { g.fillStyle = col; for (const zc of [-0.12, 0.12]) g.fillRect((zc - 0.065 + W) / (2 * W) * w, 0, 0.13 / (2 * W) * w, h); });
    // Upward and end-facing panels (bonnet, roof, tailgate, bumpers), not the sides. Low bits under the bumpers are left plain.
    return skin(rig, (c, n) => c.y > 0.28 && Math.abs(n.z) < 0.55 && (n.y > -0.2 || Math.abs(n.x) > 0.6), (x, y, z) => [(z + W) / (2 * W), (x - L0) / L], tex);
  },
  bonnet: (f, rig, s, black) => {
    const b = f.bonnet, tex = picture(1024, Math.round(1024 * 2 * b.halfW / (b.x1 - b.x0)), (g, w, h) => black ? (g.fillStyle = "#0c0d0f", g.fillRect(0, 0, w, h)) : weave(g, w, h, 150));
    return skin(rig, (c, n) => top(n) && c.y > b.minY, (x, y, z) => [(x - b.x0) / (b.x1 - b.x0), (z + b.halfW) / (2 * b.halfW)], tex);
  },
  roof: (f, rig, s, black) => {
    const r = f.roof, tex = picture(1024, Math.round(1024 * 2 * r.halfW / (r.x1 - r.x0)), (g, w, h) => black ? (g.fillStyle = "#0b0c0e", g.fillRect(0, 0, w, h)) : weave(g, w, h, 300));
    return skin(rig, (c, n) => n.y > 0.5 && c.y > r.minY, (x, y, z) => [(x - r.x0) / (r.x1 - r.x0), (z + r.halfW) / (2 * r.halfW)], tex);
  },
  bonnetVents: (f, rig) => {
    const b = f.bonnet, mid = (b.x0 + b.x1) / 2, x0 = mid - 0.12, x1 = mid + 0.1;
    const tex = picture(256, 512, (g, w, h) => { for (const [z0, z1] of [[0.22, 0.5], [-0.5, -0.22]]) for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? "#0a0b0d" : "#1d2024"; g.fillRect(i * w / 9, (z0 + 0.5) / 1 * h, w / 9 + 1, (z1 - z0) / 1 * h); } });
    return skin(rig, (c, n) => top(n) && c.y > b.minY, (x, y, z) => [(x - x0) / (x1 - x0), (z + 0.5) / 1.0], tex);
  },
  wingVents: (f, rig) => {
    const x0 = rig.wheelInfo.frontX - 0.55, tex = picture(128, 128, (g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#0a0b0d" : "#202328"; g.fillRect(0, i * h / 6, w, h / 6 + 1); } });
    return skin(rig, (c, n) => Math.abs(n.z) > 0.6, (x, y) => [(x - x0) / 0.16, (y - 0.55) / 0.17], tex);
  },
  // Racing numbers and decals have writing, so each side gets its own skin (the far side is mirrored back).
  roundel: (f, rig) => {
    const tex = picture(256, 256, (g, w, h) => { g.fillStyle = "#f2f2ee"; g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, 7); g.fill(); g.lineWidth = w * 0.06; g.strokeStyle = "#111"; g.stroke();
      g.fillStyle = "#111"; g.font = `bold ${h * 0.5}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("27", w / 2, h / 2 + h * 0.03); });
    const out = new THREE.Group();
    for (const k of [1, -1]) out.add(skin(rig, (c, n) => sideOf(k)(n), (x, y) => [(k * (x - f.door.x)) / 0.42 + 0.5, (y - f.door.y) / 0.42 + 0.5], tex));
    out.userData.ownMaterials = true; return out;
  },
  decals: (f, rig) => {
    const x0 = f.door.x - 0.9, len = 1.35, tex = picture(1024, 96, (g, w, h) => {
      for (let i = -2; i < 40; i++) { g.fillStyle = i % 2 ? "#c8161d" : "#0d0e10"; g.beginPath(); g.moveTo(i * 30, h); g.lineTo(i * 30 + 30, h); g.lineTo(i * 30 + 60, 0); g.lineTo(i * 30 + 30, 0); g.fill(); } });
    const out = new THREE.Group();
    for (const k of [1, -1]) out.add(skin(rig, (c, n) => sideOf(k)(n), (x, y) => [k > 0 ? (x - x0) / len : 1 - (x - x0) / len, (y - 0.36) / 0.12], tex));
    out.userData.ownMaterials = true; return out;
  },
  // Windscreen sun strip: a dark vinyl band across the top ~12 cm of the front glass with white lettering.
  sunStrip: (f, rig, s) => {
    const T = glassTriangles(rig), P = T.pos, N = T.nrm, screen = (c, n) => n.x > 0.35 && n.y > 0.2 && Math.abs(n.z) < 0.5 && c.y > 0.9;
    let top = -Infinity, z0 = Infinity, z1 = -Infinity, nx = 0, cnt = 0; const c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let t = 0; t < P.length; t += 9) {
      c.set((P[t] + P[t + 3] + P[t + 6]) / 3, (P[t + 1] + P[t + 4] + P[t + 7]) / 3, (P[t + 2] + P[t + 5] + P[t + 8]) / 3);
      n.set(N[t] + N[t + 3] + N[t + 6], N[t + 1] + N[t + 4] + N[t + 7], N[t + 2] + N[t + 5] + N[t + 8]).normalize();
      if (!screen(c, n)) continue;
      nx += n.x; cnt++;
      for (let j = 0; j < 9; j += 3) { top = Math.max(top, P[t + j + 1]); z0 = Math.min(z0, P[t + j + 2]); z1 = Math.max(z1, P[t + j + 2]); }
    }
    if (!cnt) return new THREE.Group(); // no front glass found on this model
    const y0 = top - 0.12 * (nx / cnt), word = String(s.sunStrip || "GTI").toUpperCase().slice(0, 12); // 12 cm along the sloped glass, as a height
    const tex = picture(1024, 96, (g, w, h) => {
      g.fillStyle = "#0d0e10"; g.fillRect(0, 0, w, h);
      let px = h * 0.62; g.font = `bold ${px}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
      while (g.measureText(word).width > w * 0.6 && px > 20) { px -= 4; g.font = `bold ${px}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`; }
      g.fillStyle = "#f2f2ee"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(word, w / 2, h * 0.55);
    });
    // Seen from the front, the car's left (+z) is on the viewer's right, so the picture runs from +z to -z.
    return skin(rig, (c2, n2) => screen(c2, n2) && c2.y > y0 - 0.03, (x, y, z) => [(z1 - z) / (z1 - z0), (y - y0) / (top - y0)], tex,
      { roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.2 }, T);
  },
  mirrorCaps: (f, rig, s, black) => {
    const tex = picture(256, 256, (g, w, h) => black ? (g.fillStyle = "#0b0c0e", g.fillRect(0, 0, w, h)) : weave(g, w, h, 40));
    return skin(rig, (c, n) => n.x > 0 && Math.abs(c.z) > f.sideZ - 0.06 && c.y > 0.9 && c.y < 1.2 && c.x > 0.35 && c.x < 0.75, (x, y, z) => [(y - 0.9) / 0.3, (Math.abs(z) - f.sideZ + 0.06) / 0.25], tex);
  },
  // Flames run back from the front wheels along the sides and over the bonnet; camo and graffiti cover the body.
  graphic: (f, rig, s) => {
    const L0 = f.rearX - 0.05, L = f.frontX - f.rearX + 0.1, start = rig.wheelInfo.frontX + 0.35, kind = s.graphic || "flames";
    const paintPixels = (W, H, toCar) => (g) => {
      const img = g.createImageData(W, H), d = img.data;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const [x, v] = toCar(px / W, 1 - py / H), i = (py * W + px) * 4; let rgb = null;
        if (kind === "flames") {
          const u = start - x, edge = 0.75 + 0.22 * Math.sin(v * 17 + 1.3) + 0.12 * Math.sin(v * 43) + 0.1 * noise(v * 9, 2);
          if (u > 0 && u < edge) { const t = Math.min(1, u / edge); rgb = [255, 209 - 189 * t, 26 - 21 * t]; }
        } else {
          const a = noise(x * 3, v * 3), b = noise(x * 7 + 4, v * 7 + 4), camo = kind === "camo";
          rgb = a > 0.6 ? (camo ? [64, 74, 46] : [242, 38, 140]) : b > 0.55 ? (camo ? [20, 23, 18] : [250, 217, 26]) : (camo ? [107, 97, 66] : [26, 153, 242]);
        }
        if (rgb) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
      }
      g.putImageData(img, 0, 0);
    };
    // Sides: x along, height up. Top: x along, across the car.
    const sideTex = picture(1024, 256, (g, w, h) => paintPixels(w, h, (u, v) => [L0 + u * L, 0.2 + v * 1.4])(g));
    const topTex = picture(1024, 256, (g, w, h) => paintPixels(w, h, (u, v) => [L0 + u * L, 0.6 + (v * 2 - 1) * 0.8])(g));
    const out = new THREE.Group();
    out.add(skin(rig, (c, n) => Math.abs(n.z) >= 0.35 && c.y > 0.25, (x, y) => [(x - L0) / L, (y - 0.2) / 1.4], sideTex));
    out.add(skin(rig, (c, n) => Math.abs(n.z) < 0.35 && c.y > 0.3, (x, y, z) => [(x - L0) / L, (z + 1) / 2], topTex));
    out.userData.ownMaterials = true; return out;
  }
};

// Wheel positions and size, measured once when a car is made (before it's turned or lowered).
export function measureWheels(rig) {
  rig.group.updateMatrixWorld(true);
  const list = rig.wheels.map(w => { const b = new THREE.Box3().setFromObject(w.group), c = b.getCenter(new THREE.Vector3()); w.home = { pos: w.group.position.clone(), rotX: w.group.rotation.x }; return { x: c.x, y: c.y, z: c.z, r: (b.max.y - b.min.y) / 2 }; });
  rig.wheelInfo = { list, r: list.length ? list[0].r : 0.33, frontX: Math.max(...list.map(w => w.x)), rearX: Math.min(...list.map(w => w.x)) };
}

/* ---------- modelled parts fitted to a particular car (models/aero/<car>/, made by models/tools/prep_aero.py) ----------
   They're saved in the car's own coordinates, so they just go on. Cars without them use the simple shapes above. */
const AERO = {
  exhaust: [["exhaust", n => /chrome/i.test(n) ? "chrome" : "black"]],
  "Quad exhaust tips": [["exhaust-quad", n => /chrome/i.test(n) ? "chrome" : "black"]]
};
const aeroCache = {};
function aeroPart(rig, files) {
  const g = new THREE.Group();
  for (const [file, kind] of files) {
    const url = `models/${rig.aero}/${file}.glb`;
    (aeroCache[url] = aeroCache[url] || new GLTFLoader().loadAsync(url).then(x => x.scene).catch(() => null)).then(scene => {
      if (!scene || !g.parent) return; // missing, or taken off while loading
      const m = mats(), c = scene.clone(true);
      c.traverse(o => {
        if (!o.isMesh) return;
        const k = kind(o.material.name || "");
        o.material = k === "paint" ? rig.paints[0] : m[k] || m.carbon;
        o.castShadow = true; o.receiveShadow = true; o.userData.addon = true;
      });
      g.add(c);
      window.dispatchEvent(new Event("viewer3d-addon-loaded")); // redraw (and refresh photo quality's copy)
    });
  }
  return g;
}

/* Hiding parts of the car's own cabin that a new part replaces: the front seats under bucket seats, the steering
   wheel's rim under a sport wheel. They're part of big shared meshes, so this car gets its own copy of each mesh
   involved and the replaced triangles are left out of its index (put back when the part comes off). The stock car
   beside it keeps everything. Each region is measured once per mesh. */
function cabinRegions(f) {
  const c = cabinOf(f), [wx, wy, wz] = c.wheel, tilt = 0.38, n = V3(-Math.cos(tilt), Math.sin(tilt), 0), r = c.wheelR || 0.178;
  return {
    seats: p => p.x > c.headrestX - 0.2 && p.x < c.frontSeatX + 0.36 && Math.abs(Math.abs(p.z) - c.seatZ) < 0.25 && p.y > c.seatY - 0.06 && p.y < c.headrestY + 0.16,
    wheelRim: p => { const d = V3(p.x - wx, p.y - wy, p.z - wz), a = d.dot(n), rad = d.addScaledVector(n, -a).length(); return Math.abs(a) < 0.07 && rad > r - 0.035 && rad < r + 0.05; }
  };
}
function hideCabin(rig, f, wantHidden) {
  const key = Object.keys(wantHidden).filter(k => wantHidden[k]).sort().join(",");
  if ((rig.hiddenKey || "") === key) return;
  rig.hiddenKey = key;
  const regions = cabinRegions(f), inv = rig.body.matrixWorld.clone().invert(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  rig.body.updateWorldMatrix(true, true);
  rig.body.traverse(o => {
    if (!o.isMesh || o.userData.addon || rig.paints.includes(o.material) || /Glass|Lens|Rim|Tyre|Caliper|Disc|Hub/i.test(o.material.name || "")) return;
    if (!o.userData.cut) { // measured once: which triangles fall in each region
      const g = o.geometry, P = g.attributes.position, idx = g.index, n = idx ? idx.count : P.count, M = o.matrixWorld.clone().premultiply(inv), cut = {};
      for (let i = 0; i < n; i += 3) {
        const k = [0, 1, 2].map(j => idx ? idx.getX(i + j) : i + j);
        a.fromBufferAttribute(P, k[0]).applyMatrix4(M); b.fromBufferAttribute(P, k[1]).applyMatrix4(M); d.fromBufferAttribute(P, k[2]).applyMatrix4(M);
        const ctr = a.clone().add(b).add(d).divideScalar(3);
        for (const r in regions) if (regions[r](ctr)) (cut[r] = cut[r] || new Set()).add(i);
      }
      o.userData.cut = Object.keys(cut).length ? { cut, full: idx ? Array.from(idx.array) : null, n } : { none: true };
      if (!o.userData.cut.none) o.geometry = g.clone(); // this car's own copy
    }
    const info = o.userData.cut; if (info.none) return;
    const active = Object.keys(wantHidden).filter(k => wantHidden[k] && info.cut[k]);
    if (!active.length) { o.geometry.setIndex(info.full ? info.full : null); o.geometry.computeBoundingSphere(); return; }
    const keep = [];
    for (let i = 0; i < info.n; i += 3) if (!active.some(k => info.cut[k].has(i))) for (let j = 0; j < 3; j++) keep.push(info.full ? info.full[i + j] : i + j);
    o.geometry.setIndex(keep); o.geometry.computeBoundingSphere();
  });
  rig.probes = null; rig.probeMeshes = null; rig.trimTris = null; // measurements of the cabin change with it
}

/* ---------- putting a build's add-ons on a car ---------- */
// spec: { spoiler, bodykit, widebody, exhaust, stripes, extras: [names], glow } or null for none.
export function updateAddons(rig, spec, f) {
  if (!rig.fx) rig.fx = { parts: new Map() };
  const s = spec || { extras: [] }, has = n => s.extras.includes(n), want = new Map();
  if (s.spoiler) want.set("spoiler:" + s.spoiler, "");
  for (const k of ["bodykit", "widebody", "exhaust"]) if (s[k] && !(k === "exhaust" && rig.aero && has("Quad exhaust tips"))) want.set(k, "");
  const spacerMm = has("Wheel spacers") ? +((textOf(s, "Wheel spacers").match(/(\d+)\s*mm/) || [0, 20])[1]) : 0;
  const out = spacerMm / 1000 + (s.widebody ? 0.08 : 0), camber = has("Negative camber setup") ? 0.06 : 0;
  s.wheelOut = out;
  // A part's key: when it changes, the part is rebuilt (colour, plate text, wheel position).
  const low = has("Low-profile tyres") ? lowFor(textOf(s, "Low-profile tyres")) : 0;
  const keyOf = n => ({ "LED underglow": s.glow, "LED ambient interior lighting": s.ambient, "Number plates": (s.plate || "") + has("Front plate delete") + has("Rear plate delete") + JSON.stringify(s.plateStyle || {}),
    "All-terrain tyres": String(out) + low, "Raised white letters": String(out) + low, "Racing harnesses": String(has("Bucket seats")), "Centre cap swap": textOf(s, n) + out + low + camber + (rig.wheelKey || "") })[n] ?? textOf(s, n);
  for (const n of s.extras) if (PARTS[n] && !(n === "Side skirts" && s.bodykit)) want.set(n, keyOf(n)); // the aero kit has its own skirts
  // Number plates are on every car unless both are taken off; they show the reg typed in the Studio's plate box, or the car's own.
  want.set("Number plates", keyOf("Number plates")); // always: with a plate off, some cars get a cover over their blank mount
  // Paint-on effects (skins).
  const fx = { "fx:stripes": s.stripes && s.stripes, "fx:bonnet": has("Carbon-fibre bonnet") && "carbon", "fx:roof": (has("Carbon roof") && "carbon") || (has("Two-tone black roof") && "black"),
    "fx:bonnetVents": has("Bonnet vents") && "1", "fx:wingVents": has("Wing vents") && "1", "fx:roundel": has("Racing numbers") && "1", "fx:decals": has("Decals and graphics") && "1",
    "fx:mirrorCaps": (has("Carbon mirror caps") && "1") || (has("Gloss black mirror caps") && "black"), "fx:sunStrip": has("Windscreen sun strip") && (s.sunStrip || "GTI"), "fx:graphic": has("Custom graphic wrap") && (s.graphic || "flames") };
  for (const k in fx) if (fx[k]) want.set(k, String(fx[k]));
  // Rebuild only the parts that changed.
  for (const [k, part] of rig.fx.parts) if (!want.has(k) || want.get(k) !== part.userData.key) { part.parent.remove(part); part.traverse(o => { if (o.isMesh) { if (!rig.aero || !AERO[k]) o.geometry.dispose(); if (part.userData.ownMaterials || o.parent && o.parent.userData.ownMaterials) { if (o.material.map && o.material.map !== tyreTex && !Object.values(tyreTexts).includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); } } }); rig.fx.parts.delete(k); }
  if (!rig.standIn) hideCabin(rig, f, { seats: has("Bucket seats"), wheelRim: has("Sport steering wheel") });
  for (const [k, key] of want) if (!rig.fx.parts.has(k)) {
    const part = k.startsWith("fx:") ? SKINS[k.slice(3)](f, rig, s, key === "black") : rig.aero && AERO[k] ? aeroPart(rig, AERO[k]) : PARTS[k](f, rig, s); part.userData.key = key;
    (part.userData.ground ? rig.group : rig.body).add(part); rig.fx.parts.set(k, part);
  }
  // Wheels: spacers and widebody push them out, camber tilts the tops in.
  for (const w of rig.wheels) {
    if (!w.home) continue; const k = Math.sign(w.home.pos.z) || 1;
    w.group.position.z = w.home.pos.z + k * out; w.group.rotation.x = w.home.rotX - k * camber;
    w.group.position.y = w.home.pos.y - low; // low-profile tyres are a little smaller, so the whole car sits lower
  }
  // Chrome wheels: mirror chrome, so the rim's own painted/machined picture comes off too.
  if (!rig.rimMR) rig.rimMR = rig.rims.map(m => [m.metalness, m.roughness, m.map]);
  rig.rims.forEach((m, i) => {
    const on = has("Chrome wheel finish");
    if (on) { m.color.set(0xffffff); m.metalness = 1; m.roughness = 0.05; m.map = null; } else { m.metalness = rig.rimMR[i][0]; m.roughness = rig.rimMR[i][1]; m.map = rig.rimMR[i][2]; }
    m.needsUpdate = true;
  });
  // Chrome delete: shiny trim goes gloss black. Paint protection film or ceramic coating: an extra-glossy clear coat.
  if (!rig.chromeMats) {
    rig.chromeMats = [];
    rig.group.traverse(o => { const m = o.material; if (o.isMesh && !o.userData.addon && m.metalness === 1 && m.roughness === 0 && !m.map && !m.transparent && !/Lens/.test(m.name) && !rig.chromeMats.includes(m)) rig.chromeMats.push(m); });
    rig.chromeStock = rig.chromeMats.map(m => m.color.clone());
  }
  rig.chromeMats.forEach((m, i) => { if (has("Chrome delete and black badges")) { m.color.set(0x0a0a0b); m.roughness = 0.2; } else { m.color.copy(rig.chromeStock[i]); m.roughness = 0; } });
  // ...and the drawn badges: model names (e.g. "440i") come off, maker logos (VW, BMW roundel, Ford oval) go gloss black.
  const debadge = has("Chrome delete and black badges");
  rig.body.traverse(o => {
    if (!o.userData.badge) return;
    if (o.userData.badgeType === "text") { o.visible = !debadge; return; }
    const m = o.material;
    if (!o.userData.badgeStock) o.userData.badgeStock = [m.color.clone(), m.metalness, m.roughness];
    if (debadge) { m.color.set(0x161618); m.metalness = 0.3; m.roughness = 0.12; }
    else { const [c, mt, r] = o.userData.badgeStock; m.color.copy(c); m.metalness = mt; m.roughness = r; }
  });
  // Gloss black grille: plain (untextured) trim in the middle of the nose, like the BMW's kidneys, goes gloss black.
  // Textured models (Golf, Fiesta) draw their grille in the texture and already have a black one, so nothing changes there.
  if (!rig.grilleMats) {
    rig.grilleMats = [];
    rig.group.updateMatrixWorld(true);
    const toCar = rig.group.matrixWorld.clone().invert(), box = new THREE.Box3(), mid = new THREE.Vector3(), size = new THREE.Vector3();
    rig.group.traverse(o => {
      const m = o.material;
      if (!o.isMesh || o.userData.addon || !m || Array.isArray(m) || m.map || m.transparent || /^(Paint|Glass_|Lens_|Rim|Tyre|Disc|Caliper|Hub)/.test(m.name)) return;
      box.setFromObject(o).applyMatrix4(toCar); box.getCenter(mid); box.getSize(size);
      if (mid.x > f.frontX - 0.25 && Math.abs(mid.z) < 0.5 && size.z < 1 && size.y < 0.4) { o.material = m.clone(); rig.grilleMats.push(o.material); }
    });
    rig.grilleStock = rig.grilleMats.map(m => [m.color.clone(), m.roughness, m.metalness]);
  }
  rig.grilleMats.forEach((m, i) => { const [c, r, mt] = rig.grilleStock[i]; if (has("Gloss black grille")) { m.color.set(0x0a0a0b); m.roughness = 0.2; m.metalness = 0; } else { m.color.copy(c); m.roughness = r; m.metalness = mt; } });
  if (has("Paint protection film") || has("Ceramic coating")) rig.paints.forEach(m => { m.clearcoat = 1; m.clearcoatRoughness = 0.0; });
  return (has("Lift kit") ? 0.06 : 0) - low; // how much the body goes up
}

// How much smaller (in radius) a low-profile tyre is than the car's own, by its profile (45, 40, 35 or 30 series).
export const LOW_PRO = 0.012;
export function lowFor(text) { const p = +((String(text).match(/\b(45|40|35|30)-profile/) || [0, 35])[1]); return { 45: 0.004, 40: 0.008, 35: 0.012, 30: 0.018 }[p] || LOW_PRO; }

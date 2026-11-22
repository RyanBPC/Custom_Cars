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
  const gc = document.createElement("canvas"); gc.width = gc.height = 128; const gg = gc.getContext("2d");
  const grad = gg.createRadialGradient(64, 64, 4, 64, 64, 64); grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.55, "rgba(255,255,255,0.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  MAT.glowTex = new THREE.CanvasTexture(gc);
  MAT.glow = {};
  return MAT;
}
function glowMat(hex) {
  const m = mats();
  return m.glow[hex] || (m.glow[hex] = new THREE.MeshBasicMaterial({ color: hex, map: m.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
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
  rig.probes.set(key, r); return r;
}
const down = (rig, x, z, glass) => probe(rig, [x, 3, z], [0, -1, 0], glass);
const up = (rig, x, z) => probe(rig, [x, -1, z], [0, 1, 0]);
const fromFront = (rig, y, z) => probe(rig, [4, y, z], [-1, 0, 0]);
const fromBack = (rig, y, z) => probe(rig, [-4, y, z], [1, 0, 0]);
const fromSide = (rig, x, y, k, glass) => probe(rig, [x, y, 3 * k], [0, 0, -k], glass);
const or = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? d : v);

function bonnetY(f, x) { const p = f.bonnet.pts; if (x <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const t = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); } return p[p.length - 1][1]; }

/* ---------- the parts. Each returns a shape in the car's own space (front is +x, ground is y = 0). ---------- */
const PARTS = {
  "spoiler:lip": (f, rig) => { const m = mats(), e = down(rig, f.roofEdge.x + 0.02, 0), y = e ? e.y : f.roofEdge.y; const p = box(0.12, 0.012, 2 * f.rearGlass.halfW - 0.05, m.carbon, f.roofEdge.x - 0.04, y - 0.004, 0); p.rotation.z = -0.1; return p; },
  "spoiler:ducktail": (f, rig) => { const p = slab([[0.02, 0], [-0.22, 0.04], [-0.24, 0.075], [0.02, 0.035]], 2 * f.rearGlass.halfW, rig.paints[0]); const e = down(rig, f.roofEdge.x + 0.02, 0); p.position.set(f.roofEdge.x + 0.02, (e ? e.y : f.roofEdge.y) - 0.03, 0); return p; },
  "spoiler:gt-wing": (f, rig) => {
    const m = mats(), g = new THREE.Group(), span = Math.min(1.55, 2 * f.sideZ - 0.2), legZ = 0.4;
    // The legs stand on the boot lid (hatchbacks: the tailgate just below the rear window).
    const bx = f.rearGlass ? f.rearGlass.bottom[0] - 0.03 : f.rearX + 0.15;
    const feet = [1, -1].map(k => down(rig, bx, k * legZ) || V3(bx, f.rearGlass ? f.rearGlass.bottom[1] : 1, k * legZ));
    const footY = Math.min(feet[0].y, feet[1].y), bladeY = Math.max(f.roofEdge.y + 0.02, footY + 0.3), x = bx - 0.07;
    // Wing blade with an aerofoil side profile, trailing edge raised for downforce.
    const blade = slab([[0.16, 0.0], [0.08, 0.025], [-0.1, 0.03], [-0.16, 0.012], [-0.16, -0.004], [0.0, -0.008]], span, m.carbon);
    blade.position.set(x, bladeY, 0); blade.rotation.z = -0.12; g.add(blade);
    for (const k of [1, -1]) {
      const foot = feet[k > 0 ? 0 : 1], h = bladeY - foot.y + 0.01;
      // Swan-neck legs: from the boot lid up and slightly back to the blade, with a mounting plate.
      const leg = box(0.1, h, 0.014, m.black, (foot.x + x) / 2, foot.y + h / 2 - 0.005, k * legZ); leg.rotation.z = Math.atan2(foot.x - x, h); g.add(leg);
      g.add(box(0.12, 0.012, 0.06, m.black, foot.x, foot.y + 0.004, k * legZ));
      g.add(box(0.36, 0.15, 0.01, m.carbon, x, bladeY + 0.01, k * (span / 2 + 0.005))); // end plates
    }
    return g;
  },
  bodykit: (f, rig) => {
    const m = mats(), g = new THREE.Group(), w = f.sideZ - 0.08;
    const fb = up(rig, f.frontX - 0.12, 0), ff = fb && fromFront(rig, fb.y + 0.02, 0);
    const fy = fb ? fb.y : f.frontBottomY, fx = ff ? ff.x : f.frontX;
    // Front splitter, curved to follow the bumper's corners.
    const s = new THREE.Shape(); s.moveTo(-0.08, -w); s.lineTo(0.0, -w); s.quadraticCurveTo(0.09, -w * 0.7, 0.09, 0); s.quadraticCurveTo(0.09, w * 0.7, 0.0, w); s.lineTo(-0.08, w); s.lineTo(-0.08, -w);
    const sp = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: false }), m.carbon, fx - 0.06, fy - 0.016, 0); sp.rotation.x = -Math.PI / 2; g.add(sp);
    // Side skirts between the wheels.
    const xs = rig.wheelInfo, x0 = xs.rearX + xs.r + 0.04, x1 = xs.frontX - xs.r - 0.04;
    // Side skirt: an L-shaped strip tucked under the sill, its outer face just proud of the door bottom.
    g.add(sides(k => {
      const xm = (x0 + x1) / 2, sb = up(rig, xm, k * (f.sideZ - 0.06)), yb = sb ? sb.y : f.sillY - 0.05;
      const sf = fromSide(rig, xm, yb + 0.04, k), zo = sf ? Math.abs(sf.z) : f.sideZ;
      const sec = new THREE.Shape(); // cross-section in (z, y), outer face first
      sec.moveTo(zo - 0.06, yb + 0.012); sec.lineTo(zo + 0.012, yb + 0.012); sec.lineTo(zo + 0.022, yb - 0.025); sec.lineTo(zo + 0.016, yb - 0.06); sec.lineTo(zo - 0.06, yb - 0.05);
      const geo = new THREE.ExtrudeGeometry(sec, { depth: x1 - x0, bevelEnabled: false });
      const sk = mesh(geo, m.carbon); sk.rotation.y = -Math.PI / 2; sk.position.set(x1, 0, 0);
      if (k < 0) { sk.scale.x = -1; }
      return sk;
    }));
    // Rear diffuser with fins.
    const rb = up(rig, f.rearX + 0.12, 0), ry = rb ? rb.y : f.rearBottomY, rbx = fromBack(rig, ry + 0.02, 0), dx = (rbx ? rbx.x : f.rearX) + 0.12, dw = 2 * f.exhaust.z - 0.2;
    g.add(box(0.28, 0.016, dw, m.black, dx, ry - 0.008, 0));
    for (let i = -2; i <= 2; i++) g.add(box(0.24, 0.07, 0.01, m.black, dx + 0.01, ry - 0.045, i * dw / 5));
    return g;
  },
  widebody: (f, rig) => {
    // Bolt-on over-fenders: a flared lip that follows each arch, swept round the wheel's own axle
    // (a lathe), so it is thick where it meets the body and tucks in at the edge, with rivets along it.
    const m = mats(), g = new THREE.Group(), r = rig.wheelInfo.r;
    const profile = [[0.175, -0.012], [0.15, 0.022], [0.115, 0.048], [0.085, 0.062], [0.062, 0.058], [0.05, 0.035], [0.052, -0.012]].map(([a, h]) => new THREE.Vector2(r + a, h));
    const arc = Math.PI + 0.5, geo = new THREE.LatheGeometry(profile, 40, Math.PI / 2 - 0.25, arc); geo.rotateX(Math.PI / 2); geo.computeVertexNormals();
    for (const w of rig.wheelInfo.list) {
      const k = Math.sign(w.z) || 1, sd = fromSide(rig, w.x, w.y + r + 0.06, k), z = sd ? Math.abs(sd.z) : f.sideZ;
      const flare = new THREE.Group(); flare.position.set(w.x, w.y, k * (z - 0.012)); if (k < 0) flare.rotation.y = Math.PI;
      flare.add(mesh(geo, rig.paints[0]));
      for (let i = 0; i < 9; i++) { // rivets on the outer face
        const a = Math.PI / 2 - 0.15 + (i / 8) * (arc - 0.2), rr = r + 0.128;
        flare.add(mesh(new THREE.SphereGeometry(0.0065, 8, 6), m.chrome, rr * Math.sin(a), -rr * Math.cos(a), 0.04));
      }
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
    const m = mats(), g = new THREE.Group();
    for (const w of rig.wheelInfo.list) {
      const x = w.x - rig.wheelInfo.r - 0.07, z = Math.sign(w.z) * (f.sideZ - 0.12), top = or((up(rig, x, z) || {}).y, 0.3);
      g.add(box(0.012, top - 0.07, 0.2, m.rubber, x, (top + 0.07) / 2, z));
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
let tyreTex = null;
function tyreLetters(r0, r1) {
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
  const m = mesh(geo, new THREE.MeshStandardMaterial({ map: tyreTex, transparent: true, roughness: 0.8, side: THREE.DoubleSide })); m.castShadow = false; return m;
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
  "Bucket seats": f => {
    const c = cabinOf(f), g = new THREE.Group(), m = mats();
    for (const k of [1, -1]) {
      const zc = k * c.seatZ, xb = c.headrestX - 0.04;
      const back = box(0.03, c.headrestY - c.seatY + 0.12, 0.56, m.carbon, xb, (c.headrestY + c.seatY) / 2, zc); back.rotation.z = -0.12; g.add(back);
      for (const s of [1, -1]) { const side = slab([[xb, c.seatY - 0.08], [c.frontSeatX + 0.32, c.seatY - 0.06], [c.frontSeatX + 0.3, c.seatY + 0.1], [xb + 0.12, c.seatY + 0.16], [xb + 0.06, c.headrestY - 0.1], [xb - 0.02, c.headrestY - 0.12]], 0.03, m.carbon); side.position.z = zc + s * 0.27; g.add(side); }
    }
    return g;
  },
  "Racing harnesses": f => {
    const c = cabinOf(f), g = new THREE.Group(), red = redMat();
    for (const k of [1, -1]) {
      const zc = k * c.seatZ, xb = c.headrestX + 0.06;
      for (const s of [1, -1]) {
        g.add(bar([xb, c.headrestY - 0.12, zc + s * 0.1], [xb + 0.1, c.seatY + 0.22, zc + s * 0.08], 0.05, 0.006, red));
        g.add(bar([xb + 0.1, c.seatY + 0.22, zc + s * 0.08], [c.frontSeatX + 0.12, c.seatY + 0.06, zc + s * 0.04], 0.05, 0.006, red));
        g.add(bar([c.frontSeatX - 0.02, c.seatY + 0.04, zc + s * 0.24], [c.frontSeatX + 0.12, c.seatY + 0.06, zc], 0.05, 0.006, red));
      }
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), mats().chrome, c.frontSeatX + 0.12, c.seatY + 0.07, zc));
    }
    return g;
  },
  "Sport steering wheel": f => {
    const c = cabinOf(f), [x, y, z] = c.wheel, r = c.wheelR || 0.178, tilt = 0.38, g = new THREE.Group();
    const n = V3(-Math.cos(tilt), Math.sin(tilt), 0), up = V3(Math.sin(tilt), Math.cos(tilt), 0);
    const alc = namedMat("alcantara", () => new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.95 }));
    const rim = mesh(new THREE.TorusGeometry(r, 0.021, 12, 64), alc, x, y, z); rim.quaternion.setFromUnitVectors(V3(0, 0, 1), n); g.add(rim);
    const mark = box(0.03, 0.05, 0.03, redMat()); mark.position.set(x, y, z).addScaledVector(up, r); mark.quaternion.copy(rim.quaternion); g.add(mark);
    return g;
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

// Extra parts shown by changing the paint, wheels or ride height instead of adding a shape.
const PAINT_EXTRAS = ["Carbon-fibre bonnet", "Carbon roof", "Two-tone black roof", "Bonnet vents", "Wing vents", "Racing numbers", "Decals and graphics", "Carbon mirror caps", "Gloss black mirror caps", "Custom graphic wrap", "Paint protection film", "Ceramic coating", "Windscreen sun strip"];
const OTHER_EXTRAS = ["Wheel spacers", "Negative camber setup", "Chrome wheel finish", "Lift kit", "Chrome delete and black badges", "Gloss black grille", "Front plate delete", "Rear plate delete", "Private number plate", "Styled number plates"];
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
function skin(rig, keep, uv, tex, matProps = {}, T = paintTriangles(rig)) {
  const P = T.pos, N = T.nrm, oP = [], oN = [], oU = [], c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < P.length; t += 9) {
    c.set((P[t] + P[t + 3] + P[t + 6]) / 3, (P[t + 1] + P[t + 4] + P[t + 7]) / 3, (P[t + 2] + P[t + 5] + P[t + 8]) / 3);
    nn.set(N[t] + N[t + 3] + N[t + 6], N[t + 1] + N[t + 4] + N[t + 7], N[t + 2] + N[t + 5] + N[t + 8]).normalize();
    if (!keep(c, nn)) continue;
    const uvs = [0, 3, 6].map(j => uv(P[t + j], P[t + j + 1], P[t + j + 2]));
    if (uvs.every(q => q[0] < 0) || uvs.every(q => q[0] > 1) || uvs.every(q => q[1] < 0) || uvs.every(q => q[1] > 1)) continue; // wholly outside the picture
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
  if (!repeat) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
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
  "spoiler:gt-wing": [["wing", n => /post/i.test(n) ? "black" : "carbon"]],
  "spoiler:lip": [["lip", () => "carbon"]],
  "spoiler:ducktail": [["ducktail", () => "paint"]],
  bodykit: [["splitter", () => "carbon"], ["skirts", () => "carbon"], ["diffuser", () => "black"]],
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

/* ---------- putting a build's add-ons on a car ---------- */
// spec: { spoiler, bodykit, widebody, exhaust, stripes, extras: [names], glow } or null for none.
export function updateAddons(rig, spec, f) {
  if (!rig.fx) rig.fx = { parts: new Map() };
  const s = spec || { extras: [] }, has = n => s.extras.includes(n), want = new Map();
  if (s.spoiler) want.set("spoiler:" + s.spoiler, "");
  for (const k of ["bodykit", "widebody", "exhaust"]) if (s[k] && !(k === "exhaust" && rig.aero && has("Quad exhaust tips"))) want.set(k, "");
  const out = (has("Wheel spacers") ? 0.02 : 0) + (s.widebody ? 0.04 : 0), camber = has("Negative camber setup") ? 0.06 : 0;
  s.wheelOut = out;
  // A part's key: when it changes, the part is rebuilt (colour, plate text, wheel position).
  const keyOf = n => ({ "LED underglow": s.glow, "LED ambient interior lighting": s.ambient, "Number plates": (s.plate || "") + has("Front plate delete") + has("Rear plate delete") + JSON.stringify(s.plateStyle || {}), "All-terrain tyres": String(out) })[n] || "";
  for (const n of s.extras) if (PARTS[n]) want.set(n, keyOf(n));
  // Number plates are on every car unless both are taken off; they show the reg typed in the Studio's plate box, or the car's own.
  want.set("Number plates", keyOf("Number plates")); // always: with a plate off, some cars get a cover over their blank mount
  // Paint-on effects (skins).
  const fx = { "fx:stripes": s.stripes && s.stripes, "fx:bonnet": has("Carbon-fibre bonnet") && "carbon", "fx:roof": (has("Carbon roof") && "carbon") || (has("Two-tone black roof") && "black"),
    "fx:bonnetVents": has("Bonnet vents") && "1", "fx:wingVents": has("Wing vents") && "1", "fx:roundel": has("Racing numbers") && "1", "fx:decals": has("Decals and graphics") && "1",
    "fx:mirrorCaps": (has("Carbon mirror caps") && "1") || (has("Gloss black mirror caps") && "black"), "fx:sunStrip": has("Windscreen sun strip") && (s.sunStrip || "GTI"), "fx:graphic": has("Custom graphic wrap") && (s.graphic || "flames") };
  for (const k in fx) if (fx[k]) want.set(k, String(fx[k]));
  // Rebuild only the parts that changed.
  for (const [k, part] of rig.fx.parts) if (!want.has(k) || want.get(k) !== part.userData.key) { part.parent.remove(part); part.traverse(o => { if (o.isMesh) { if (!rig.aero || !AERO[k]) o.geometry.dispose(); if (part.userData.ownMaterials || o.parent && o.parent.userData.ownMaterials) { if (o.material.map && o.material.map !== tyreTex) o.material.map.dispose(); o.material.dispose(); } } }); rig.fx.parts.delete(k); }
  for (const [k, key] of want) if (!rig.fx.parts.has(k)) {
    const part = k.startsWith("fx:") ? SKINS[k.slice(3)](f, rig, s, key === "black") : rig.aero && AERO[k] ? aeroPart(rig, AERO[k]) : PARTS[k](f, rig, s); part.userData.key = key;
    (part.userData.ground ? rig.group : rig.body).add(part); rig.fx.parts.set(k, part);
  }
  // Wheels: spacers and widebody push them out, camber tilts the tops in.
  for (const w of rig.wheels) {
    if (!w.home) continue; const k = Math.sign(w.home.pos.z) || 1;
    w.group.position.z = w.home.pos.z + k * out; w.group.rotation.x = w.home.rotX - k * camber;
  }
  // Chrome wheels.
  if (!rig.rimMR) rig.rimMR = rig.rims.map(m => [m.metalness, m.roughness]);
  rig.rims.forEach((m, i) => { if (has("Chrome wheel finish")) { m.color.set(0xffffff); m.metalness = 1; m.roughness = 0.06; } else { m.metalness = rig.rimMR[i][0]; m.roughness = rig.rimMR[i][1]; } });
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
  return has("Lift kit") ? 0.06 : 0; // how much the body goes up
}

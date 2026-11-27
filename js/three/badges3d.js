/* Badges (makers' logos and model names) drawn sharp onto the 3D cars.
   Game models often ship their badges blank (the game paints them on while it runs), so a car's
   models/<car>.json can list them: { "type": "bmw" | "vw" | "ford" | "text", "text": "440i", "style": "red" (text only), "from": [x, y, z], "dir": [dx, dy, dz], "size": metres }.
   A ray from "from" along "dir" finds the body, and the badge is laid flat on the spot it hits, upright. */
import * as THREE from "three";

const texCache = {};

// Each badge is drawn twice: once in colour, once as a "shine map" (blue channel = metal, green = roughness) so the
// chrome parts (rims, lettering, the VW V/W) reflect the studio like real chrome and the enamel/paint stays satin.
// k(colour, chrome) gives the colour to paint with: the real colour, or the map's chrome/enamel value.
const CHROME = "rgb(0,38,255)", ENAMEL = "rgb(0,102,0)";  // metal 1, roughness 0.15 / metal 0, roughness 0.4
const paint = (g, mask) => (col, chrome) => mask ? (chrome ? CHROME : ENAMEL) : (typeof col === "function" ? col(g) : col);

// The BMW roundel: black ring with B M W round the top, blue and white quarters in the middle.
function drawBMW(g, S, k) {
  const c = S / 2;
  g.fillStyle = k("#c9ccd1", true); g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();         // chrome edge
  g.fillStyle = k("#0b0b0d"); g.beginPath(); g.arc(c, c, c * 0.93, 0, Math.PI * 2); g.fill();  // black ring
  g.fillStyle = k("#c9ccd1", true); g.beginPath(); g.arc(c, c, c * 0.62, 0, Math.PI * 2); g.fill();  // inner chrome line
  const q = [["#1c69d4", Math.PI, Math.PI * 1.5], ["#ffffff", Math.PI * 1.5, Math.PI * 2], ["#1c69d4", 0, Math.PI / 2], ["#ffffff", Math.PI / 2, Math.PI]];
  for (const [col, a0, a1] of q) { g.fillStyle = k(col); g.beginPath(); g.moveTo(c, c); g.arc(c, c, c * 0.585, a0, a1); g.closePath(); g.fill(); }
  g.fillStyle = k("#ffffff"); g.font = `600 ${Math.round(S * 0.17)}px Arial, Helvetica, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  [["B", -38], ["M", 0], ["W", 38]].forEach(([ch, deg]) => {
    g.save(); g.translate(c, c); g.rotate(deg * Math.PI / 180); g.fillText(ch, 0, -c * 0.775); g.restore();
  });
}

// The flat Volkswagen logo: a ring with the V over the W, in chrome on black.
function drawVW(g, S, k) {
  const c = S / 2, w = S * 0.055;
  g.fillStyle = k("#0d0e10"); g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  g.strokeStyle = k("#d6d9de", true); g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath(); g.arc(c, c, c - w, 0, Math.PI * 2); g.stroke();
  g.save(); g.beginPath(); g.arc(c, c, c - w * 1.5, 0, Math.PI * 2); g.clip();
  const P = (x, y) => [c + x * c, c + y * c];
  g.beginPath(); g.moveTo(...P(-0.42, -0.8)); g.lineTo(...P(0, 0.08)); g.lineTo(...P(0.42, -0.8)); g.stroke();                                   // V
  g.beginPath(); g.moveTo(...P(-0.86, -0.3)); g.lineTo(...P(-0.42, 0.8)); g.lineTo(...P(0, 0.2)); g.lineTo(...P(0.42, 0.8)); g.lineTo(...P(0.86, -0.3)); g.stroke(); // W
  g.restore();
}

// Draws badge b onto canvas cv (sizing it) and returns its width/height ratio. mask: draw the shine map instead.
function drawBadge(cv, b, mask) {
  const S = 512, g = cv.getContext("2d"), k = paint(g, mask);
  let aspect = 1;
  if (b.type === "text") {
    const font = `700 ${S * 0.42}px Arial, Helvetica, sans-serif`; g.font = font;
    aspect = Math.max(1, (g.measureText(b.text).width + S * 0.1) / (S * 0.5));
    cv.width = Math.round(S * 0.5 * aspect); cv.height = Math.round(S * 0.5);
    const chromeGrad = (g) => { const grad = g.createLinearGradient(0, 0, 0, cv.height);
      grad.addColorStop(0, "#f4f6f8"); grad.addColorStop(0.5, "#9da3aa"); grad.addColorStop(1, "#e3e6ea"); return grad; };
    if (mask) { g.fillStyle = ENAMEL; g.fillRect(0, 0, cv.width, cv.height); }
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    const tx = cv.width / 2, ty = cv.height / 2 + S * 0.02;
    if (b.style === "red") {
      // GTI grille badge: red letters with a thin chrome edge
      g.lineJoin = "round"; g.lineWidth = S * 0.045; g.strokeStyle = k(chromeGrad, true); g.strokeText(b.text, tx, ty);
      g.fillStyle = k("#d0121b"); g.fillText(b.text, tx, ty);
    } else { g.fillStyle = k(chromeGrad, true); g.fillText(b.text, tx, ty); }
  } else if (b.type === "ford") {
    // The Ford oval: chrome rim, deep blue, white script "Ford" with a thin white line inside the rim.
    aspect = 2.45; cv.width = S; cv.height = Math.round(S / aspect);
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    if (mask) { g.fillStyle = ENAMEL; g.fillRect(0, 0, W, H); }
    const oval = (rx, ry) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
    g.fillStyle = k((g) => { const rim = g.createLinearGradient(0, 0, 0, H); rim.addColorStop(0, "#f2f4f6"); rim.addColorStop(0.5, "#9aa1a8"); rim.addColorStop(1, "#e6e9ec"); return rim; }, true);
    oval(W / 2, H / 2); g.fill();
    g.fillStyle = k((g) => { const blue = g.createRadialGradient(cx, cy * 0.7, 0, cx, cy, W / 2); blue.addColorStop(0, "#2a5fb8"); blue.addColorStop(1, "#0b2c6b"); return blue; });
    oval(W / 2 - H * 0.07, H / 2 - H * 0.07); g.fill();
    g.strokeStyle = k("rgba(255,255,255,.9)"); g.lineWidth = H * 0.025; oval(W / 2 - H * 0.13, H / 2 - H * 0.13); g.stroke();
    g.fillStyle = k("#ffffff"); g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `italic 700 ${Math.round(H * 0.56)}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
    g.fillText("Ford", cx, cy + H * 0.02);
  } else {
    cv.width = cv.height = S;
    if (mask) { g.fillStyle = ENAMEL; g.fillRect(0, 0, S, S); }
    (b.type === "bmw" ? drawBMW : drawVW)(g, S, k);
  }
  return aspect;
}

function badgeTexture(b) {
  const key = b.type + (b.text || "") + (b.style || "");
  if (texCache[key]) return texCache[key];
  const cv = document.createElement("canvas"), mv = document.createElement("canvas");
  const aspect = drawBadge(cv, b, false);
  drawBadge(mv, b, true);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const shine = new THREE.CanvasTexture(mv);  // linear data, not a colour
  shine.anisotropy = 8;
  return (texCache[key] = { tex, shine, aspect });
}

export function addBadges(rig, list) {
  if (!list || !list.length) return;
  rig.group.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), targets = [];
  rig.body.traverse(o => { if (o.isMesh && o.visible && !(o.material && o.material.transparent)) targets.push(o); });
  for (const b of list) {
    // "on": the model's own (blank) badge part: hide it and sit exactly where it was, facing the same way.
    // "at" + "normal": an exact spot measured from the model (for badges only painted into its texture).
    if (b.on || b.at) {
      let p, n;
      if (b.on) {
        const part = targets.find(o => o.name.startsWith(b.on));
        if (!part) continue;
        part.visible = false;
        const c = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
        rc.set(c.clone().addScaledVector(new THREE.Vector3(...b.dir).normalize(), -0.5), new THREE.Vector3(...b.dir).normalize());
        const h = rc.intersectObject(part, false)[0];
        if (!h) continue;
        n = h.face.normal.clone().transformDirection(part.matrixWorld); if (n.dot(rc.ray.direction) > 0) n.negate();
        // the middle of the part's face: back from its box centre along the face direction to the surface
        rc.set(c.clone().addScaledVector(n, 0.5), n.clone().negate());
        const h2 = rc.intersectObject(part, false)[0];
        p = h2 ? h2.point : h.point;
      } else { p = new THREE.Vector3(...b.at); n = new THREE.Vector3(...b.normal).normalize(); }
      rig.body.add(badgeMesh(rig, b, p, n));
      continue;
    }
    rc.set(new THREE.Vector3(...b.from), new THREE.Vector3(...b.dir).normalize());
    const hit = rc.intersectObjects(targets, false)[0];
    if (!hit) continue;
    const d = rc.ray.direction.clone(), from = rc.ray.origin.clone();
    const facing = (h) => { const v = h.face.normal.clone().transformDirection(h.object.matrixWorld); return v.dot(d) > 0 ? v.negate() : v; };
    const basis = (n) => { const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(); if (up.lengthSq() < 0.1) up.set(1, 0, 0); return [new THREE.Vector3().crossVectors(up, n), up]; };
    const { tex, aspect } = badgeTexture(b);
    // Look round the badge's footprint (rays parallel to the first). If the panel round it is nearer than the centre,
    // the first ray went down a hole or cup (e.g. the BMW boot's roundel hole): the badge goes on the panel, angled
    // like it, so no rim hides it from other angles.
    let point = hit.point.clone(), n = facing(hit);
    const [r0, u0] = basis(d.clone().negate()), hw = b.size / 2 * 1.25, hh = (b.type === "text" ? b.size / aspect / 2 : b.size / 2) * 1.25;
    const ring = [];
    for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      rc.set(from.clone().addScaledVector(r0, sx * hw).addScaledVector(u0, sy * hh), d);
      const h2 = rc.intersectObjects(targets, false)[0];
      if (h2) ring.push(h2);
    }
    const nearest = ring.length ? Math.min(...ring.map(h => h.distance)) : hit.distance;
    if (nearest < hit.distance - 0.01 && hit.distance - nearest < 0.2) {
      point = from.clone().addScaledVector(d, nearest);
      n = ring.reduce((a, h) => a.add(facing(h)), new THREE.Vector3()).normalize();
    }
    rig.body.add(badgeMesh(rig, b, point, n));
  }
}

// The badge itself: flat, facing along n, upright, a few millimetres off the surface at p (world space).
function badgeMesh(rig, b, p, n) {
  const { tex, shine, aspect } = badgeTexture(b);
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  if (up.lengthSq() < 0.1) up.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, n);
  const geo = aspect > 1 ? new THREE.PlaneGeometry(b.size, b.size / aspect) : new THREE.CircleGeometry(b.size / 2, 64);
  const mat = new THREE.MeshStandardMaterial({ name: "Badge", map: tex, transparent: true, metalnessMap: shine, roughnessMap: shine, metalness: 1, roughness: 1, // the shine map sets chrome vs enamel
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const m = new THREE.Mesh(geo, mat);
  // Real VW/BMW/Ford logos stand ~5mm proud on a chrome edge; lettering sits nearly flat.
  const raised = b.type !== "text", lift = raised ? 0.005 : 0.003;
  m.matrix.makeBasis(right, up, n).setPosition(p.clone().addScaledVector(n, lift));
  m.matrix.premultiply(new THREE.Matrix4().copy(rig.body.matrixWorld).invert());
  m.matrix.decompose(m.position, m.quaternion, m.scale);
  m.userData.badge = true; m.userData.badgeType = b.type; m.userData.addon = true; m.renderOrder = 2; // addon: body probes (plates, parts) ignore it
  if (raised) {
    // The chrome side band from the face back into the panel (1mm into it, so curved panels leave no gap).
    // An oval (Ford) is a round band squashed to the badge's height. Chrome delete turns it black with the face.
    const band = new THREE.CylinderGeometry(b.size / 2, b.size / 2, lift + 0.001, 64, 1, true).rotateX(Math.PI / 2);
    if (aspect > 1) band.scale(1, 1 / aspect, 1);
    band.translate(0, 0, -(lift + 0.001) / 2);
    const edge = new THREE.Mesh(band, new THREE.MeshStandardMaterial({ name: "BadgeEdge", color: 0xd6d9de, metalness: 1, roughness: 0.15, side: THREE.DoubleSide }));
    edge.userData.badge = true; edge.userData.badgeType = b.type; edge.userData.addon = true;
    m.add(edge);
  }
  return m;
}

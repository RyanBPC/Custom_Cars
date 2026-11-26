/* "Make it a photo": captures the 3D view (any angle, setting and build) and has an image AI turn it into a
   realistic photo. Free route: copy into the Gemini app and add the result back. Shown with a slider
   comparing the 3D view and the AI photo, which line up exactly because they come from the same frame. */
"use strict";

let ai3dReq = null, ai3dShotUrl = null, ai3dShotName = "", ai3dCam = null;
// Set once Google says the key has no billing, so later photos go straight to the free steps.
let billingOff = false;
try { billingOff = sessionStorage.getItem("customizacions.billingOff") === "1"; } catch (e) {}

// Fitted parts the 3D model can't show yet; the AI is asked to add them.
function notShownParts() {
  const parts = Object.keys(state.mods).filter(id => id !== "custom" && spinNotShownIds.includes(id)).map(id => photoPartText(id, state.mods[id]));
  const extra = customNotIn3d(); if (extra.length) parts.push(photoPartText("custom", { items: extra }));
  return parts.filter(Boolean);
}

const SEAT_NAMES = { driver: "driver's seat", passenger: "front passenger seat", rear: "back seat" };
function photo3dPrompt(c, envName, mode, seat) {
  const extra = notShownParts();
  if (seat) {
    const fitted = state.mods.custom ? state.mods.custom.items.map(i => (i.text || i.name.toLowerCase()).replace(/,? visible through the windows/, "")) : [];
    return [
      `This image is a 3D render of the inside of a ${c.make} ${c.model} (UK right-hand drive), seen from the ${SEAT_NAMES[seat]}. Turn it into a photorealistic photograph taken from that seat with a real camera.`,
      "Keep exactly the same: the camera position and angle, framing, dashboard layout, steering wheel on the right, seats, door cards and every visible part. Do not add, remove or redesign any part, screen, button or badge.",
      `Improve only realism: leather, fabric and plastic textures with real stitching and grain, soft natural light coming in through the windows, reflections in the glass and screens, and ${envName ? `a real ${envName.toLowerCase()} seen through the windows` : "a clean studio seen through the windows"}.`,
      ...(fitted.length ? [`These fitted parts must look real: ${fitted.join("; ")}.`] : []),
      "Do not add people, text, logos or watermarks."
    ].join("\n");
  }
  const where = envName ? `a real ${envName.toLowerCase()} background matching the one shown` : "a clean professional photo-studio background matching the one shown";
  return [
    mode === "photo"
      ? `This image is a real photograph with a 3D-rendered ${c.make} ${c.model} (UK right-hand drive) placed in it. Make the car look like it was really photographed there.`
      : `This image is a 3D render of a ${c.make} ${c.model} (UK right-hand drive). Turn it into a photorealistic photograph taken with a real camera.`,
    "Keep exactly the same: the car's shape and proportions, camera angle, framing and position in the picture, wheel design and size, paint colour and finish, ride height, window tint and every visible part. Do not add, remove or redesign any part, badge or light.",
    `Improve only realism: paint reflections and clear-coat, glass, tyre rubber, panel gaps, natural lighting matching the scene, a real shadow under the car, and ${where}.`,
    ...(extra.length ? [`Also add these parts, which the render doesn't show yet: ${extra.join("; ")}.`] : []),
    "Keep the number plates blank. Do not add any text, logos or watermarks."
  ].join("\n");
}

const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

async function makePhoto() {
  const v = window.Viewer3D, btn = document.querySelector('[data-spin="photo"]');
  if (!v) return;
  btn.disabled = true;
  let shot = null;
  try { shot = await v.capture(); }
  catch (e) { console.warn(e); panel("<p>Couldn't take the picture of this view. Try another setting, or refresh the page.</p>"); }
  finally { btn.disabled = false; }
  if (!shot || !shot.blob) return;
  const c = car();
  const envName = shot.env !== "photo" && env3dNames && env3dNames[shot.env] ? env3dNames[shot.env].name : null;
  const prompt = photo3dPrompt(c, envName, shot.mode, shot.inside);
  ai3dReq = { source: "3d", car: c.id, env: shot.env, mode: shot.mode, angle: shot.angle % 360, mods: JSON.parse(JSON.stringify(state.mods)), prompt };
  if (shot.inside) ai3dReq.pitch = shot.pitch;
  Object.assign(ai3dReq, viewExtras(shot));
  ai3dCam = shot.cam;
  if (ai3dShotUrl) URL.revokeObjectURL(ai3dShotUrl);
  ai3dShotUrl = URL.createObjectURL(shot.blob);
  ai3dShotName = `${c.id}-3d-${shot.inside ? "inside-" + shot.inside + "-" : ""}${shot.env}-${shot.angle}deg.${shot.blob.type === "image/png" ? "png" : "jpg"}`;
  try { const r = await api("api/lookup", ai3dReq); if (r.url) { showAi3d(r.url); panel("<p>Shown from your saved AI photos (no cost). This is an AI impression, not a real photo.</p>"); return; } } catch (e) {}
  let status = null;
  try { status = await api("api/status"); } catch (e) {}
  if (status && status.mode !== "manual" && !billingOff) {
    const p = panel(`<p class="rendering">Making your photo… usually 10–30 seconds.</p>`);
    try {
      const r = await api("api/render", { ...ai3dReq, image: await blobToDataUrl(shot.blob) });
      showAi3d(r.url); panel("<p>Done. Drag across the picture to compare the 3D view and the AI photo. This is an AI impression, not a real photo.</p>");
      return;
    } catch (e) {
      // No billing on the Google key: use the free steps instead (and don't ask Google again this visit).
      if (e.code === "needs_billing") { billingOff = true; try { sessionStorage.setItem("customizacions.billingOff", "1"); } catch (x) {} }
      else if (e.code !== "manual_mode") { p.querySelector("p").textContent = e.message; return; }
    }
  }
  manual3dPanel(prompt, billingOff ? "Automatic photos need billing on your Google key, so here's the free way (nothing is charged)." : "");
}

// Free route: the same four steps as the photo views, using the captured 3D picture.
function manual3dPanel(prompt, note = "") {
  const p = panel(`
    ${note ? `<p class="muted small">${note}</p>` : ""}
    <h4>Make it a photo, free, 4 quick steps</h4>
    <ol>
      <li><button class="btn sm" type="button" data-copy-pic>Copy the 3D picture</button> or <a class="btn sm" download>download it</a> <span class="copied-pic muted" hidden>Copied</span></li>
      <li><button class="btn sm" type="button" data-copy>Copy the AI instruction</button> <span class="copied muted" hidden>Copied</span></li>
      <li><a class="btn sm" href="https://gemini.google.com/app" target="_blank" rel="noopener">Open Gemini ↗</a> Paste the picture (Ctrl+V), then the instruction, and send.</li>
      <li><label class="btn sm primary">Add the result<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label> Choose Gemini's picture, or copy it in Gemini and press Ctrl+V here.</li>
    </ol>
    <details><summary>See the instruction</summary><textarea readonly rows="9"></textarea></details>
    <p class="muted small status" role="status">Results are saved, so the same view and build show instantly next time.</p>`);
  const status = t => { p.querySelector(".status").textContent = t; };
  const dl = p.querySelector("a[download]"); dl.href = ai3dShotUrl; dl.setAttribute("download", ai3dShotName);
  p.querySelector("textarea").value = prompt;
  p.querySelector("[data-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(prompt); } catch (e) { p.querySelector("details").open = true; p.querySelector("textarea").select(); document.execCommand("copy"); }
    p.querySelector(".copied").hidden = false;
  });
  // Copies the 3D picture itself, so it can be pasted straight into Gemini.
  p.querySelector("[data-copy-pic]").addEventListener("click", async () => {
    try {
      const blob = await (await fetch(ai3dShotUrl)).blob();
      const png = blob.type === "image/png" ? blob : await new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d").drawImage(i, 0, 0); c.toBlob(r, "image/png"); }; i.src = ai3dShotUrl; });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      p.querySelector(".copied-pic").hidden = false;
    } catch (e) { status("Couldn't copy the picture here; use download instead."); }
  });
  const addResult = file => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { status("That picture type can't be used here. Save it from Gemini as PNG or JPG and try again."); return; }
    if (file.size > 15 * 1024 * 1024) { status("That picture is too large (max 15 MB)."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try { showAi3d((await api("api/upload", { ...ai3dReq, image: reader.result })).url); }
      catch (err) { status(err.message); return; }
      status("Added. Drag across the picture to compare the 3D view and the AI photo. This is an AI impression, not a real photo.");
    };
    reader.readAsDataURL(file);
  };
  p.querySelector("input[type=file]").addEventListener("change", e => addResult(e.target.files[0]));
  // Pasting a picture anywhere on the page (Ctrl+V) adds it as the result while these steps are open.
  if (manualPaste) document.removeEventListener("paste", manualPaste);
  manualPaste = e => {
    if (p.hidden || !document.body.contains(p) || e.target.closest("input, textarea, [contenteditable]")) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.kind === "file" && i.type.startsWith("image/"));
    if (item) { e.preventDefault(); addResult(item.getAsFile()); }
  };
  document.addEventListener("paste", manualPaste);
}
let manualPaste = null;

/* ---------- the AI Photo tab ----------
   Turn the 3D car to any angle. If that angle (setting, view and build) has a saved AI photo it's shown, with a
   slider against the live 3D underneath; if not, the live 3D stays and you can press Make it a photo there.
   Saved photos are also listed under the view, so you can jump straight to any of them. */
let aiTab = false, aiShownKey = null, aiDismissedKey = null, aiCheckToken = 0;
const AI_INDEX = "customizacions.aiphotos";
const stable = v => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v);
function aiIndex() { try { return JSON.parse(localStorage.getItem(AI_INDEX)) || []; } catch (e) { return []; } }
// One key per saved photo spot: same rounding as the server (5 degrees).
function viewKey(r) { return [r.car, r.env, r.mode, Math.round(r.angle / 5) * 5 % 360, r.pitch == null ? "" : Math.round(r.pitch / 5) * 5, r.zoom == null ? "" : r.zoom, stable(r.mods)].join("|"); }
function rememberPhoto(req, url, cam) {
  const key = viewKey(req), list = aiIndex().filter(e => e.key !== key);
  list.unshift({ key, car: req.car, mods: stable(req.mods), env: req.env, mode: req.mode, angle: req.angle, pitch: req.pitch == null ? null : req.pitch, url, cam });
  try { localStorage.setItem(AI_INDEX, JSON.stringify(list.slice(0, 60))); } catch (e) {}
  renderAiStrip(); scanTurntable();
}
// Height and zoom also decide which saved photo fits: 360 view (camera height angle + distance), Photoshoot (zoom).
// Left out when they're the defaults, so photos saved before this still match.
function viewExtras(v) {
  const c = v.cam, out = {};
  if (!c || v.inside) return out;
  if (v.mode === "360") {
    const dx = c.pos[0] - c.target[0], dy = c.pos[1] - c.target[1], dz = c.pos[2] - c.target[2], d = Math.hypot(dx, dy, dz);
    out.pitch = Math.round(Math.asin(dy / d) * 180 / Math.PI / 5) * 5; out.zoom = Math.round(d * 2);
  } else if (v.mode === "photo" && Math.abs((c.plateDist || 1) - 1) > 0.02) out.zoom = Math.round(c.plateDist * 20);
  return out;
}
// The request describing the view on screen right now (the prompt is only needed when making a photo).
function currentViewReq() {
  const v = window.Viewer3D && window.Viewer3D.view(); if (!v) return null;
  const req = { source: "3d", car: car().id, env: v.env, mode: v.mode, angle: v.angle % 360, mods: JSON.parse(JSON.stringify(state.mods)), prompt: "lookup" };
  if (v.inside) req.pitch = v.pitch;
  Object.assign(req, viewExtras(v));
  return { req, v };
}
function aiBar(text, canShow) { $("aiBar").hidden = !aiTab || !text; $("aiBarText").textContent = text || ""; $("aiBarShow").hidden = !canShow; }
function showPhoto(url, key) {
  aiShownKey = key; aiDismissedKey = null;
  $("ai3dResult").src = url; $("ai3dAdded").hidden = !notShownParts().length;
  $("ai3dResult").style.opacity = 1; $("ai3d").classList.remove("empty");
  setAi3dSplit(aiCompare ? 50 : 0); $("ai3d").hidden = false; aiBar(""); $("viewer3d").classList.add("ai-photo-on");
  updateTurn();
  renderAiStrip();
}
// A turntable angle with no photo yet: the live 3D shows through, and dragging still spins round.
function emptySpot(key) {
  aiShownKey = key; $("ai3d").hidden = false; $("ai3d").classList.add("empty"); $("ai3dResult").style.opacity = 0;
  $("viewer3d").classList.add("ai-photo-on");
  aiBar("No AI photo of this angle yet. Press Make it a photo, or drag to keep spinning."); updateTurn();
}
function hidePhoto(text, canShow) { $("ai3d").classList.remove("empty"); updateTurn(); $("ai3d").hidden = true; $("viewer3d").classList.remove("ai-photo-on"); aiShownKey = null; aiBar(text, canShow); renderAiStrip(); }
const NO_PHOTO = "No AI photo of this angle yet. Drag to turn the car, then press Make it a photo.";
// After the camera stops: show the saved photo for this exact angle, if there is one.
async function checkAiAngle() {
  if (!aiTab) return;
  const cur = currentViewReq(); if (!cur) return;
  const key = viewKey(cur.req);
  if (key === aiShownKey) return;
  const token = ++aiCheckToken;
  let r = null; try { r = await api("api/lookup", cur.req); } catch (e) {}
  if (token !== aiCheckToken || !aiTab || spinDrag || glideRaf) return;
  if (r && r.url) {
    if (key === aiDismissedKey) { hidePhoto("This angle has an AI photo.", true); aiBar._url = r.url; aiBar._key = key; return; }
    showPhoto(r.url, key); rememberPhoto(cur.req, r.url, cur.v.cam);
  } else if (turnBase() && key !== aiDismissedKey && Math.abs(((cur.req.angle - nearestStep(cur.req.angle) + 540) % 360) - 180) < 2.5) emptySpot(key);
  else hidePhoto(NO_PHOTO);
}
window.addEventListener("viewer3d-view", () => {
  if (spinDrag || glideRaf) return; // still turning
  checkAiAngle(); if (aiTab && turnBase() !== turnScanned) scanTurntable(); });
$("aiBarShow").addEventListener("click", () => { if (aiBar._url) showPhoto(aiBar._url, aiBar._key); });
document.querySelector(".ai3d-tools").addEventListener("click", e => {
  const b = e.target.closest("[data-ai]"), v = window.Viewer3D; if (!b || !v) return;
  if (b.dataset.ai === "compare") {
    aiCompare = !aiCompare; b.setAttribute("aria-pressed", aiCompare);
    $("ai3d").classList.toggle("compare", aiCompare); setAi3dSplit(aiCompare ? 50 : 0); return;
  }
  const was = aiShownKey;
  if (b.dataset.ai === "move") { hidePhoto("Drag to move the camera. Make it a photo from any angle."); aiDismissedKey = was; return; }
  glideTo(nearestStep(v.view().angle) + (b.dataset.ai === "left" ? -TURN_STEP : TURN_STEP));
});
// Saved photos of this car and build, newest first; picking one puts the camera back where it was taken.
function renderAiStrip() {
  const el = $("aiStrip"), mk = stable(state.mods), list = aiIndex().filter(e => e.car === state.car && e.mods === mk);
  el.hidden = !aiTab || !list.length;
  if (el.hidden) return;
  el.innerHTML = "";
  for (const e of list) {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "listitem");
    b.setAttribute("aria-current", e.key === aiShownKey);
    const img = document.createElement("img"); img.src = e.url; img.alt = ""; img.loading = "lazy";
    const where = e.mode.startsWith("inside-") ? SEAT_NAMES[e.mode.slice(7)] : (env3dNames && env3dNames[e.env] ? env3dNames[e.env].name : e.env === "photo" ? "Studio" : e.env);
    const label = document.createElement("span"); label.textContent = `${where} · ${e.mode.startsWith("inside-") ? "inside" : e.angle + "°"}`;
    b.append(img, label); b.title = "Go to this photo's angle";
    b.addEventListener("click", () => goToSaved(e));
    el.append(b);
  }
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function goToSaved(e) {
  const v = window.Viewer3D; if (!v) return;
  hidePhoto("Going to that angle…");
  const sel = $("envSelect");
  if (sel.value !== e.env) { sel.value = e.env; sel.dispatchEvent(new Event("change")); }
  const seat = e.mode.startsWith("inside-") ? e.mode.slice(7) : null;
  if (seat) { if (v.inside() !== seat) setInside(seat); }
  else {
    if (v.inside()) setInside(null);
    const want = e.mode === "photo" ? "photo" : "360";
    if (e.env !== "photo" && v.mode() !== want) { v.setMode(want); updateModeButton(); }
  }
  // Wait for the setting and view mode to be ready, then put the camera back exactly.
  for (let i = 0; i < 40; i++) { const now = v.view(); if (now && now.env === e.env && now.mode === e.mode) break; await pause(150); }
  await pause(250);
  v.setView(e.cam);
  aiDismissedKey = null; aiShownKey = null;
}
/* ---------- AI turntable: photos every 30 degrees, dragged like the 3D view ---------- */
const TURN_STEP = 30, TURN_ANGLES = Array.from({ length: 360 / TURN_STEP }, (_, i) => i * TURN_STEP);
let aiModeBefore = null, aiCompare = false, turnPhotos = new Map(), turnScanned = null, turnToken = 0;
const nearestStep = a => (Math.round(a / TURN_STEP) * TURN_STEP % 360 + 360) % 360;
// What the turntable belongs to: this car, build, setting and view (inside the car has no turntable).
const turnMode = req => req.env !== "photo" ? "photo" : req.mode; // street/forest photos are taken in Photoshoot
function turnBase() { const cur = currentViewReq(); return cur && !cur.v.inside ? [cur.req.car, cur.req.env, turnMode(cur.req), stable(cur.req.mods)].join("|") : null; }
// Finds which of the 12 angles already have a saved photo (free: it only asks this computer's server).
async function scanTurntable() {
  const base = turnBase(), cur = currentViewReq(), token = ++turnToken;
  turnScanned = base;
  if (!aiTab || !base) { turnPhotos = new Map(); updateTurn(); return; }
  const found = new Map();
  const ask = { ...cur.req, mode: turnMode(cur.req) };
  if (ask.mode !== cur.req.mode) { delete ask.pitch; delete ask.zoom; } // Photoshoot photos have no 360 height/zoom
  await Promise.all(TURN_ANGLES.map(async a => { try { const r = await api("api/lookup", { ...ask, angle: a }); if (r.url) found.set(a, r.url); } catch (e) {} }));
  if (token !== turnToken) return;
  turnPhotos = found; found.forEach(u => { new Image().src = u; }); // load them now, so spinning is instant
  updateTurn();
}
function updateTurn() {
  const el = $("aiTurn"), base = aiTab && turnBase();
  el.hidden = !base; if (!base) return;
  const here = window.Viewer3D ? nearestStep(window.Viewer3D.view().angle) : -1, n = turnPhotos.size;
  $("aiTurnDots").innerHTML = TURN_ANGLES.map(a => `<i class="${turnPhotos.has(a) ? "on" : ""}${a === here ? " here" : ""}"></i>`).join("");
  $("aiTurnText").textContent = n === TURN_ANGLES.length ? "AI 360°: drag to spin all the way round. Let go and the real AI photo of that angle appears."
    : `AI turntable: ${n} of ${TURN_ANGLES.length} angles made.${n ? " Drag to spin; it stops on the nearest AI photo." : ""}`;
  $("aiTurnNext").hidden = n === TURN_ANGLES.length;
}
// Turns to a turntable angle: the photo swaps at once if it's saved; otherwise the live 3D shows.
function spinTo(a) {
  a = (a % 360 + 360) % 360;
  window.Viewer3D.setAngle(a);
  const u = turnPhotos.get(a);
  if (u) { $("ai3dResult").src = u; $("ai3dResult").style.opacity = 1; }
  else $("ai3dResult").style.opacity = 0;
  $("ai3d").classList.toggle("empty", !u);
  aiBar(u ? "" : "No AI photo of this angle yet. Press Make it a photo, or drag to keep spinning.");
  updateTurn();
}
// Drag the photo left or right to spin the car (about one step per 60 pixels).
/* Dragging spins the car smoothly all the way round (the live 3D, so it's instant). On letting go it glides to
   the nearest of the 12 angles and fades in the real AI photo taken there, which matches that frame exactly. */
let spinDrag = null, glideRaf = null;
function glideTo(target) {
  cancelAnimationFrame(glideRaf);
  const v = window.Viewer3D, from = v.view().angle, to = ((target % 360) + 360) % 360;
  const d = ((to - from + 540) % 360) - 180, t0 = performance.now(), dur = Math.min(450, 140 + Math.abs(d) * 6);
  $("ai3dResult").style.opacity = 0;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
    v.setAngle(from + d * ease);
    if (k < 1) glideRaf = requestAnimationFrame(step); else { glideRaf = null; spinTo(to); }
  };
  glideRaf = requestAnimationFrame(step);
}
$("ai3d").addEventListener("pointerdown", e => {
  if (aiCompare || e.target.closest("button") || !window.Viewer3D) return;
  e.preventDefault(); // stop the browser starting its own "drag this picture" instead of spinning
  cancelAnimationFrame(glideRaf); glideRaf = null;
  spinDrag = { x: e.clientX, start: window.Viewer3D.view().angle };
  $("ai3dResult").style.opacity = 0; aiBar("");
  $("ai3d").setPointerCapture(e.pointerId); $("ai3d").classList.add("dragging");
});
$("ai3d").addEventListener("pointermove", e => {
  if (!spinDrag) return;
  window.Viewer3D.setAngle(spinDrag.start - (e.clientX - spinDrag.x) * 0.5); // half a degree per pixel, like the 3D view
});
const endSpin = () => {
  if (!spinDrag) return;
  spinDrag = null; $("ai3d").classList.remove("dragging"); aiShownKey = null;
  glideTo(nearestStep(window.Viewer3D.view().angle));
};
$("ai3d").addEventListener("dragstart", e => e.preventDefault());
$("ai3d").addEventListener("pointerup", endSpin); $("ai3d").addEventListener("pointercancel", endSpin);
// Keyboard: left and right arrows turn to the next angle while the photo has focus.
$("ai3d").tabIndex = 0;
$("ai3d").addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault(); aiShownKey = null; glideTo(nearestStep(window.Viewer3D.view().angle) + (e.key === "ArrowLeft" ? -TURN_STEP : TURN_STEP));
});
// Goes to the next angle without a photo and opens Make it a photo there.
$("aiTurnNext").addEventListener("click", async () => {
  const v = window.Viewer3D; if (!v) return;
  const here = nearestStep(v.view().angle), next = TURN_ANGLES.map(i => (here + i) % 360).find(a => !turnPhotos.has(a));
  if (next === undefined) return;
  hidePhoto(""); v.setAngle(next);
  await pause(700); // let the view settle so the picture matches
  makePhoto();
});

function selectViewTab(tab) {
  aiTab = tab === "ai";
  document.querySelectorAll("#viewTabs [data-tab]").forEach(b => { const on = b.dataset.tab === tab; b.setAttribute("aria-pressed", on); });
  $("viewer3d").classList.toggle("ai-mode", aiTab);
  if (aiTab) {
    const v = window.Viewer3D;
    if (v && $("envSelect").value !== "photo" && v.mode() !== "photo") { aiModeBefore = v.mode(); v.setMode("photo"); updateModeButton(); }
    if (v) v.setSplit(0); scanTurntable(); aiShownKey = null; aiDismissedKey = null; aiBar("Looking for a saved photo of this angle…"); checkAiAngle(); }
  else {
    cancelAnimationFrame(glideRaf); glideRaf = null;
    if (aiModeBefore && window.Viewer3D) { window.Viewer3D.setMode(aiModeBefore); updateModeButton(); aiModeBefore = null; }
    $("aiTurn").hidden = true; $("ai3d").hidden = true; $("viewer3d").classList.remove("ai-photo-on"); aiBar(""); if (typeof setSpinSplit === "function") setSpinSplit(spinSplitPos); }
  renderAiStrip();
}
// A photo was just made (or added): show it in the AI Photo tab and save its spot.
function showAi3d(url) {
  aiTab = false; selectViewTab("ai");
  aiCheckToken++; // this photo wins over a check that's still running
  const key = viewKey(ai3dReq);
  showPhoto(url, key); rememberPhoto(ai3dReq, url, ai3dCam);
}
// The build changed: show it in 3D. Photos of other builds stay saved and come back with that build.
function hideAi3d() { if (aiTab) selectViewTab("3d"); }
document.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) selectViewTab(b.dataset.tab); });
$("viewTabs").hidden = $("viewActions").hidden = !ON_SERVER;
function setAi3dSplit(v) { $("ai3d").style.setProperty("--s", v + "%"); $("ai3dSplit").value = v; }
$("ai3dSplit").addEventListener("input", e => setAi3dSplit(e.target.value));
document.querySelector('[data-spin="photo"]').addEventListener("click", makePhoto);

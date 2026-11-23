/* Connects the studio to the 3D view (js/three/viewer3d.js), which is loaded only when first needed. */
"use strict";

let spinLoading = false, spinTimer = null, spinSplitPos = 50;

function spinActive() { return viewMode === "spin"; }

// A build in the simple form the 3D view needs. With no mods it describes the stock car.
function spinBuild(mods) {
  const c = car(), E = eff(c, mods), items = mods.custom ? mods.custom.items : [];
  // Caliper paint: the standard brakes in a new colour (big brakes bring their own calipers).
  const paintC = !mods.brakes && items.some(i => i.name === "Caliper paint");
  return {
    id: c.id, name: `${c.make} ${c.model}`, paint: E.paint, finish: E.pfin, wheelIn: E.size,
    wheelsChanged: !!mods.wheels, brakesChanged: !!mods.brakes || paintC, wheelStyle: mods.wheels ? mods.wheels.style : null,
    rimColour: RIM_FINISH[E.finish] || RIM_FINISH.silver, caliper: paintC ? caliperPaint(mods) : E.caliper, bigBrake: E.bigBrake,
    dropMm: mods.drop ? (mods.drop.air ? 80 : mods.drop.mm) : 0, // aired out: tyres tucked into the arches tint: E.tint, smoked: E.smoked,
    addons: { spoiler: mods.spoiler ? mods.spoiler.type : null, bodykit: !!mods.bodykit, widebody: !!mods.widebody, exhaust: !!mods.exhaust,
              stripes: mods.stripes ? mods.stripes.colour : null, extras: mods.custom ? mods.custom.items.map(i => i.name) : [], glow: glowColour(mods),
              ambient: glowColour(mods, "LED ambient interior lighting", "#3aa8ff"), plate: privateReg(mods) || state.plate || carReg(c), plateStyle: plateStyleOf(mods), graphic: graphicStyle(mods), sunStrip: sunStripText(mods),
              extraText: Object.fromEntries(items.map(i => [i.name, i.text || ""])) } // what was chosen for each extra (its colour, finish...)
  };
}

// The caliper paint colour: one of the caliper colours by name, else any colour named, red if none.
function caliperPaint(mods) {
  const it = mods.custom.items.find(i => i.name === "Caliper paint"), t = it.text.toLowerCase(), k = Object.keys(CALIPER).find(n => new RegExp("\b" + n + "\b").test(t));
  return k ? CALIPER[k] : glowColour(mods, "Caliper paint", CALIPER.red);
}
// Underglow colour from what the user said ("purple underglow"), blue-ish if none.
function glowColour(mods, name = "LED underglow", fallback = "#22c8ff") {
  const g = mods.custom && mods.custom.items.find(i => i.name === name), t = g ? g.text.toLowerCase() : "";
  if (g) registerCustomColours(t);
  // The first colour named (the longest name where two start together, so "sky blue" beats "blue").
  const c = g && COLOURS.map(x => [t.search(new RegExp("\\b" + x[0] + "\\b")), x]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0] || b[1][0].length - a[1][0].length).map(x => x[1])[0];
  return c ? c[1] : fallback;
}
// Which pattern a "Custom graphic wrap" is, from what the user said.
function graphicStyle(mods) {
  const g = mods.custom && mods.custom.items.find(i => i.name === "Custom graphic wrap"), t = g ? g.text.toLowerCase() : "";
  return /camo/.test(t) ? "camo" : /graffiti|tribal/.test(t) ? "graffiti" : "flames";
}
// The word on a windscreen sun strip (what the user said after "saying"), "GTI" if none.
function sunStripText(mods) {
  const g = mods.custom && mods.custom.items.find(i => i.name === "Windscreen sun strip"), m = g && g.text.match(/"([^"]+)"/);
  return m ? m[1] : "GTI";
}
// Extra parts the 3D view can't show (it shows the ones marked in3d in EXTRA_PARTS).
const in3d = name => name === "Styled number plates" || EXTRA_PARTS.some(e => e.name === name && e.in3d); // styled plates are drawn by the 3D plates
function customNotIn3d() { return state.mods.custom ? state.mods.custom.items.filter(i => !in3d(i.name)) : []; }

function spinMessage(text) { const m = $("spinMsg"); m.textContent = text || ""; m.hidden = !text; }

function showSpin() {
  $("viewer3d").hidden = false; $("callouts").innerHTML = "";
  if (!ON_SERVER) return spinMessage("The 3D view needs the site opened with start.bat. Double-click start.bat in the customizacions folder.");
  if (window.Viewer3D) {
    clearTimeout(spinTimer);
    const ok = window.Viewer3D.show($("viewer3d"), spinBuild(state.mods), spinBuild({}));
    if (ok) window.Viewer3D.setEnvironment(envId);
    spinMessage(ok ? "" : "Your browser can't show 3D here (WebGL is turned off or not supported). The Drawing and Photo views still work.");
    setSpinSplit(spinSplitPos);
    return;
  }
  spinMessage("Loading 3D…");
  if (!spinLoading) {
    spinLoading = true;
    const s = document.createElement("script");
    s.type = "module"; s.src = "js/three/viewer3d.js";
    s.onerror = () => spinMessage("The 3D view couldn't load. Check that start.bat is still running, then refresh.");
    document.body.appendChild(s);
    spinTimer = setTimeout(() => { if (!window.Viewer3D) spinMessage("The 3D view is taking a long time to load. Check that start.bat is running, then refresh."); }, 10000);
  }
}
function hideSpin() { $("viewer3d").hidden = true; spinMessage(""); }

// Mods each car's 3D model can't show yet (from models/<car>.json), keyed by the build's mod ids.
let spinNotShownIds = [];
const NOT_SHOWN_IDS = { "wheel size and style": [], "aero kit": ["bodykit"], widebody: ["widebody"], spoiler: ["spoiler"], exhaust: ["exhaust"], stripes: ["stripes"] };
function updateNotShown() {
  const fitted = Object.keys(state.mods).filter(id => id !== "wheels" && spinNotShownIds.includes(id)).map(id => modLabel(id, state.mods[id]));
  fitted.push(...customNotIn3d().map(i => i.name));
  if (state.mods.wheels && spinNotShownIds.includes("wheels")) fitted.unshift(`${state.mods.wheels.size}″ ${state.mods.wheels.style} wheel shape (the colour is shown)`);
  const el = $("spinNotShown");
  // Name any parts that are still simple stand-in shapes (none at the moment: arch flares and canards are now modelled).
  const approx = [];
  el.textContent = (fitted.length ? `Not shown in 3D yet: ${fitted.join(", ")}. Make it a photo adds them. ` : "") + (approx.length ? `The ${approx.join(" and ")} are rough shapes for now.` : "");
  el.hidden = !el.textContent;
}
function refreshSpin(changed) {
  if (typeof hideAi3d === "function") hideAi3d(); // the AI photo no longer matches a changed build
  if (!window.Viewer3D) return;
  updateNotShown();
  window.Viewer3D.applyBuild(spinBuild(state.mods), spinBuild({}));
  // The before/after slider stays wherever the user left it.
}

/* ---------- the stock / your build divider ---------- */
function setSpinSplit(pct) {
  spinSplitPos = Math.min(100, Math.max(0, pct));
  $("spinSplit").style.left = spinSplitPos + "%";
  $("spinKnob").setAttribute("aria-valuenow", Math.round(spinSplitPos));
  $("spinKnob").setAttribute("aria-valuetext", `${Math.round(100 - spinSplitPos)}% showing after (your build)`);
  if (window.Viewer3D) window.Viewer3D.setSplit(spinSplitPos / 100);
}
(function () {
  const knob = $("spinKnob"), box = $("viewer3d");
  const moveTo = e => { const r = box.getBoundingClientRect(); setSpinSplit((e.clientX - r.left) / r.width * 100); };
  knob.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener("pointermove", e => { if (knob.hasPointerCapture(e.pointerId)) moveTo(e); });
  knob.addEventListener("keydown", e => {
    const d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -25, PageUp: 25, Home: -100, End: 100 }[e.key];
    if (d === undefined) return;
    e.preventDefault(); setSpinSplit(spinSplitPos + d);
  });
})();

/* ---------- turn and zoom buttons, and messages from the 3D view ---------- */
// The mode button says what pressing it will switch to.
function updateModeButton() {
  const b = document.querySelector('[data-spin="mode"]'), photo = window.Viewer3D && window.Viewer3D.mode() === "photo";
  b.textContent = photo ? "360° view" : "Photoshoot";
  const shoot = photo && $("envSelect").value !== "photo";
  $("spinModeHint").hidden = !shoot; $("spinShots").hidden = !shoot;
}
window.addEventListener("viewer3d-ready", () => { updateModeButton(); if (spinActive()) showSpin(); applyPhotoQuality(wantPhotoQuality()); });
window.addEventListener("viewer3d-message", e => spinMessage(e.detail));
// The Lights button follows the car's lights (pressed or not; night settings switch them on too).
window.addEventListener("viewer3d-lights", e => {
  document.querySelector('[data-spin="lights"]').setAttribute("aria-pressed", e.detail.on);
  $("spinLive").textContent = e.detail.on ? "Lights on" : "Lights off";
});
// Photo quality progress, shown at the top of the 3D view.
// Photo quality just quietly sharpens the car when you stop moving; only a problem is worth a note.
window.addEventListener("viewer3d-pt", e => {
  const n = $("ptNote");
  if (e.detail.state === "error") { n.textContent = "Photo quality isn't available on this computer, so you're seeing the normal 3D."; n.hidden = false; setTimeout(() => { n.hidden = true; }, 5000); }
});
// On by default (it only works while you're still); the button turns it off, and that choice is remembered.
// Off unless you switch it on: on slower computers the light simulation stays grainy even when finished.
// (A new name, so an old "on" from before doesn't switch it back on.)
const PT_KEY = "customizacions.photoQuality.v2";
function wantPhotoQuality() { try { return localStorage.getItem(PT_KEY) === "on"; } catch (e) { return false; } }
function applyPhotoQuality(on) {
  const v = window.Viewer3D; if (!v) return;
  v.setPhotoQuality(on);
  document.querySelector('[data-spin="pt"]').setAttribute("aria-pressed", on);
}
// When a real model loads, say whose model it is (CC BY needs credit) and which mods it can't show yet.
window.addEventListener("viewer3d-model", e => {
  const d = e.detail, chip = document.querySelector(".spin-chip");
  if (d.standIn) { chip.innerHTML = '<span class="long">3D preview · </span>stand-in car shape'; spinNotShownIds = []; updateNotShown(); return; }
  spinNotShownIds = [];
  (d.notShown || []).forEach(n => { if (n === "wheel size and style") spinNotShownIds.push("wheels"); else spinNotShownIds.push(...(NOT_SHOWN_IDS[n] || [])); });
  updateNotShown();
  const c = d.credit || {};
  chip.innerHTML = '<a class="m" target="_blank" rel="noopener">3D model</a> by <span class="by"></span>, <a class="l" target="_blank" rel="noopener license"></a>';
  const a = chip.querySelector("a.m"); a.href = c.url || "#"; a.title = `${c.title || ""}. Changes: ${c.changes || "none"}`;
  chip.querySelector(".by").textContent = (c.author || "unknown").replace(/\s*\(@.*\)$/, "");
  const l = chip.querySelector("a.l"); l.textContent = c.licence || "licence unknown"; l.href = c.licenceUrl || "#";
  $("spinLive").textContent = d.notShown.length ? `Not shown in 3D: ${d.notShown.join(", ")}` : "";
});

// Photoshoot: fixed photographer framing on the real photo, with preset angles for the car.
$("spinShots").addEventListener("click", e => {
  const b = e.target.closest("[data-shot]"); if (!b || !window.Viewer3D) return;
  window.Viewer3D.tune({ carYaw: Number(b.dataset.shot) });
  $("spinLive").textContent = `${b.textContent} shot`;
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-spin]"), v = window.Viewer3D;
  if (!b || !v) return;
  if (b.dataset.spin === "photo") return; // handled in js/photo3d.js
  if (b.dataset.spin === "save") { savePicture(b); return; }
  if (b.dataset.spin === "pt") { const on = !v.photoQuality(); applyPhotoQuality(on); try { localStorage.setItem(PT_KEY, on ? "on" : "off"); } catch (e) {} return; }
  if (b.dataset.spin === "lights") { v.setLights(!v.lightsOn()); return; }
  if (b.dataset.spin === "inside") { setInside(v.inside() ? null : "driver"); return; }
  if (b.dataset.spin === "mode") { v.setMode(v.mode() === "photo" ? "360" : "photo"); updateModeButton(); return; }
  ({ left: () => v.turn(-30), right: () => v.turn(30), in: () => v.zoom(0.85), out: () => v.zoom(1.18), reset: () => v.reset() })[b.dataset.spin]();
  // Tell screen-reader users the new angle after a button press.
  $("spinLive").textContent = ({ in: "Zoomed in", out: "Zoomed out" })[b.dataset.spin] || `Turned to ${v.angle()}°`;
});

// Save picture: downloads the current view of the build, named after the car (e.g. "volkswagen-golf-gti-my-build.png").
async function savePicture(btn) {
  const v = window.Viewer3D; if (!v || btn.disabled) return;
  btn.disabled = true; $("spinLive").textContent = "Saving picture…";
  try {
    const shot = await v.snapshot(); if (!shot || !shot.blob) throw new Error("no picture");
    const c = car(), ext = shot.blob.type === "image/jpeg" ? "jpg" : "png";
    const blob = await captionPicture(shot.blob, c).catch(e => { console.warn("Picture caption skipped:", e); return shot.blob; });
    const name = `${c.make} ${c.model} my build`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = `${name}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $("spinLive").textContent = shot.sharp ? "Saved the photo-quality picture" : "Saved picture";
  } catch (e) { console.warn("Save picture failed:", e); $("spinLive").textContent = "Sorry, the picture couldn't be saved"; }
  btn.disabled = false;
}

// Adds a slim dark strip along the bottom of a saved picture saying what the build is,
// e.g. "Volkswagen Golf GTI · 6 parts · about £8,400 fitted", so a picture sent to a friend explains itself.
async function captionPicture(blob, c) {
  const img = await createImageBitmap(blob), w = img.width, h = img.height;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
  const n = partCount(state.mods), strip = Math.max(28, Math.round(h * 0.05)), pad = Math.round(strip * 0.6);
  const left = `${c.make} ${c.model} · ` + (n ? `${n} ${n === 1 ? "part" : "parts"} · about ${fmt(buildCost(c, state.mods))} fitted` : "stock");
  g.fillStyle = "rgba(10,11,13,0.82)"; g.fillRect(0, h - strip, w, strip);
  g.textBaseline = "middle"; const y = h - strip / 2;
  g.font = `600 ${Math.round(strip * 0.42)}px system-ui, sans-serif`; g.fillStyle = "#f2f2f2"; g.textAlign = "left";
  g.fillText(left, pad, y, w * 0.62);
  g.font = `${Math.round(strip * 0.34)}px system-ui, sans-serif`; g.fillStyle = "#a8acb3"; g.textAlign = "right";
  g.fillText("Custom Cars Build Studio · 3D preview", w - pad, y, w * 0.33);
  return await new Promise((ok, bad) => cv.toBlob(b => b ? ok(b) : bad(new Error("no blob")), blob.type || "image/png", 0.92));
}

// Interior: sit in a seat and look around; the button steps back out.
function setInside(seat) {
  const v = window.Viewer3D; if (!v) return;
  v.interior(seat);
  $("viewer3d").classList.toggle("inside", !!seat);
  document.body.classList.toggle("inside-car", !!seat);
  const b = document.querySelector('[data-spin="inside"]'); b.textContent = seat ? "Exterior" : "Interior";
  $("spinSeats").hidden = $("spinInHint").hidden = !seat;
  $("spinSeats").querySelectorAll("[data-seat]").forEach(x => x.setAttribute("aria-pressed", x.dataset.seat === seat));
  if (!seat) { updateModeButton(); setSpinSplit(spinSplitPos); }
  $("spinLive").textContent = seat ? `Sitting in the ${({ driver: "driver's seat", passenger: "passenger seat", rear: "back seat" })[seat]}. Drag to look around.` : "Back outside the car.";
}
$("spinSeats").addEventListener("click", e => { const b = e.target.closest("[data-seat]"); if (b) setInside(b.dataset.seat); });
// Escape steps back out, but not while typing (e.g. in the chat box) or when something else already used the key.
document.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) && window.Viewer3D && window.Viewer3D.inside()) setInside(null); });

// If the 3D view was open last time, open it again.
if (spinActive()) { stage.classList.add("spin"); showSpin(); }

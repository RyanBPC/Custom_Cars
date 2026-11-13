/* Front/Side photo views of the car, plus the AI render (free manual mode, or automatic via the local server). */
"use strict";

const ON_SERVER = location.protocol === "http:" || location.protocol === "https:";
const PHOTO_EXTS = ["jpg", "jpeg", "png", "webp"];
const photoUrls = {};          // "golf-front" -> url, or null when there's no picture yet
const sessionRenders = {};     // results added by hand without the server, keyed by car+angle+prompt
let viewMode = "drawing", envId = "photo", photoToken = 0, serverStatus = null;

try { const v = JSON.parse(localStorage.getItem("customizacions.view") || "null"); if (v) { if (["drawing", "front", "side", "spin"].includes(v.view)) viewMode = v.view; if (ENVIRONMENTS.some(e => e.id === v.env)) envId = v.env; } } catch (e) {}
function saveView() { try { localStorage.setItem("customizacions.view", JSON.stringify({ view: viewMode, env: envId })); } catch (e) {} }

// The studio shows the 3D view. Without start.bat (opened by double-click) 3D can't load, so the drawing is used.
viewMode = ON_SERVER ? "spin" : "drawing";

function photoActive() { return viewMode === "front" || viewMode === "side"; }

// With the local server, ask it which pictures exist (once per page load).
let photoList = null;
async function serverPhotoList() {
  if (!photoList) photoList = fetch("api/photos").then(r => r.ok ? r.json() : null).catch(() => null);
  return photoList;
}

// Finds the stock picture: from the server's list, or (when opened by double-click) by trying each file type.
async function findPhoto(id, angle) {
  const k = id + "-" + angle;
  if (k in photoUrls) return photoUrls[k];
  if (ON_SERVER) { const list = await serverPhotoList(); if (list) return (photoUrls[k] = list[k] || null); }
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= PHOTO_EXTS.length) { photoUrls[k] = null; return resolve(null); }
      const url = `photos/${k}.${PHOTO_EXTS[i++]}`, img = new Image();
      img.onload = () => { photoUrls[k] = url; resolve(url); };
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  });
}

const HELPER_OFF = "The photo helper isn't running. Double-click start.bat in the project folder, keep the black window open, then try again.";

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  } catch {
    // No server answered at all (browser says "Failed to fetch").
    throw Object.assign(new Error(HELPER_OFF), { code: "server_off" });
  }
  const data = await res.json().catch(() => ({}));
  // A plain file server (not start.bat) answers 404/405/501 with no message of ours.
  if (!res.ok && !data.message && [404, 405, 501].includes(res.status)) throw Object.assign(new Error(HELPER_OFF), { code: "server_off" });
  if (!res.ok) throw Object.assign(new Error(data.message || "Something went wrong."), { code: data.error });
  return data;
}

// What the server needs to identify a render: the build itself, not just the instruction's wording.
function renderRequest(c, angle, prompt) {
  return { car: c.id, angle, env: envId, mods: JSON.parse(JSON.stringify(state.mods)), prompt };
}
// True if the user is still looking at the same car, angle, setting and build as a finished render.
function stillShowing(req) {
  return car().id === req.car && viewMode === req.angle && photoPrompt(car(), state.mods, envId) === req.prompt;
}

function imgTag(url, alt) { const i = document.createElement("img"); i.src = url; i.alt = alt; i.decoding = "async"; return i; }

// Left of the slider is always "before" (stock); the right side is "after" (your build).
function setPhotoLabels(right) { $("lblL").textContent = "BEFORE"; $("lblR").textContent = right; }

/* ---------- stage ---------- */
async function renderPhotoStage() {
  const c = car(), angle = viewMode, token = ++photoToken;
  stage.classList.add("photo"); $("callouts").innerHTML = "";
  $("renderPanel").hidden = true;
  const stock = await findPhoto(c.id, angle);
  if (token !== photoToken) return;
  if (!stock) {
    const msg = document.createElement("div"); msg.className = "photo-missing";
    msg.innerHTML = `<b></b><span>Make one free with the prompts in <code>photos/README.md</code>, then save it as <code></code> and refresh.</span>`;
    msg.querySelector("b").textContent = `No ${angle} picture of the ${c.make} ${c.model} yet.`;
    msg.querySelectorAll("code")[1].textContent = `photos/${c.id}-${angle}.jpg`;
    beforeL.replaceChildren(); afterL.replaceChildren(msg);
    setSplit(0); $("aiChip").hidden = true; $("renderBtn").hidden = true; setPhotoNote(""); setPhotoLabels("");
    return;
  }
  $("aiChip").hidden = false;
  const parts = photoParts(state.mods);
  $("renderBtn").hidden = false; $("renderBtn").disabled = false;
  beforeL.replaceChildren(imgTag(stock, `${c.make} ${c.model}, stock`));
  const prompt = photoPrompt(c, state.mods, envId);
  let rendered = sessionRenders[c.id + angle + prompt] || null;
  if (!rendered && ON_SERVER && parts.length) {
    try { rendered = (await api("api/lookup", renderRequest(c, angle, prompt))).url; } catch (e) { rendered = null; }
    if (token !== photoToken) return;
  }
  if (rendered) showRendered(rendered);
  else {
    afterL.replaceChildren(imgTag(stock, `${c.make} ${c.model}`));
    // The note sits above both halves of the compare slider, so it's never half hidden.
    // No render yet: show the stock photo once (never labelled "AFTER", which made it look like the AI did nothing).
    setPhotoNote(parts.length ? "This is the stock car. Press AI render to see your parts on the real car." : "Add visible parts (wheels, wrap, spoiler…) then press AI render.");
    setPhotoLabels("BEFORE · STOCK"); setSplit(100);
    $("lblL").textContent = "BEFORE · STOCK";
  }
}

function setPhotoNote(text) { const n = $("photoNote"); n.textContent = text || ""; n.hidden = !text; }

function showRendered(url) {
  const c = car();
  afterL.replaceChildren(imgTag(url, `${c.make} ${c.model}, AI render of your build`));
  setPhotoNote(""); setPhotoLabels("AFTER · AI RENDER"); setSplit(50);
}

/* ---------- AI render ---------- */
function panel(html) { const p = $("renderPanel"); p.hidden = false; p.innerHTML = html; return p; }

async function startRender() {
  const c = car(), angle = viewMode, stock = photoUrls[c.id + "-" + angle];
  if (!stock) return;
  const parts = photoParts(state.mods);
  if (!parts.length) { panel(`<p>Add a part you can see first: wheels, a wrap, a spoiler, a drop… Engine upgrades don't change the look.</p>`); return; }
  const prompt = photoPrompt(c, state.mods, envId), req = renderRequest(c, angle, prompt);
  if (ON_SERVER) {
    try { serverStatus = await api("api/status"); } catch (e) { serverStatus = null; }
  }
  if (!serverStatus || serverStatus.mode === "manual") return manualPanel(stock, req);
  const btn = $("renderBtn"), t0 = performance.now();
  btn.disabled = true;
  const p = panel(`<p class="rendering">Rendering your ${c.model}… <span class="mono" aria-hidden="true">0s</span> (usually 10–30 seconds)</p>`);
  const timer = setInterval(() => { const s = p.querySelector(".mono"); if (s) s.textContent = Math.round((performance.now() - t0) / 1000) + "s"; }, 500);
  try {
    const r = await api("api/render", req);
    // Only show it if the build wasn't changed while the render was running.
    if (stillShowing(req)) {
      showRendered(r.url);
      panel(`<p>${r.cached ? "Shown from your saved renders (no cost)." : "Done. Drag across the picture to compare with stock."} This is an AI impression, not a real photo.</p>`);
    } else panel(`<p>Your earlier build's render is saved. Go back to that build to see it, or press AI render for this one.</p>`);
  } catch (e) {
    if (e.code === "manual_mode") return manualPanel(stock, req);
    panel(`<p class="err"></p>`).querySelector(".err").textContent = e.message;
  } finally { clearInterval(timer); btn.disabled = false; }
}

// Free route: copy the instruction into the Gemini app with the stock picture, then add the result back.
function manualPanel(stock, req) {
  const prompt = req.prompt;
  const p = panel(`
    <h4>Free AI render, 4 quick steps</h4>
    <ol>
      <li><a class="btn sm" download>Download the stock picture</a></li>
      <li><button class="btn sm" type="button" data-copy>Copy the AI instruction</button> <span class="copied muted" hidden>Copied</span></li>
      <li><a class="btn sm" href="https://gemini.google.com/app" target="_blank" rel="noopener">Open Gemini ↗</a> Attach the picture, paste the instruction and send.</li>
      <li><button class="btn sm primary" type="button" data-pick>Add the result</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden tabindex="-1" aria-hidden="true"> Download Gemini's picture and choose it here.</li>
    </ol>
    <details><summary>See the instruction</summary><textarea readonly rows="9"></textarea></details>
    <p class="muted small"></p>`);
  const dl = p.querySelector("a[download]"); dl.href = stock; dl.setAttribute("download", stock.split("/").pop());
  p.querySelector("textarea").value = prompt;
  p.querySelector(".small").textContent = ON_SERVER
    ? "Results you add are saved, so this build shows instantly next time. Automatic renders are possible too (Google charges about 3p a picture): see .env.example."
    : "Tip: open the site with start.bat to keep your results saved between visits.";
  p.querySelector("[data-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(prompt); } catch (e) { const ta = p.querySelector("textarea"); p.querySelector("details").open = true; ta.select(); document.execCommand("copy"); }
    p.querySelector(".copied").hidden = false;
  });
  // A real button, so keyboard users can reach step 4; it opens the hidden file picker.
  p.querySelector("[data-pick]").addEventListener("click", () => p.querySelector("input[type=file]").click());
  p.querySelector("input[type=file]").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 15 * 1024 * 1024) { p.querySelector(".small").textContent = "That picture is too large (max 15 MB)."; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      let url = reader.result;
      if (ON_SERVER) {
        try { url = (await api("api/upload", { ...req, image: reader.result })).url; }
        catch (err) { p.querySelector(".small").textContent = err.message; return; }
      } else sessionRenders[req.car + req.angle + prompt] = url;
      if (stillShowing(req)) {
        showRendered(url);
        p.querySelector(".small").textContent = "Added. Drag across the picture to compare with stock. This is an AI impression, not a real photo.";
      } else p.querySelector(".small").textContent = "Saved for the build you had when you copied the instruction. Go back to that build to see it.";
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- controls ---------- */
function setView(v) {
  viewMode = v; saveView();
  document.querySelectorAll(".viewbar [data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v));
  updateEnvPick(v);
  stage.classList.toggle("spin", v === "spin");
  if (v === "spin") { leavePhoto(); showSpin(); return; }
  hideSpin();
  if (v === "drawing") { leavePhoto(); setPhotoLabels("AFTER"); renderStage(null, null); setSplit(50); }
  else renderPhotoStage();
}
function leavePhoto() {
  photoToken++; stage.classList.remove("photo"); $("aiChip").hidden = true; setPhotoNote(""); $("renderBtn").hidden = true; $("renderPanel").hidden = true;
}

$("envSelect").innerHTML = ENVIRONMENTS.map(e => `<option value="${e.id}">${e.name}</option>`).join("");
$("envSelect").value = envId;
$("envSelect").addEventListener("change", e => {
  envId = e.target.value; saveView();
  if (viewMode === "spin") { if (window.Viewer3D) window.Viewer3D.setEnvironment(envId); if (typeof updateModeButton === "function") updateModeButton(); }
  else renderPhotoStage();
});
// Settings apply to the AI photos and the 3D view. In 3D the first option is the built-in studio.
// The 3D view shows different real places from the AI photo settings, so in 3D the names come from
// env/environments.json (loaded once, only when the site runs through start.bat).
let env3dNames = null;
if (ON_SERVER) fetch("env/environments.json").then(r => r.ok ? r.json() : {}).then(j => { env3dNames = j; updateEnvPick(viewMode); }).catch(() => {});
function updateEnvPick(v) {
  $("envPick").hidden = !(v === "front" || v === "side" || v === "spin");
  [...$("envSelect").options].forEach((o, i) => {
    const photoName = ENVIRONMENTS[i].name, name3d = env3dNames && env3dNames[o.value] && env3dNames[o.value].name;
    o.textContent = v === "spin" ? (i === 0 ? "Studio" : name3d || `${photoName} (not in 3D yet)`) : photoName;
  });
}
$("viewNote").hidden = ON_SERVER;
$("renderBtn").addEventListener("click", startRender);
document.querySelectorAll(".viewbar [data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === viewMode));
updateEnvPick(viewMode);

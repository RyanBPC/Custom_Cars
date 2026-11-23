/* The Build page's four steps: 1 your car (with your own photo), 2 your build (the 3D studio above),
   3 parts and prices (a card per part: picture on your car, UK price, where to buy), 4 your photo modified by AI. */
"use strict";
(() => {
const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* ---------- step bar ---------- */
// The steps are tabs: one step shows at a time, with Back / Next at the bottom, instead of one long page.
// Step 2 is its heading plus the 3D studio. The step you were on is remembered in this browser.
const stepIds = ["flowCar", "flowBuild", "flowParts", "flowPhoto"];
const STEP_NAMES = ["Your car", "Your build", "Parts & prices", "See it on your car"];
const panels = [[el("flowCar")], [el("flowBuild"), document.querySelector("#studio .studio")], [el("flowParts")], [el("flowPhoto")]];
panels.forEach((nodes, i) => {
  nodes.forEach(n => { n.setAttribute("role", "tabpanel"); n.setAttribute("aria-label", `Step ${i + 1}: ${STEP_NAMES[i]}`); });
  const nav = document.createElement("div");
  nav.className = "flow-nav";
  nav.innerHTML = (i > 0 ? `<button type="button" class="btn" data-step-to="${i - 1}">← ${STEP_NAMES[i - 1]}</button>` : "<span></span>")
    + (i < 3 ? `<button type="button" class="btn primary" data-step-to="${i + 1}">Next: ${STEP_NAMES[i + 1]} →</button>` : "");
  nodes[nodes.length - 1].after(nav); nodes.push(nav);
});
el("flowSteps").setAttribute("role", "tablist");
let step = 0;
try { const s = +localStorage.getItem("customcars.step"); if (s >= 0 && s <= 3) step = s; } catch (e) {}
function showStep(n, scroll) {
  step = n;
  try { localStorage.setItem("customcars.step", n); } catch (e) {}
  panels.forEach((nodes, i) => nodes.forEach(x => { x.hidden = i !== n; }));
  el("flowSteps").querySelectorAll("[data-step]").forEach((b, i) => {
    b.setAttribute("role", "tab"); b.setAttribute("aria-selected", i === n);
    if (i === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
  });
  if (scroll) { const top = el("flowSteps").getBoundingClientRect().top + scrollY - 70; if (scrollY > top) scrollTo({ top, behavior: "auto" }); }
  if (n === 2) { partsShown = false; loadShots(); }
}
el("flowSteps").addEventListener("click", e => {
  const b = e.target.closest("[data-step]"); if (b) showStep(stepIds.indexOf(b.dataset.step), true);
});
document.querySelector("#studio").addEventListener("click", e => {
  const b = e.target.closest("[data-step-to]"); if (b) showStep(+b.dataset.stepTo, true);
});
// Photo Studio and Interior are views of the 3D studio, so they open on step 2.
function stepForHash() { if (/^#(photo|interior|ai)\b/.test(location.hash) && step !== 1) showStep(1); }
addEventListener("hashchange", stepForHash);

/* ---------- step 1: your own photo (kept in this browser only) ---------- */
const PHOTO_KEY = "customcars.myphoto", RESULT_KEY = "customcars.myresults";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
let myPhoto = load(PHOTO_KEY, null); // { car, url } or null

// Shrinks a picture to at most 1600px wide as a JPEG, so it fits in the browser's storage.
function shrink(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => rej(new Error("That file isn't a picture this browser can open."));
    img.src = URL.createObjectURL(file);
  });
}
function renderMyPhoto() {
  const has = !!myPhoto;
  el("myPhotoImg").hidden = !has; if (has) el("myPhotoImg").src = myPhoto.url;
  el("myPhotoEmpty").hidden = has;
  el("myPhotoRemove").hidden = !has;
  el("myPhotoAdd").textContent = has ? "Change photo" : "Add photo";
  el("myPhoto").classList.toggle("has", has);
  const c = car();
  el("flowCarNote").textContent = has && myPhoto.car !== c.id
    ? `Your photo was added for another car. Pick it again, or add a photo of your ${c.make} ${c.model}.`
    : `Showing the ${c.make} ${c.model}. More makes and models are on the way.`;
  renderMyRender();
}
el("myPhotoAdd").addEventListener("click", () => el("myPhotoFile").click());
el("myPhotoRemove").addEventListener("click", () => { myPhoto = null; try { localStorage.removeItem(PHOTO_KEY); } catch (e) {} renderMyPhoto(); });
el("myPhotoFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    myPhoto = { car: state.car, url: await shrink(f) };
    if (!store(PHOTO_KEY, myPhoto)) el("flowCarNote").textContent = "Added for now, but this browser couldn't save it for next time.";
  } catch (err) { el("flowCarNote").textContent = err.message; return; }
  renderMyPhoto();
});
// Drop a picture straight onto the box too.
el("myPhoto").addEventListener("dragover", e => { e.preventDefault(); el("myPhoto").classList.add("over"); });
el("myPhoto").addEventListener("dragleave", () => el("myPhoto").classList.remove("over"));
el("myPhoto").addEventListener("drop", e => {
  e.preventDefault(); el("myPhoto").classList.remove("over");
  const f = e.dataTransfer.files[0]; if (!f) return;
  const dt = new DataTransfer(); dt.items.add(f); el("myPhotoFile").files = dt.files; el("myPhotoFile").dispatchEvent(new Event("change"));
});

/* ---------- step 2: read the parts off a photo of a build you like ---------- */
const LOOK_PROMPT = "Look at the modified car in this photo. List only the modifications you can actually see, in one line of plain English that a car configurator can read, for example: \"gloss black paint, 19 inch bronze deep dish wheels, lower it 35mm, carbon front splitter, ducktail spoiler, smoked lights, rear window tint\". Include the wheel size if you can judge it, the colour, the ride height, any spoiler or wing, body kit or widebody arches, stripes, tint and lights. Reply with that one line only.";
el("lookCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(LOOK_PROMPT); el("lookCopied").hidden = false; }
  catch (e) { prompt("Copy this instruction:", LOOK_PROMPT); }
});
el("lookAsk").addEventListener("click", async () => {
  el("cfgTabChat").click();
  const input = el("askInput");
  let text = "";
  try { text = (await navigator.clipboard.readText()).trim(); } catch (e) {}
  if (text && text !== LOOK_PROMPT && text.length < 400) input.value = text;
  input.placeholder = "Paste Gemini's answer here and press Send";
  input.focus();
  el("advisor").scrollIntoView({ block: "nearest" });
});

/* ---------- step 3: a card for every part ---------- */
// Which way to turn the 3D car to show each part best (degrees in the 360 view: 60 = front three-quarter,
// 0 = side, 210 = back three-quarter; Photoshoot counts from the other end, see partShot).
const PART_ANGLE = { wheels: 45, drop: 0, brakes: 35, bodykit: 60, widebody: 50, spoiler: 210, exhaust: 235, wrap: 60, stripes: 80, tint: 330, lights: 85 };
// Best angle for extra parts that show better from somewhere other than the front three-quarter.
const EXTRA_ANGLE = { "Side skirts": 0, "Smoked tail lights": 210, "Caliper paint": 35, "Centre cap swap": 35, "Low-profile tyres": 20, "Honeycomb mesh grille": 75, "Carbon grille": 75,
  "Chrome window trim": 15, "Carbon window trim": 15, "Seat covers": 25, "Dashboard trim": 40, "Floor mats": 25, "Bonnet wrap": 65 };
// eBay search words for extra parts where the part's name alone isn't what shops call it.
const EXTRA_QUERY = { "Bonnet wrap": "bonnet vinyl wrap film", "Caliper paint": "brake caliper paint kit", "Centre cap swap": "wheel centre caps", "Low-profile tyres": "low profile tyres",
  "Honeycomb mesh grille": "honeycomb mesh grille", "Smoked tail lights": "smoked tail light tint film", "Chrome window trim": "chrome window trim strip", "Carbon window trim": "carbon window trim",
  "Seat covers": "seat covers", "Dashboard trim": "dashboard trim kit", "Floor mats": "floor mats" };
const UNSEEN = { tune: "Under the bonnet", intake: "Under the bonnet" };
// What to search for at each shop.
const SEARCH = {
  tune: "ECU remap", intake: "cold air intake", exhaust: "cat back exhaust", wheels: p => `${p.size} inch ${p.style.replace("-", " ")} alloy wheels`,
  drop: p => p.air ? "air suspension kit" : p.springs ? "lowering springs" : "coilovers", brakes: "big brake kit", bodykit: "front splitter side skirts diffuser",
  widebody: "wide arch kit", spoiler: p => ({ lip: "boot lip spoiler", ducktail: "ducktail spoiler", "gt-wing": "GT wing spoiler", "roof-ext": "roof spoiler extension", pedestal: "pedestal boot wing spoiler" })[p.type],
  wrap: p => p.paint ? "" : "vinyl wrap film", stripes: "racing stripes vinyl", tint: "window tint film", lights: "smoked headlight film"
};
const q = s => encodeURIComponent(s).replace(/%20/g, "+");
const carWords = c => `${c.make} ${c.model.split(" ")[0]} ${c.gen}`;
// Wheel bolt patterns, so the eBay search finds wheels that actually fit.
const PCD = { golf: "5x112", bmw440i: "5x120", fiesta: "4x108" };
// What to look for on eBay for each part (null = a service, such as a remap or a respray, not something to buy).
function productQuery(x, c) {
  const p = x.p, cw = carWords(c);
  if (x.item) {
    if (x.item.name === "Private number plate") return null;
    if (x.item.name === "Styled number plates") return "4D gel number plates road legal pair";
    if (/plate delete/i.test(x.item.name)) return null;
    return `${cw} ${EXTRA_QUERY[x.item.name] || x.item.name}`;
  }
  switch (x.id) {
    case "tune": return null;
    case "wrap": return p.paint ? null : `${p.finish} vinyl car wrap film`;
    case "wheels": return `${p.size} inch ${p.finish} alloy wheels ${PCD[c.id] || ""}`.trim();
    case "stripes": return "racing stripes vinyl car";
    case "tint": return "car window tint film";
    default: { const s = typeof SEARCH[x.id] === "function" ? SEARCH[x.id](p) : SEARCH[x.id]; return s ? `${cw} ${s}` : null; }
  }
}
function shops(id, p, c, item) {
  const near = what => ({ name: "Near you", url: `https://www.google.com/maps/search/${q(what)}` });
  const ebay = s => ({ name: "eBay UK", url: `https://www.ebay.co.uk/sch/i.html?_nkw=${q(s)}` });
  const dt = s => ({ name: "Demon Tweeks", url: `https://www.demon-tweeks.com/uk/catalogsearch/result/?q=${q(s)}` });
  const amz = s => ({ name: "Amazon UK", url: `https://www.amazon.co.uk/s?k=${q(s)}` });
  if (item) {
    if (item.name === "Private number plate") return [{ name: "DVLA", url: `https://dvlaregistrations.dvla.gov.uk/search/results.html?search=${q((item.reg || "").replace(/\s/g, ""))}` }];
    if (item.name === "Styled number plates") return [{ name: "Premium Plates", url: "https://www.premiumplates.com/" }, ebay("4D gel number plates road legal")];
    if (/plate delete/i.test(item.name)) return [ebay(carWords(c) + " number plate delete")];
    return [ebay(`${carWords(c)} ${item.name}`), amz(`${c.make} ${c.model.split(" ")[0]} ${item.name}`)];
  }
  const s = typeof SEARCH[id] === "function" ? SEARCH[id](p) : SEARCH[id];
  if (id === "tune") return [near("ECU remap specialist"), dt(`${c.make} ${c.model.split(" ")[0]} remap`)];
  if (id === "wrap") return p.paint ? [near("car body shop respray")] : [near("car wrap shop"), ebay("vinyl car wrap " + p.finish)];
  if (id === "tint") return [{ name: "Halfords", url: "https://www.halfords.com/search?q=window+tinting" }, near("window tinting")];
  if (id === "widebody") return [ebay(`${carWords(c)} ${s}`), near("car body kit fitting")];
  return [dt(`${c.make} ${c.model.split(" ")[0]} ${s}`), ebay(`${carWords(c)} ${s}`)];
}
// Pictures of each part on the 3D car, taken from its best angle (cached per build).
const shots = new Map(); let shotQueue = Promise.resolve();
async function partShot(angle) {
  const V = window.Viewer3D; if (!V || !V.view()) return null;
  const key = JSON.stringify([state.car, state.mods, angle, V.mode()]);
  if (shots.has(key)) return shots.get(key);
  const job = shotQueue.then(async () => {
    const before = V.view();
    if (before.inside) return null; // sitting inside: leave the view alone
    V.setAngle(before.mode === "photo" ? angle - 180 : angle);
    const shot = await V.capture();
    V.setView(before.cam);
    if (!shot || !shot.blob) return null;
    // Crop to the middle of the frame, where the car is, as a small picture.
    const bmp = await createImageBitmap(shot.blob), W = 640, H = 400;
    const cw = bmp.width * 0.62, ch = cw * H / W, c = document.createElement("canvas"); c.width = W; c.height = H;
    c.getContext("2d").drawImage(bmp, (bmp.width - cw) / 2, (bmp.height - ch) / 2 + bmp.height * 0.04, cw, ch, 0, 0, W, H);
    return new Promise(r => c.toBlob(b => r(b && URL.createObjectURL(b)), "image/jpeg", 0.85));
  }).catch(() => null);
  shotQueue = job; shots.set(key, job);
  job.then(url => { if (!url) shots.delete(key); }); // try again next time if it failed
  return job;
}
function cards() {
  const c = car(), out = [];
  for (const id of Object.keys(state.mods).sort((a, b) => MODS[a].order - MODS[b].order)) {
    const p = state.mods[id];
    if (id === "custom") { for (const it of p.items) out.push({ id, item: it, title: it.name + (it.reg ? ` (${it.reg})` : ""), cat: "Extras", price: it.price || 0, text: it.text || "", angle: EXTRA_ANGLE[it.name] ?? (/plate/i.test(it.name) ? 215 : 60) }); continue; }
    const info = modInfo(id, p, c) || {};
    out.push({ id, p, title: modLabel(id, p), cat: MODS[id].cat, price: modPrice(id, p, c), text: info.what || "", effect: info.effect || "", angle: PART_ANGLE[id] });
  }
  return out;
}
let cardsKey = "";
function renderParts() {
  const c = car(), list = cards(), key = JSON.stringify([state.car, state.mods]);
  if (key === cardsKey) return; cardsKey = key;
  el("partCards").innerHTML = list.length ? list.map((x, i) => `
    <article class="part-card panel">
      <div class="part-pic" data-i="${i}">${x.angle === undefined ? `<span class="part-unseen">${esc(UNSEEN[x.id] || "Not visible from outside")}</span>` : `<span class="part-loading">Loading picture…</span>`}</div>
      <div class="part-body">
        <div class="part-top"><small>${esc(x.cat)}</small><span class="part-fitted"><b class="mono">${x.price ? fmt(x.price) : "Ask for a quote"}</b><small>typical fitted</small></span></div>
        <h3>${esc(x.title)}</h3>
        ${x.text ? `<p>${esc(x.text)}</p>` : ""}
        <div class="part-product" data-i="${i}" hidden></div>
        <div class="part-shops"><span class="muted small">Buy from</span>${shops(x.id, x.p, c, x.item).map(s => `<a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join("")}</div>
      </div>
    </article>`).join("") : `<p class="part-none muted">No parts yet. Pick some in step 2 and they'll show here with prices and shops.</p>`;
  const parts = buildCost(c, state.mods);
  el("partTotal").hidden = !list.length;
  el("partTotal").innerHTML = `<div><span>${list.length} part${list.length === 1 ? "" : "s"}, typical fitted prices (not the eBay prices)</span><b class="mono">${fmt(parts)}</b></div><div><span>${c.make} ${c.model}, ${c.used ? "used" : "new"} (approx.)</span><b class="mono">${fmt(c.price)}</b></div><div class="grand"><span>Total</span><b class="mono">${fmt(parts + c.price)}</b></div>`;
  partsShown = false; loadShots();
}
// Real products from eBay UK (through the local server, which keeps the eBay keys). null = not available.
const products = new Map(); let ebayNote = "";
function findProduct(words) {
  if (!products.has(words)) {
    products.set(words, fetch("api/parts?q=" + encodeURIComponent(words)).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (j.error) ebayNote = j.error; products.delete(words); return null; }
      return j.items || [];
    }).catch(() => { products.delete(words); return null; }));
  }
  return products.get(words);
}
function showProduct(i, x, items, words) {
  const box = el("partCards").querySelector(`.part-product[data-i="${i}"]`), pic = el("partCards").querySelector(`.part-pic[data-i="${i}"]`);
  if (!box || !items.length) return false;
  const it = items[0], more = `https://www.ebay.co.uk/sch/i.html?_nkw=${q(words)}`;
  if (it.image) { pic.dataset.product = "1"; pic.innerHTML = `<img src="${esc(it.image)}" alt="${esc(it.title)}" referrerpolicy="no-referrer" loading="lazy"><span class="part-chip">eBay listing</span>`; }
  box.hidden = false;
  box.innerHTML = `<a class="part-item" href="${esc(it.url)}" target="_blank" rel="noopener"><span class="part-item-title">${esc(it.title)}</span>
      <span class="part-item-price"><b class="mono">£${it.price.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</b> <small>part only, on eBay${it.condition ? `, ${esc(it.condition.toLowerCase())}` : ""}</small></span></a>
    <p class="part-item-note muted small">Fitting not included. Check the listing says it fits your car before buying.</p>
    <div class="part-item-links"><a class="btn sm primary" href="${esc(it.url)}" target="_blank" rel="noopener">View this part on eBay ↗</a>
      ${items.length > 1 ? `<a class="btn sm" href="${esc(more)}" target="_blank" rel="noopener">More options ↗</a>` : ""}</div>`;
  return true;
}
// Only fill in the pictures once step 3 is near the screen (the 3D car is then out of sight, so the turning isn't seen).
let partsShown = false;
async function loadShots() {
  if (partsShown || el("flowParts").hidden) return; // only while the Parts & prices step is open
  partsShown = true; ebayNote = "";
  const list = cards(), key = cardsKey, c = car();
  // 1. Real parts first, all at once.
  const done = await Promise.all(list.map(async (x, i) => {
    const words = productQuery(x, c); if (!words) return false;
    const items = await findProduct(words);
    return key === cardsKey && items ? showProduct(i, x, items, words) : false;
  }));
  if (key !== cardsKey) return; // the build changed meanwhile
  el("partNote").hidden = !ebayNote || ebayNote === "ebay_offline";
  el("partNote").innerHTML = ebayNote === "no_ebay_key"
    ? `<b>Want photos of the real parts?</b> Add your free eBay keys to .env (see docs/EBAY.md) and restart start.bat. Each card then shows a real listing that fits your car.`
    : ebayNote === "ebay_keys"
    ? `<b>eBay didn't accept your keys.</b> Check EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env (see docs/EBAY.md), then restart start.bat. Until then the parts are shown on the 3D car.`
    : ebayNote ? `eBay didn't answer just now, so the parts are shown on the 3D car instead.` : "";
  // 2. The 3D car from the right angle for anything without a real part (remaps, paint, or no eBay keys).
  for (const [i, x] of list.entries()) {
    if (done[i] || x.angle === undefined) continue;
    const url = await partShot(x.angle);
    if (key !== cardsKey) return;
    const box = el("partCards").querySelector(`.part-pic[data-i="${i}"]`); if (!box || box.dataset.product) continue;
    box.innerHTML = url ? `<img src="${url}" alt="${esc(x.title)} on the 3D ${esc(car().model)}"><span class="part-chip">On your 3D car</span>` : `<span class="part-unseen">Open the site with start.bat to see it in 3D</span>`;
  }
}
addEventListener("scroll", () => { if (!partsShown) loadShots(); }, { passive: true });
addEventListener("viewer3d-ready", () => { partsShown = false; loadShots(); });

/* ---------- step 4: your photo with the build, through the free Gemini app ---------- */
let results = load(RESULT_KEY, {}); // prompt key -> result picture
function myPrompt(c) {
  return photoPrompt(c, state.mods, "photo").replace(/^Edit this photo of a /, "Edit this photo of my own ") + "\nIt's a real photo, so keep my car's own details, the number plate area and the surroundings exactly as they are.";
}
function renderMyRender() {
  const box = el("myRender"), c = car();
  if (!myPhoto || myPhoto.car !== c.id) {
    box.innerHTML = `<div class="myrender-empty"><p><b>Add a photo of your ${esc(c.make)} ${esc(c.model)} in step 1</b> and your build is added to it here.</p>
      <p class="muted small">No photo? The 3D studio can turn any view of the 3D car into a realistic photo.</p>
      <div class="actions"><button type="button" class="btn primary" data-go="flowCar">Add a photo</button><button type="button" class="btn" data-go3d>Make a photo from 3D</button></div></div>`;
    return;
  }
  if (!photoParts(state.mods).length) {
    box.innerHTML = `<div class="myrender-empty"><p><b>Add a part you can see first</b> (wheels, a colour, a drop, a spoiler…) in step 2. Engine parts don't change the look.</p></div>`;
    return;
  }
  const prompt = myPrompt(c), key = c.id + "|" + prompt, result = results[key];
  box.innerHTML = `
    <div class="myrender-compare${result ? "" : " solo"}">
      <figure><img src="${myPhoto.url}" alt="Your car now"><figcaption>Now</figcaption></figure>
      ${result ? `<figure><img src="${result}" alt="Your car with your build (AI impression)"><figcaption>With your build · AI impression</figcaption></figure>` : ""}
    </div>
    <ol class="myrender-steps">
      <li><a class="btn sm" download="my-car.jpg" href="${myPhoto.url}">Download your photo</a></li>
      <li><button type="button" class="btn sm" data-copy>Copy the AI instruction</button> <span class="muted small" data-copied hidden>Copied</span></li>
      <li><a class="btn sm" href="https://gemini.google.com/app" target="_blank" rel="noopener">Open Gemini ↗</a> Attach your photo, paste the instruction and send.</li>
      <li><button type="button" class="btn sm primary" data-pick>${result ? "Replace the result" : "Add the result"}</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden tabindex="-1" aria-hidden="true"> Download Gemini's picture and choose it here.</li>
    </ol>
    <details><summary>See the instruction</summary><textarea readonly rows="9"></textarea></details>
    <p class="muted small" data-msg>${result ? "Change your build and the steps start again for the new look. This build's picture stays saved." : "Free. Gemini makes the picture; it's an AI impression, so details may differ from real parts."}</p>`;
  box.querySelector("textarea").value = prompt;
  box.querySelector("[data-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(prompt); } catch (e) { const t = box.querySelector("textarea"); box.querySelector("details").open = true; t.select(); document.execCommand("copy"); }
    box.querySelector("[data-copied]").hidden = false;
  });
  const file = box.querySelector("input[type=file]");
  box.querySelector("[data-pick]").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files[0]; if (!f) return;
    try { results = { ...results, [key]: await shrink(f) }; } catch (err) { box.querySelector("[data-msg]").textContent = err.message; return; }
    // Keep the newest few only, so the browser's storage doesn't fill up.
    const keys = Object.keys(results); while (keys.length > 6) delete results[keys.shift()];
    store(RESULT_KEY, results); renderMyRender();
  });
}
el("myRender").addEventListener("click", e => {
  const go = e.target.closest("[data-go]"); if (go) showStep(stepIds.indexOf(go.dataset.go), true);
  if (e.target.closest("[data-go3d]")) { showStep(1, true); const b = document.querySelector('[data-spin="photo"]'); if (b && !b.hidden) setTimeout(() => b.click(), 600); }
});

/* ---------- keep the steps in line with the build ---------- */
const baseRenderInfo = renderInfo;
renderInfo = function () { baseRenderInfo.apply(this, arguments); update(); };
let lastPromptKey = "";
function update() {
  renderParts();
  const k = JSON.stringify([state.car, state.mods, !!myPhoto]);
  if (k !== lastPromptKey) { lastPromptKey = k; renderMyPhoto(); }
}
update(); showStep(step); stepForHash();
})();

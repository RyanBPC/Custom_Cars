/* Home page: the hero picture and the gallery of ready-made builds. Clicking a card opens the Build
   page with that car and its parts already fitted. */
(function () {
  const photo = b => `photos/builds/${b.id}.jpg`;
  // A card's picture: the build's photo, or the drawn car if the photo hasn't been made.
  // Cards use a small 800 px copy (photos/builds/thumbs/) so the home page loads fast; the hero keeps the full photo.
  const thumb = b => `photos/builds/thumbs/${b.id}.jpg`;
  const drawn = carId => `<div class="drawn">${carSVG(CARS.find(c => c.id === carId), {}, { uid: "h" + Math.random().toString(36).slice(2, 7) })}</div>`;
  // photo: false in builds.js = no photo made yet, so draw the car straight away instead of two failed loads.
  const art = b => b.photo === false ? drawn(b.car)
    : `<img src="${thumb(b)}" alt="" loading="lazy" width="800" height="450" data-full="${photo(b)}" data-car="${b.car}">`;
  window.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest("#buildGrid, #popGrid") || !img.dataset.car) return;
    // No small copy? Try the full photo once before falling back to the drawn car.
    if (img.dataset.full) { const full = img.dataset.full; delete img.dataset.full; img.src = full; return; }
    img.outerHTML = drawn(img.dataset.car);
  }, true);

  // Short names for the Models filter and the "Build your own" card.
  const POPULAR = ["track", "bmw-msport", "fiesta-fresh"];
  const SHORT = { golf: "Golf GTI", bmw440i: "BMW 440i", fiesta: "Fiesta" };
  const shortName = id => SHORT[id] || CARS.find(c => c.id === id).model;
  // Website #157: each card is an <article> with its name as a heading and one real "Build this" button,
  // so screen readers hear a short button name; the whole card stays clickable for mouse users.
  const own = `<article class="build-card own" data-build="" data-car="golf"><div class="art"><span class="plus" aria-hidden="true">+</span></div>
    <div class="body"><h3><b>Build your own</b></h3><span id="ownCarText">Start from a stock ${shortName("golf")} and choose every part.</span><button type="button" class="btn primary sm build-this">Start from stock</button></div></article>`;
  // Rough fitted price of a build, worked out from its own text the same way "Build this" fits it,
  // on a throwaway copy (the real car, parts and chat are put back untouched).
  function buildPrice(b) {
    const c = CARS.find(x => x.id === b.car), keep = { car: state.car, mods: state.mods };
    try {
      state.car = b.car; state.mods = {};
      const plan = localPlan(b.text) || {}, mods = {};
      (Array.isArray(plan.apply) ? plan.apply : []).forEach(a => { if (a && MODS[a.id]) mods[a.id] = sanitize(a.id, a.params, c); });
      return buildCost(c, sanitizeAll(mods, c));
    } catch (e) { return 0; }
    finally { state.car = keep.car; state.mods = keep.mods; }
  }
  const priceLine = b => { const v = buildPrice(b); return v > 0 ? `<span class="price">About £${(Math.round(v / 100) * 100).toLocaleString("en-GB")} fitted</span>` : ""; };
  const grid = document.getElementById("buildGrid");
  const card = b => {
    const c = CARS.find(x => x.id === b.car);
    return `<article class="build-card" data-build="${b.id}" data-car="${b.car}"><div class="art">${art(b)}</div>
      <div class="body"><h3><b>${b.name}</b></h3><span>${c.make} ${c.model}</span>${priceLine(b)}<ul class="tags" aria-label="Parts">${b.tags.map(t => `<li>${t}</li>`).join("")}</ul><button type="button" class="btn primary sm build-this" aria-label="Build this: ${b.name}">Build this</button></div></article>`;
  };
  grid.innerHTML = own + BUILDS.map(card).join("");
  // Home page "Popular builds" (Website #123): one build per car, same cards as the Models page.
  const popGrid = document.getElementById("popGrid");
  if (popGrid) popGrid.innerHTML = POPULAR.map(id => BUILDS.find(b => b.id === id)).filter(Boolean).map(card).join("");

  // Models filter: All / one button per car that has builds. "Build your own" stays and follows the chosen car.
  const filter = document.getElementById("buildFilter");
  const carIds = [...new Set(BUILDS.map(b => b.car))];
  const chip = (id, label, n) => `<button type="button" data-filter="${id}" aria-pressed="${id ? "false" : "true"}">${label} <small>${n}</small></button>`;
  filter.innerHTML = chip("", "All cars", BUILDS.length) + carIds.map(id => chip(id, shortName(id), BUILDS.filter(b => b.car === id).length)).join("");
  filter.addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]"); if (!btn) return;
    const pick = btn.dataset.filter;
    filter.querySelectorAll("[data-filter]").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
    grid.querySelectorAll(".build-card:not(.own)").forEach(card => { card.hidden = !!pick && card.dataset.car !== pick; });
    const ownCar = pick || "golf";
    grid.querySelector(".build-card.own").dataset.car = ownCar;
    document.getElementById("ownCarText").textContent = `Start from a stock ${shortName(ownCar)} and choose every part.`;
    // Website #187: tell screen readers how many builds are showing now, like the Garage tabs do.
    const n = pick ? BUILDS.filter(b => b.car === pick).length : BUILDS.length;
    const say = document.getElementById("buildCount");
    if (say) say.textContent = pick ? `Showing ${n} ${shortName(pick)} ${n === 1 ? "build" : "builds"}` : `Showing all ${n} builds`;
  });

  const hero = BUILDS.find(b => b.id === HERO_BUILD);
  const heroImg = document.getElementById("heroImg");
  // index.html already starts loading a smaller hero copy; only swap if the hero build changes.
  const heroSrc = `photos/builds/hero/${hero.id}.jpg`;
  const noPhoto = () => document.getElementById("home").classList.add("no-photo");
  heroImg.alt = hero.name;
  heroImg.onerror = () => { if (heroImg.src.includes("/hero/")) heroImg.src = photo(hero); else noPhoto(); };
  if (!heroImg.src.endsWith(heroSrc)) heroImg.src = heroSrc;
  else if (heroImg.complete && !heroImg.naturalWidth) heroImg.onerror();

  function openBuild(id, ownCar) {
    const b = BUILDS.find(x => x.id === id);
    const carId = b ? b.car : ownCar || "golf";
    // A plate we looked up belongs to its car, so it doesn't follow you onto a different one.
    if (state.plateCar && state.plateCar !== carId) clearPlate();
    if (state.car !== carId || Object.keys(state.mods).length) switchCar(carId, false);
    if (typeof hideAi3d === "function") hideAi3d();
    if (b) { applyPlan(localPlan(b.text), b.text); addAI(`This is the ${b.name}. Change anything you like: just tell me.`); }
    goTab("build");
    if (b && b.angle != null) aimAt(b.angle);
  }
  // Turns the 3D view so the build's headline parts face you (e.g. the GT wing from behind).
  // The view may still be starting up, or snap back to its default angle when the setting loads, so check again.
  function aimAt(deg) {
    const near = (a, t) => Math.abs(((a - t + 540) % 360) - 180) < 4;
    let tries = 0;
    (function aim() {
      const v = window.Viewer3D;
      if (!v || !v.view() || v.inside()) { if (++tries < 20) setTimeout(aim, 150); return; }
      v.setAngle(deg);
      // One later check: if the camera went back to its default front view, turn it again.
      setTimeout(() => { if (!near(v.angle(), deg) && near(v.angle(), 43) && !v.inside()) v.setAngle(deg); }, 1500);
    })();
  }
  ["buildGrid", "popGrid"].forEach(id => { const g = document.getElementById(id); if (g) g.addEventListener("click", e => { const c = e.target.closest("[data-build]"); if (c) openBuild(c.dataset.build, c.dataset.car); }); });
  // "Build yours" keeps whatever you're already building.
  document.getElementById("heroStart").addEventListener("click", () => goTab("build"));
  // Welcome back: saved builds (Website #67) live under the build sheet on the Build page, so a returning
  // visitor landing on Home gets a pointer to them. Same key and checks as loadMyBuilds() in studio.js.
  const back = document.getElementById("heroBack");
  function showBack() {
    let n = 0;
    try { const a = JSON.parse(localStorage.getItem("customizacions.mybuilds") || "[]");
      if (Array.isArray(a)) n = a.filter(b => b && b.mods && typeof b.mods === "object" && CARS.some(c => c.id === b.car)).length; } catch (e) { n = 0; }
    back.hidden = !n;
    if (n) back.innerHTML = `Welcome back: you have ${n} saved build${n === 1 ? "" : "s"}. <a href="#build" id="heroBackLink">Open My builds</a>`;
  }
  showBack();
  window.addEventListener("hashchange", () => { if (document.getElementById("home").offsetParent) showBack(); });
  back.addEventListener("click", e => {
    if (!e.target.closest("#heroBackLink")) return;
    e.preventDefault(); goTab("build");
    setTimeout(() => {
      const box = document.getElementById("myBuilds"); if (!box || box.hidden) return;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      const first = box.querySelector("button"); if (first) first.focus({ preventScroll: true });
    }, 120);
  });
  // "Try saying..." examples under the hero: open Build and send the phrase through the chat parser,
  // the same way the Price list and Journal Try buttons do.
  document.querySelector("#home .try-box").addEventListener("click", e => {
    const b = e.target.closest("[data-home-try]"); if (!b) return;
    const ph = b.dataset.homeTry;
    if (typeof hideAi3d === "function") hideAi3d();
    goTab("build"); applyPlan(localPlan(ph), ph);
  });
})();

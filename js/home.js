/* Home page: the hero picture and the gallery of ready-made builds. Clicking a card opens the Build
   page with that car and its parts already fitted. */
(function () {
  const photo = b => `photos/builds/${b.id}.jpg`;
  // A card's picture: the build's photo, or the drawn car if the photo hasn't been made.
  // Cards use a small 800 px copy (photos/builds/thumbs/) so the home page loads fast; the hero keeps the full photo.
  const thumb = b => `photos/builds/thumbs/${b.id}.jpg`;
  const art = b => `<img src="${thumb(b)}" alt="" loading="lazy" width="800" height="450" data-full="${photo(b)}" data-car="${b.car}">`;
  window.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest("#buildGrid") || !img.dataset.car) return;
    // No small copy? Try the full photo once before falling back to the drawn car.
    if (img.dataset.full) { const full = img.dataset.full; delete img.dataset.full; img.src = full; return; }
    const d = document.createElement("div"); d.className = "drawn";
    d.innerHTML = carSVG(CARS.find(c => c.id === img.dataset.car), {}, { uid: "h" + Math.random().toString(36).slice(2, 7) });
    img.replaceWith(d);
  }, true);

  const own = `<button type="button" class="build-card own" data-build=""><div class="art"><span class="plus" aria-hidden="true">+</span></div>
    <div class="body"><b>Build your own</b><span>Start from a stock Golf GTI and choose every part.</span><span class="btn primary sm build-this">Start from stock</span></div></button>`;
  document.getElementById("buildGrid").innerHTML = own + BUILDS.map(b => {
    const c = CARS.find(x => x.id === b.car);
    return `<button type="button" class="build-card" data-build="${b.id}"><div class="art">${art(b)}</div>
      <div class="body"><b>${b.name}</b><span>${c.make} ${c.model}</span><ul class="tags">${b.tags.map(t => `<li>${t}</li>`).join("")}</ul><span class="btn primary sm build-this">Build this</span></div></button>`;
  }).join("");

  const hero = BUILDS.find(b => b.id === HERO_BUILD);
  const heroImg = document.getElementById("heroImg");
  // index.html already starts loading a smaller hero copy; only swap if the hero build changes.
  const heroSrc = `photos/builds/hero/${hero.id}.jpg`;
  const noPhoto = () => document.getElementById("home").classList.add("no-photo");
  heroImg.alt = hero.name;
  heroImg.onerror = () => { if (heroImg.src.includes("/hero/")) heroImg.src = photo(hero); else noPhoto(); };
  if (!heroImg.src.endsWith(heroSrc)) heroImg.src = heroSrc;
  else if (heroImg.complete && !heroImg.naturalWidth) heroImg.onerror();

  function openBuild(id) {
    const b = BUILDS.find(x => x.id === id);
    const carId = b ? b.car : "golf";
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
  document.getElementById("buildGrid").addEventListener("click", e => { const c = e.target.closest("[data-build]"); if (c) openBuild(c.dataset.build); });
  // "Build yours" keeps whatever you're already building.
  document.getElementById("heroStart").addEventListener("click", () => goTab("build"));
  // "Try saying..." examples under the hero: open Build and send the phrase through the chat parser,
  // the same way the Price list and Journal Try buttons do.
  document.querySelector("#home .try-box").addEventListener("click", e => {
    const b = e.target.closest("[data-home-try]"); if (!b) return;
    const ph = b.dataset.homeTry;
    if (typeof hideAi3d === "function") hideAi3d();
    goTab("build"); applyPlan(localPlan(ph), ph);
  });
})();

/* Tab pages. Each tab at the top shows one part of the site on its own (#home, #models, #build, #photo, #interior, #about, ...).
   It's all one page underneath, so the car you're building stays the same when you switch tabs,
   and the browser's back and forward buttons move between tabs. */
"use strict";
(function () {
  // Which section each tab shows, and the heading for the studio's three tabs.
  const PAGES = { home: "home", models: "models", build: "studio", photo: "studio", interior: "studio", about: "about", garage: "garage", drive: "drive", prices: "prices", journal: "journal" };
  // Old links (#studio, #ai) still work.
  const ALIAS = { studio: "build", ai: "photo" };
  const HEADS = {
    build: ["Build", "Configure <em>your car.</em>"],
    photo: ["Photo Studio", "Turn your build into <em>a realistic photo.</em>"],
    interior: ["Interior", "Sit inside <em>your build.</em>"]
  };
  const head = document.querySelector("#studio .studio-head");
  const defaultText = head.querySelector("p").innerHTML;
  const TEXT = {
    photo: "Pick an angle and make an AI photo of your build, or make all 12 angles for a photo turntable. Keep chatting to the advisor to change parts.",
    interior: "Drag to look around, and switch seats with the buttons. Ask the advisor for parts like ambient lighting and see them from inside."
  };
  // Tabs that aren't finished yet: a "Still being built" label by the heading (with what's missing)
  // and a small mark on the tab's menu link. Take a tab out of this list when it's done.
  const WIP = {
    photo: "AI photos need the site's AI connection set up, so they may not work for everyone yet.",
    drive: "The road is a simple drawing for now."
  };
  const wipNote = document.createElement("p");
  wipNote.className = "wip-note";
  document.querySelectorAll("nav.main a, .navmore-list a").forEach(a => {
    const t = a.getAttribute("href").slice(1);
    if (!WIP[t]) return;
    const mark = document.createElement("span");
    mark.className = "wip-mark"; mark.textContent = "Still being built";
    const b = a.querySelector("b"); if (b) b.after(mark); else a.append(mark);
  });

  // Browser-tab title for each tab, so history and bookmarks can be told apart.
  const SITE = "Custom Cars";
  const TITLES = { home: "Custom Cars Build Studio", models: "Models", build: "Build", photo: "Photo Studio", interior: "Interior", about: "About", garage: "Garage", drive: "Test drive", prices: "Price list", journal: "Journal" };
  let current = null;
  // "#journal/mot" opens the Journal page with that guide open (links from the advisor's answers).
  let sub = null;

  const tabOf = () => {
    let t = location.hash.slice(1);
    sub = null;
    const slash = t.indexOf("/");
    if (slash > 0) { sub = t.slice(slash + 1); t = t.slice(0, slash); }
    if (ALIAS[t]) { t = ALIAS[t]; history.replaceState(null, "", "#" + t); }
    return PAGES[t] ? t : "home";
  };

  // Put the 3D view in the right mode for the tab (it may still be loading).
  function setViewer(tab) {
    const v = window.Viewer3D;
    if (typeof selectViewTab === "function" && typeof aiTab !== "undefined") {
      if (tab === "photo" && !aiTab) selectViewTab("ai");
      if (tab !== "photo" && aiTab) selectViewTab("3d");
    }
    if (v && typeof setInside === "function") {
      if (tab === "interior" && !v.inside()) setInside("driver");
      if (tab !== "interior" && v.inside()) setInside(null);
    }
  }

  // After a tab change, move keyboard focus to the new page's main heading
  // so screen readers announce where you are (not on first load).
  function focusHeading(page) {
    const h = document.querySelector("#" + page + " h1, #" + page + " h2");
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }

  function show(tab, scroll) {
    const page = PAGES[tab];
    document.title = tab === "home" ? TITLES.home : TITLES[tab] + " · " + SITE;
    for (const id of new Set(Object.values(PAGES))) document.getElementById(id).hidden = id !== page;
    document.body.dataset.page = tab;
    let inMore = false;
    document.querySelectorAll("nav.main a, .navmore-list a").forEach(a => {
      const on = a.getAttribute("href") === "#" + tab;
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      if (on && a.closest(".navmore")) inMore = true;
    });
    // The "More" button lights up too when one of its pages is open.
    if (more) {
      const sum = more.querySelector("summary");
      if (inMore) sum.setAttribute("aria-current", "page"); else sum.removeAttribute("aria-current");
      more.open = false;
    }
    if (HEADS[tab]) {
      head.querySelector(".eyebrow").textContent = HEADS[tab][0];
      head.querySelector("h1").innerHTML = HEADS[tab][1];
      head.querySelector("p").innerHTML = TEXT[tab] || defaultText;
    }
    // "Still being built" label under the page's heading.
    if (WIP[tab]) {
      wipNote.innerHTML = `<span class="wip-pill">Still being built</span> ${WIP[tab]}`;
      const h = document.querySelector(`#${page} h1, #${page} h2`);
      h.after(wipNote);
    } else wipNote.remove();
    keepNavLinkInView();
    if (page === "studio") setViewer(tab);
    if (scroll && current !== null) { window.scrollTo(0, 0); if (tab !== current) focusHeading(page); }
    current = tab;
  }

  // "More" menu in the top bar: close it after picking a page, on Escape, or on a click elsewhere.
  const more = document.querySelector(".navmore");
  if (more) {
    more.addEventListener("click", e => { if (e.target.closest(".navmore-list a")) more.open = false; });
    more.addEventListener("keydown", e => {
      if (e.key === "Escape" && more.open) { e.preventDefault(); more.open = false; more.querySelector("summary").focus(); }
    });
    document.addEventListener("click", e => { if (more.open && !more.contains(e.target)) more.open = false; });
  }

  // On phones the nav scrolls sideways: fade its right edge while links are hidden,
  // and slide the current tab's link into view (sideways only, so the page doesn't jump).
  const nav = document.querySelector("nav.main");
  function markMore() {
    if (nav) nav.classList.toggle("more", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  }
  function keepNavLinkInView() {
    const a = nav && nav.querySelector('a[aria-current="page"]');
    if (a && nav.scrollWidth > nav.clientWidth) {
      const left = a.offsetLeft - nav.offsetLeft, right = left + a.offsetWidth;
      if (left < nav.scrollLeft) nav.scrollLeft = left - 8;
      else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth + 8;
    }
    markMore();
  }
  if (nav) {
    nav.addEventListener("scroll", markMore, { passive: true });
    window.addEventListener("resize", markMore);
  }

  // Open a tab from code (cards, buttons). Adds a history step, like clicking a tab.
  window.goTab = function (tab) {
    tab = ALIAS[tab] || tab;
    if (location.hash === "#" + tab) show(tab, true); else location.hash = tab;
  };

  // "Skip to content": jump focus past the nav without changing the tab (#hash is used for tabs).
  const skip = document.querySelector(".skip-link"), main = document.getElementById("content");
  if (skip && main) skip.addEventListener("click", e => { e.preventDefault(); main.focus(); main.scrollIntoView(); });

  // Open and scroll to one Journal guide ("#journal/mot"), closing the others.
  function openGuide() {
    if (!sub) return;
    const g = document.getElementById("guide-" + sub);
    if (!g || g.tagName !== "DETAILS") return;
    document.querySelectorAll("#posts details[open]").forEach(d => { if (d !== g) d.open = false; });
    g.open = true;
    g.scrollIntoView({ block: "start" });
    const s = g.querySelector("summary"); if (s) s.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", () => { show(tabOf(), true); openGuide(); });
  // The 3D view arrives after the page: put it in the tab's mode once it's ready.
  window.addEventListener("viewer3d-ready", () => setTimeout(() => setViewer(current), 0));

  // The viewer's own buttons (AI Photo tab, Interior) move you to the matching tab without adding a history step.
  document.addEventListener("click", e => {
    if (current === null || PAGES[current] !== "studio") return;
    const b = e.target.closest('#viewTabs [data-tab], [data-spin="inside"]');
    if (!b) return;
    setTimeout(() => {
      const v = window.Viewer3D;
      const tab = v && v.inside() ? "interior" : typeof aiTab !== "undefined" && aiTab ? "photo" : "build";
      if (tab !== current) { history.replaceState(null, "", "#" + tab); show(tab, false); }
    }, 0);
  });
  // Leaving the interior with Escape counts too.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !e.defaultPrevented && !(e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) && current === "interior") setTimeout(() => { history.replaceState(null, "", "#build"); show("build", false); }, 0);
  });

  show(tabOf(), false);
  if (sub) window.addEventListener("load", () => setTimeout(openGuide, 0), { once: true });
  // The page names are also section ids, so the browser jumps down to them on first load: start at the top instead.
  if (location.hash) { window.scrollTo(0, 0); window.addEventListener("load", () => window.scrollTo(0, 0), { once: true }); }
})();

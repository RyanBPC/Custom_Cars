/* Build page options: tidy panels of paint, wheels, aero and so on, like a car maker's configurator.
   Each option is the same plain English you'd type to the advisor, so it goes through the same parser
   (js/advisor/local-parser.js) and shows up in the chat and the build sheet like any other change. */
"use strict";
(function () {
  // pick: the part this row chooses one of (null = factory / none). extras: parts you switch on and off.
  const GROUPS = [
    { name: "Paint", pick: "wrap", swatch: true, opts: [["Factory", null], ["Gloss red", "red paint"], ["Gloss blue", "blue paint"], ["Gloss black", "black paint"], ["Gloss white", "white paint"], ["Gloss grey", "grey paint"], ["Gloss green", "green paint"], ["Gloss yellow", "yellow paint"], ["Gloss rose pink", "rose pink paint"], ["Metallic grey", "metallic grey paint"], ["Metallic red", "metallic red paint"], ["Metallic blue", "metallic blue paint"], ["Pearl white", "pearl white paint"], ["Pearl black", "pearl black paint"], ["Matte grey", "matte grey wrap"], ["Matte black", "matte black wrap"], ["Satin black", "satin black wrap"]] },
    { name: "Wheels", pick: "wheels", opts: [["Factory", null], ["18″ black mesh", "18 inch black mesh wheels"], ["19″ silver multi-spoke", "19 inch silver multi-spoke wheels"], ["19″ gunmetal forged", "19 inch gunmetal forged wheels"], ["19″ bronze deep dish", "19 inch bronze deep dish wheels"], ["20″ turbofan", "20 inch chrome turbofan wheels"]] },
    { name: "Ride height", pick: "drop", opts: [["Factory", null], ["−20mm", "lower it 20mm"], ["−35mm", "lower it 35mm"], ["Slammed −50mm", "slammed"], ["Air ride", "air ride"]] },
    { name: "Aero", pick: "spoiler", opts: [["No spoiler", null], ["Lip", "lip spoiler"], ["Ducktail", "ducktail spoiler"], ["GT wing", "gt wing"]], extras: [["Body kit", "body kit"], ["Widebody", "widebody"]] },
    { name: "Styling", extras: [["20% tint", "20% tint"], ["Smoked lights", "smoked lights"], ["Racing stripes", "racing stripes"], ["Carbon mirror caps", "carbon mirror caps"], ["Big brakes", "big brakes"]] },
    // Underglow: off or a colour (the LED colour on the road under the car).
    { name: "Underglow", glow: true, opts: [["Off", null], ["Blue", "blue underglow"], ["White", "white underglow"], ["Purple", "purple underglow"], ["Pink", "pink underglow"], ["Green", "green underglow"], ["Red", "red underglow"], ["Orange", "orange underglow"]] },
    { name: "Interior", extras: [["Ambient lighting", "ambient lighting"]], link: ["Sit inside →", "#interior"] },
    { name: "Number plates", extras: [["No front plate", "no front plate"], ["No rear plate", "no rear plate"]], plateBox: true },
    { name: "Performance", pick: "tune", opts: [["Stock", null], ["Stage 1", "stage 1 tune"], ["Stage 2", "stage 2 tune"]], extras: [["Louder exhaust", "louder exhaust"], ["Quad tips", "quad exhaust tips"]] }
  ];
  const box = document.getElementById("options");
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const customs = () => (state.mods.custom && state.mods.custom.items) || [];
  // What an option fits on a stock car. (The parser skips parts already fitted, so ask it about an empty build.)
  function planFor(text) {
    const mods = state.mods; state.mods = {};
    try { return localPlan(text); } finally { state.mods = mods; }
  }

  // Is everything this option fits already on the car?
  function isOn(text) {
    const p = planFor(text), list = p.apply || [];
    return list.length > 0 && list.every(a => a.id === "custom"
      ? a.params.items.every(i => customs().some(c => c.name === i.name))
      : state.mods[a.id] && same(sanitize(a.id, a.params, car()), state.mods[a.id]));
  }
  // Extras (underglow, ambient lighting...) share one list, so add to it instead of replacing it.
  const customPlan = items => items.length ? { apply: [{ id: "custom", params: { items } }] } : { remove: ["custom"] };
  function plans(g, o, extra) {
    const [label, text] = o;
    if (!text) { // back to how the car left the factory
      const said = g.pick === "spoiler" ? label : `${label} ${g.name.toLowerCase()}`;
      return { said, plan: { remove: [g.pick], reply: `Done: ${said.toLowerCase()}.` } };
    }
    const p = planFor(text);
    if (extra && isOn(text)) {
      const last = p.apply[p.apply.length - 1]; // the option's own part
      const plan = last.id === "custom" ? customPlan(customs().filter(c => !last.params.items.some(i => i.name === c.name))) : { remove: [last.id] };
      plan.reply = `Taken off: ${label.toLowerCase()}.`;
      return { said: `Remove the ${label.toLowerCase()}`, plan };
    }
    p.apply = (p.apply || []).map(a => a.id !== "custom" ? a : { id: "custom", params: { items: [...customs().filter(c => !a.params.items.some(i => i.name === c.name)), ...a.params.items] } });
    return { said: text, plan: p };
  }

  const glowItem = () => customs().find(c => c.name === "LED underglow");
  const colourOf = text => { const c = COLOURS.find(x => text.startsWith(x[0] + " ")); return c ? c[1] : null; };
  function chip(g, gi, o, oi, extra) {
    const on = g.glow ? (o[1] ? !!glowItem() && glowColour(state.mods) === colourOf(o[1]) : !glowItem()) : o[1] ? isOn(o[1]) : !state.mods[g.pick];
    let sw = g.glow && o[1] ? `<i class="sw flat" style="background:${colourOf(o[1])}"></i>` : "";
    if (g.swatch) {
      const p = o[1] && planFor(o[1]).apply[0], col = p ? p.params.colour : car().colour;
      sw = `<i class="sw${p && !["gloss", "metallic", "pearl"].includes(p.params.finish) ? " flat" : ""}" style="background:${col}"></i>`;
    }
    return `<button type="button" class="chip" data-g="${gi}" data-o="${oi}" data-x="${extra ? 1 : 0}" aria-pressed="${on}">${sw}${o[0]}</button>`;
  }
  // Your own private plate: type a reg and it goes on both plates (a private plate part, about £250).
  function plateBox() {
    const reg = privateReg(state.mods);
    return `<form class="plate-form" id="ownPlateForm" autocomplete="off"><label for="ownPlateText">Your own plate</label>
      <div class="plate-row"><input id="ownPlateText" maxlength="8" placeholder="e.g. RYAN 1" value="${reg}" aria-describedby="ownPlateHint" spellcheck="false">
      <button type="submit" class="chip">${reg ? "Change" : "Put on"}</button>${reg ? `<button type="button" class="chip" id="ownPlateClear">Back to the standard reg</button>` : ""}</div>
      <small id="ownPlateHint">Up to 7 letters and numbers, like a real UK private plate.</small></form>
      <div class="plate-style" aria-label="Plate style">${Object.keys(PLATE_STYLE_OPTS).map(k => `<label>${{ finish: "Lettering", shape: "Shape", border: "Border", badge: "Side badge" }[k]}
        <select data-ps="${k}">${PLATE_STYLE_OPTS[k].map(([v, l, pr]) => `<option value="${v}"${(plateStyleOf(state.mods) || {})[k] === v ? " selected" : ""}>${l}${pr ? ` (+£${pr})` : ""}</option>`).join("")}</select></label>`).join("")}
        <small>3D gel and 4D letters are road legal when made to BS AU 145e; the letters must stay black.</small></div>`;
  }
  function setPlateStyle(k, v) {
    const st = { ...(plateStyleOf(state.mods) || {}), [k]: v }, item = plateStyleItem(st), rest = customs().filter(c => c.name !== "Styled number plates");
    const plan = customPlan(item ? [...rest, item] : rest), label = PLATE_STYLE_OPTS[k].find(x => x[0] === v)[1].replace(/ \(.*\)/, "");
    plan.reply = item ? `Done: plates now with ${label.toLowerCase()}.` : "Back to standard plates.";
    addUser(`Number plates: ${label.toLowerCase()}`); applyPlan(plan, `plates ${label}`);
  }
  box.addEventListener("change", e => { const sel = e.target.closest("select[data-ps]"); if (sel) setPlateStyle(sel.dataset.ps, sel.value); });
  function setPlate(raw) {
    const reg = cleanReg(raw), rest = customs().filter(c => c.name !== "Private number plate");
    if (!reg) { const plan = customPlan(rest); plan.reply = "Your plates are back to the car's own reg."; addUser("Take the private plate off"); applyPlan(plan, "private plate off"); return; }
    const plan = customPlan([...rest, { name: "Private number plate", in3d: true, price: 250, text: "", reg }]);
    plan.reply = `Done: your plates now read ${reg}.`;
    addUser(`Private plate ${reg}`); applyPlan(plan, `private plate ${reg}`);
  }
  box.addEventListener("submit", e => { if (e.target.id === "ownPlateForm") { e.preventDefault(); setPlate(document.getElementById("ownPlateText").value); } });
  box.addEventListener("input", e => { if (e.target.id === "ownPlateText") { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""); if (v !== e.target.value) e.target.value = v; } });

  function render() {
    box.innerHTML = GROUPS.map((g, gi) => `<section class="opt-group" aria-label="${g.name}"><h3>${g.name}</h3>
      ${g.opts ? `<div class="chips">${g.opts.map((o, oi) => chip(g, gi, o, oi, false)).join("")}</div>` : ""}
      ${g.extras ? `<div class="chips">${g.extras.map((o, oi) => chip(g, gi, o, oi, true)).join("")}</div>` : ""}
      ${g.plateBox ? plateBox() : ""}
      ${g.link ? `<a class="opt-link" href="${g.link[1]}">${g.link[0]}</a>` : ""}</section>`).join("")
      + `<p class="opt-foot">Want something not listed? <button type="button" class="linkish" id="toAdvisor">Ask the advisor</button></p>`;
  }

  box.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (b) {
      const g = GROUPS[b.dataset.g], extra = b.dataset.x === "1", o = (extra ? g.extras : g.opts)[b.dataset.o];
      if (!extra && b.getAttribute("aria-pressed") === "true") return; // already chosen
      if (g.glow && !o[1]) { const plan = customPlan(customs().filter(c => c.name !== "LED underglow")); plan.reply = "Taken off: underglow."; addUser("Remove the underglow"); applyPlan(plan, "underglow off"); return; }
      const { said, plan } = plans(g, o, extra);
      addUser(said); applyPlan(plan, said);
      return;
    }
    if (e.target.id === "ownPlateClear") { setPlate(""); return; }
    if (e.target.id === "toAdvisor") { showPanel("chat"); document.getElementById("askInput").focus(); }
  });

  // Options / Advisor switch.
  const tabs = { opts: document.getElementById("cfgTabOpts"), chat: document.getElementById("cfgTabChat") };
  function showPanel(which) {
    for (const k in tabs) tabs[k].setAttribute("aria-selected", k === which);
    box.hidden = which !== "opts"; document.getElementById("advisor").hidden = which !== "chat";
    if (which === "chat") { const m = document.getElementById("msgs"); m.scrollTop = m.scrollHeight; }
  }
  tabs.opts.addEventListener("click", () => showPanel("opts"));
  tabs.chat.addEventListener("click", () => showPanel("chat"));

  // Keep the options lit up to match the car, whatever changed it (chat, cards, reset, another car).
  const origInfo = window.renderInfo;
  window.renderInfo = function () { const r = origInfo.apply(this, arguments); render(); return r; };
  render();
})();

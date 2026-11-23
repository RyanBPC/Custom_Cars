/* Build page options: tidy panels of paint, wheels, aero and so on, like a car maker's configurator.
   Each option is the same plain English you'd type to the advisor, so it goes through the same parser
   (js/advisor/local-parser.js) and shows up in the chat and the build sheet like any other change. */
"use strict";
(function () {
  // pick: the part this row chooses one of (null = factory / none). extras: parts you switch on and off.
  const GROUPS = [
    // ---- choice rows: dropdowns and a colour picker (see rowHtml); read gives the current choices from the fitted part ----
    { name: "Paint and wrap", row: true, mod: "wrap", offLabel: "Back to factory paint", fitLabel: "Apply",
      defaults: { kind: "wrap", finish: "gloss", colour: "#b5121b" },
      fields: [{ key: "kind", label: "Type", opts: [["wrap", "Vinyl wrap"], ["paint", "Respray (paint)"]] },
        { key: "finish", label: "Finish", opts: [["gloss", "Gloss"], ["satin", "Satin"], ["matte", "Matte"], ["metallic", "Metallic"], ["pearl", "Pearl"], ["chrome", "Chrome"], ["chameleon", "Colour-shift (chameleon)"], ["brushed", "Brushed metal"], ["carbon", "Carbon-look"]] },
        { key: "colour", label: "Colour", colour: true }],
      make: (v, n) => `${{ chameleon: "colour-shift", brushed: "brushed metal", carbon: "carbon-look" }[v.finish] || v.finish} ${n(v.colour)} ${v.kind === "paint" && !["chrome", "chameleon", "brushed", "carbon"].includes(v.finish) ? "respray" : "wrap"}` },
    { name: "Graphic wrap", row: true, part: "Custom graphic wrap", defaults: { pattern: "camo" },
      fields: [{ key: "pattern", label: "Pattern", opts: [["camo", "Camo"], ["flames", "Flames"], ["graffiti", "Graffiti / full print"]] }],
      read: (t, v) => { v.pattern = /camo/.test(t) ? "camo" : /graffiti|tribal|print/.test(t) ? "graffiti" : "flames"; },
      make: v => `${v.pattern === "graffiti" ? "graffiti" : v.pattern} wrap` },
    { name: "Wheels", row: true, mod: "wheels", offLabel: "Back to factory wheels", fitLabel: "Fit these wheels", defaults: { size: "19", style: "multi-spoke", finish: "gunmetal", lip: "no" },
      fields: [{ key: "size", label: "Size", opts: [["17", "17 inch"], ["18", "18 inch"], ["19", "19 inch"], ["20", "20 inch"], ["21", "21 inch"]] },
        { key: "style", label: "Style", opts: [["multi-spoke", "Multi-spoke"], ["5-spoke", "5-spoke"], ["y-spoke", "Y-spoke"], ["split-spoke", "Split-spoke"], ["mesh", "Mesh"], ["bbs-mesh", "BBS-style cross-spoke mesh"], ["monoblock", "Forged monoblock"], ["deep-dish", "Deep dish"], ["turbofan", "Turbofan"]] },
        { key: "finish", label: "Finish", opts: [["silver", "Silver"], ["gunmetal", "Gunmetal"], ["black", "Gloss black"], ["matte-black", "Matte black"], ["white", "White"], ["bronze", "Bronze"], ["gold", "Gold"], ["machined", "Machined (diamond-cut)"], ["chrome", "Chrome"]] },
        { key: "lip", label: "Lip", opts: [["no", "Same as the face"], ["yes", "Polished lip (two-tone)"]] }],
      // The finish goes right before "wheels", so its colour is read as the wheels' (not the paint's).
      make: v => `${v.size} inch ${{ "bbs-mesh": "bbs style cross spoke", monoblock: "forged monoblock", "deep-dish": "deep dish" }[v.style] || v.style} ${{ "matte-black": "matte black", black: "gloss black", machined: "machined" }[v.finish] || v.finish} wheels${v.lip === "yes" ? " with a polished lip" : ""}` },
    { name: "Tyres", row: true, part: "Low-profile tyres", offLabel: "Factory tyres", fitLabel: "Fit low-profile tyres", defaults: { profile: "35" },
      fields: [{ key: "profile", label: "Sidewall profile", opts: [["45", "45 series"], ["40", "40 series"], ["35", "35 series"], ["30", "30 series"]] }],
      read: (t, v) => { const m = t.match(/(45|40|35|30)-profile/); if (m) v.profile = m[1]; }, make: v => `${v.profile} profile tyres`,
      extras: [["Raised white letters", "raised white letter tyres"]] },
    { name: "Wheel spacers", row: true, part: "Wheel spacers", defaults: { mm: "20" },
      fields: [{ key: "mm", label: "Thickness (each side)", opts: [["5", "5mm"], ["10", "10mm"], ["15", "15mm"], ["20", "20mm"], ["25", "25mm"]] }],
      read: (t, v) => { const m = t.match(/(\d+)mm/); if (m) v.mm = m[1]; }, make: v => `${v.mm}mm wheel spacers` },
    { name: "Ride height", pick: "drop", opts: [["Factory", null], ["−20mm", "lower it 20mm"], ["−35mm", "lower it 35mm"], ["Slammed −50mm", "slammed"], ["Air ride", "air ride"]] },
    { name: "Aero", pick: "spoiler", opts: [["No spoiler", null], ["Lip", "lip spoiler"], ["Ducktail", "ducktail spoiler"], ["Roof extension", "roof spoiler extension"], ["Pedestal wing", "pedestal wing"], ["GT wing", "gt wing"]], extras: [["Body kit", "body kit"], ["Widebody", "widebody"]] },
    { name: "Styling", extras: [["Big brakes", "big brakes"]] },
    { name: "Window tint", row: true, mod: "tint", defaults: { vlt: "35" },
      fields: [{ key: "vlt", label: "Rear windows (light let through)", opts: [["70", "70% (lightest)"], ["50", "50%"], ["35", "35%"], ["20", "20%"], ["5", "5% (limo)"]] }],
      make: v => `${v.vlt}% tint`, note: "UK law: the windscreen must let through at least 75% of light and the front side windows 70%, so dark tint goes on the rear windows only (shown here)." },
    { name: "Smoked lights", row: true, parts: ["Smoked headlights", "Smoked tail lights"], alsoRemove: ["lights"], offLabel: "Clear lights", fitLabel: "Smoke them", defaults: { head: "medium", tail: "medium" },
      fields: [{ key: "head", label: "Headlights", opts: [["off", "Clear"], ["light", "Light smoke"], ["medium", "Medium smoke"], ["dark", "Dark smoke"]] },
        { key: "tail", label: "Tail lights", opts: [["off", "Clear"], ["light", "Light smoke"], ["medium", "Medium smoke"], ["dark", "Dark smoke"]] }],
      read: (t, v) => { const h = t.match(/(light|medium|dark) smoked headlight/), tl = t.match(/(light|medium|dark) smoked tail/); v.head = h ? h[1] : "off"; v.tail = tl ? tl[1] : "off"; },
      make: v => [v.head !== "off" && `${v.head === "light" ? "lightly" : v.head} smoked headlights`, v.tail !== "off" && `${v.tail === "light" ? "lightly" : v.tail} smoked tail lights`].filter(Boolean).join(" and "),
      note: "Lights must still pass the MOT brightness test; dark smoke is for shows." },
    { name: "Body & trim", extras: [["Side skirts", "side skirts"], ["Honeycomb grille", "honeycomb mesh grille"], ["Carbon grille", "carbon grille"], ["Chrome window trim", "chrome window trim"], ["Carbon window trim", "carbon window trim"]] },
    { name: "Racing stripes", row: true, mod: "stripes", defaults: { colour: "#ecebe6" }, fields: [{ key: "colour", label: "Colour", colour: true }],
      make: (v, n) => `${n(v.colour)} racing stripes` },
    { name: "Bonnet wrap", row: true, part: "Bonnet wrap", defaults: { finish: "gloss", colour: "#16181c" },
      fields: [{ key: "finish", label: "Finish", opts: [["gloss", "Gloss"], ["satin", "Satin"], ["matte", "Matte"], ["carbon", "Carbon-look"]] }, { key: "colour", label: "Colour", colour: true, when: v => v.finish !== "carbon" }],
      read: (t, v, c) => { v.finish = /carbon/.test(t) ? "carbon" : /matte/.test(t) ? "matte" : /satin/.test(t) ? "satin" : "gloss"; if (c[0]) v.colour = c[0]; },
      make: (v, n) => v.finish === "carbon" ? "carbon-look bonnet wrap" : `${v.finish} ${n(v.colour)} bonnet wrap` },
    { name: "Mirror caps", row: true, parts: ["Carbon mirror caps", "Gloss black mirror caps", "Coloured mirror caps"], defaults: { finish: "carbon", colour: "#b5121b" },
      fields: [{ key: "finish", label: "Finish", opts: [["carbon", "Carbon fibre"], ["black", "Gloss black"], ["colour", "Painted colour"]] }, { key: "colour", label: "Colour", colour: true, when: v => v.finish === "colour" }],
      read: (t, v, c, name) => { v.finish = name === "Carbon mirror caps" ? "carbon" : name === "Gloss black mirror caps" ? "black" : "colour"; if (c[0]) v.colour = c[0]; },
      make: (v, n) => v.finish === "carbon" ? "carbon mirror caps" : v.finish === "black" ? "gloss black mirror caps" : `${n(v.colour)} mirror caps` },
    { name: "Caliper paint", row: true, part: "Caliper paint", defaults: { colour: "#b5121b" }, fields: [{ key: "colour", label: "Colour", colour: true }],
      read: (t, v, c) => { if (c[0]) v.colour = c[0]; }, make: (v, n) => `paint the calipers ${n(v.colour)}`, note: "Paints your standard brakes. For bigger brakes, choose Big brakes under Styling." },
    { name: "Wheel centre caps", row: true, part: "Centre cap swap", defaults: { finish: "painted", colour: "#16181c" },
      fields: [{ key: "finish", label: "Finish", opts: [["painted", "Painted"], ["chrome", "Chrome"]] }, { key: "colour", label: "Colour", colour: true, when: v => v.finish !== "chrome" }],
      read: (t, v, c) => { v.finish = /chrome/.test(t) ? "chrome" : "painted"; if (c[0]) v.colour = c[0]; },
      make: (v, n) => v.finish === "chrome" ? "chrome centre caps" : `${n(v.colour)} centre caps` },
    { name: "Underglow", row: true, part: "LED underglow", defaults: { colour: "#2459c2" }, fields: [{ key: "colour", label: "Colour", colour: true }],
      read: (t, v, c) => { if (c[0]) v.colour = c[0]; }, make: (v, n) => `${n(v.colour)} underglow`,
      note: "UK roads: no red showing forwards, no white backwards, no blue or flashing. Safest switched on only when parked." },
    { name: "Interior", link: ["Sit inside →", "#interior"] },
    { name: "Ambient lighting", row: true, part: "LED ambient interior lighting", defaults: { colour: "#5aa6dc" }, fields: [{ key: "colour", label: "Colour", colour: true }],
      read: (t, v, c) => { if (c[0]) v.colour = c[0]; }, make: (v, n) => `${n(v.colour)} ambient lighting` },
    { name: "Seat covers", row: true, part: "Seat covers", defaults: { material: "leather", colour: "#16181c", tone: "one", colour2: "#b5121b", stitch: "matching", stitchColour: "#b5121b" },
      fields: [{ key: "material", label: "Material", opts: [["leather", "Leather"], ["alcantara", "Alcantara"], ["cloth", "Cloth"], ["quilted", "Quilted (diamond-stitch) leather"]] },
        { key: "colour", label: "Colour", colour: true },
        { key: "tone", label: "Two-tone", opts: [["one", "One colour"], ["two", "Two-tone (centre panels)"]] },
        { key: "colour2", label: "Centre panel colour", colour: true, when: v => v.tone === "two" },
        { key: "stitch", label: "Stitching", opts: [["matching", "Matching"], ["contrast", "Contrast colour"]] },
        { key: "stitchColour", label: "Stitching colour", colour: true, when: v => v.stitch === "contrast" }],
      read: (t, v) => {
        const [main, stitch] = t.split(/ with /), c = coloursInText(main);
        v.material = /alcantara/.test(t) ? "alcantara" : /cloth/.test(t) ? "cloth" : /quilt|diamond/.test(t) ? "quilted" : "leather";
        v.tone = /two[- ]?tone/.test(t) ? "two" : "one"; if (c[0]) v.colour = c[0]; if (c[1]) v.colour2 = c[1];
        if (stitch && /stitch/.test(stitch)) { v.stitch = "contrast"; const s = coloursInText(stitch); if (s[0]) v.stitchColour = s[0]; } else v.stitch = "matching";
      },
      make: (v, n) => `${v.tone === "two" ? `two-tone ${n(v.colour)} and ${n(v.colour2)}` : n(v.colour)} ${{ leather: "leather", alcantara: "alcantara", cloth: "cloth", quilted: "quilted leather" }[v.material]} seat covers${v.stitch === "contrast" ? ` with ${n(v.stitchColour)} stitching` : ""}` },
    { name: "Dashboard trim", row: true, part: "Dashboard trim", defaults: { finish: "carbon", colour: "#b5121b" },
      fields: [{ key: "finish", label: "Finish", opts: [["carbon", "Carbon fibre"], ["piano", "Piano black"], ["brushed", "Brushed aluminium"], ["wood", "Wood"], ["colour", "Painted colour"]] }, { key: "colour", label: "Colour", colour: true, when: v => v.finish === "colour" }],
      read: (t, v, c) => { v.finish = /wood/.test(t) ? "wood" : /alumin|brushed/.test(t) ? "brushed" : /piano/.test(t) ? "piano" : /painted/.test(t) ? "colour" : "carbon"; if (c[0]) v.colour = c[0]; },
      make: (v, n) => ({ carbon: "carbon dashboard trim", piano: "piano black dashboard trim", brushed: "brushed aluminium dashboard trim", wood: "wood dashboard trim" })[v.finish] || `${n(v.colour)} painted dashboard trim` },
    { name: "Floor mats", row: true, part: "Floor mats", defaults: { material: "carpet", colour: "#b5121b", logo: "none" },
      fields: [{ key: "material", label: "Material", opts: [["carpet", "Carpet with coloured edging"], ["rubber", "Rubber"]] }, { key: "colour", label: "Edging colour", colour: true, when: v => v.material === "carpet" },
        { key: "logo", label: "Embroidery", opts: [["none", "None"], ["logo", "Embroidered badge"]] }],
      read: (t, v, c) => { v.material = /rubber/.test(t) ? "rubber" : "carpet"; const e = t.match(/with (.+?) edging/); const ec = e && coloursInText(e[1]); if (ec && ec[0]) v.colour = ec[0]; v.logo = /embroider/.test(t) ? "logo" : "none"; },
      make: (v, n) => `${v.material === "rubber" ? "rubber floor mats" : `carpet floor mats with ${n(v.colour)} edging`}${v.logo === "logo" ? " and embroidered badge" : ""}` },
    { name: "Number plates", extras: [["No front plate", "no front plate"], ["No rear plate", "no rear plate"]], plateBox: true },
    { name: "Performance", pick: "tune", opts: [["Stock", null], ["Stage 1", "stage 1 tune"], ["Stage 2", "stage 2 tune"]], extras: [["Louder exhaust", "louder exhaust"], ["Quad tips", "quad exhaust tips"]] }
  ];
  const box = document.getElementById("options");
  if (!document.getElementById("optRowCss")) document.head.insertAdjacentHTML("beforeend", `<style id="optRowCss">
    .opt-row{display:grid;gap:10px}.colour-field{display:grid;gap:6px}.cf-label{font-size:12px;color:var(--muted)}
    .chip.sw-only{padding:5px}.chip.sw-only .sw{width:18px;height:18px}.opt-row .plate-style{margin:0}.opt-note{color:var(--muted);font-size:12px}
    .opt-row input[type=color]{width:44px;height:28px;padding:0;border:0;background:none;cursor:pointer}</style>`);
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

  // Rows for an extra part with a colour or finish: a choice is on when the part is fitted with exactly that wording.
  const itemOf = name => customs().find(c => c.name === name);
  const plannedText = (text, name) => { const a = (planFor(text).apply || []).find(x => x.id === "custom"), it = a && a.params.items.find(i => i.name === name); return it ? it.text : null; };
  /* ---------- choice rows: dropdowns and a colour picker instead of a button for every option ----------
     A row builds one plain-English request from its choices ("satin purple bonnet wrap") and sends it through the
     advisor's parser, like typing it. Its current choices are read back from the car. */
  const QUICK = ["black", "white", "silver", "grey", "nardo grey", "red", "blue", "navy", "sky blue", "green", "british racing green", "yellow", "orange", "purple", "pink", "gold", "bronze", "teal"];
  const nameOf = hex => { const f = COLOURS.find(c => c[1].toLowerCase() === String(hex).toLowerCase()); return f ? f[0] : "custom-" + String(hex).replace("#", "").toLowerCase(); };
  const hexOf = name => (COLOURS.find(c => c[0] === name) || [])[1];
  // Colours named in a piece of text, in order (custom colours are "custom-rrggbb").
  function coloursInText(t) {
    if (typeof registerCustomColours === "function") registerCustomColours(t);
    const hits = []; for (const [n, h] of COLOURS) { const i = t.search(new RegExp("\\b" + n.replace(/[-]/g, "\\-") + "\\b")); if (i >= 0) hits.push([i, n.length, h]); }
    hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]); const out = []; let end = -1;
    for (const [i, l, h] of hits) if (i >= end) { out.push(h); end = i + l; }
    return out;
  }
  const allColours = () => { const seen = new Set(); return COLOURS.filter(c => !/^custom-/.test(c[0]) && !seen.has(c[1]) && seen.add(c[1])).map(c => c[0]).sort(); };
  function colourField(gi, key, label, hex) {
    const cur = hex ? nameOf(hex) : "";
    return `<div class="colour-field"><span class="cf-label">${label}</span><div class="chips">${QUICK.map(n => `<button type="button" class="chip sw-only" data-row="${gi}" data-key="${key}" data-val="${hexOf(n)}" aria-pressed="${cur === n}" title="${n}" aria-label="${n}"><i class="sw" style="background:${hexOf(n)}"></i></button>`).join("")}</div>
      <div class="plate-style"><label>More colours<select data-row="${gi}" data-key="${key}"><option value="">Pick a colour…</option>${allColours().map(n => `<option value="${hexOf(n)}"${cur === n ? " selected" : ""}>${n.replace(/\b\w/g, m => m.toUpperCase())}</option>`).join("")}</select></label>
      <label>Your own colour<input type="color" data-row="${gi}" data-key="${key}" value="${hex || "#888888"}"></label></div></div>`;
  }
  function selectField(gi, key, label, opts, val) {
    return `<div class="plate-style"><label>${label}<select data-row="${gi}" data-key="${key}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
  }
  // The text a row's part is fitted with now (custom part), or null.
  const partsOf = g => g.parts || (g.part ? [g.part] : []);
  const rowItem = g => customs().find(c => partsOf(g).includes(c.name));
  // Current choices of a row: read from the fitted part, else its defaults.
  function rowVals(g) {
    if (g.mod === "wrap") { const w = state.mods.wrap; return w ? { colour: w.colour, finish: w.finish, kind: w.paint ? "paint" : "wrap" } : { ...g.defaults, on: false }; }
    if (g.mod === "wheels") { const w = state.mods.wheels; return w ? { size: String(w.size), style: w.style, finish: w.finish, lip: w.lip ? "yes" : "no" } : { ...g.defaults, on: false }; }
    if (g.mod === "tint") { const w = state.mods.tint; return w ? { vlt: String(w.vlt) } : { ...g.defaults, on: false }; }
    if (g.mod === "stripes") { const s = state.mods.stripes; return s ? { colour: s.colour } : { ...g.defaults, on: false }; }
    const its = customs().filter(c => partsOf(g).includes(c.name)); if (!its.length) return { ...g.defaults, on: false };
    const t = its.map(it => (it.text || it.name).toLowerCase()).join(" and "), v = { on: true }; g.read(t, v, coloursInText(t), its[0].name); return { ...g.defaults, ...v };
  }
  function rowHtml(g, gi) {
    const v = rowVals(g), fitted = v.on !== false;
    return `<div class="opt-row">${g.fields.map(f => f.colour ? (f.when && !f.when(v) ? "" : colourField(gi, f.key, f.label, v[f.key])) : selectField(gi, f.key, f.label, f.opts, v[f.key])).join("")}
      <div class="chips">${fitted ? `<button type="button" class="chip" data-row-off="${gi}">${g.offLabel || "Take it off"}</button>` : `<button type="button" class="chip" data-row-fit="${gi}">${g.fitLabel || "Fit it"}</button>`}</div>
      ${g.note ? `<small class="opt-note">${g.note}</small>` : ""}</div>`;
  }
  // Applies a row's choices: builds its wording and fits it (replacing the part's previous choice).
  function applyRow(g, v) {
    const text = g.make(v, nameOf);
    if (!text) return rowOff(g);
    const p = planFor(text);
    if (g.alsoRemove) p.remove = [...(p.remove || []), ...g.alsoRemove];
    p.apply = (p.apply || []).map(a => a.id !== "custom" ? a : { id: "custom", params: { items: [...customs().filter(c => !a.params.items.some(i => i.name === c.name) && !partsOf(g).includes(c.name)), ...a.params.items] } });
    addUser(text); applyPlan(p, text);
  }
  function rowOff(g) {
    const what = g.name.toLowerCase();
    const plan = g.mod ? { remove: [g.mod] } : customPlan(customs().filter(c => !partsOf(g).includes(c.name)));
    if (g.alsoRemove) plan.remove = [...(plan.remove || []), ...g.alsoRemove];
    plan.reply = `Taken off: ${what}.`; addUser(`Remove the ${what}`); applyPlan(plan, `${what} off`);
  }
  function rowChange(gi, key, val) {
    const g = GROUPS[gi], v = rowVals(g); v[key] = val; v.on = true; applyRow(g, v);
  }
  function chip(g, gi, o, oi, extra) {
    const on = g.part && !extra ? (o[1] ? !!itemOf(g.part) && itemOf(g.part).text === plannedText(o[1], g.part) : !itemOf(g.part)) : o[1] ? isOn(o[1]) : !state.mods[g.pick];
    let sw = g.part && !extra && o[2] ? `<i class="sw flat" style="background:${o[2]}"></i>` : "";
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
  box.addEventListener("change", e => {
    const sel = e.target.closest("select[data-ps]"); if (sel) return setPlateStyle(sel.dataset.ps, sel.value);
    const f = e.target.closest("[data-row]"); if (f && f.value) rowChange(+f.dataset.row, f.dataset.key, f.value);
  });
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
      ${g.row ? rowHtml(g, gi) : ""}
      ${g.opts && !g.row ? `<div class="chips">${g.opts.map((o, oi) => chip(g, gi, o, oi, false)).join("")}</div>` : ""}
      ${g.extras ? `<div class="chips">${g.extras.map((o, oi) => chip(g, gi, o, oi, true)).join("")}</div>` : ""}
      ${g.plateBox ? plateBox() : ""}
      ${g.link ? `<a class="opt-link" href="${g.link[1]}">${g.link[0]}</a>` : ""}</section>`).join("")
      + `<p class="opt-foot">Want something not listed? <button type="button" class="linkish" id="toAdvisor">Ask the advisor</button></p>`;
  }

  box.addEventListener("click", e => {
    const rb = e.target.closest("[data-row],[data-row-off],[data-row-fit]");
    if (rb && rb.tagName === "BUTTON") {
      if (rb.dataset.rowOff) return rowOff(GROUPS[rb.dataset.rowOff]);
      if (rb.dataset.rowFit) { const g = GROUPS[rb.dataset.rowFit]; return applyRow(g, rowVals(g)); }
      if (rb.getAttribute("aria-pressed") !== "true") rowChange(+rb.dataset.row, rb.dataset.key, rb.dataset.val);
      return;
    }
    const b = e.target.closest(".chip");
    if (b) {
      const g = GROUPS[b.dataset.g], extra = b.dataset.x === "1", o = (extra ? g.extras : g.opts)[b.dataset.o];
      if (!extra && b.getAttribute("aria-pressed") === "true") return; // already chosen
      if (g.part && !extra && !o[1]) { const what = g.name.toLowerCase(), plan = customPlan(customs().filter(c => c.name !== g.part)); plan.reply = `Taken off: ${what}.`; addUser(`Remove the ${what}`); applyPlan(plan, `${what} off`); return; }
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

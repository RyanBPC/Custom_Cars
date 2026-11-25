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
    { name: "Aero", pick: "spoiler", opts: [["No spoiler", null], ["Lip", "lip spoiler"], ["Ducktail", "ducktail spoiler"], ["Roof extension", "roof spoiler extension"], ["Pedestal wing", "pedestal wing"], ["GT wing", "gt wing"]], extras: [["Body kit", "body kit"], ["Widebody", "widebody"], ["Painted widebody", "painted widebody"]] },
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
    { name: "Body & trim", extras: [["Side skirts", "side skirts"]] },
    { name: "Grille", row: true, parts: ["Gloss black grille", "Honeycomb mesh grille", "Carbon grille", "Body-colour grille", "Sport grille"], offLabel: "Factory grille", fitLabel: "Fit this grille", defaults: { kind: "black" },
      fields: [{ key: "kind", label: "Grille", opts: [["black", "Gloss black"], ["honeycomb", "Honeycomb mesh"], ["sport", "Sport (honeycomb, red line)"], ["carbon", "Carbon fibre"], ["body", "Body colour"]] }],
      read: (t, v, c, name) => { v.kind = { "Gloss black grille": "black", "Honeycomb mesh grille": "honeycomb", "Carbon grille": "carbon", "Body-colour grille": "body", "Sport grille": "sport" }[name] || "black"; },
      make: v => ({ black: "gloss black grille", honeycomb: "honeycomb mesh grille", sport: "sport grille with a red line", carbon: "carbon grille", body: "body coloured grille" })[v.kind] },
    { name: "Window trim", row: true, parts: ["Chrome window trim", "Gloss black window trim", "Carbon window trim", "Brushed window trim"], offLabel: "Factory trim", fitLabel: "Fit this trim", defaults: { kind: "chrome" },
      fields: [{ key: "kind", label: "Strip under the side windows", opts: [["chrome", "Chrome"], ["black", "Gloss black"], ["carbon", "Carbon fibre"], ["brushed", "Brushed aluminium"]] }],
      read: (t, v, c, name) => { v.kind = { "Chrome window trim": "chrome", "Gloss black window trim": "black", "Carbon window trim": "carbon", "Brushed window trim": "brushed" }[name] || "chrome"; },
      make: v => ({ chrome: "chrome window trim", black: "gloss black window trim", carbon: "carbon window trim", brushed: "brushed aluminium window trim" })[v.kind] },
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
    { name: "Steering wheel", row: true, part: "Sport steering wheel", offLabel: "Factory wheel", fitLabel: "Fit a sport wheel", defaults: { grip: "alcantara", shape: "flat", marker: "yes", markerColour: "#b5121b", stitch: "matching", stitchColour: "#b5121b" },
      fields: [{ key: "grip", label: "Grip", opts: [["alcantara", "Alcantara"], ["leather", "Leather"], ["carbon", "Carbon fibre"]] },
        { key: "shape", label: "Shape", opts: [["flat", "Flat-bottomed"], ["round", "Round"]] },
        { key: "marker", label: "Top marker", opts: [["yes", "Coloured marker"], ["no", "None"]] }, { key: "markerColour", label: "Marker colour", colour: true, when: v => v.marker === "yes" },
        { key: "stitch", label: "Stitching", opts: [["matching", "Matching"], ["contrast", "Contrast colour"]] }, { key: "stitchColour", label: "Stitching colour", colour: true, when: v => v.stitch === "contrast" }],
      read: (t, v) => {
        v.grip = /carbon/.test(t) ? "carbon" : /leather/.test(t) ? "leather" : "alcantara"; v.shape = /round/.test(t) ? "round" : "flat";
        const mk = t.match(/([a-z0-9 -]+?) top marker/); v.marker = /no top marker/.test(t) ? "no" : "yes"; if (mk) { const c = coloursInText(mk[1]); if (c.length) v.markerColour = c[c.length - 1]; }
        const st = t.match(/and ([a-z0-9 -]+?) stitching/); v.stitch = st ? "contrast" : "matching"; if (st) { const c = coloursInText(st[1]); if (c[0]) v.stitchColour = c[0]; }
      },
      make: (v, n) => `${v.shape === "round" ? "round" : "flat bottomed"} ${v.grip} steering wheel ${v.marker === "yes" ? `with a ${n(v.markerColour)} top marker` : "with no top marker"}${v.stitch === "contrast" ? ` and ${n(v.stitchColour)} stitching` : ""}` },
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
    details.opt-group>summary{list-style:none;display:flex;align-items:baseline;gap:10px;cursor:pointer;min-height:24px}
    details.opt-group>summary::-webkit-details-marker{display:none}
    details.opt-group>summary h3{margin:0;flex:none}
    details.opt-group>summary::after{content:"";flex:none;margin-left:auto;align-self:center;width:7px;height:7px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(45deg);transition:transform .15s}
    details.opt-group[open]>summary::after{transform:rotate(-135deg)}
    details.opt-group[open]>summary{margin-bottom:10px}
    details.opt-group>summary:focus-visible{outline:2px solid var(--fg);outline-offset:3px;border-radius:4px}
    .opt-cur{font-size:12px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.opt-cur.on{color:var(--fg)}
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
  // Choices made on a row whose part isn't fitted yet: kept here until "Fit it", so just looking never fits or charges anything.
  const drafts = {};
  // Current choices of a row: read from the fitted part, else the draft, else its defaults.
  function rowVals(g) {
    if (g.mod === "wrap") { const w = state.mods.wrap; return w ? { colour: w.colour, finish: w.finish, kind: w.paint ? "paint" : "wrap" } : { ...g.defaults, on: false }; }
    if (g.mod === "wheels") { const w = state.mods.wheels; return w ? { size: String(w.size), style: w.style, finish: w.finish, lip: w.lip ? "yes" : "no" } : { ...g.defaults, on: false }; }
    if (g.mod === "tint") { const w = state.mods.tint; return w ? { vlt: String(w.vlt) } : { ...g.defaults, on: false }; }
    if (g.mod === "stripes") { const s = state.mods.stripes; return s ? { colour: s.colour } : { ...g.defaults, on: false }; }
    const its = customs().filter(c => partsOf(g).includes(c.name)); if (!its.length) return { ...g.defaults, ...(drafts[g.name] || {}), on: false };
    const t = its.map(it => (it.text || it.name).toLowerCase()).join(" and "), v = { on: true }; g.read(t, v, coloursInText(t), its[0].name); return { ...g.defaults, ...v };
  }
  function rowHtml(g, gi) {
    const v = rowVals(g), fitted = v.on !== false;
    return `<div class="opt-row">${g.fields.map(f => f.colour ? (f.when && !f.when(v) ? "" : colourField(gi, f.key, f.label, v[f.key])) : selectField(gi, f.key, f.label, f.opts, v[f.key])).join("")}
      <div class="chips">${fitted ? `<button type="button" class="chip" data-row-off="${gi}">${g.offLabel || "Take it off"}</button>` : `<button type="button" class="chip" data-row-fit="${gi}">${g.fitLabel || "Fit it"}</button>`}</div>
      ${!fitted && !g.mod ? `<small class="opt-note">Just looking: nothing is fitted or added to the price until you press ${g.fitLabel || "Fit it"}.</small>` : ""}
      ${g.note ? `<small class="opt-note">${g.note}</small>` : ""}</div>`;
  }
  // Applies a row's choices: builds its wording and fits it (replacing the part's previous choice).
  function applyRow(g, v) {
    const text = g.make(v, nameOf);
    delete drafts[g.name];
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
    const g = GROUPS[gi], v = rowVals(g);
    // Not fitted yet (an extra part): remember the choice and show it, but don't fit it until "Fit it".
    if (!g.mod && v.on === false) { drafts[g.name] = { ...(drafts[g.name] || {}), [key]: val }; return render(); }
    v[key] = val; v.on = true; applyRow(g, v);
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
  // Website #182: upper-case the plate as you type but keep the cursor where it was (it used to jump to the end, so
  // fixing one letter in the middle added letters at the end). The caret moves back by any characters removed before it.
  box.addEventListener("input", e => {
    if (e.target.id !== "ownPlateText") return;
    const el = e.target, clean = t => t.toUpperCase().replace(/[^A-Z0-9 ]/g, ""), v = clean(el.value);
    if (v === el.value) return;
    const a = el.selectionStart, b = el.selectionEnd, at = n => n == null ? v.length : clean(el.value.slice(0, n)).length;
    const na = at(a), nb = at(b);
    el.value = v;
    try { el.setSelectionRange(na, nb); } catch (_) {}
  });

  // Website #137: render() rebuilds the panel, so remember which control had keyboard focus and put focus back on its
  // new copy (a Fit it button becomes Take it off, so match that too; else fall back to the group's heading).
  const FOCUS_ATTRS = ["data-row", "data-key", "data-val", "data-row-off", "data-row-fit", "data-g", "data-o", "data-x", "data-ps"];
  function focusMemo() {
    const el = document.activeElement;
    if (!el || el === box || !box.contains(el)) return null;
    const sec = el.closest(".opt-group"), q = a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
    const sels = [el.id ? "#" + CSS.escape(el.id) : el.tagName.toLowerCase() + FOCUS_ATTRS.filter(a => el.hasAttribute(a)).map(q).join("")];
    if (el.dataset.rowFit) sels.push(`[data-row-off="${el.dataset.rowFit}"]`);
    if (el.dataset.rowOff) sels.push(`[data-row-fit="${el.dataset.rowOff}"]`);
    return { sels, sec: sec ? [...box.querySelectorAll(".opt-group")].indexOf(sec) : -1 };
  }
  function focusBack(m) {
    if (!m) return;
    for (const s of m.sels) { const el = box.querySelector(s); if (el) return el.focus(); }
    const grp = box.querySelectorAll(".opt-group")[m.sec], h = grp && (grp.querySelector("summary") || grp.querySelector("h3"));
    if (h) { if (h.tagName === "H3") h.tabIndex = -1; h.focus(); }
  }
  function render() {
    const memo = focusMemo();
    renderPanel();
    focusBack(memo);
  }
  // Website #138: each group folds away; its summary shows the current choice so the list stays short on a phone.
  // Open at first: Paint and wrap, Wheels and anything fitted; after that each group remembers being opened or closed.
  const openMemo = {};
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function groupStatus(g) {
    if (g.row) {
      const v = rowVals(g);
      if (v.on === false) return { on: false, text: g.mod || g.offLabel ? "Factory" : "Off" };
      const t = g.make(v, nameOf); return { on: true, text: t ? t.replace(/custom-([0-9a-f]{6})/g, "#$1") : "Fitted" };
    }
    const on = [];
    if (g.opts) for (const o of g.opts) if (o[1] && isOn(o[1]) && state.mods[g.pick]) on.push(o[0]);
    if (g.extras) for (const o of g.extras) if (isOn(o[1])) on.push(o[0]);
    if (g.plateBox) { const reg = privateReg(state.mods); if (reg) on.unshift(reg); if (plateStyleOf(state.mods)) on.push("styled"); }
    return { on: on.length > 0, text: on.join(", ") || (g.pick ? (g.opts[0][0] === "Factory" || g.opts[0][0] === "Stock" ? g.opts[0][0] : "Factory") : "Off") };
  }
  box.addEventListener("toggle", e => { if (e.target.matches && e.target.matches("details.opt-group")) openMemo[e.target.dataset.name] = e.target.open; }, true);
  // Website #139: "just looking" choices belong to this car and this build. A new car, or the build going back to
  // stock in one go (Reset, "start again"), forgets them; switching tabs keeps them.
  let draftCar = state.car, draftMods = Object.keys(state.mods).length;
  function forgetStaleDrafts() {
    const n = Object.keys(state.mods).length;
    if (state.car !== draftCar || (draftMods > 0 && n === 0)) for (const k in drafts) delete drafts[k];
    draftCar = state.car; draftMods = n;
  }
  // Category tabs above the groups, so the panel shows a short set at a time instead of one long list.
  // Every group is in one category, and "All" still shows the full list.
  const CATS = [
    ["Body", ["Paint and wrap", "Graphic wrap", "Racing stripes", "Bonnet wrap", "Aero", "Styling", "Body & trim", "Grille", "Window trim", "Mirror caps", "Number plates"]],
    ["Wheels", ["Wheels", "Tyres", "Wheel spacers", "Wheel centre caps", "Caliper paint", "Ride height"]],
    ["Lights & glass", ["Window tint", "Smoked lights", "Underglow"]],
    ["Interior", ["Interior", "Steering wheel", "Ambient lighting", "Seat covers", "Dashboard trim", "Floor mats"]],
    ["Performance", ["Performance"]]
  ];
  const catOf = name => (CATS.find(c => c[1].includes(name)) || CATS[0])[0];
  let optCat = "Body";
  try { const s = localStorage.getItem("customcars.optcat"); if (s === "All" || CATS.some(c => c[0] === s)) optCat = s; } catch (e) {}
  box.addEventListener("click", e => {
    const t = e.target.closest("[data-cat]"); if (!t) return;
    optCat = t.dataset.cat; try { localStorage.setItem("customcars.optcat", optCat); } catch (err) {}
    render(); const again = box.querySelector(`[data-cat="${CSS.escape(optCat)}"]`); if (again) again.focus();
  });
  function catTabs() {
    const fitted = name => GROUPS.filter(g => catOf(g.name) === name && !(g.link && !g.row && !g.opts && !g.extras) && groupStatus(g).on).length;
    const tab = (id, n) => `<button type="button" role="tab" data-cat="${id}" aria-selected="${optCat === id}" tabindex="${optCat === id ? 0 : -1}">${id}${n ? ` <small>${n}</small>` : ""}</button>`;
    return `<div class="opt-cats" role="tablist" aria-label="Part categories">${CATS.map(c => tab(c[0], fitted(c[0]))).join("")}${tab("All", 0)}</div>`;
  }
  // Arrow keys move between the category tabs.
  box.addEventListener("keydown", e => {
    const t = e.target.closest("[data-cat]"); if (!t || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const all = [...box.querySelectorAll("[data-cat]")], i = all.indexOf(t);
    const n = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
    e.preventDefault(); all[n].click();
  });
  function renderPanel() {
    forgetStaleDrafts();
    box.innerHTML = catTabs() + GROUPS.map((g, gi) => {
      if (optCat !== "All" && catOf(g.name) !== optCat) return "";
      if (g.link && !g.row && !g.opts && !g.extras) return `<section class="opt-group" aria-label="${g.name}"><h3>${g.name}</h3><a class="opt-link" href="${g.link[1]}">${g.link[0]}</a></section>`;
      const st = groupStatus(g), open = g.name in openMemo ? openMemo[g.name] : (st.on || g.name === "Paint and wrap" || g.name === "Wheels");
      return `<details class="opt-group" data-name="${g.name}"${open ? " open" : ""}><summary><h3>${g.name}</h3><span class="opt-cur${st.on ? " on" : ""}">${esc(st.text)}</span></summary>
      ${g.row ? rowHtml(g, gi) : ""}
      ${g.opts && !g.row ? `<div class="chips">${g.opts.map((o, oi) => chip(g, gi, o, oi, false)).join("")}</div>` : ""}
      ${g.extras ? `<div class="chips">${g.extras.map((o, oi) => chip(g, gi, o, oi, true)).join("")}</div>` : ""}
      ${g.plateBox ? plateBox() : ""}
      ${g.link ? `<a class="opt-link" href="${g.link[1]}">${g.link[0]}</a>` : ""}</details>`; }).join("")
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

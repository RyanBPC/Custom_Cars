/* Builds the instruction sent to the image AI from the build sheet, so the AI picture matches the build. */
"use strict";

// Settings the AI render can place the car in. "photo" keeps the stock picture's own background.
const ENVIRONMENTS = [
  { id: "photo", name: "Studio", text: "" },
  { id: "street-day", name: "City street, day", text: "Move the car to a city street in daylight." },
  { id: "street-night", name: "City street, night", text: "Move the car to a wet town street at night, with streetlights and reflections on the ground." },
  { id: "forest-day", name: "Forest track, day", text: "Move the car to a gravel track through a pine forest in daylight." },
  { id: "forest-night", name: "Forest avenue, night", text: "Move the car to a tree-lined avenue at night, lit by park lamps." }
];

// How each part should look in a photo. Parts with no visible change (remap, intake) return "".
function photoPartText(id, p) {
  switch (id) {
    case "wheels": return `${p.size}-inch ${p.finish} ${p.style.replace("-", " ")} alloy wheels with low-profile performance tyres`;
    case "drop": return p.air?`on air suspension, aired out so the tyres tuck just under the wheel arches and the body sits very low`:`lowered by about ${p.mm}mm on ${p.springs?"lowering springs":"coilovers"}, so the gap between tyre and wheel arch is much smaller`;
    case "brakes": return `large brake discs with ${p.caliper} six-piston calipers visible through the wheel spokes`;
    case "bodykit": return "a carbon-look front splitter, side skirts and rear diffuser";
    case "widebody": return "bolt-on widebody wheel-arch flares, about 50mm wider on each side, painted to match";
    case "spoiler": return ({ lip: "a small lip spoiler on the boot or roof edge", ducktail: "a ducktail rear spoiler painted to match", "gt-wing": "a large carbon swan-neck GT wing on tall uprights", "roof-ext": "a gloss black roof spoiler extension over the rear window", pedestal: "a body-coloured pedestal wing on two short stands above the boot" })[p.type];
    case "wrap": if(p.paint) return `a full ${p.finish} ${colourName(p.colour).toLowerCase()} respray, factory-quality paint replacing the original colour`; return `a full ${p.finish} ${colourName(p.colour).toLowerCase()} vinyl wrap replacing the paint colour`;
    case "stripes": return `twin ${colourName(p.colour).toLowerCase()} racing stripes running front to back over the bonnet, roof and boot lid, each about 13 cm wide with a 10 cm gap between them`;
    case "tint": return `dark tint on the rear windows only, letting through ${p.vlt}% of light (front windows stay clear, as UK law requires)`;
    case "lights": return "lightly smoked headlight and tail-light lenses";
    case "exhaust": return "a sports exhaust with larger polished tailpipes";
    case "custom": return p.items.map(i => i.text || i.name.toLowerCase()).join("; ");
    default: return "";
  }
}

function photoParts(mods) {
  return Object.keys(mods || {})
    .sort((a, b) => MODS[a].order - MODS[b].order)
    .map(id => photoPartText(id, mods[id]))
    .filter(Boolean);
}

// Same plate as the 3D car (plateLine in js/photo3d.js, loaded on the same page), worded for editing a stock photo.
// Your own photo (Build step 4) keeps its real plate, so it gets no plate line here.
function photoPlateLine(c, opts) {
  if (opts && opts.ownPhoto) return "";
  if (typeof plateLine !== "function") return "Keep the number plates blank.";
  return plateLine(c)
    .replace(/^Keep the (.+?) exactly as shown, reading/, "Show the $1 reading")
    .replace(/^The car has no number plates; do not add any\./, "Remove the number plates; the car has none.");
}

function photoPrompt(c, mods, envId, opts) {
  const env = ENVIRONMENTS.find(e => e.id === envId) || ENVIRONMENTS[0];
  const parts = photoParts(mods), plate = photoPlateLine(c, opts);
  return [
    `Edit this photo of a ${c.make} ${c.model} (${c.gen}), a UK right-hand-drive car.`,
    "Keep the car itself exactly the same: same body shape, proportions, badges, grille, lights, camera angle and right-hand drive.",
    "Apply only these modifications:",
    ...parts.map(t => "- " + t),
    env.text || "Keep the background, lighting and camera angle exactly as they are.",
    "Photorealistic, like a professional car photograph." + (plate ? " " + plate : "") + " Do not add any " + (plate && !/blank|none/.test(plate) ? "other " : "") + "text, logos or watermarks."
  ].join("\n");
}

/* Ready-made builds shown on the home page. Each one is a car plus what you'd type to the advisor,
   so clicking it opens the studio with exactly those parts fitted. To add a build (or a new car later),
   add an entry here. Photos live in photos/builds/<id>.jpg (taken with the 3D view's own photo capture, in a Photoshoot setting);
   if a photo is missing the card draws the car instead.
   "angle" is where the 3D camera starts, so the build's main parts are in view: 43 = front three-quarter,
   317 = rear three-quarter (same side), in degrees round the car. */
const BUILDS = [
  { id: "track", angle: 317, name: "Track Golf", car: "golf",
    text: "gt wing, body kit, 19 inch gunmetal forged wheels, lower it 35mm, red calipers, stage 2 tune, louder exhaust",
    tags: ["GT wing", "Splitter & diffuser", "19\" forged", "Stage 2"] },
  { id: "stance", angle: 317, name: "Stance Golf", car: "golf",
    text: "slammed, 19 inch bronze deep dish wheels, ducktail spoiler, dark tint, matte grey wrap",
    tags: ["Slammed", "19\" deep dish", "Ducktail", "Matte grey"] },
  { id: "daily", angle: 43, name: "Clean Daily", car: "golf",
    text: "18 inch black mesh wheels, lower it 20mm, lip spoiler, 20% tint",
    tags: ["18\" mesh", "-20mm", "Lip spoiler", "Tint"] },
  { id: "show", angle: 43, name: "Show Car", car: "golf",
    text: "blue paint, 20 inch chrome turbofan wheels, body kit, underglow, racing stripes, quad exhaust tips",
    tags: ["20\" turbofan", "Underglow", "Stripes", "Quad tips"] },
  // BMW 440i (used, F32): the classic UK "M Sport look" and a subtle daily.
  { id: "bmw-msport", angle: 43, name: "M Sport Look", car: "bmw440i",
    text: "gloss black grille, debadge, 19 inch black wheels, lower it 30mm, stage 1 tune, louder exhaust",
    tags: ["Black grille", "19\" black", "-30mm", "Stage 1"] },
  { id: "bmw-clean", angle: 43, name: "Clean 440i", car: "bmw440i",
    text: "18 inch silver wheels, lower it 20mm, 20% tint, smoked lights",
    tags: ["18\" silver", "-20mm", "Tint", "Smoked lights"] },
  // Ford Fiesta Mk6 1.4 (a cheap first car): small, sensible first-car mods.
  { id: "fiesta-fresh", angle: 43, name: "First-car Fresh", car: "fiesta",
    text: "17 inch black wheels, lowering springs, 20% tint, led headlights",
    tags: ["17\" black", "Springs", "Tint", "LED lights"] },
  { id: "fiesta-st", angle: 317, name: "Fiesta ST Look", car: "fiesta",
    text: "body kit, lip spoiler, 17 inch black wheels, lowering springs, white racing stripes, louder exhaust",
    tags: ["Body kit", "Lip spoiler", "Stripes", "Exhaust"] }
];
const HERO_BUILD = "track";

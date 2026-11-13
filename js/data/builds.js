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
    tags: ["20\" turbofan", "Underglow", "Stripes", "Quad tips"] }
];
const HERO_BUILD = "track";

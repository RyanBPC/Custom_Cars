/* Parts catalogue: colours, wheel/caliper options, mods, prices and part descriptions. */
"use strict";
// Tyre per rim size, as printed on the 3D sidewall (js/three/wheels3d.js reads this too). The outside of the
// tyre stays about the same, so bigger rims get lower-profile tyres, like a real Golf.
const TYRE_SIZE = { 15: "195/65 R15 91H", 16: "205/55 R16 91V", 17: "225/45 R17 94W", 18: "225/40 R18 92Y", 19: "235/35 R19 91Y", 20: "235/30 R20 88Y", 21: "245/25 R21 88Y" };
const RIM_WIDTH = { 15: 6.5, 16: 7, 17: 7.5, 18: 8, 19: 8.5, 20: 9, 21: 9 };
// A car's own factory tyre(s) at its stock rim size (cars.js "tyre": one size, or [front, rear] when staggered,
// like the BMW 440i), then its own upgrade sizes (cars.js "tyres"), else the Golf-based table above.
// Returns a string or a [front, rear] pair.
function tyreFor(car, size) {
  const n = Math.min(21, Math.max(15, Math.round(size)));
  if (car && car.tyre && Math.round(size) === car.wheel) return car.tyre;
  return (car && car.tyres && car.tyres[n]) || TYRE_SIZE[n];
}
// Outside diameter in mm of a tyre like "205/40 R17 84W".
function tyreDiameter(t) { const m = /^(\d+)\/(\d+) R(\d+)/.exec(t); return m ? m[3] * 25.4 + 2 * m[1] * m[2] / 100 : 0; }
// How much taller (%) a car's upgrade tyre is than its stock one. Some small cars have no real tyre low enough for big rims.
function tyreGrowth(car, size) {
  if (!car || !car.tyre || !car.tyres) return 0;
  const first = t => Array.isArray(t) ? t[0] : t, stock = tyreDiameter(first(car.tyre)), now = tyreDiameter(first(tyreFor(car, size)));
  return stock && now ? Math.round((now / stock - 1) * 100) : 0;
}
// For the 3D sidewall: look the car up by id (cars.js loads first).
function tyreForId(id, size) { return tyreFor(typeof ALL_CARS !== "undefined" ? ALL_CARS.find(c => c.id === id) : null, size); }
function wheelSpec(size, forged, car) {
  const n = Math.min(21, Math.max(15, Math.round(size)));
  const kg = 8 + (n - 15) - (forged ? 2 : 0); // rough real weights: ~10kg at 17in flow-formed, forged ~2kg lighter
  const short = t => t.replace(/ \d+[A-Z]$/, ""), t = tyreFor(car, size);
  const tyres = Array.isArray(t) ? short(t[0]) + " front and " + short(t[1]) + " rear tyres" : short(t) + " tyres";
  const taller = tyreGrowth(car, size);
  return size + "×" + RIM_WIDTH[n] + "J, about " + kg + "kg each, " + tyres + (taller > 5 ? " (about " + taller + "% taller than standard, so the arches would need work)" : "");
}
const COLOURS = [
 // Real UK factory colours come first so "estoril blue" is never read as plain blue. The third value is the factory finish.
 ["kings red","#c0141f","metallic"],["tornado red","#c4111b"],["moonstone grey","#8b8e8f"],["pure white","#f1f1ee"],["oryx white","#ece9df","pearl"],["deep black pearl","#0e0f12","pearl"],["lapiz blue","#1f4fa8","metallic"],["pomelo yellow","#e3bf1a","metallic"],["dolphin grey","#5a5f63","metallic"],
 ["estoril blue","#1f3f8c","metallic"],["alpine white","#efefea"],["black sapphire","#121318","metallic"],["mineral grey","#5d6166","metallic"],["mineral white","#e5e5e0","metallic"],["snapper rocks blue","#3d8fd6","metallic"],["portimao blue","#1c4fa2","metallic"],["melbourne red","#8a1520","metallic"],
 // Light/pale shades come first so "light grey" is never read as plain grey.
 ["light grey","#b3b8bd"],["light gray","#b3b8bd"],["pale grey","#c8ccd0"],["pale gray","#c8ccd0"],["light blue","#7fb2e5"],["pale blue","#a9cbe8"],["light green","#8cc98e"],["light pink","#eab3c9"],
 ["pearl white","#f2f0ea"],["british racing green","#1f4a33"],["nardo grey","#7a7e80"],["midnight purple","#3a2550"],["baby blue","#8fbfe0"],["baby pink","#f4c0d4"],["rose pink","#e27795"],["rose","#e27795"],["sky blue","#5aa6dc"],["navy","#1b2a4a"],
 ["gunmetal","#50565e"],["black","#16181c"],["white","#ecebe6"],["silver","#c5c8cc"],["grey","#6f757c"],["gray","#6f757c"],["red","#b5121b"],["blue","#2459c2"],
 ["green","#2f7a45"],["yellow","#e0b400"],["orange","#d9601e"],["purple","#5b2d86"],["pink","#d8608f"],["teal","#1d8a86"],["gold","#b8964e"],["bronze","#8c6a3f"],["lime","#7fc241"],["burgundy","#5e1422"],["brown","#5a3d2b"]
];
const RIM_FINISH = {silver:"#c9cdd2",gunmetal:"#545a62",black:"#1c1e22",bronze:"#8c6a3f",gold:"#b8964e",white:"#e8e8e4"};
const CALIPER = {red:"#c41d24",yellow:"#e1b400",black:"#26282c",blue:"#2459c2",gold:"#b8964e",green:"#2f7a45",orange:"#d9601e"};
const WHEEL_STYLES = ["multi-spoke","mesh","monoblock","deep-dish","turbofan"];

const MODS = {
 tune:{name:"Engine remap",cat:"Performance",order:1},
 intake:{name:"Cold-air intake",cat:"Performance",order:2},
 exhaust:{name:"Valved cat-back exhaust",cat:"Performance",order:3},
 wheels:{name:"Wheels",cat:"Wheels & suspension",order:4},
 drop:{name:"Coilovers",cat:"Wheels & suspension",order:5},
 brakes:{name:"Big brake kit",cat:"Wheels & suspension",order:6},
 bodykit:{name:"Aero kit",cat:"Bodywork",order:7},
 widebody:{name:"Widebody arches",cat:"Bodywork",order:8},
 spoiler:{name:"Spoiler",cat:"Bodywork",order:9},
 wrap:{name:"Vinyl wrap",cat:"Styling",order:10},
 stripes:{name:"Racing stripe",cat:"Styling",order:11},
 tint:{name:"Window tint",cat:"Styling",order:12},
 lights:{name:"Smoked lights",cat:"Styling",order:13},
 custom:{name:"Extra parts",cat:"Extras",order:14}
};
const fmt = n => "£" + Math.round(n).toLocaleString("en-GB");
// Power and torque gains [power, torque] as fractions, in line with what UK tuners quote and dyno.
// Turbo: e.g. Golf GTI Mk8.5 261bhp -> ~315bhp (stage 1), ~350bhp (stage 2), ~420bhp (hybrid turbo);
// BMW B58 440i 322bhp -> ~385bhp, ~430bhp, ~510bhp. Non-turbo (e.g. Fiesta 1.4) gains are small without big hardware.
const TUNE_GAIN = {t:{1:[.20,.25],2:[.33,.35],3:[.60,.55]}, n:{1:[.04,.04],2:[.08,.07],3:[.38,.35]}};

// Extra parts outside the main catalogue, with typical UK fitted prices. Anything else the user asks for
// is added as a custom part with no price. in3d: the 3D view shows it; the AI photo adds the rest.
// "chrome wheels", "chrome turbofan wheels", "chrome 20 inch rims" (but not "chrome wrap and wheels").
const CHROME_WHEELS_RE = /\bchrome\s+(?:(?!and\b|with\b|plus\b|wrap\b|paint\b|respray\b)[a-z0-9"”-]+\s+){0,3}(?:wheels?|rims?|alloys?)\b/;
const EXTRA_PARTS = [
 {re:/under ?glow|\bneons?\b(?!\s+(?:green|yellow|pink|orange|lime|red|blue|purple)\b(?!\s+(?:lights?|lighting|underglow)))|underbody lights?/,name:"LED underglow",in3d:true,price:250,text:"LED underglow lighting under the car"},
 {re:/carbon (fibre |fiber )?(bonnet|hood)/,name:"Carbon-fibre bonnet",in3d:true,price:1400,text:"an exposed carbon-fibre bonnet"},
 {re:/(bonnet|hood) vents?|vented (bonnet|hood)/,name:"Bonnet vents",in3d:true,price:350,text:"a vented bonnet with two heat-extraction vents"},
 {re:/canards?|dive planes?/,name:"Front canards",in3d:true,price:180,text:"carbon canards on the front bumper corners"},
 {re:/roof (rack|box|basket)/,name:"Roof rack",in3d:true,price:350,text:"a black roof rack"},
 {re:/light ?bar|spot ?lights?|rally lights?/,name:"LED light bar",in3d:true,price:220,text:"a roof-mounted LED light bar"},
 {re:/sun ?strip|windscreen (banner|strip|sticker)|screen banner/,name:"Windscreen sun strip",in3d:true,price:25,text:""},
 {re:/decals?|sponsor stickers?|race numbers?|graphics/,name:"Decals and graphics",in3d:true,price:450,text:"motorsport-style decals and graphics on the doors"},
 {re:/chrome delete|de-?chrome|black(ed)?[- ]?out (trim|badges)|debadge|black badges|shadow ?line/,name:"Chrome delete and black badges",in3d:true,price:300,text:"gloss-black badges and window trim instead of chrome"},
 {re:/(?:gloss |piano )?black(?:ed)?(?:[- ]?out)? (?:the )?(?:front |kidney )?(?:grilles?|kidneys?)\b|\bgrilles? (?:in |painted )?(?:gloss )?black\b/,name:"Gloss black grille",in3d:true,price:150,text:"a gloss-black front grille instead of the standard finish"},
 {re:/(?:gloss |piano )?black (?:wing )?mirror(?:s| caps?)\b/,name:"Gloss black mirror caps",in3d:true,price:120,text:"gloss-black wing mirror caps"},
 {re:/(?<!black (?:wing )?)mirror caps?|carbon (?:wing )?mirrors?/,name:"Carbon mirror caps",in3d:true,price:180,text:"carbon-fibre wing mirror caps"},
 {re:/\b(?:red|blue|white|yellow|green|orange|pink|purple|grey|gray|silver|gold|bronze|teal|lime|navy|brown|custom-[0-9a-f]{6}|body[- ]colou?r(?:ed)?)\b[a-z -]{0,14}?(?:wing )?mirror caps?\b/,name:"Coloured mirror caps",in3d:true,price:150,text:"painted wing mirror caps"},
 {re:/(wheel )?spacers?/,name:"Wheel spacers",in3d:true,price:150,text:"wheel spacers so the wheels sit flush with the arches"},
 {re:/bucket seats?|racing seats?|sports? seats?/,name:"Bucket seats",in3d:true,price:1800,text:"carbon racing bucket seats visible through the windows"},
 {re:/roll ?cage/,name:"Roll cage",in3d:true,price:2500,text:"a roll cage visible through the windows"},
 {re:/steering wheel/,name:"Sport steering wheel",in3d:true,price:450,text:""},
 {re:/(roof|bonnet|hood) scoop|air scoop/,name:"Air scoop",in3d:true,price:400,text:"an air scoop"},
 {re:/tow (hook|strap)/,name:"Tow strap",in3d:true,price:40,text:"a red tow strap on the front bumper"},
 {re:/\btow ?bars?\b/,name:"Tow bar",in3d:true,price:550,text:"a detachable tow bar (fitted with wiring)"},
 {re:/mud ?flaps?/,name:"Rally mud flaps",in3d:true,price:120,text:"rally-style mud flaps behind the wheels"},
 {re:/window visors?|wind deflectors?/,name:"Window visors",in3d:true,price:90,text:"smoked window visors above the side windows"},
 {re:/lift kit|lifted|raise it|(sit|ride|sits|rides) higher|off ?road look/,name:"Lift kit",in3d:true,price:900,text:"raised suspension with more ground clearance"},
 {re:/off ?road tyres|all ?terrain tyres|chunky tyres|mud tyres/,name:"All-terrain tyres",in3d:true,price:800,text:"chunky all-terrain tyres with raised white lettering"},
 {re:/bull ?bar|nudge bar/,name:"Bull bar",in3d:true,price:450,text:"a black bull bar on the front"},
 {re:/snorkel/,name:"Snorkel",in3d:true,price:350,text:"a raised air-intake snorkel on the front pillar"},
 {re:/side ?exit exhaust|side pipes?/,name:"Side-exit exhaust",in3d:true,price:1800,text:"side-exit exhaust tips just ahead of the rear wheels"},
 {re:/quad (tips|exhaust)|four (exhaust )?(tips|pipes)/,name:"Quad exhaust tips",in3d:true,price:400,text:"four large exhaust tips at the back"},
 {re:/strut ?(?:brace|bar)s?/,name:"Strut brace",in3d:false,price:120,text:"a strut brace across the top of the front suspension towers"},
 {re:/limited[- ]?slip|\blsd\b|quaife|\b(?:diff|differential)s?\b/,name:"Limited slip diff",in3d:false,price:1200,text:"a limited slip differential for better traction out of corners"},
 {re:/anti[- ]?roll bars?|sway bars?|\barbs?\b/,name:"Uprated anti-roll bars",in3d:false,price:350,text:"stiffer anti-roll bars for less body roll"},
 {re:/catch ?can/,name:"Oil catch can",in3d:false,price:150,text:"an oil catch can in the engine bay"},
 {re:/oil cooler/,name:"Oil cooler",in3d:false,price:500,text:"an oil cooler to keep the engine cool on track days"},
 {re:/intercooler/,name:"Uprated intercooler",in3d:true,price:900,text:"a large front-mounted intercooler visible behind the grille"},
 {re:/louv(re|er)s?/,name:"Rear window louvres",in3d:true,price:350,text:"black louvres over the rear window"},
 {re:/carbon roof/,name:"Carbon roof",in3d:true,price:2200,text:"an exposed carbon-fibre roof"},
 {re:/(bonnet|hood) pins?/,name:"Bonnet pins",in3d:true,price:90,text:"chrome bonnet pins"},
 {re:/angel eyes|halo lights?|halo rings?/,name:"Halo headlights",in3d:true,price:350,text:"glowing halo rings in the headlights"},
 {re:/led headlights?|\bhids?\b|xenon|brighter (head)?lights|matrix (?:led )?(?:head)?lights?|daytime running lights?|\bdrls?\b/,name:"LED headlight upgrade",in3d:true,price:400,text:"bright white LED headlights"},
 {re:/puddle lights?|(?:door )?projector lights?|door (?:logo )?lights?/,name:"Puddle lights",in3d:false,price:40,text:"logo puddle lights shining on the ground under the doors"},
 {re:/\b(?:led|dynamic|sequential)\s+(?:tail|rear)\s?lights?\b/,name:"LED tail lights",in3d:true,price:300,text:"LED tail lights with a dark smoked look"},
 {re:/sequential indicators?|dynamic indicators?/,name:"Sequential indicators",in3d:true,price:200,text:"sweeping sequential indicators"},
 {re:/(evil|angry) (eyes|look)|eyelids|eyebrows/,name:"Headlight eyelids",in3d:true,price:60,text:"gloss-black eyelid covers over the top of the headlights"},
 {re:/private plate|personal(ised)? plate|custom (number )?plate|show plate/,name:"Private number plate",in3d:true,price:250,text:""},
 {re:/sound system|subwoofer|\bsub\b|speakers?|(?<!(exhaust|pipes?|engine).{0,20})\bbass\b(?!.{0,20}(exhaust|pipes?|engine))/,name:"Sound system upgrade",in3d:true,price:900,text:""},
 {re:/harness(es)?/,name:"Racing harnesses",in3d:true,price:350,text:"red racing harnesses on the seats, visible through the windows"},
 {re:/short shifter|quick shift/,name:"Short shifter",in3d:true,price:250,text:""},
 {re:/camber/,name:"Negative camber setup",in3d:true,price:300,text:"wheels tilted in at the top with negative camber"},
 {re:/ppf|paint protection/,name:"Paint protection film",in3d:true,price:1500,text:""},
 {re:/ceramic (coat|protect|paint|detail)/,name:"Ceramic coating",in3d:true,price:600,text:""},
 {re:/dash ?cam/,name:"Dash cam",in3d:true,price:180,text:""},
 {re:CHROME_WHEELS_RE,name:"Chrome wheel finish",in3d:true,price:900,text:"mirror-chrome wheels"},
 {re:/two[- ]?tone|black roof|contrast roof/,name:"Two-tone black roof",in3d:true,price:450,text:"a gloss-black roof and pillars for a two-tone look"},
 {re:/flames?|tribal|camo(uflage)?|pattern wrap|graffiti/,name:"Custom graphic wrap",in3d:true,price:1200,text:""},
 {re:/racing number|roundel/,name:"Racing numbers",in3d:true,price:120,text:"white racing-number roundels on the doors"},
 {re:/gold (wheels|rims)|bronze (wheels|rims)/,name:"",price:0,text:""},
 {re:/interior lights?|ambient lighting|led interior/,name:"LED ambient interior lighting",in3d:true,price:250,text:""},
 // Cosmetic extras (Ryan's list): each has its own 3D version; the colour or finish chosen goes in its text (js/advisor/local-parser.js).
 {re:/\bside ?skirts?\b/,name:"Side skirts",in3d:true,price:450,text:"carbon-look side skirts between the wheels"},
 {re:/smoked? (?:tail|rear) ?lights?|(?:tail|rear) ?lights? (?:smoked|tinted)|tint(?:ed)? (?:the )?(?:tail|rear) ?lights?/,name:"Smoked tail lights",in3d:true,price:120,text:"lightly smoked tail-light lenses"},
 {re:/(?:bonnet|hood) (?:vinyl )?wrap|wrap (?:the |my )?(?:bonnet|hood)|carbon[- ]look (?:bonnet|hood)|(?:gloss|glossy|matte?|satin) (?:[a-z]+ )?(?:bonnet|hood)\b|\b(?:black|white|red|grey|gray) (?:bonnet|hood)\b/,name:"Bonnet wrap",in3d:true,price:250,text:"a gloss black vinyl wrap on the bonnet"},
 {re:/calipers? paint|paint(?:ed)? (?:the |my )?(?:brake )?calipers?|painted (?:brake )?calipers?|calipers? (?:colou?r|painted)/,name:"Caliper paint",in3d:true,price:200,text:"red painted brake calipers"},
 {re:/(?:cent(?:re|er)|wheel|hub) caps?\b/,name:"Centre cap swap",in3d:true,price:60,text:"black wheel centre caps"},
 {re:/low[- ]?pro(?:file)?\b|stretch(?:ed)? tyres?|thin(?:ner)? (?:side ?walls?|tyres)/,name:"Low-profile tyres",in3d:true,price:600,text:"low-profile tyres with thin sidewalls"},
 {re:/honeycomb|mesh grilles?/,name:"Honeycomb mesh grille",in3d:true,price:180,text:"a black honeycomb mesh grille and bumper inserts"},
 {re:/carbon (?:fibre |fiber )?grilles?/,name:"Carbon grille",in3d:true,price:350,text:"a carbon-fibre grille and bumper inserts"},
 {re:/chrome (?:window )?(?:trim|line|surrounds?)\b|chrome (?:door )?handles?/,name:"Chrome window trim",in3d:true,price:150,text:"a chrome strip along the bottom of the side windows"},
 {re:/carbon (?:fibre |fiber )?(?:window |exterior )?(?:trim|line)\b/,name:"Carbon window trim",in3d:true,price:250,text:"a carbon-fibre strip along the bottom of the side windows"},
 {re:/seat covers?|re-?upholster|(?:leather|alcantara|suede) (?:seats?|interior|upholstery)|two[- ]?tone seats?|\b(?:tan|red|black|white|grey|gray|blue|brown) (?:leather )?seats?\b/,name:"Seat covers",in3d:true,price:950,text:"black leather seat covers"},
 {re:/dash(?:board)? (?:trim|inserts?)|(?:carbon|aluminium|aluminum|brushed|piano black) (?:fibre |fiber )?(?:dash(?:board)?|interior trim|trim inserts?)/,name:"Dashboard trim",in3d:true,price:300,text:"carbon-fibre dashboard trim"},
 {re:/(?:floor|car) mats?\b|\bmats\b/,name:"Floor mats",in3d:true,price:80,text:"black floor mats with red edging"},
 // Number plates off: the chat turns "no plates", "remove the front plate" and so on into these (js/advisor/local-parser.js). UK law needs both on the road, so they're for shows.
 {re:/front plate delete/,name:"Front plate delete",in3d:true,price:50,text:"no front number plate"},
 {re:/rear plate delete/,name:"Rear plate delete",in3d:true,price:50,text:"no rear number plate"},
 {re:/wing vents|fender vents|arch vents/,name:"Wing vents",in3d:true,price:300,text:"vents in the front wings behind the wheels"}
].filter(e => e.name);
// A private plate's own reg: UK style, capitals and numbers, at most 7 characters plus one space ("RYAN 1", "AB12 CDE").
function cleanReg(t){const s=String(t||"").toUpperCase().replace(/[^A-Z0-9 ]/g,"").replace(/\s+/g," ").trim();let n=0,o="";for(const ch of s){if(ch===" "){if(o&&!o.endsWith(" "))o+=ch;continue;}if(n<7){o+=ch;n++;}}return o.trim();}
// Styled plates: lettering finish, shape, border and side badge, with typical UK prices for a pair (show-plate makers).
const PLATE_STYLE_OPTS={
  finish:[["standard","Standard printed",0],["gel","3D gel (raised glossy letters)",60],["4d","4D laser-cut letters",80],["4dgel","4D + gel (laser-cut with a gloss top)",110]],
  shape:[["standard","Standard oblong",0],["short","Short oblong",10],["square","Square",10],["bike","Motorbike size",10]],
  border:[["none","No border",0],["black","Black border",5],["silver","Silver border",5],["red","Red border",5],["blue","Blue border",5],["carbon","Carbon border",8]],
  badge:[["uk","UK badge",0],["flag","Union flag + UK",5],["none","No badge",0]]};
function cleanPlateStyle(st){const o={};for(const k in PLATE_STYLE_OPTS){const v=st&&st[k];if(PLATE_STYLE_OPTS[k].some(x=>x[0]===v))o[k]=v;}return o;}
const plateStyleOf=mods=>{const i=mods&&mods.custom&&mods.custom.items.find(x=>x.name==="Styled number plates");return i&&i.style||null;};
function plateStyleItem(st){st=cleanPlateStyle(st);const price=Object.keys(PLATE_STYLE_OPTS).reduce((a,k)=>a+((PLATE_STYLE_OPTS[k].find(x=>x[0]===st[k])||[0,0,0])[2]),0);
  const plain=Object.keys(PLATE_STYLE_OPTS).every(k=>!st[k]||st[k]===PLATE_STYLE_OPTS[k][0][0]);
  return plain?null:{name:"Styled number plates",in3d:true,price:Math.max(30,price+30),text:"",style:st};}
const privateReg=mods=>{const i=mods&&mods.custom&&mods.custom.items.find(x=>x.name==="Private number plate");return i&&i.reg||"";};

// Typical fitted prices at UK independent specialists (parts, fitting and VAT), by size of car:
// small = a first car like the Fiesta 1.4 (cheaper parts, smaller panels), six = a six-cylinder like the 440i.
function modPrice(id,p,car){
  const small=car.hp<120, six=car.cyl>=6;
  switch(id){
    case "tune": return ({1:small?250:six?650:450,2:small?900:six?2600:1900,3:car.turbo?(six?7500:5500):4500})[p.stage];
    case "intake": return small?150:six?400:320;
    case "exhaust": return small?450:six?2200:1600;
    case "wheels": return 1500+(p.size-17)*260+(p.style==="monoblock"?1400:0)+(p.style==="deep-dish"?500:0);
    case "drop": return p.air?3500:p.springs?(small?220:300):small?750:six?1500:1350;
    case "brakes": return small?1300:six?3800:3400;
    case "bodykit": return small?850:1800;
    case "widebody": return small?4500:six?7500:6500;
    case "spoiler": return ({lip:small?200:350,ducktail:small?400:650,"gt-wing":small?1200:1900,"roof-ext":small?250:350,pedestal:small?600:850})[p.type];
    case "wrap": return p.paint?(small?3000:six?4500:4000):p.finish==="chrome"||p.finish==="chameleon"?(small?3800:5200):p.finish==="brushed"?(small?3000:4200):p.finish==="carbon"?(small?2500:3500):(small?1900:six?2900:2600);
    case "stripes": return 380;
    case "tint": return 220;
    case "lights": return 280;
    case "custom": return p.items.reduce((a,i)=>a+(i.price||0),0);
  }
  return 0;
}
function colourName(hex){const f=COLOURS.find(c=>c[1].toLowerCase()===String(hex).toLowerCase()&&!/^custom-/.test(c[0]));return f?f[0].replace(/\b\w/g,m=>m.toUpperCase()):"Custom colour ("+String(hex).toUpperCase()+")";}
// Your own colour (from the colour picker, or typed as #rrggbb) is written "custom-rrggbb" so it reads like any other colour name;
// this adds any such colours in a piece of text to the colour list, so the parser, 3D and labels all know them.
function registerCustomColours(text){for(const m of String(text||"").toLowerCase().matchAll(/custom-([0-9a-f]{6})\b/g)){const n="custom-"+m[1];if(!COLOURS.some(c=>c[0]===n))COLOURS.push([n,"#"+m[1]]);}}
function modLabel(id,p){
  switch(id){
    case "tune": return p.stage===3?"Stage 3 power upgrade":"Stage "+p.stage+" remap";
    case "wheels": return p.size+"″ "+p.finish+" "+p.style+" wheels";
    case "drop": return p.air?"Air suspension, aired out":p.springs?"Lowering springs, −"+p.mm+"mm":"Coilovers, −"+p.mm+"mm";
    case "spoiler": return ({lip:"Lip spoiler",ducktail:"Ducktail spoiler","gt-wing":"GT wing","roof-ext":"Roof spoiler extension",pedestal:"Pedestal wing"})[p.type];
    case "wrap": return p.finish[0].toUpperCase()+p.finish.slice(1)+" "+colourName(p.colour).toLowerCase()+(p.paint?" respray":" wrap");
    case "tint": return p.vlt+"% rear window tint";
    case "brakes": return "Big brakes, "+p.caliper+" calipers";
    case "stripes": return colourName(p.colour)+" racing stripe";
    case "custom": return p.items.map(i=>i.name+(i.reg?" ("+i.reg+")":"")+(i.style?" ("+Object.keys(PLATE_STYLE_OPTS).filter(k=>i.style[k]&&i.style[k]!==PLATE_STYLE_OPTS[k][0][0]).map(k=>PLATE_STYLE_OPTS[k].find(x=>x[0]===i.style[k])[1].replace(/ \(.*\)/,"").toLowerCase()).join(", ")+")":"")).join(", ");
  }
  return MODS[id].name;
}
function modInfo(id,p,car){
  const T=car.turbo;
  switch(id){
    case "tune": return p.stage===1?{what:"Rewrites the engine software to use more boost and better ignition timing.",effect:"Noticeably stronger mid-range pull with no hardware changes.",spec:T?"ECU software, 99 RON fuel recommended":"ECU software, higher rev limit and revised cams map"}
      : p.stage===2?{what:"A remap paired with a high-flow downpipe and intake so the engine can breathe.",effect:"Big gains across the rev range, louder and quicker to spool.",spec:T?"Software + downpipe + intake + uprated intercooler":"Software + headers + intake"}
      : {what:T?"A larger hybrid turbo, fuel system upgrades and a custom map.":"A supercharger kit with injectors, fuel pump and custom map.",effect:"A step-change in power. Needs a strong clutch and regular servicing.",spec:T?"Hybrid turbo, uprated fuel pump, custom dyno map":"Centrifugal supercharger, injectors, dyno map"};
    case "intake": return {what:"Replaces the airbox with a less restrictive filter and pipework.",effect:"Small power gain and more induction noise under throttle.",spec:"Cotton or foam filter, heat-shielded"};
    case "exhaust": return {what:"Stainless pipes from the catalytic converter back, with valves you control.",effect:"Quiet in town, loud when you want it. Saves a few kilos.",spec:"T304 stainless, 76mm bore, valved, MOT-legal with cats kept"};
    case "wheels": { const forged=p.style==="monoblock"; return {what:(forged?"Forged ":"Flow-formed ")+p.style+" wheels in "+p.finish+", with matched performance tyres.",effect:p.size>car.wheel?"Fills the arches and sharpens steering, at a small cost to ride comfort.":p.size<car.wheel?"Smaller wheels with taller tyres ride better and are cheaper to replace.":"Same size as stock, so ride stays the same with a fresh look.",spec:wheelSpec(p.size,forged,car)}; }
    case "drop": if(p.air) return {what:"Air struts and a compressor replacing the stock springs and dampers, so you can raise and lower the car from a switch or app.",effect:"Shown aired out, sitting about "+p.mm+"mm lower with the tyres tucked under the arches. Raise it for speed bumps and driveways; the ride stays comfortable. Tell your insurer.",spec:"Air struts, compressor, tank and management, fitted (UK ~£2,000-£3,000)"};
    if(p.springs) return {what:"Shorter, stiffer springs that replace the stock ones and work with your existing dampers.",effect:"The cheap way to lower a car: it sits about "+p.mm+"mm lower with a firmer ride. The drop is fixed, so you can't adjust the height later. Get a four-wheel alignment after fitting.",spec:"Lowering springs (e.g. Eibach or H&R), fitted with alignment (UK ~£200-£350)"};
    return {what:"Height and damping adjustable suspension replacing the stock springs and dampers.",effect:p.mm>40?"Mostly for looks: the car sits "+p.mm+"mm lower, but the ride gets much firmer, it may scrape on speed bumps and may need camber correction. Around 30mm handles best.":"Lower centre of gravity, less body roll and a firmer ride. The car sits "+p.mm+"mm lower.",spec:"Mono-tube, 32-way damping, "+p.mm+"mm drop"};
    case "brakes": return {what:"Larger discs with six-piston front calipers.",effect:"Shorter stopping distances and less fade on track days.",spec:"6-pot front, 380mm two-piece discs, "+p.caliper+" calipers"};
    case "bodykit": return {what:"Front splitter, side skirts and a rear diffuser.",effect:"Sharper, lower look and a little front-end grip at speed.",spec:"Gloss carbon-look ABS, bolt-on"};
    case "widebody": return {what:"Bolt-on arch flares that widen the body to fit wider wheels and tyres.",effect:"A much more aggressive stance with room for a wider track.",spec:"+50mm per side, FRP, bolt-on"};
    case "spoiler": return ({lip:{what:"A small lip on the boot or roof edge.",effect:"Subtle styling change with a touch of rear stability.",spec:"Carbon-look, adhesive fit"},ducktail:{what:"A raised, swept-up tail spoiler.",effect:"Classic look and modest rear downforce.",spec:"Painted to body colour"},"gt-wing":{what:"A swan-neck rear wing on tall uprights.",effect:"Real rear downforce at speed. Best on track days.",spec:"Carbon, adjustable angle, about 90kg downforce at 100mph"},"roof-ext":{what:"A gloss black blade that carries the roof spoiler further back over the rear window.",effect:"Sportier profile, a hot-hatch favourite. Little real downforce.",spec:"Gloss black ABS, bolts or tapes to the roof spoiler"},pedestal:{what:"A body-coloured wing on two short stands, mid-height above the boot or tailgate.",effect:"Bold look with some rear downforce, without a full GT wing.",spec:"Painted to body colour, bolted through the boot lid or tailgate"}})[p.type];
    case "wrap": if(p.paint) return {what:"A full respray in "+p.finish+" "+colourName(p.colour).toLowerCase()+".",effect:"New paint all over, done in a body shop. Permanent, so tell your insurer about the colour change and update the V5C with the DVLA.",spec:"Quality UK respray, about £3,000-£6,000"};
    return {what:"A full-body vinyl wrap in "+p.finish+" "+colourName(p.colour).toLowerCase()+".",effect:"Completely changes the colour and protects the paint underneath. Removable.",spec:"Cast vinyl, about 5-7 year life"};
    case "stripes": return {what:"A shoulder-line racing stripe in "+colourName(p.colour).toLowerCase()+".",effect:"Motorsport styling. Removable without paint damage.",spec:"Cast vinyl, 90mm"};
    case "tint": return {what:"Film applied to the rear side windows and rear screen.",effect:"More privacy and less heat. UK law only allows dark tint on rear windows.",spec:p.vlt+"% light transmission, rear only"};
    case "custom": return {what:p.items.map(i=>i.name).join(", ")+".",effect:"Extra parts outside the main catalogue, shown on the 3D car. Make it a photo makes them look real."+(p.items.some(i=>i.name==="LED underglow")?" UK law: coloured underglow mustn't be lit on public roads (shows and private land only).":""),spec:p.items.map(i=>i.name+(i.price?" ("+fmt(i.price)+")":" (no price yet)")).join(", ")};
    case "lights": return {what:"Smoked tint on head and tail light lenses.",effect:"A darker, meaner look. Lights must still pass MOT brightness tests.",spec:"Light smoke film, MOT-legal grade"};
  }
}

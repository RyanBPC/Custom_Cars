/* Keyword advisor: turns a plain-English request into a build plan without AI. */
"use strict";
/* offline interpreter */
/* Beginner questions ("what would you recommend", "mods under £500"): suggest, don't fit. */
function adviceAsked(t){return /\b(recommend|suggest|ideas?|first mods?|best mods?|good mods?|cheap|budget|afford|beginner|starter|where (?:do|should) i start|what should i (?:do|get|add|start))\b|\bmods?\b.*£\s*\d|\b(?:under|below|less than|up to|max)\s*£?\s*\d/.test(t);}
function starterIdeas(t,car){
  const IDEAS=[["lowering springs","drop",{springs:true,mm:30}],["stage 1 remap","tune",{stage:1}],["dark windows","tint",{}],["smoked lights","lights",{}],["lip spoiler","spoiler",{type:"lip"}],["induction kit","intake",{}],["racing stripes","stripes",{}],["aero kit","bodykit",{}],["louder exhaust","exhaust",{}]];
  const m=t.match(/(?:under|below|less than|up to|max|budget(?: of)?|for)\s*£\s*(\d[\d,]*)\s*(k\b)?|£\s*(\d[\d,]*)\s*(k\b)?|(?:under|below|less than|up to|max)\s*(\d[\d,]*)\s*(k\b)?/);
  const n=m?parseInt((m[1]||m[3]||m[5]).replace(/,/g,""),10)*((m[2]||m[4]||m[6])?1000:1):null;
  const cheap=/\bcheap|\bbudget\b(?!\s*(?:of\s*)?£?\s*\d)/.test(t)&&n===null;
  let list=IDEAS.map(([say,id,p])=>({say,price:modPrice(id,p,car)})).filter(i=>n===null||i.price<=n);
  if(cheap) list.sort((a,b)=>a.price-b.price);
  list=list.slice(0,3);
  const money=v=>"£"+v.toLocaleString("en-GB");
  if(!list.length) return `Most parts start at about ${money(Math.min(...IDEAS.map(([,id,p])=>modPrice(id,p,car))))} fitted, so ${money(n)} is a bit tight. Try one of the gallery builds for ideas, or save up a little.`;
  const lead=n!==null?`Good first mods for the ${car.model} under ${money(n)}:`:cheap?`Cheapest good first mods for the ${car.model}:`:`Good first mods for the ${car.model}:`;
  return `${lead} ${list.map(i=>`${i.say} (about ${money(i.price)})`).join(", ")}. Say one to try it on, e.g. "${list[0].say}", or try one of the gallery builds.`;
}
function colourNear(t,re){
  const m=t.match(re); if(!m) return null;
  let before=t.slice(Math.max(0,m.index-32),m.index);
  const cut=before.split(/,|;|\band\b|\bwith\b|\bplus\b|\balso\b/); before=cut[cut.length-1];
  let best=null,bi=-1;
  // The colour nearest the part wins; when two end at the same place, the longer name wins ("light grey" beats "grey").
  for(const [n,h] of COLOURS){const i=before.lastIndexOf(n);if(i>=0&&i+n.length>bi){best=h;bi=i+n.length;}}
  if(best) return best;
  let after=t.slice(m.index+m[0].length,m.index+m[0].length+24).split(/,|;|\band\b|\bwith\b/)[0];
  for(const [n,h] of COLOURS){if(after.includes(n)) return h;}
  return null;
}
// Words the chat understands. A close misspelling ("bonet", "spoilor", "exaust", "fiber") is read as the right word.
const PARSE_WORDS="bonnet hood spoiler wing ducktail exhaust exhausts wheels wheel rims alloys carbon fibre fiber underglow stripes stripe racing tint tinted windows window lower lowered lowering coilovers suspension brakes brake calipers caliper bodykit widebody splitter diffuser skirts intake turbo remap tune headlights lights smoked wrap paint respray colour color matte satin gloss chrome roof rack snorkel louvres louvers canards visors harness harnesses steering shifter subwoofer speakers interior ambient bucket seats cage mirror mirrors decals graphics flames camo graffiti plate number intercooler scoop vents quad tips bumper sequential indicators eyelids spacers camber terrain tyres tires lift lifted louder faster power stance slammed slam massive spoilers flare flares arch arches overfenders strip sunstrip banner windscreen".split(" ");
// Ordinary words and car names are never "corrected" ("back" must not become "rack", "golf" not "gold").
const PARSE_KEEP=new Set("dechrome dechromed lose flower flowers slower slowly shower showers tower towers mower blower follower track back side more make take have some also that this then than them they want with like need just love nice cool look looks rear front real full good best feel keep sound wide deep dark does done give here there when what your into onto over under extra every maybe could would should thing things stuff little really super very much many same lets please thanks cheers mate bring check change turn same seat doors door body tail high tall long short lows boot gear gets wants fits tone toned tones limo quiet quieter light lighter bright pale fine time tint ride springs spring bagged bags badge badges badgeless debadge debadged decat decatted stock standard original factory normal glass privacy downpipe downpipes steps wind winds deflector deflectors sport sports towbar towbars strap straps inch inches".split(" "));
function editDistance(a,b){
  const d=[];for(let i=0;i<=a.length;i++){d[i]=[i];for(let j=1;j<=b.length;j++)d[i][j]=i?0:j;}
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1); // swapped letters count as one slip
  }
  return d[a.length][b.length];
}
function fixTypos(t){
  const vocab=[...PARSE_WORDS,...COLOURS.flatMap(([n])=>n.split(" "))];
  const keep=new Set([...PARSE_KEEP,...ALL_CARS.flatMap(c=>c.keys.join(" ").split(/[^a-z0-9]+/))]);
  return t.replace(/[a-z]{4,}/g,w=>{
    if(keep.has(w)||vocab.includes(w)) return w;
    const lim=w.length>=7?2:1; let best=w,bd=lim+1;
    for(const v of vocab){ if(Math.abs(v.length-w.length)>lim) continue; const d=editDistance(w,v); if(d<bd){bd=d;best=v;} }
    return bd<=lim?best:w;
  });
}
// With no colour asked for, stripes contrast with the paint (black on a light car, white on a dark one).
function stripeContrast(c){
  const p=(state.mods.wrap&&state.mods.wrap.colour)||c.colour||"#ecebe6", n=parseInt(p.slice(1),16);
  const lum=(0.299*(n>>16&255)+0.587*(n>>8&255)+0.114*(n&255))/255;
  return lum>0.55?"#16181c":"#ecebe6";
}
function planParts(text){
  let t=" "+fixTypos(text.toLowerCase())+" "; const apply=[],remove=[]; let switchCar=null, reset=false;
  for(const c of CARS){if(c.keys.some(k=>new RegExp("(^|[^a-z0-9])"+k.replace(/[-]/g,"\\-")+"([^a-z0-9]|$)").test(t))){switchCar=c.id;break;}}
  // Just the make ("bmw please", "show me the bmw", "switch to the vw") switches car too.
  // Only when that part of the sentence is nothing but the make, so "bmw wheels" on the Golf stays a wheel request.
  if(!switchCar){
    const MAKE_WORDS={volkswagen:["vw","volkswagen","volkswagon"],bmw:["bmw","beemer","bimmer"]};
    const FILLER=/\b(can|could|i|we|you|please|pls|show|me|us|the|a|an|my|switch|swap|change|go|back|to|into|over|let'?s|lets|see|look|at|try|use|load|open|pick|choose|select|want|get|have|do|drive|build|car|one|instead|now|then|ok|okay|thanks|cheers|just|let)\b/g;
    for(const part of t.split(/[,.;!?]|\band\b|\bor\b/)){
      const left=part.replace(FILLER," ").trim();
      const hit=left&&CARS.find(x=>(MAKE_WORDS[x.make.toLowerCase()]||[x.make.toLowerCase()]).includes(left));
      if(hit){switchCar=hit.id;break;}
    }
  }
  const c=CARS.find(x=>x.id===(switchCar||state.car));
  // A car we have specs for but no 3D model ("porsche 911", "civic type r") isn't fitted as a part: the reply says it isn't in the studio yet.
  // Words shared with shown cars or other things ("ford", "v8", "mk5") don't count.
  const hiddenNote=[];
  if(!switchCar){const shownMakes=CARS.map(x=>x.make.toLowerCase());
    for(const h of ALL_CARS){if(CARS.includes(h)) continue;
      const ks=h.keys.filter(k=>!shownMakes.includes(k)&&!["v8","mk5"].includes(k)), re=new RegExp("(^|[^a-z0-9])("+ks.map(k=>k.replace(/[-]/g,"\-")).join("|")+")(?=[^a-z0-9]|$)","g");
      if(ks.length&&re.test(t)){t=t.replace(re," ").replace(new RegExp("\b"+h.make.toLowerCase().replace(/[-]/g,"\-")+"\b","g")," ");
        const shown=CARS.map(x=>x.make==="Volkswagen"?x.model:x.make+" "+x.model.split(" ")[0]);
        hiddenNote.push(`The ${h.make} ${h.model} isn't in the studio yet. For now you can build the ${shown.slice(0,-1).join(", ")} or ${shown[shown.length-1]}.`);break;}}}
  // A reset phrase is taken out of the text so words like "everything" can't also trigger other parts.
  // "remove all" only counts as a reset when nothing specific follows ("remove all the stripes" just removes stripes).
  const RESET_RE=/\b(reset|(?:put it |take it |go )?back to (?:stock|standard|original|factory)|undo (?:everything|it all|all|the lot)|clear (?:everything|it all|the lot)|start (again|over)|remove (everything|all(?=\s*(?:$|[,.;!]|\band\b|\bthe (?:mods|parts|upgrades)\b|\bmods\b|\bparts\b|\bupgrades\b|\bof it\b))))\b/g;
  // "Stock wheels", "standard exhaust", "put the wheels back to stock" take that part off (back to the factory one), so they're read before the reset rule.
  const STOCK_PART={wheel:"wheels",wheels:"wheels",rim:"wheels",rims:"wheels",alloy:"wheels",alloys:"wheels",exhaust:"exhaust",suspension:"suspension",height:"suspension","ride height":"suspension",brake:"brakes",brakes:"brakes",calipers:"brakes",lights:"lights",headlights:"lights",taillights:"lights","tail lights":"lights",windows:"tint",glass:"tint",spoiler:"spoiler",bumpers:"body kit",paint:"wrap",colour:"wrap",color:"wrap"};
  // "Quieter exhaust" / "make the exhaust quieter" means back to the standard exhaust, the quietest one.
  const QUIET_RE=/\b(?:quiet(?:er)?|silent|less (?:loud|noisy)|toned?[- ]down)\s+(?:the\s+)?exhausts?\b|\bexhausts?\s+(?:a (?:bit|little|lot)\s+)?(?:quieter|less (?:loud|noisy))\b|\b(?:tone|turn)\s+(?:the\s+)?exhausts?\s+down\b|\bmake\s+(?:it|the car|her|him)\s+(?:a (?:bit|little|lot)\s+)?(?:quieter|less (?:loud|noisy))\b|\bquieter\s+please\b|\b(?:it'?s|its|it is|exhaust is|way)?\s*too (?:loud|noisy)\b/g;
  // "Take the wheels off" / "take my spoiler off" means remove them, the same as "take off the wheels".
  t=t.replace(/\btake\s+(?:the\s+|my\s+|that\s+|those\s+)?([a-z][a-z ]{1,30}?)\s+off\b/g,(m,w)=>/^(?:it|them|everything|all)$/.test(w)?m:" remove the "+w+" ");
  // "Not too loud" / "nothing too noisy" is a limit, not a complaint: blank it so it can't read as "quieter" (Car #106).
  const NOT_LOUD_RE=/\b(?:not|nothing|isn'?t|aren'?t|won'?t be|don'?t want it)\s+(?:too|that|so|overly|crazy|stupidly)\s+(?:loud|noisy)\b/g;
  const notLoud=NOT_LOUD_RE.test(t); if(notLoud) t=t.replace(NOT_LOUD_RE," ");
  // "Spoiler not too big" / "nothing too big on the wing" means a small one, not the GT wing.
  if(/spoiler|\bwing\b|duck ?tail/.test(t)) t=t.replace(/\b(?:not|nothing|isn'?t|don'?t want (?:it|anything))\s+(?:too|that|so|overly|crazy)\s+(?:big|large|huge|tall|much|over the top)\b/g," subtle ");
  const quiet=QUIET_RE.test(t); if(quiet) t=t.replace(QUIET_RE," standard exhaust ");
  // "Carbon (kidney) grilles": the studio's grille part is gloss black, so fit that and say carbon costs a bit more.
  const CARBON_GRILLE_RE=/\bcarbon(?:[- ]fib(?:re|er))?\s+(?:front\s+|kidney\s+)?(?:grilles?|kidneys?)\b/g;
  const carbonGrille=CARBON_GRILLE_RE.test(t); if(carbonGrille) t=t.replace(CARBON_GRILLE_RE," gloss black grille ");
  const SP=String.raw`(ride height|tail lights|\d{2}s|`+Object.keys(STOCK_PART).filter(k=>!k.includes(" ")).join("|")+")";
  const stockNames=[];
  const toStock=w=>{const k=/^\d{2}s$/.test(w)?"wheels":STOCK_PART[w]; if(!stockNames.includes(k)) stockNames.push(k); return " remove the "+k+" , ";};
  t=t.replace(new RegExp(String.raw`\b(?:put|set|take|bring|turn|change)\s+(?:the\s+)?`+SP+String.raw`\s+back\s+to\s+(?:stock|standard|original|factory|normal)\b`,"g"),(m,w)=>toStock(w));
  t=t.replace(new RegExp(String.raw`\b(?:back to (?:the )?)?(?:stock|standard|original|oem|factory|normal)\s+(?:size\s+)?`+SP+String.raw`\b`,"g"),(m,w)=>toStock(w));
  if(RESET_RE.test(t)){reset=true;t=t.replace(RESET_RE," ");}
  // UK slang is read before the removal rule, so the "delete"/"remove" in these doesn't take parts off.
  const notes=[...hiddenNote];
  if(quiet) notes.push("The standard exhaust is the quietest: every aftermarket exhaust is louder.");
  if(notLoud&&!quiet) notes.push("For a sportier sound that isn't too loud, the valved cat-back is the one: louder than standard, but keep the valves shut for a quiet cruise, and it stays under the MOT noise limit.");
  if(carbonGrille) notes.push("The studio shows the gloss black grille; real carbon fibre grilles look similar and cost a bit more (about £250).");
  // A decat fails the MOT, so it's never fitted; suggest a legal cat-back exhaust instead.
  const DECAT_RE=/\bde-?cat(?:ted)?\b|\bcat(?:alytic converter)? delete\b|\b(?:remove|delete|take off|take out|get rid of|lose)\s+(?:the\s+)?(?:cat|catalytic converter)\b(?!-)/g;
  const decat=DECAT_RE.test(t);
  if(decat){t=t.replace(DECAT_RE," ");notes.push("I haven't done a decat: taking out the catalytic converter fails the UK MOT and isn't road legal. For more sound, say \"cat-back exhaust\" instead.");}
  // "Delete the badges", "badgeless", "remove the GTI badges" all mean the debadge part.
  const DEBADGE_RE=/\bbadge ?delete\b|\bbadgeless\b|\bde-?badged?\b|\b(?:remove|delete|take off|take out|get rid of|lose|no)\s+(?:all\s+)?(?:the\s+)?(?:[a-z]+\s+)?badges?\b/g;
  if(DEBADGE_RE.test(t)) t=t.replace(DEBADGE_RE," debadge ");
  // "Black out the chrome", "delete the chrome trim", "no chrome" mean the trim (chrome delete), not a chrome wrap.
  const DECHROME_RE=/\b(?:black(?:ed)?[- ]?out|delete|remove|take off|get rid of|lose|no)\s+(?:all\s+)?(?:the\s+)?(?:window\s+)?chrome(?:\s+(?:trim|bits|window trim|surrounds?))?\b(?!\s*(?:wrap|paint|finish|respray|wheels?|rims?|alloys?))|\bchrome(?:\s+trim)?\s+(?:blacked out|black[- ]?out|removed|deleted)\b|\bde-?chromed?\b/g;
  if(DECHROME_RE.test(t)) t=t.replace(DECHROME_RE," chrome delete ");
  // Your own reg: "make my plate say RYAN 1", "private plate reading AB12 CDE", "plate 'R1 YAN'" put a private plate on with that text.
  // Read from what was typed (the typo fixer would turn "reading" into "racing" and could change the reg itself).
  const REG_RE=/\b(?:(?:private|personal(?:ised)?|custom|number|reg(?:istration)?)\s+)?plates?\s+(?:that\s+|which\s+)?(?:says?|saying|reads?|reading|to say|to read|to)\s+["']?([a-z0-9]{1,7}(?:\s[a-z0-9]{1,7})?)["']?|\b(?:private|personal(?:ised)?|custom|number)\s+plates?\s+["']([a-z0-9 ]{1,9})["']/;
  let regPlate="";
  const regM=(" "+String(text).toLowerCase().replace(/\s+/g," ")+" ").match(REG_RE);
  if(regM&&!/\b(?:4d|3d|gel|border|square|short|oblong|union|standard|bike)\b/.test(regM[1]||regM[2]||"")){ // "plates to 4d" is a style, not a reg
    const reg=cleanReg(regM[1]||regM[2]);
    if(reg){
      // take the phrase (as the typo fixer left it) out of the text, so its words aren't read as other parts
      const ws=regM[0].trim().split(" "), words=ws.length-ws.findIndex(w=>/^plates?$/.test(w))-1; // words after "plate"
      t=t.replace(new RegExp(String.raw`\b(?:(?:private|personal(?:ised)?|custom|number|reg(?:istration)?)\s+)?plates?\b(?:\s+\S+){0,${words}}`)," ");
      regPlate=reg; // fitted with the other extra parts below
      notes.push(`Your number plates now read ${reg}.`);
    }
  }
  // Plate styles: "3d gel plates", "4d plates", "4d gel plates", "square plate", "short plates", "red border", "union jack plates".
  let plateStyle=null;
  const tl=" "+String(text).toLowerCase().replace(/\s+/g," ")+" ";
  if(/\bplates?\b|\bborder\b/.test(tl)&&!/\b(?:no|remove|delete|take off|without)\s+(?:the\s+|both\s+)?(?:front\s+|rear\s+|back\s+)?(?:number\s+)?plates?\b/.test(tl)){
    const st={};
    if(/\b4d\b|laser[- ]?cut|raised (?:acrylic )?letters/.test(tl)) st.finish=/\bgel\b|\bgloss(?:y)?\b|\b3d\b/.test(tl)?"4dgel":"4d";
    else if(/\b3d\b|\bgel\b|glossy letters|domed letters|resin letters/.test(tl)) st.finish="gel";
    else if(/\b(?:standard|normal|printed|flat) (?:letters|lettering|plates?)\b/.test(tl)) st.finish="standard";
    if(/\bsquare\b/.test(tl)) st.shape="square"; else if(/\bshort\b/.test(tl)) st.shape="short"; else if(/\b(?:motor ?bike|motorcycle|bike) (?:size|plates?)\b/.test(tl)) st.shape="bike"; else if(/\b(?:oblong|standard (?:size|shape))\b/.test(tl)) st.shape="standard";
    const bm=tl.match(/\b(black|silver|chrome|red|blue|carbon)(?: fibre| fiber)? border\b/); if(bm) st.border=bm[1]==="chrome"?"silver":bm[1]; else if(/\bno border\b/.test(tl)) st.border="none";
    if(/\bunion (?:jack|flag)\b/.test(tl)) st.badge="flag"; else if(/\bno (?:badge|flag)\b|\bwithout (?:the )?(?:badge|flag)\b/.test(tl)) st.badge="none"; else if(/\buk badge\b/.test(tl)) st.badge="uk";
    if(Object.keys(st).length){
      plateStyle={...(plateStyleOf(state.mods)||{}),...st};
      t=t.replace(/\b(?:4d|3d|gel|laser[- ]?cut|glossy|square|short|oblong|union jack|union flag|(?:black|silver|chrome|red|blue|carbon) border)\b/g," ");
      notes.push("Plate style set: shown on both number plates.");
    }
  }
  // Number plates: "no plates" / "remove the front plate" / "rear plate off" take plates off (the plate delete parts);
  // "put the plates back on" / "add the rear plate" put them back. Read here, before "no"/"remove" would mean taking a part off.
  const PL=String.raw`(?:number\s+|reg(?:istration)?\s+|licen[cs]e\s+)?plate`, OFF=String.raw`(?:no|remove|delete|take off|take out|get rid of|lose|ditch|without)\s+(?:the\s+|both\s+|my\s+|its\s+)?`;
  // (The typo fixer has already turned "plates" into "plate", so "plate" with no front/rear means both.)
  const plateRe=end=>new RegExp(String.raw`\b${OFF}${end}${PL}\b|${end?String.raw`\b`:String.raw`(?<!(?:front|rear|back)\s+)\b`}${end}${PL}\s+(?:off|delete|deleted|removed)\b`,"g");
  const PLATE_BACK_RE=new RegExp(String.raw`\b(?:put|add|fit|bring)\s+(?:back\s+)?(?:on\s+)?(?:the\s+|both\s+|my\s+|a\s+)?((?:front|rear|back)\s+)?${PL}\b(?:\s+back)?(?:\s+on)?|\b((?:front|rear|back)\s+)?${PL}\s+back(?:\s+on)?\b`,"g");
  const plateBack=[];
  t=t.replace(PLATE_BACK_RE,(m,e1,e2)=>{const e=(e1||e2||"").trim();if(e!=="rear"&&e!=="back")plateBack.push("Front plate delete");if(e!=="front")plateBack.push("Rear plate delete");return " ";});
  t=t.replace(plateRe(String.raw`front\s+`)," fplate_off ").replace(plateRe(String.raw`(?:rear|back)\s+`)," rplate_off ").replace(plateRe("")," fplate_off rplate_off ")
     .replace(/ fplate_off /g," front plate delete , ").replace(/ rplate_off /g," rear plate delete , "); // commas, so "delete rear plate" isn't read as a removal
  if(plateBack.length){ // the plate delete parts come off with the other extra parts below
    notes.push(plateBack.length>1?"Both number plates are back on.":plateBack[0].startsWith("Front")?"The front number plate is back on.":"The rear number plate is back on.");
  }
  // "Wrap the roof black" / "roof in gloss black" is the black roof part (~£450), not a full-body wrap.
  t=t.replace(/\b(?:(?:wrap|paint|respray|do|colou?r|black out)\s+(?:the\s+|my\s+|its\s+)?roof|roof)\s+(?:in\s+)?(?:(?:gloss|glossy|piano|satin|matte?)\s+)?black\b(?!\s+(?:wheels?|rims?|alloys?|mirrors?|calipers?))/g," black roof ");
  // Air suspension ("air ride", "bagged", "on air") is shown aired out at the lowest setting.
  // "Air Lift" is the air ride brand, so it reads as air ride, not a lift kit.
  t=t.replace(/\bair ?lift(?: performance)?\b/g," air ride ");
  // "Bags of power" is British for "lots of power", not air bags.
  t=t.replace(/\bbags of (power|torque)\b/g," more $1 ").replace(/\bbags of\b/g," ");
  // With air ride already on the car, "raise it up" / "air it up" means pump it up for driving, not a lift kit.
  const airOn=!(reset||(switchCar&&switchCar!==state.car))&&state.mods.drop&&state.mods.drop.air;
  const AIRUP_RE=/\b(?:raise|lift|pump|air)\s+(?:it|the car|her)\s+up\b|\b(?:raise|lift)\s+it\b(?!\s*\d)|\bair (?:it )?up\b|\b(?:ride|sit) higher\b/g;
  if(airOn&&!/lift kit|lifted/.test(t)&&AIRUP_RE.test(t)){t=t.replace(AIRUP_RE," ");notes.push("Aired up for driving. The 3D car stays shown aired out, its parked look.");}
  // Lowering springs (Eibach, H&R) are the cheap fixed drop, not coilovers.
  const springs=!/coilover/.test(t)&&/\blowering springs?\b|\bsprings\b|\beibach\b|\bh ?& ?r\b/.test(t);
  const air=/\bair ?ride\b|\bbagged\b|\bbags\b|\bon air\b|\bair suspension\b/.test(t);
  // "except/apart from/but not" also count, so "everything except a wing" is a track build with no wing.
  // Handle every removal clause ("remove the wing and the wheels"). A clause ends where the user starts asking for something new.
  // Quad tips are their own part: the word "exhaust" in "quad exhaust tips" doesn't mean the £1,600 louder exhaust.
  const QUAD_TIPS_RE=/\b(?:quad|four)\s+exhausts?(?:\s+(?:tips|pipes))?\b/g;
  const REM_MAP={wing:"spoiler",spoiler:"spoiler",wheel:"wheels",rim:"wheels",alloy:"wheels",kit:"bodykit",splitter:"bodykit",wide:"widebody",arch:"widebody",flare:"widebody",exhaust:"exhaust",tint:"tint",stripe:"stripes",wrap:"wrap",coilover:"drop",spring:"drop",suspension:"drop",remap:"tune",tune:"tune",brake:"brakes",caliper:"brakes",lights:"lights",smoke:"lights",intake:"intake"};
  const REM_PHRASES=[["widebody kit","widebody"],["wide body kit","widebody"],["wide body","widebody"],["brake kit","brakes"],["body kit","bodykit"],["bodykit","bodykit"],["aero kit","bodykit"],["air ride","drop"],["airride","drop"],["air suspension","drop"],["bags","drop"],["bagged","drop"]];
  const remWords=[];
  // Saying what you don't want ("no spoiler", "without stripes", "don't add a wing") counts as a removal, so that part is never fitted.
  // "and red calipers" / "and 19 inch rims" / "and a stage 1 remap" / "and tint the windows" describe something being asked for, so they aren't part of the removal.
  // A bare or "the" part ("and stripes", "and the wheels") still is. Each match runs to the next "and", so "no wing and red calipers and no stripes" still drops the stripes.
  const COLOUR_WORDS=COLOURS.map(x=>x[0].replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  const ASK_PARTS=String.raw`(?:calipers?|brakes?|stripes?|(?:head|tail|fog)?\s?lights?|lenses|mirrors?|caps?|spoiler|wing|wrap|exhaust|tips|grilles?|splitter|lip|bonnet|hood|roof|tint|windows?)`;
  const PART_ASK_RE=new RegExp(String.raw`\band\s+(?:(?:some|new|an?)\s+)*(?:(?:(?:(?:gloss|glossy|matte?|satin)\s+)?(?:chrome|`+COLOUR_WORDS+String.raw`|1[7-9]|2[01])(?:\s*(?:-?\s?inch(?:es)?\b|in\b|"|”))?\s+(?:(?!and\b)[a-z]+\s+){0,2}(?:wheels?|rims?|alloys?)\b|(?:1[7-9]|2[01])s\b)`
    +String.raw`|(?:(?:gloss|glossy|matte?|satin|bright|deep|dark|light)\s+)?(?:chrome|carbon(?:\s+fib(?:re|er))?|smoked?|tinted|big|bigger|louder|`+COLOUR_WORDS+String.raw`)\s+(?:(?!and\b)[a-z]+\s+){0,2}`+ASK_PARTS+String.raw`\b`
    +String.raw`|stage\s*[1-3]\b|\d+\s*%\s*(?:tint|windows?)\b|limo\s+tint\b|lowering\s+springs?\b|(?:tint|wrap|remap|tune|lower)\s+(?:it|the|my)\b|tint\s+windows?\b|drop\s+it\b)(?:(?!\band\b)[\s\S])*`,"g");
  // "chrome delete" names a part, so its "delete" doesn't take off whatever comes next.
  for(const rem of t.matchAll(/\b(remove|take off|(?<!\bchrome\s+)delete|get rid of|lose|no more|no|without|except(?: for)?|apart from|but not|other than|minus|(?:don'?t|do not) (?:add|want|fit|put on|put|need|give it))\s+(the\s+|a\s+|an\s+|any\s+)?([^,;.]+)/g)){
    let w=rem[3].split(/\b(add|fit|put|give|make|then|but|with)\b/)[0].replace(PART_ASK_RE," ");
    // Match whole part names first, so "big brake kit" doesn't also remove the aero "kit".
    for(const [ph,id] of REM_PHRASES) if(w.includes(ph)){if(!remove.includes(id))remove.push(id);w=w.split(ph).join(" ");}
    const remPart=w.replace(QUAD_TIPS_RE," ");
    for(const k in REM_MAP) if(remPart.includes(k)&&!remove.includes(REM_MAP[k])) remove.push(REM_MAP[k]);
    remWords.push(w);
  }
  const removing=remove.length>0;
  // One entry per part: a later, more specific ask ("full build with a big wing") replaces the earlier one instead of listing it twice.
  const add=(id,params)=>{if(!removing||!remove.includes(id)){const k=apply.findIndex(a=>a.id===id); if(k>=0) apply.splice(k,1); apply.push({id,params});}};
  // A police look is illegal to drive in the UK (impersonating the police), so it isn't fitted; "police livery" mustn't become stripes.
  const POLICE_RE=/\b(?:police|cop|panda)\s+(?:car|livery|look|style|wrap|stripes?|decals?|lights?|spec)\b|\bjam ?sandwich\b|\bbattenburg\b/g;
  if(POLICE_RE.test(t)){t=t.replace(POLICE_RE," ");notes.push("I can't fit a police look: driving a car made to look like a police car can count as impersonating the police in the UK. Try racing stripes or a two-colour wrap for a bold look instead.");}
  // "Sound like a V8": cylinders make that sound, so be honest and fit the closest thing, the valved exhaust.
  const v8=t.match(/\bsounds?\s+(?:more\s+)?like\s+(?:an?\s+)?v ?(6|8|10|12)\b/);
  if(v8){t=t.replace(v8[0]," louder exhaust ");const n=+v8[1];notes.push(c.cyl>=n?`It already has ${c.cyl} cylinders, and the valved cat-back exhaust brings that sound out.`:`A ${c.cyl}-cylinder engine can't truly sound like a V${n}: that sound comes from the number of cylinders. The valved cat-back exhaust is the closest, so that's on.`);}
  // Stretched tyres are a stance look that isn't modelled; any wheels asked for alongside are still fitted.
  const STRETCH_RE=/\bstretch(?:ed)?\s+(?:tyres?|tires?)\b|\btyre stretch\b/g;
  if(STRETCH_RE.test(t)){t=t.replace(STRETCH_RE," ");notes.push("Stretched tyres (a narrow tyre on a wide rim) are a stance look that isn't shown in 3D yet. Many insurers and MOT testers dislike them, because a stretched tyre can come off the rim.");}
  const track=/\b(track|full build|go wild|everything|race car|time attack|the (?:full )?works|go all out|all[- ]out)\b/.test(t);
  if(track){add("drop",{mm:35});add("brakes",{caliper:"red"});add("bodykit",{});add("spoiler",{type:"gt-wing"});add("wheels",{size:Math.min(21,c.wheel+1),style:"monoblock",finish:"gunmetal"});add("tune",{stage:2});add("exhaust",{});}
  // "19s" on its own means 19-inch wheels.
  if((/\b(1[7-9]|2[01])s\b/.test(t)||/wheel|\brims?\b|alloy/.test(t.replace(/steering wheel|wheel spacers?|wheel arch(es)?/g,"")))&&!remove.includes("wheels")){
    // Only take a size that has a unit ("19-inch", "19in", 19") or sits just before a wheel word ("19 bronze wheels"), so "20% tint" isn't read as 20-inch wheels.
    const sz=t.match(/\b(1[7-9]|2[01])\s*(?:"|”|''|-?\s?inch(?:es)?\b|in\b|s\b)/)||t.match(/\b(1[7-9]|2[01])\s+(?:[a-z]+\s+){0,2}(?:wheels?|rims?|alloys?)\b/);
    const style=/mesh|bbs|cross/.test(t)?"mesh":/forged|mono/.test(t)?"monoblock":/dish|deep/.test(t)?"deep-dish":/turbo ?fan|fan/.test(t)?"turbofan":/spoke/.test(t)?"multi-spoke":"multi-spoke";
    const fc=colourNear(t,/wheel|rim|alloy/); let finish="gunmetal";
    if(fc){const name=(COLOURS.find(x=>x[1]===fc)||[""])[0];finish=Object.keys(RIM_FINISH).find(k=>name.includes(k))||(name.includes("grey")||name.includes("gray")?"gunmetal":"gunmetal");}
    // Plain words for size: "huge/massive" = 21", "bigger" = +1 or +2, "smaller" = -1.
    const plainSize=/huge|massive|giant|biggest/.test(t)?21:/much bigger|way bigger/.test(t)?Math.min(21,c.wheel+2):/smaller/.test(t)?Math.max(17,c.wheel-1):Math.min(21,c.wheel+1);
    add("wheels",{size:sz?+sz[1]:plainSize,style,finish});
  }
  // Word edges, so "flowers", "slower" or "teardrop" don't lower the car.
  if((air||springs||/\blower(s|ed|ing)?\b|\bdrop(s|ped)?\b|coilover|stance|\bslam|suspension|\blow\b|closer to the ground|sits? low|ground clearance/.test(t))&&!/lift|raise|higher/.test(t)&&!remove.includes("drop")){
    // Prefer a mm number next to a lowering word ("lower it 40mm", "40mm drop"); never one for spacers ("15mm spacers").
    let mm=t.match(/\b(?:lower\w*|drop\w*|slam\w*|coilovers?)\s+(?:it\s+|the car\s+)?(?:by\s+)?(\d{2,3})\s*mm/)||t.match(/\b(\d{2,3})\s*mm\s+(?:lower|drop)/)||t.match(/\b(\d{2,3})\s*mm\b(?!\s*(?:wheel\s+)?spacers?)/);
    // Inches ("lower it 2 inches", "drop it an inch"): 25.4mm each, rounded to the nearest 5mm. Only 1-4 inches right after a lowering word, so "19 inch wheels" is never a drop.
    if(!mm){const inch=t.match(/\b(?:lower\w*|drop\w*|slam\w*)\s+(?:it\s+|the car\s+)?(?:by\s+)?(an?|one|two|three|four|[1-4](?:\.5)?)\s*(?:inch(?:es)?\b|in\b|"|”)/);
      if(inch){const n={a:1,an:1,one:1,two:2,three:3,four:4}[inch[1]]||+inch[1]; mm=[null,String(Math.round(n*25.4/5)*5)]; notes.push(`${n} inch${n>1?"es":""} is about ${Math.round(n*25.4)}mm.`);}}
    if(air) notes.push("That's air suspension, shown aired out at its lowest (50mm down).");
    // Say why an out-of-range drop was changed, so it doesn't look misheard.
    if(mm&&!air){const want=+mm[1],lo=springs?20:15,hi=springs?40:50;
      if(want>hi) notes.push(springs?`Lowering springs go down about ${hi}mm at most, so I've set ${hi}mm. For lower, say "coilovers".`:`${hi}mm is the lowest the studio goes. Any lower usually needs air suspension and arch work, so say "air ride" if you want it on the floor.`);
      else if(want<lo) notes.push(`${lo}mm is the smallest drop here, so I've set ${lo}mm.`);}
    add("drop",air?{mm:50,air:true}:springs?{mm:mm?Math.min(40,Math.max(20,+mm[1])):30,springs:true}:{mm:mm?+mm[1]:/slam|really low|super low|as low/.test(t)?50:/a bit|slightly|little/.test(t)?20:30});}
  const ts=t.replace(/wing ?(vents?|mirrors?)/g,""); // "wing vents" and "wing mirrors" aren't spoilers
  if(/spoiler|\bwing\b|duck ?tail/.test(ts)&&!remove.includes("spoiler")) add("spoiler",{type:/duck/.test(ts)?"ducktail":/\blip\b|small|subtle/.test(ts)?"lip":/gt|big|huge|massive|giant|large|track|swan|tall|\bwing\b/.test(ts)?"gt-wing":"ducktail"});
  if(/\bbody ?kit|\blip ?kit|splitter|skirt|diffuser|aero|front lip|more aggressive|sportier look|sporty look|look sporty|look sportier|make it sportier|racier/.test(t)&&!remove.includes("bodykit")) add("bodykit",{});
  if(/wide ?body|widebody|wider|flare|arches|wide arch|over ?fenders?|fat|chunky/.test(t)&&!remove.includes("widebody")) add("widebody",{});
  // "No pops and bangs" asks for them to stay off, so it adds nothing.
  const NOPOPS_RE=/\b(?:no|without|remove|lose|get rid of|turn off|switch off)\s+(?:the\s+)?(?:pops|bangs|crackles?)(?:\s+(?:and|n|&)\s+bangs)?\b/g;
  if(NOPOPS_RE.test(t)){t=t.replace(NOPOPS_RE," ");notes.push("No pops and bangs: they're a remap setting, and a tuner can switch them off.");}
  if(/exhaust|louder|\bloud\b|noisier|pops|bangs|crackle|burble|growl|straight pipe|sounds? (better|meaner|angrier|nastier|sportier)|better sound/.test(t.replace(QUAD_TIPS_RE," "))&&!remove.includes("exhaust")) add("exhaust",{});
  if(/intake|induction|air filter|cold air/.test(t)) add("intake",{});
  // Pops and bangs are a remap setting (an overrun map), not just an exhaust part.
  const pops=/\bpops\b|\bbangs\b|\bcrackles?\b|\boverrun\b|\bburble (?:map|tune)\b/.test(t)&&!remove.includes("exhaust");
  // A downpipe is the usual stage 2 part, so on its own it means a stage 2 build.
  const downpipe=/\bdown ?pipes?\b/.test(t); if(downpipe&&!/stage ?3|big turbo|bigger turbo|hybrid turbo/.test(t)) notes.push("A downpipe is part of a stage 2 build, so it goes with the stage 2 remap.");
  // Side steps are an SUV/van part; point hatchback owners to side skirts instead.
  if(/\bside ?steps?\b|\brunning boards?\b/.test(t)) notes.push("Side steps don't really suit a hatchback. Try \"side skirts\" for a lower look along the sides.");
  const st=t.match(/stage ?([123])/)||(downpipe&&[0,"2"]);
  if(st) add("tune",{stage:+st[1]});
  else if(/big turbo|bigger turbo|supercharg|turbo upgrade/.test(t)) add("tune",{stage:3});
  // "Fit a turbo" on its own: a bigger turbo if the car already has one, a turbo conversion if it doesn't. Both are the priced stage 3 kit.
  else if(/\bturbo(?:charge[ds]?|charger|charging|ed)?\b(?!\s*fan)/.test(t)&&!/\bturbo\s*fans?\b/.test(t)&&!/\b(?:no|without|remove|lose|get rid of|take off|delete|don'?t want)\s+(?:the\s+|a\s+|my\s+|any\s+)?turbo/.test(t)&&!remove.includes("tune")){
    add("tune",{stage:3});
    notes.push(c.turbo?`The ${c.model} already has a turbo, so this is a bigger hybrid turbo with a custom map (stage 3).`
      :`The ${c.model} has no turbo, so this is a turbo or supercharger conversion with a custom map (stage 3). It's big work, so use a specialist.`);}
  else if(/(much|way|really|insanely|seriously) (faster|quicker|more power)|max power|loads of power/.test(t)) add("tune",{stage:2});
  else if((/faster|quicker|more power|remap|tune|chip|more hp|horsepower|bhp|\bspeed\b|more pull|more torque|\bfast\b|power up/.test(t)||pops)&&!remove.includes("tune")) add("tune",{stage:1});
  if(pops&&apply.some(a=>a.id==="tune")) notes.push("Pops and bangs come from the remap, so that's on too. Keep it quiet near homes.");
  if(/brake|caliper|stop better|stopping power/.test(t)&&!remove.includes("brakes")){const cc=colourNear(t,/brake|caliper/);const name=cc?(COLOURS.find(x=>x[1]===cc)||[""])[0]:"red";add("brakes",{caliper:Object.keys(CALIPER).find(k=>name.includes(k))||"red"});}
  // "tinted headlights" means smoked lights only, so hide tint words next to a lights word before looking for window tint.
  const tT=t.replace(/\btint(?:ed)?\s+(?:the\s+|my\s+)?(?:(?:head|tail|rear|front|fog)\s?)?lights?\b|\b(?:(?:head|tail|rear|front|fog)\s?)?lights?\s+tinted\b/g," ");
  if(/tint|\blimo\b|dark(er)? windows|black(ed)?[- ]?out windows|privacy glass/.test(tT)&&!remove.includes("tint")){const notInch="(?!\\s*-?\\s*(?:inch|in\\b|\"|”|s\\b))"; // so "tint and 20 inch wheels" isn't read as 20% tint
    const v=tT.match(/\b(20|35|50)\s*(?:%|per ?cent)/)||tT.match(new RegExp("\\btint\\w*\\s+(?:[a-z]+\\s+){0,2}(20|35|50)\\b"+notInch))||tT.match(new RegExp("\\b(20|35|50)\\b"+notInch+"\\s+(?:[a-z]+\\s+)?tint"));const limo=/\blimo\b|\b5\s*(?:%|per ?cent)/.test(tT); if(limo) notes.push("Limo tint (5%) is shown on the rear windows only: UK law says the front side windows must let through at least 70% of light.");
    add("tint",{vlt:limo?5:v?+v[1]:/privacy/.test(tT)?20:35});}
  if(/stripe|livery|go-faster/.test(t)&&!remove.includes("stripes")) add("stripes",{colour:colourNear(t,/stripe|livery/)||stripeContrast(c)});
  // Only lights words, so colours like "light grey" don't fit smoked lenses.
  // Fog, spot and rally lights are their own parts (the light bar covers spot/rally), so they don't fit smoked lenses too.
  const tL=t.replace(/\b(?:(?:selective\s+)?yellow\s+|amber\s+)?(?:fog|spot|rally|driving)\s?(?:lights?|lamps?)\b/g," ");
  if(/\bfog\s?(?:lights?|lamps?)\b/.test(t)&&!/\bsmoked?\b/.test(tL)) notes.push(`Fog lights aren't in the studio yet, so the ${c.model} keeps its standard ones. Yellow fog bulbs are a cheap retro look (about £20-£40 a pair).`);
  // Clear / "euro" lenses are see-through, the opposite of smoked, so they don't fit smoked lights (Car #46).
  const clearL=/\b(?:clear|euro|crystal)\s+(?:(?:head|tail|rear|front|side)\s?)?(?:lights?|lenses?|lamps?|indicators?)\b/.test(t)&&!/\bsmoked?\b|dark(?:er)? lights|tinted lights/.test(tL);
  if(clearL) notes.push(`Clear (euro) lenses aren't in the studio yet, so the ${c.model} keeps its standard lights. Say "smoked lights" if you want them darker instead.`);
  // Matrix headlights and DRLs are factory parts, so the LED headlight upgrade stands in (Car #113).
  if(/matrix (?:led )?(?:head)?lights?|daytime running lights?|\bdrls?\b/.test(t)) notes.push(`Matrix headlights and daytime running lights come from the factory, so I've fitted the LED headlight upgrade, the closest look for the ${c.model}.`);
  // Neons (underglow), puddle lights and DRLs are their own parts, so they don't fit smoked lenses too (Car #113).
  const tL2=tL.replace(/\b(?:neon(?:\s+[a-z]+)?\s+lights?|neons?|puddle lights?|(?:door )?projector lights?|door (?:logo )?lights?|matrix (?:led )?(?:head)?lights?|daytime running lights?|drls?)\b/g," ");
  if(!clearL&&/\bsmoked?\b|\b(head|tail) ?lights?\b|\blights\b|\blenses\b|dark(er)? lights|tinted lights/.test(tL2)&&!/light ?bar|underglow|angel|halo|led |dynamic|hid|xenon|brighter|sequential|eyelid|interior light|ambient/.test(t)&&!remove.includes("lights")) add("lights",{});
  // A colour right before a part ("gloss black mirror caps", "black roof", "red calipers") belongs to that part, not the paint.
  const colNames=COLOURS.map(x=>x[0]).sort((x,y)=>y.length-x.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  const tw=t.replace(new RegExp(String.raw`\b(?:(?:gloss|glossy|matte?|satin|piano)\s+)?(?:`+colNames+String.raw`)\s+(?:wing\s+)?(?:mirror caps?|mirrors?|roof|wheels?|rims?|alloys?|calipers?|brakes?|stripes?|badges?|(?:kidney\s+|front\s+)?grilles?|kidneys?)\b`,"g")," ");
  // "chrome delete" is the trim part, and "chrome turbofan wheels" is the wheels' finish; neither is a chrome wrap.
  const twc=tw.replace(/\bchrome delete\b/g," ").replace(new RegExp(CHROME_WHEELS_RE.source,"g")," ");
  const finish=/matte|matt\b/.test(twc)?"matte":/satin/.test(twc)?"satin":/chrome/.test(twc)?"chrome":/\bpearl(?:escent)?\b/.test(tw)?"pearl":/metallic|metal flake/.test(tw)?"metallic":"gloss";
  let wrapCol=colourNear(tw,/wrap|paint|respray|colou?r/);
  if(!wrapCol&&/matte|satin|chrome|gloss|metallic|pearl/.test(twc)) wrapCol=colourNear(twc,/matte|matt\b|satin|chrome|gloss|metallic|pearl(?:escent)?\b/);
  // "Wrap it in chrome" / "chrome wrap" with no colour named is a silver chrome wrap.
  if(!wrapCol&&finish==="chrome"&&/\bwrap|\bin chrome\b|\b(?:full|all) chrome\b|\bchrome (?:paint|finish|respray)\b/.test(twc)) wrapCol="#c5c8cc";
  if(!wrapCol){const m=tw.match(/\b(?:make it|turn it|paint it|want it|colour it|color it|change it to|go)\s+(?:a |an )?(?:nice |dark |bright )?([a-z ]{3,24}?)(?=\s*(?:,|\.|!|$|\band\b|\bwith\b|\bplease\b))/); if(m){const f=COLOURS.find(x=>m[1].includes(x[0])); if(f) wrapCol=f[1];}}
  // A colour typed on its own ("nardo grey", "nardo grey with black roof") is a respray. Only a clause that is just a colour counts, so "black roof" stays a roof.
  if(!wrapCol){for(const part of t.split(/,|;|\.|!|\band\b|\bwith\b|\bplus\b|\balso\b|\bbut\b/)){const w=part.replace(/\b(please|pls|i want|i'?d like|can i have|can it be|it in|in|a|an|nice|metallic|pearlescent|matte?|satin|gloss|glossy|paint(work)?|colou?r|finish|the|my|car|it|all|over)\b/g," ").replace(/\s+/g," ").trim(); const f=w&&COLOURS.find(x=>x[0]===w); if(f){wrapCol=f[1];break;}}}
  // A factory colour keeps its factory finish (Estoril Blue is metallic) unless another finish was named.
  const fac=wrapCol&&COLOURS.find(x=>x[1]===wrapCol&&x[2]); const wfin=fac&&finish==="gloss"&&!/gloss/.test(tw)?fac[2]:finish;
  // "Paint it red" / "respray" is a respray, not a vinyl wrap (unless wrap or chrome was said).
  const isPaint=/\b(?:paint(?:ed|work|job)?|re-?spray(?:ed)?)\b/.test(tw)&&!/\bwrap/.test(tw)&&wfin!=="chrome";
  if(wrapCol&&!remove.includes("wrap")) add("wrap",isPaint?{colour:wrapCol,finish:wfin,paint:true}:{colour:wrapCol,finish:wfin});
  // Extra parts (underglow, carbon bonnet…) and anything else the user names become custom parts.
  const freshCar=reset||(switchCar&&switchCar!==state.car);
  const had=freshCar||!state.mods.custom?[]:state.mods.custom.items;
  const inRemoval=s=>remWords.some(w=>s.split(" ").some(x=>x.length>3&&w.includes(x.toLowerCase())));
  let items=had.filter(i=>!inRemoval(i.name.toLowerCase()));
  if(plateBack.length) items=items.filter(i=>!plateBack.includes(i.name));
  if(regPlate) items=[...items.filter(i=>i.name!=="Private number plate"),{name:"Private number plate",in3d:true,price:250,text:"",reg:regPlate}];
  if(plateStyle){const it=plateStyleItem(plateStyle); items=[...items.filter(i=>i.name!=="Styled number plates"),...(it?[it]:[])];}
  const removedCustom=items.length<had.length;
  for(const e of EXTRA_PARTS) if(e.re.test(t)&&!remWords.some(w=>e.re.test(w))&&!items.some(i=>i.name===e.name)) {let tx=e.text||(e.name==="Custom graphic wrap"?text.trim().slice(0,160):e.name.toLowerCase()); if(e.name==="LED underglow"||e.name==="LED ambient interior lighting"){const h=colourNear(t,e.name==="LED underglow"?/under ?glow|neon|underbody/:/interior lights?|ambient|led interior/); const c=h&&COLOURS.find(x=>x[1]===h); if(c) tx=c[0]+" "+tx;} if(e.name==="Windscreen sun strip"){const w=text.match(/\b(?:saying|that says|says|reading|reads)\s+["'“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,11}?)["'”]?(?=\s*(?:,|\.|!|$|\band\b|\bon\b|\bplease\b))/i); tx='a dark windscreen sun strip with white lettering saying "'+(w?w[1].trim().toUpperCase():"GTI")+'"';} items.push({name:e.name,price:e.price,text:tx});}
  if(!apply.length&&!remove.length&&!removedCustom&&items.length===had.length&&!reset&&!decat&&!hiddenNote.length&&!(switchCar&&switchCar!==state.car)){
    const m=t.match(/\b(?:let'?s do|lets get|can (?:i|you|we) (?:get|have|add|do|fit)|could (?:i|you) (?:get|add)|i'?d like|i would like|give me|chuck on|slap on|throw on|bolt on|add|fit|put on|put|give it|install|i want|want|get me|stick on|do)\s+(?:a |an |some |the |me )?([a-z0-9][a-z0-9 '\-]{2,40}?)(?=\s*(?:,|\.|!|$|\band\b|\bon it\b|\bplease\b))/);
    if(m){const name=m[1].trim().replace(/^\w/,x=>x.toUpperCase()); items.push({name,price:null,text:m[1].trim()});}
  }
  if(items.length!==had.length||removedCustom||items.some((i,k)=>i!==had[k])){ if(items.length) add("custom",{items}); else if(had.length) remove.push("custom"); }
  let reply;
  // Name only what's new: catalogue parts, plus extra parts that weren't on the car before.
  const names=apply.filter(a=>a.id!=="custom").map(a=>modLabel(a.id,sanitize(a.id,a.params,c)).toLowerCase()).concat(items.filter(i=>!had.includes(i)).map(i=>i.name));
  const switchMsg=switchCar&&switchCar!==state.car?`Switched to the ${c.make} ${c.model}.`:"";
  const warnings=[apply.some(a=>a.id==="tune")?"Remember to tell your insurer about any power upgrade.":"",apply.some(a=>a.id==="drop")?(apply.some(a=>a.id==="drop"&&a.params.air)?"Raise it up for speed bumps.":"Watch out for speed bumps."):""];
  if(reset&&names.length) reply=[switchMsg,`Back to stock, then fitted: ${names.join(", ")}.`,...warnings].filter(Boolean).join(" ");
  else if(reset) reply=[switchMsg,"Back to stock. Clean slate. What shall we start with?"].filter(Boolean).join(" ");
  else if(names.length) reply=[switchMsg,`Fitted: ${names.join(", ")}.`,...warnings].filter(Boolean).join(" ");
  else if(remove.length&&stockNames.length) reply=`Back to the standard ${stockNames.map(n=>n==="wrap"?"paint":n==="tint"?"windows":n).join(" and ")}. Anything else?`;
  else if(remove.length){
    // Only say "Taken off" when something was actually on the car; "no spoiler" on a stock car just confirms it won't be added.
    const wasOn=id=>id==="custom"?had.length>0:!freshCar&&!!(state.mods&&state.mods[id]);
    const SAY={tune:"a remap",intake:"an intake",exhaust:"a louder exhaust",wheels:"new wheels",drop:"lowering",brakes:"big brakes",bodykit:"an aero kit",widebody:"widebody arches",spoiler:"a spoiler",wrap:"a wrap",stripes:"stripes",tint:"window tint",lights:"smoked lights",custom:"extra parts"};
    const parts=remove.filter(id=>SAY[id]).map(id=>SAY[id]);
    reply=remove.some(wasOn)||!parts.length?"Taken off. Anything else?":`No problem, I won't add ${parts.length>1?parts.slice(0,-1).join(", ")+" or "+parts[parts.length-1]:parts[0]}.`;
  }
  else if(switchCar) reply=`Here's the ${c.make} ${c.model}. Try asking for wheels, a drop, a wrap colour, a spoiler or more power.`;
  else if(removedCustom) reply="Taken off. Anything else?";
  else if(adviceAsked(t)) reply=starterIdeas(t,c);
  else reply="Just say it simply, like \"big spoiler\", \"make it blue\", \"bigger wheels\", \"lower it\", \"louder\", \"more power\", \"dark windows\", \"underglow\" or \"carbon bonnet\". If it's something unusual, say \"add\" and what you want, e.g. \"add flames on the doors\".";
  if(notes.length) reply=(reply.startsWith("Just say it simply")?"":reply+" ")+notes.join(" ");
  return {reply,switchCar,reset,apply,remove,notes:{}};
}

/* Price questions ("how much is a remap", "what do coilovers cost", "how much is my build") get a price, nothing is fitted.
   "add it" / "yes" straight after fits the part that was asked about. */
let priceAsked=null;
const PRICE_Q=/\bhow much\b(?!\s+(?:power|bhp|hp|horse ?power|torque|faster|quicker|lower|louder|more power|lower|higher|bigger|smaller|wider))|\bwhat\b.*\b(?:costs?|price)\b|\b(?:price|cost)s? (?:of|for)\b|\bhow pricey\b/;
const ADD_IT=/^\s*(?:yes|yeah|yep|yup|go on|ok(?:ay)?|sure|go for it|do it|let'?s do it|add (?:it|that|them|those)(?: on| to (?:it|the car))?|fit (?:it|that|them|those)|i'?ll (?:take|have) (?:it|that|them))\b[\s!.,]*(?:then|please|pls|thanks)?[\s!.]*$/;
/* Plain questions ("what is a remap", "how fast is it now", "is it road legal") get an answer, nothing is fitted.
   "add it" straight after a "what is" question fits that part (same as a price question). */
const SPEED_Q=/\bhow (?:fast|quick)\b|\bhow (?:much|many) (?:power|bhp|hp|horse ?power|torque)\b|\bwhat(?:'s| is|s) (?:the |its |my )?(?:power|bhp|0-62|0 to 62|top speed)\b/;
/* "0-60 time", "what is 0-62", "whats the top speed", "vmax": a speed question even without "how" or "?" (Car #110). */
const SPEED_TOPIC=/(?:^|\s)0 ?(?:-|to) ?6[02](?:mph)?\b|\bzero to (?:sixty|60|62)\b|\btop ?speed\b|\bv ?max\b/;
const SPEED_WANT=/\b(?:make|add|fit|give|increase|more|raise|improve|boost|faster|quicker|better|higher|remove|delimit|derestrict|unlimit)\b/;
const LEGAL_Q=/\b(?:road ?legal|legal|illegal|mot|insurance|insurer|insure)\b/;
const ASKING=/\?|^\s*(?:is|are|will|would|does|do|can|could|should|am|what|how|whats|what's)\b/;
const INFO_Q=/^\s*(?:what(?:'s| is| are| does| do)|whats|how (?:does|do)|tell me about|explain)\b/;
/* Advice questions ("should i get a remap", "is a stage 2 remap worth it", "would coilovers suit it", "does a remap void warranty")
   get the same what-it-is answer as INFO_Q; nothing is fitted until the user says "add it". */
const ADVICE_Q=/^\s*(?:should i|shall i|is (?:it|an?|the|getting)\b.*\bworth|are .*\bworth|(?:would|will|could)\b.*\b(?:suit|look good|ruin|affect|void|hurt|wreck|be worth)|do(?:es)?\b.*\b(?:ruin|affect|void|suit|hurt|wreck)|(?:what|which)\b.*\bsuits?)\b/;
const WARRANTY_Q=/\bwarrant(?:y|ee)\b/;
const WARRANTY_NOTE="Warranty: if your car is still under the maker's warranty, a remap or suspension change can let the dealer refuse claims on related parts (engine, gearbox, suspension). Looks-only parts like wraps, wheels or tint usually don't affect it. Ask your dealer before you buy.";
function questionReply(low){
  const none={switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  const car=CARS.find(x=>x.id===state.car), mods=state.mods||{}, n=partCount(mods);
  if((SPEED_Q.test(low)||SPEED_TOPIC.test(low))&&(ASKING.test(low)||(SPEED_TOPIC.test(low)&&!SPEED_WANT.test(low)))){
    const x=perf(car,mods), b=perf(car,{});
    const top=car.topSpeed?` Top speed is ${car.topSpeed} mph${car.limited?", limited":""}${car.limited&&x.hp!==b.hp?" (a remap keeps the limiter)":!car.limited&&x.hp>b.hp?" as standard; more power adds a little":""}.`:"";
    const r=n&&x.hp!==b.hp?`Your ${car.model} now makes about ${x.hp} bhp and ${x.nm} Nm (standard is ${b.hp} bhp), with 0-62 mph in about ${x.t62}s (standard ${b.t62}s).`
      :`Your ${car.model} makes ${x.hp} bhp and ${x.nm} Nm, with 0-62 mph in ${x.t62}s${n?". Your parts so far don't add power":" as standard"}.`;
    return {reply:r+top+` The Studio's numbers panel shows the full list.${x.hp===b.hp?' Say "add a remap" for more power.':""}`,...none};
  }
  if(LEGAL_Q.test(low)&&ASKING.test(low)){
    // "Is underglow legal?" / "are smoked lights legal": answer for the part named, not the general build.
    const asked=low.replace(/[?!.,]/g," ").replace(/\b(?:is|are|will|would|does|do|can|could|should|am|what|whats|what's|how|about|it|its|a|an|the|my|this|that|these|those|road|legal|illegal|mot|insurance|insurer|insure|affect|pass|fail|uk|in|on|car|cars|get|getting|have|having|fit|fitting|fitted|to|be|of|with|for|me|i|still|and|they|them|really|actually|allowed|please|pls)\b/g," ").replace(/\s+/g," ").trim();
    const RULE={
      underglow:"Underglow is legal to fit, but on the road it mustn't show red to the front, white to the back, or any blue or flashing light; the safe way is to only switch it on when parked.",
      lightbar:"A light bar is legal to fit, but it must stay off on public roads (it's for off-road use).",
      plates:"3D and 4D raised plates are legal if they're made to the British Standard (BS AU 145e) with the standard font and spacing; tinted, ghost or re-spaced plates aren't.",
      spoiler:"A spoiler or wing is legal if it's fixed firmly and has no sharp edges sticking out past the car.",
      lights:"Smoked lights are only legal if they're still bright enough and the right colour (white front, red rear, orange indicators); dark smoked tail lights often fail the MOT.",
      tint:"Front side windows must let through at least 70% of light, and the windscreen 75%, so dark front tint can fail the MOT and get you a fine. Rear windows can be any darkness.",
      exhaust:"A louder exhaust is legal if it keeps its catalytic converter and isn't too loud; a decat or very loud system can fail the MOT's noise and emissions checks.",
      decat:"A decat (taking out the catalytic converter) fails the MOT emissions test and isn't road legal.",
      drop:"Lowered cars are legal, but the tyres mustn't rub and the headlights may need re-aiming.",
      tune:"A remap is legal, but it must be declared to your insurer.",
      wheels:"Bigger wheels are legal if the tyres don't rub or stick out past the arches.",
      body:"Body kits and wide arches are legal if the tyres stay covered and there are no sharp edges.",
      wrap:"A wrap or respray is legal; for a full colour change, tell the DVLA (on your V5C) and your insurer.",
      // Car #114: extra parts named by the user, matched on their words (no part is fitted).
      cage:"A roll cage is legal on the road, but pad any bars your head could hit, and tell your insurer.",
      bullbar:"Only EU-approved, pedestrian-safe bull bars are legal on newer cars; old metal ones aren't.",
      lift:"A lift kit is legal if the tyres stay inside the arches and the lights still line up; tell your insurer.",
      spacers:"Wheel spacers are legal if they're fitted properly and the tyres don't stick out past the arches.",
      camber:"Negative camber is legal, but the uneven tyre wear it causes can fail the MOT.",
      towbar:"A tow bar is legal if it's type-approved for your car; check the towing limit on your V5C.",
      canards:"Canards are legal if they're fixed firmly and have no sharp edges.",
      seats:"Bucket seats and harnesses are legal, but keep working seatbelts for every seat you use.",
      rearseats:"Taking the rear seats out is legal, but tell the DVLA if the number of seats changes, and your insurer."};
    const keys=[];
    const TEXT_RULES=[[/\broll ?cages?\b/,"cage"],[/\bbull ?bars?\b|\bnudge ?bars?\b/,"bullbar"],[/\blift(?:ed)? kits?\b|\blift(?:ed|ing)? (?:it|the car)\b/,"lift"],
      [/\b(?:wheel )?spacers?\b/,"spacers"],[/\bcamber\b/,"camber"],[/\btow ?(?:bars?|hitch|ball)\b/,"towbar"],[/\bcanards?\b|\bdive ?planes?\b/,"canards"],
      [/\bbucket seats?\b|\bharness(?:es)?\b|\bracing seats?\b/,"seats"],[/\b(?:remov\w*|delet\w*|tak\w* out|no)\b.*\brear seats?\b|\brear seats? (?:out|delete|removed?)\b/,"rearseats"],
      [/\bwraps?\b|\bwrapp(?:ed|ing)\b/,"wrap"]];
    let rest=asked;
    if(/\bde-?cat(?:ted)?\b|\bcat(?:alytic converter)? delete\b|\bstraight ?pipes?d?\b/.test(low)){keys.push("decat"); rest=rest.replace(/\bstraight ?pipes?d?\b/g," ");}
    for(const [re,k] of TEXT_RULES) if(re.test(low)){keys.push(k); rest=rest.replace(new RegExp(re.source,"g")," ");}
    rest=rest.replace(/\s+/g," ").trim();
    if(!keys.includes("decat")&&rest){
      const p=planParts(rest);
      for(const a of p.apply||[]){
        if(a.id==="custom"){for(const i of a.params.items||[]){const k=i.name==="LED underglow"?"underglow":i.name==="LED light bar"?"lightbar":i.name==="Styled number plates"?"plates":null; if(k) keys.push(k);}}
        else{const k=a.id==="widebody"||a.id==="bodykit"?"body":a.id; if(RULE[k]) keys.push(k);}
      }
    }
    if(keys.length) return {reply:[...new Set(keys)].map(k=>RULE[k]).join(" ")+" Tell your insurer about every mod, or a claim can be refused.",...none};
    const tips=["Tell your insurer about every mod, or a claim can be refused."];
    if(mods.tint) tips.push("Front side windows must let through at least 70% of light, and the windscreen 75%, so dark front tint can fail the MOT and get you a fine.");
    if(mods.exhaust||/exhaust|loud/.test(low)) tips.push("A loud or decat exhaust can fail the MOT's noise and emissions checks.");
    if(mods.drop) tips.push("Lowered cars are legal, but the tyres mustn't rub and the headlights may need re-aiming.");
    if(mods.tune) tips.push("A remap is legal, but it must be declared to your insurer.");
    if(n&&!mods.tint) tips.push("Nothing else on this build is illegal on its own if it's fitted well.");
    return {reply:(n?"For your build: ":`As standard your ${car.model} is fully road legal. If you add parts: `)+tips.join(" "),...none};
  }
  const warranty=WARRANTY_Q.test(low)&&ASKING.test(low), advice=ADVICE_Q.test(low)||warranty;
  if(!INFO_Q.test(low)&&!advice) return null;
  const warn=warranty?" "+WARRANTY_NOTE:"", warnOnly=warranty?{reply:WARRANTY_NOTE,...none}:null;
  let part=low.replace(/[?]/g," ").replace(/\b(?:what|whats|what's|how|tell|me|about|explain|is|are|does|do|mean|means|meaning|a|an|the|it|they|them|that|this|on|my|car|for|to|work|works|good|actually|exactly|please|pls)\b/g," ");
  if(advice) part=part.replace(/\b(?:should|shall|would|will|could|i|we|get|getting|buy|add|fit|have|go|worth|really|suit|suits|look|looks|ruin|ruins|affect|affects|void|voids|hurt|hurts|wreck|wrecks|warranty|warrantee|ride|handling|which|best|mods?|modding|modifications?|any|of|be|with|its|or|not)\b/g," ");
  part=part.replace(/\s+/g," ").trim();
  if(!part) return warnOnly;
  const p=planParts(part), a=(p.apply||[]).find(x=>x.id!=="custom");
  if(!a) return warnOnly;
  const q=sanitize(a.id,a.params,car), info=modInfo(a.id,q,car);
  if(!info||!info.what) return warnOnly;
  const on=JSON.stringify(mods[a.id])===JSON.stringify(q);
  if(!on) priceAsked=part;
  return {reply:(`${modLabel(a.id,q)}: ${info.what} ${info.effect||""} About £${Math.round(modPrice(a.id,q,car)).toLocaleString("en-GB")} fitted on the ${car.model}.${on?" It's already on your car.":' Say "add it" to try it.'}`+warn).replace(/\s+/g," "),priceQuestion:true,...none};
}
function localPlan(text){
  // priceAsked is cleared by applyPlan (chat.js) on the next real message, so behind-the-scenes checks can't wipe it.
  const low=" "+fixTypos(String(text).toLowerCase())+" ";
  if(priceAsked&&ADD_IT.test(low)){const asked=priceAsked; priceAsked=null; return planParts(asked);}
  if(!PRICE_Q.test(low)&&!adviceAsked(low)){const q=questionReply(low); if(q) return q;}
  if(!PRICE_Q.test(low)||adviceAsked(low)) return planParts(text);
  const money=v=>"£"+Math.round(v).toLocaleString("en-GB");
  const part=low.replace(/[?]/g," ").replace(/\b(?:how much|what|whats|what's|price|prices|cost|costs|would|will|does|do|did|is|are|it|be|to|for|of|the|a|an|roughly|about|approx(?:imately)?|cost me|me|i|we|pay|get|add|fit|fitted|having|have|on|my|car|please|pls|and|so|ok|just|typically|usually|uk)\b/g," ").replace(/\s+/g," ").trim();
  const p=part?planParts(part):{apply:[]}, c=CARS.find(x=>x.id===(p.switchCar||state.car));
  const sameCar=c.id===state.car;
  const cap=w=>w[0].toUpperCase()+w.slice(1);
  const priced=(p.apply||[]).flatMap(a=>{
    if(a.id==="custom") return (a.params.items||[]).filter(i=>i.price).map(i=>({say:i.name,price:i.price,on:sameCar&&!!(state.mods.custom&&state.mods.custom.items.some(x=>x.name===i.name))}));
    const q=sanitize(a.id,a.params,c);
    return [{say:cap(modLabel(a.id,q)),price:modPrice(a.id,q,c),on:sameCar&&JSON.stringify(state.mods[a.id])===JSON.stringify(q)}];
  });
  // "How much is a wrap / respray" with no colour named: give the usual price.
  if(!priced.length&&/\b(?:wrap|re-?spray|paint(?:job| job)?)\b/.test(part)){const paint=!/\bwrap/.test(part); priced.push({say:paint?"A full respray":"A full wrap",price:modPrice("wrap",{paint,finish:"gloss"},c),on:false,generic:true});}
  const totalAsked=/\b(?:build|total|altogether|in total|so far|all (?:this|that|of (?:it|that|this))|whole thing|lot|everything)\b/.test(low);
  if(priced.length&&!totalAsked){
    const sum=priced.reduce((a,i)=>a+i.price,0), off=priced.filter(i=>!i.on&&!i.generic);
    const list=priced.map(i=>`${i.say}: about ${money(i.price)}${i.on?" (already on your car)":""}.`).join(" ");
    const tail=priced.length>1?` About ${money(sum)} together, fitted on the ${c.model} at an independent UK specialist.`:` That's for the ${c.model}, done at an independent UK specialist.`;
    if(off.length) priceAsked=part;
    const gen=priced.find(i=>i.generic);
    const next=off.length?` Say "add it" to fit ${off.length>1?"them":"it"}.`:gen?` Say a colour, like "${gen.say==="A full respray"?"paint it nardo grey":"wrap it satin black"}", to try it.`:"";
    return {reply:list+tail+next,priceQuestion:true,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  }
  if(p.switchCar&&!sameCar&&!totalAsked){const say=(c.make==="Volkswagen"?c.model:c.make+" "+c.model.split(" ")[0]).toLowerCase();
    return {reply:`A ${c.used?"used":"new"} ${c.make} ${c.model} is about ${money(c.price)}, before any parts. Say "${say}" to build one.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};}
  const cur=CARS.find(x=>x.id===state.car), bc=buildCost(cur,state.mods), n=partCount(state.mods);
  if(!n) return {reply:`Your ${cur.model} is still standard: about ${money(cur.price)} ${cur.used?"used":"new"}, with no parts added yet. Ask "how much is a remap" (or any part) to see its price.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  return {reply:`Your build: the ${cur.model} is about ${money(cur.price)} ${cur.used?"used":"new"}, plus ${money(bc)} for ${n} part${n>1?"s":""} with fitting, so about ${money(cur.price+bc)} in total. The Price list page shows what each part costs.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}

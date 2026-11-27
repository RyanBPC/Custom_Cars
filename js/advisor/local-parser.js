/* Keyword advisor: turns a plain-English request into a build plan without AI. */
"use strict";
/* offline interpreter */
/* Beginner questions ("what would you recommend", "mods under £500"): suggest, don't fit. */
/* "i have 2k to spend", "i've got £2000", "got 500 quid", "something for 5 grand": a budget, read like "under £2000" (Car #131, #170). */
/* "sleepy daily" / "sleeper daily": power that hides under the bonnet, so it still looks standard (Car #170). */
const SLEEPER_DAILY=/\bsleep(?:er|y) daily\b|\bdaily sleeper\b/;
const HAVE_BUDGET=/\b(?:i have|i'?ve got|ive got|i got|got|for|with)\s+(?:about |around |roughly )?(?:£\s*(\d[\d,]*)\s*(k\b)?|(\d[\d,]*)\s*(k\b|grand\b|quid\b|pounds\b)|(\d[\d,]*)(?=\s+to spend\b))/;
function adviceAsked(t){return HAVE_BUDGET.test(t)||SLEEPER_DAILY.test(t)||/\b(recommend|suggest|ideas?|first mods?|best mods?|good mods?|cheap|budget|afford|beginner|starter|cheapest|build me something|where (?:do|should|can) i (?:start|begin)|what (?:should|would|do|can) (?:i|you) (?:do|get|add|fit|try)(?: \w+)? (?:first|next)|what should i (?:do|get|add|start))\b|\bmods?\b.*£\s*\d|\b(?:under|below|less than|up to|max)\s*£?\s*\d/.test(t);}
function starterIdeas(t,car){
  const hb=t.match(HAVE_BUDGET); if(hb){const k=hb[2]||/^(?:k|grand)$/.test(hb[4]||"")?"k":""; t=t.replace(hb[0]," under £"+(hb[1]||hb[3]||hb[5])+k+" ");}
  const IDEAS=[["lowering springs","drop",{springs:true,mm:30}],["stage 1 remap","tune",{stage:1}],["dark windows","tint",{}],["smoked lights","lights",{}],["lip spoiler","spoiler",{type:"lip"}],["induction kit","intake",{}],["racing stripes","stripes",{}],["aero kit","bodykit",{}],["louder exhaust","exhaust",{}]];
  const m=t.match(/(?:under|below|less than|up to|max|budget(?: of)?|for)\s*£\s*(\d[\d,]*)\s*(k\b)?|£\s*(\d[\d,]*)\s*(k\b)?|(?:under|below|less than|up to|max)\s*(\d[\d,]*)\s*(k\b)?/);
  const n=m?parseInt((m[1]||m[3]||m[5]).replace(/,/g,""),10)*((m[2]||m[4]||m[6])?1000:1):null;
  const sleeper=SLEEPER_DAILY.test(t);
  const cheap=/\bcheap|\bbudget\b(?!\s*(?:of\s*)?£?\s*\d)/.test(t)&&n===null;
  let list=IDEAS.map(([say,id,p])=>({say,price:modPrice(id,p,car),hidden:id==="tune"||id==="intake"})).filter(i=>(n===null||i.price<=n)&&(!sleeper||i.hidden));
  if(cheap) list.sort((a,b)=>a.price-b.price);
  list=list.slice(0,3);
  const money=v=>"£"+v.toLocaleString("en-GB");
  if(!list.length) return `Most parts start at about ${money(Math.min(...IDEAS.map(([,id,p])=>modPrice(id,p,car))))} fitted, so ${money(n)} is a bit tight. Try one of the gallery builds for ideas, or save up a little.`;
  if(sleeper&&list.length) return `For a sleeper daily the ${car.model} keeps its standard look and gains power under the bonnet: ${list.map(i=>`${i.say} (about ${money(i.price)})`).join(", ")}. Keep the standard wheels and exhaust so it still looks stock. Say one to try it on, e.g. "${list[0].say}".`;
  const lead=n!==null?`Good first mods for the ${car.model} under ${money(n)}:`:cheap?`Cheapest good first mods for the ${car.model}:`:`Good first mods for the ${car.model}:`;
  return `${lead} ${list.map(i=>`${i.say} (about ${money(i.price)})`).join(", ")}. Say one to try it on, e.g. "${list[0].say}", or try one of the gallery builds.`;
}
const REFURB_RE=/\brefurb\w*|\b(?:kerb|curb)(?:ed| rash| damage)\b|\b(?:repair|fix) (?:my |the )?(?:kerbed |scuffed )?(?:wheels|alloys|rims)\b|\bscuffed (?:wheels|alloys|rims)\b/;
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
// Cosmetic parts whose colour or finish the user chooses: the word each colour belongs to, and the part's wording.
const COSMETIC_NEAR={"Sport steering wheel":/steering/,"Wheel spacers":/spacer/,"Low-profile tyres":/profile|tyre/,"Smoked headlights":/head/,"Smoked tail lights":/tail|rear/,"Coloured mirror caps":/mirror/,"Coloured badges":/badges?|emblems?/,"Caliper paint":/calipers?/,"Centre cap swap":/caps?\b/,"Floor mats":/mats?\b|edging/,"Bonnet wrap":/bonnet|hood/,"Seat covers":/seats?|upholster|covers?|leather|alcantara|interior/,"Dashboard trim":/dash/,"Coloured seat belts":/belts?/};
const CALIPER_PAINT_RE=/calipers? paint|paint(?:ed)? (?:the |my )?(?:brake )?calipers?|painted (?:brake )?calipers?|calipers? (?:colou?r|painted)/;
// "Yellow calipers" on its own is caliper paint; big brakes are asked for with big/kit/upgrade/BBK/Brembo/pistons or to stop better.
const BIG_BRAKE_RE=/\bbig\b|\bkit\b|upgrade|\bbbk\b|brembo|\bpot\b|piston|stop better|stopping power|bigger brakes/;
// "red brake calipers" is the calipers' colour (how Gemini's photo read words it), so "brake" just before "caliper" doesn't mean the kit.
const isCaliperPaint=t=>CALIPER_PAINT_RE.test(t)||(/\bcalipers?\b/.test(t)&&!BIG_BRAKE_RE.test(t)&&!/\bbrakes?\b/.test(t.replace(/\bbrakes? (?=calipers?\b)/g,"")));
const SMOKED_HEAD_RE=/smoked? head ?lights?|head ?lights? (?:smoked|tinted)|tint(?:ed)? (?:the )?head ?lights?/;
const SMOKED_TAIL_RE=/smoked? (?:tail|rear) ?lights?|(?:tail|rear) ?lights? (?:smoked|tinted)|tint(?:ed)? (?:the )?(?:tail|rear) ?lights?/;
// The clause of a sentence that's about one part (so "red centre caps, chrome window trim" gives the caps red, not chrome).
function clauseFor(t,re,seps){const cl=t.split(seps).find(c=>re.test(c)); return cl||t;}
const PART_CLAUSE_RE=/\b(?:bonnet|hood|trim|caps?|grilles?|mirrors?|seats?|mats?|dash(?:board)?|stitch\w*|markers?|calipers?|edging|tyres?|spacers?|wheels?|rims?|alloys?|head ?lights?|tail ?lights?|stripes?|roof|underglow|steering|ambient)\b/;
function cosmeticText(name,t){
  if(!COSMETIC_NEAR[name]) return null;
  t=clauseFor(t,COSMETIC_NEAR[name],["Seat covers","Sport steering wheel","Floor mats"].includes(name)?/,|;/:/,|;|\band\b|\bplus\b/);
  if(name==="Sport steering wheel"){const grip=/carbon/.test(t)?"carbon":/leather/.test(t)&&!/alcantara/.test(t)?"leather":"Alcantara", shape=/round|circular/.test(t)?"round":"flat-bottomed";
    const mk=t.match(/([a-z0-9-]+(?: [a-z0-9-]+)?) (?:top )?marker/), mc=mk&&COLOURS.filter(x=>new RegExp("\\b"+x[0]+"\\b").test(mk[1])).sort((a,b)=>b[0].length-a[0].length)[0];
    const sk=t.match(/([a-z0-9-]+(?: [a-z0-9-]+)?) (?:contrast )?stitch/), sc=sk&&COLOURS.filter(x=>new RegExp("\\b"+x[0]+"\\b").test(sk[1])).sort((a,b)=>b[0].length-a[0].length)[0];
    return "a "+shape+" "+grip+" sport steering wheel"+(/no (?:top )?marker/.test(t)?" with no top marker":" with a "+(mc?mc[0]:"red")+" top marker")+(sc?" and "+sc[0]+" stitching":"");}
  if(name==="Wheel spacers"){const mm=t.match(/\b([5-9]|1\d|2[0-5])\s*mm\b(?=[^,]*spacer)/); return (mm?Math.round(+mm[1]/5)*5||5:20)+"mm wheel spacers so the wheels sit flush with the arches";}
  if(name==="Low-profile tyres"){const p=t.match(/\b(45|40|35|30)(?:[- ]?(?:profile|series)|\b)/); return (p?p[1]:"35")+"-profile low-profile tyres with thin sidewalls";}
  if(name==="Smoked headlights"||name==="Smoked tail lights"){const seg=(t.split(/,|\band\b|\bwith\b/).find(x=>name==="Smoked headlights"?/head/.test(x):/tail|rear/.test(x))||t), lv=/\blight(?:ly)?\s+smok|light smoke/.test(seg)?"light":/dark|heavy|black(?:ed)?[- ]?out/.test(seg)?"dark":"medium"; return lv+(name==="Smoked headlights"?" smoked headlight lenses":" smoked tail-light lenses");}
  const h=colourNear(t,name==="Floor mats"&&/edg/.test(t)?/edging/:COSMETIC_NEAR[name]), c=h&&(COLOURS.find(x=>x[1]===h)||[])[0];
  if(name==="Caliper paint") return (c||"red")+" painted brake calipers";
  if(name==="Coloured seat belts") return (c&&c!=="black"?c:"red")+" seat belt webbing";
  if(name==="Centre cap swap") return /chrome|silver/.test(t)?"chrome wheel centre caps":(c||"black")+" wheel centre caps";
  if(name==="Coloured badges") return (/body[- ]colou?r|colou?r[- ]?(?:coded|matched)/.test(t)?"body-coloured":c||"red")+" painted badges";
  if(name==="Coloured mirror caps") return (/body[- ]colou?r/.test(t)?"body-coloured":c||"red")+" wing mirror caps";
  if(name==="Floor mats") return /rubber/.test(t)?"black rubber floor mats"+(/embroider/.test(t)?" with an embroidered badge":""):"black carpet floor mats with "+(c&&c!=="black"?c:"red")+" edging"+(/embroider/.test(t)?" and an embroidered badge":"");
  if(name==="Bonnet wrap") return /carbon/.test(t)?"a carbon-look vinyl wrap on the bonnet":"a "+(/matte?\b/.test(t)?"matte":/satin/.test(t)?"satin":"gloss")+" "+(c||"black")+" vinyl wrap on the bonnet";
  if(name==="Dashboard trim") return /alumin|brushed|metal/.test(t)?"brushed aluminium dashboard trim":/piano|gloss black/.test(t)?"piano black dashboard trim":/wood|walnut|oak/.test(t)?"wood dashboard trim":/painted|colou?r/.test(t)&&c?c+" painted dashboard trim":"carbon-fibre dashboard trim";
  // Seat covers: leather or Alcantara, one colour or two-tone (the first colour on the bolsters, the second on the centre panels).
  const mat=/alcantara|suede/.test(t)?"Alcantara":/cloth|fabric/.test(t)?"cloth":/quilt|diamond/.test(t)?"quilted leather":"leather";
  // Contrast stitching: the colour said with "stitching" goes on the stitches, not the seats.
  const st=t.match(/with ([a-z0-9 -]+?) (?:contrast )?stitch/), stc=st&&COLOURS.filter(x=>new RegExp("\\b"+x[0]+"\\b").test(st[1])).sort((a,b)=>b[0].length-a[0].length)[0];
  const stitch=stc?" with "+stc[0]+" stitching":"";
  if(st) t=t.replace(st[0]," ");
  if(/two[- ]?tone/.test(t)){const cs=COLOURS.map(x=>[t.search(new RegExp("\\b"+x[0]+"\\b")),x[0]]).filter(x=>x[0]>=0).sort((a,b)=>a[0]-b[0]||b[1].length-a[1].length).map(x=>x[1]).filter((x,i,a)=>!a.slice(0,i).some(y=>y.includes(x))); return "two-tone "+(cs[0]||"black")+" and "+(cs[1]||"red")+" "+mat+" seat covers"+stitch;}
  const c2=colourNear(t,COSMETIC_NEAR[name]), cn=c2&&(COLOURS.find(x=>x[1]===c2)||[])[0];
  // Cream, beige and oxblood are interior-only shades, not paint colours (Car #178).
  return ((t.match(/\b(tan|cream|beige|oxblood)\b/)||[])[1]||cn||"black")+" "+mat+" seat covers"+stitch;
}
const PARSE_WORDS="bonnet hood spoiler wing ducktail exhaust exhausts wheels wheel rims alloys carbon fibre fiber underglow stripes stripe racing tint tinted windows window lower lowered lowering coilovers suspension brakes brake calipers caliper bodykit widebody splitter diffuser skirts intake turbo remap tune headlights lights smoked wrap paint respray colour color matte satin gloss chrome roof rack snorkel louvres louvers canards visors harness harnesses steering shifter subwoofer speakers interior ambient bucket seats cage mirror mirrors decals graphics flames camo graffiti plate number intercooler scoop vents quad tips bumper sequential indicators eyelids spacers camber terrain tyres tires lift lifted louder faster power stance slammed slam massive spoilers pedestal extension marker flat bottom bottomed machined diamond polished lipped split twin bbs profile lettering letters lightly medium shift chameleon iridescent brushed quilted cloth stitching rubber embroidered badge honeycomb mesh grille trim handles centre center hub painted edging dashboard leather alcantara suede upholstery covers two-tone low-profile stretched sidewalls flare flares arch arches overfenders strip sunstrip banner windscreen belt belts".split(" ");
// Ordinary words and car names are never "corrected" ("back" must not become "rack", "golf" not "gold").
const PARSE_KEEP=new Set("list lists line lines wood wooden walnut dash caps mats cash cars word good spacer space serious series dechrome dechromed lose flower flowers slower slowly shower showers tower towers mower blower follower track back side more make take have some also that this then than them they want with like need just love nice cool look looks rear front real full good best feel keep sound wide deep dark does done give here there when what your into onto over under extra every maybe could would should thing things stuff little really super very much many same lets please thanks cheers mate bring check change turn same seat doors door body tail high tall long short lows boot gear gets wants fits tone toned tones limo quiet quieter light lighter bright pale fine time tint ride springs spring bagged bags badge badges badgeless debadge debadged decat decatted stock standard original factory normal glass privacy downpipe downpipes steps wind winds deflector deflectors sport sports towbar towbars strap straps inch inches brace braces limited slip diff diffs quaife roll anti catch cooler coolers quid grand alloy pedal pedals clutch gauge gauges drift".split(" "));
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
// Wheels named by brand or model alone ("bronze te37s", "volk rays", "ozs", "bbs", "vossens") are a wheel ask (Car #218).
// Done before the typo fixer, which would turn "rotas" or "volk" into other words. "rays" alone ("rays of light") isn't caught.
// A TE37 has six straight spokes, so it gets the closest style: 5-spoke.
const WHEEL_BRAND_RE=/\b(te ?37s?|volk(?:s| rays?)?|rays (?=wheels?|rims?|alloys?)|oz(?:s| racing)|rotas?|vossens?|bbs(?:es)?|rotiforms?|japan racing|jr ?11s?|enkeis?|work emotions?|advan(?: rgs?)?)\b(?!\s+(?:wheels?|rims?|alloys?)\b)/g;
function wheelBrands(t){return t.replace(WHEEL_BRAND_RE,m=>/^te ?37/.test(m)?" te37 5-spoke wheels ":` ${m} wheels `);}
function planParts(text){
  let t=" "+fixTypos(wheelBrands(text.toLowerCase()))+" "; const apply=[],remove=[]; let switchCar=null, reset=false;
  // "Golf R look", "golf r bumpers", "R-Line", "make it look like an R": the R look kit from existing parts (Car #150), not a car switch.
  // Only a bare "golf r" asked on another car still switches to the Golf (then fits the kit).
  const GOLF_R_RE=/\b(?:(?:vw |volkswagen )?golf\s+r(?![a-z0-9])(?:[- ]?line\b)?|r[- ]line\b|(?:look|looks|style)\s+like\s+an?\s+r(?![a-z0-9]))/g;
  let rLook=null;
  if(GOLF_R_RE.test(t)){const toGolf=state.car!=="golf"&&/golf/.test(t)&&!/look|style|bumper|kit|skirt|\bline\b/.test(t);
    rLook=/r[- ]line/.test(t)?"rline":"r";
    if(/\bblue\b/.test(t)&&!/\b(?:lapiz|estoril|portimao|snapper rocks|miami|baby|navy|sky|light|pale)\s+blue\b/.test(t)) t=t.replace(/\b(?:(?:dark|bright|deep)\s+)?blue\b/g," lapiz blue ");
    t=(toGolf?" golf ":"")+(rLook==="r"?" quad tips ":"")+" side skirts 19 inch silver wheels , "+t.replace(GOLF_R_RE," ").replace(/\b(?:bumpers?|body ?kit|kit|style|look|wheels?|rims?|alloys?|exhausts?)\b/g," ");}
  // "red golf badges" is about the badges, not a car switch (Car #163).
  const tSw=t.replace(/\b[a-z0-9-]+\s+(?=(?:badges?|emblems?)\b)/g," ");
  for(const c of CARS){if(c.keys.some(k=>new RegExp("(^|[^a-z0-9])"+k.replace(/[-]/g,"\\-")+"([^a-z0-9]|$)").test(tSw))){switchCar=c.id;break;}}
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
  const carbonGrille=false; // carbon grilles are their own part now ("Carbon grille" in EXTRA_PARTS)
  const SP=String.raw`(ride height|tail lights|\d{2}s|`+Object.keys(STOCK_PART).filter(k=>!k.includes(" ")).join("|")+")";
  const stockNames=[];
  const toStock=w=>{const k=/^\d{2}s$/.test(w)?"wheels":STOCK_PART[w]; if(!stockNames.includes(k)) stockNames.push(k); return " remove the "+k+" , ";};
  t=t.replace(new RegExp(String.raw`\b(?:put|set|take|bring|turn|change)\s+(?:the\s+)?`+SP+String.raw`\s+back\s+to\s+(?:stock|standard|original|factory|normal)\b`,"g"),(m,w)=>toStock(w));
  t=t.replace(new RegExp(String.raw`\b(?:back to (?:the )?)?(?:stock|standard|original|oem|factory|normal)\s+(?:size\s+)?`+SP+String.raw`\b`,"g"),(m,w)=>toStock(w));
  if(RESET_RE.test(t)){reset=true;t=t.replace(RESET_RE," ");}
  // UK slang is read before the removal rule, so the "delete"/"remove" in these doesn't take parts off.
  const notes=[...hiddenNote];
  if(rLook) notes.push(rLook==="r"?"That's the Golf R look: quad exhaust tips, side skirts and 19 inch silver wheels. It's the look only, not the R's 4Motion engine; say \"stage 2\" for more power, or \"make it lapiz blue\" for the R's best-known colour.":"That's the R-Line look (VW's sporty-looking trim): side skirts and 19 inch silver wheels. Say \"golf r look\" to add the R's quad exhaust tips too.");
  // A wheel refurb or kerb-rash repair keeps the car's own wheels (Car #132): the clause is taken out so it can't fit new wheels or a wrap.
  let refurb=null;
  if(REFURB_RE.test(t)){const cl=clauseFor(t,REFURB_RE,/,|;|\band\b|\bplus\b|\bthen\b/),h=colourNear(cl,REFURB_RE)||colourNear(cl,/wheels?|alloys?|rims?|them/), cn=h&&(COLOURS.find(x=>x[1]===h)||[])[0];
    const fin=cn?((/\bgloss\b/.test(cl)?"gloss ":/\bsatin\b/.test(cl)?"satin ":/\bmatte?\b/.test(cl)?"matte ":"")+cn):/diamond[- ]?cut|machined/.test(cl)?"diamond-cut":null;
    refurb={name:"Alloy wheel refurb",price:400,text:fin?"your own four alloys refurbished in "+fin:"your own four alloys refurbished, kerb rash repaired"};
    notes.push("Your own wheels stay on: a refurb repairs kerb rash and refinishes all four, usually about £80-£120 a wheel."+(fin?" Shown as a note for now; the 3D wheels keep their colour.":""));
    t=t.replace(cl," ");}
  if(quiet) notes.push("The standard exhaust is the quietest: every aftermarket exhaust is louder.");
  if(notLoud&&!quiet) notes.push("For a sportier sound that isn't too loud, the valved cat-back is the one: louder than standard, but keep the valves shut for a quiet cruise, and it stays under the MOT noise limit.");
  if(carbonGrille) notes.push("The studio shows the gloss black grille; real carbon fibre grilles look similar and cost a bit more (about £250).");
  // Nitrous and anti-lag are rare on UK road cars, so neither is fitted; offer a stage 2 remap instead (Car #179).
  const NITROUS_RE=/\b(?:nitrous(?: oxide)?|nos|n2o|nitro)(?: kit| system| bottle)?\b|\banti[- ]?lag(?: system)?\b|\bals\b/g;
  const nitro=t.match(NITROUS_RE);
  if(nitro){const al=nitro.some(m=>/lag/.test(m)); t=t.replace(NITROUS_RE," ");notes.push((al?"I haven't fitted anti-lag: it's a rally part that keeps the turbo spinning by burning fuel in the exhaust, which wrecks turbos and catalytic converters and is very loud.":"I haven't fitted nitrous: it's rare on UK road cars, most insurers refuse to cover it, and it can damage the engine.")+((CARS.find(x=>x.id===(switchCar||state.car))||{}).turbo?' For safe extra power, say "stage 2 remap".':' For more power, say "stage 1 remap".'));}
  // A decat fails the MOT, so it's never fitted; suggest a legal cat-back exhaust instead.
  const DECAT_RE=/\bde-?cat(?:ted)?\b|\bcat(?:alytic converter)? delete\b|\b(?:remove|delete|take off|take out|get rid of|lose)\s+(?:the\s+)?(?:cat|catalytic converter)\b(?!-)/g;
  const decat=DECAT_RE.test(t);
  if(decat){t=t.replace(DECAT_RE," ");notes.push("I haven't done a decat: taking out the catalytic converter fails the UK MOT and isn't road legal. For more sound, say \"cat-back exhaust\" instead.");}
  // An exhaust/silencer delete or straight-through pipe is very loud and can fail the MOT, so fit the valved cat-back and say why (Car #162).
  const EXH_DELETE_RE=/\b(?:exhaust|silencer|back ?box|resonator|muffler)s?\s+(?:delete|deleted|removal|removed)\b|\b(?:remove|delete|take off|take out|get rid of|lose|no)\s+(?:the\s+|my\s+)?(?:rear\s+|middle\s+|centre\s+|center\s+)?(?:silencers?|back ?box(?:es)?|resonators?|mufflers?)\b|\bstraight[- ]?(?:through|thru|pipes?d?)\b(?:\s+exhaust)?|\bde-?silenced?\b/g;
  if(EXH_DELETE_RE.test(t)){t=t.replace(EXH_DELETE_RE," exhaust ");notes.push("A full silencer delete or straight-through pipe is very loud and can fail the MOT and noise rules (and get you pulled over), so I've fitted a valved cat-back: loud when you want, quiet when you don't.");}
  // "Delete the badges", "badgeless", "remove the GTI badges" all mean the debadge part.
  const DEBADGE_RE=/\bbadge ?delete\b|\bbadgeless\b|\bde-?badged?\b|\b(?:remove|delete|take off|take out|get rid of|lose|no)\s+(?:all\s+)?(?:the\s+)?(?:[a-z]+\s+)?badges?\b/g;
  if(DEBADGE_RE.test(t)) t=t.replace(DEBADGE_RE," debadge ");
  // "Black out the chrome", "delete the chrome trim", "no chrome" mean the trim (chrome delete), not a chrome wrap.
  const DECHROME_RE=/\b(?:black(?:ed)?[- ]?out|delete|remove|take off|get rid of|lose|no)\s+(?:all\s+)?(?:the\s+)?(?:window\s+)?chrome(?:\s+(?:trim|bits|window trim|surrounds?))?\b(?!\s*(?:wrap|paint|finish|respray|wheels?|rims?|alloys?))|\bchrome(?:\s+(?:window\s+)?trim)?\s+(?:blacked out|black[- ]?out|removed|deleted|delete|removal)\b|\bde-?chromed?\b/g;
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
  // "Roof wrap black" / "roof wrapped in black" too, and a bare "roof wrap" is the black roof as well (Car #173).
  t=t.replace(/\b(?:(?:wrap|paint|respray|do|colou?r|black out)\s+(?:the\s+|my\s+|its\s+)?roof|roof(?:\s+wrap(?:ped)?)?)\s+(?:in\s+)?(?:(?:gloss|glossy|piano|satin|matte?)\s+)?black\b(?!\s+(?:wheels?|rims?|alloys?|mirrors?|calipers?))/g," black roof ");
  const ROOF_WRAP_RE=/(?<!\b(?:carbon|black|gloss|satin|matte?)\s+)\broof wrap(?:ped)?\b(?!\s+(?:in\s+)?(?:carbon|gloss|glossy|piano|satin|matte?)\b)/g;
  if(ROOF_WRAP_RE.test(t)){t=t.replace(ROOF_WRAP_RE," black roof ");notes.push(`I've gone for a gloss black roof, the usual colour for a roof wrap. Say "carbon roof" if you'd like carbon instead.`);}
  // Sunroofs are a factory option (Car #173): fitting one later means cutting the roof, so nothing is fitted.
  const SUNROOF_RE=/\b(?:(?:add|fit|get|install|want|put in|give it)\s+)?(?:an?\s+|the\s+|some\s+)?(?:sun ?roof|moon ?roof|panoramic (?:glass |sun ?)?roof|panoramic|glass roof|pano roof)s?\b/g;
  if(SUNROOF_RE.test(t)){t=t.replace(SUNROOF_RE," ");notes.push(`A sunroof or panoramic roof is a factory option on the ${c.model}. Fitting one later means cutting the roof, costs a lot and often leaks, so it's rarely worth it. For the look of a dark glass roof, say "black roof" (about £450) or "carbon roof".`);}
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
  // Clutch, boost gauge and drift asks depend on the car (Car #169): a DSG or auto has no clutch pedal, a non-turbo has no boost.
  if(/\bclutch(?:es)?\b/.test(t)&&(c.box==="dsg"||c.box==="auto")){t=t.replace(/\bclutch(?:es)?\b/g," ");notes.push(`The ${c.model} has ${c.box==="dsg"?"a DSG gearbox":"an automatic gearbox"} with no clutch pedal, so there's no clutch to swap. For big power the gearbox software gets tuned instead (a ${c.box==="dsg"?"DSG":"gearbox"} remap, about £400), usually done alongside a stage 2 remap.`);}
  if(/\bboost gauges?\b/.test(t)&&!c.turbo){t=t.replace(/\bboost gauges?\b/g," ");notes.push(`The ${c.model}'s ${c.engine.split(",")[0]} has no turbo, so there's no boost for a gauge to show. A shift light strip is a popular gauge-style add-on instead (say "add shift lights").`);}
  // Puncture kits come with the car (Car #172): most UK hot hatches ship with sealant and a pump instead of a spare, so nothing is fitted.
  const PUNCTURE_RE=/\b(?:puncture|tyres?|tires?) (?:repair |sealant |inflator )?kits?\b|\b(?:tyres?|tires?) (?:sealant|weld|inflator)\b/g;
  if(PUNCTURE_RE.test(t)){t=t.replace(PUNCTURE_RE," ");notes.push(`The ${c.model} already comes with a tyre repair kit (a bottle of sealant and a small pump, in the boot floor), so there's nothing to add. If you'd rather carry a real spare, say "add a spare wheel" (a space saver, about £150).`);}
  const DRIFT_RE=/\bdrift(?:ing)?\s+(?:build|car|spec|setup|set up|missile|look)\b|\bmake it drift\b|\bfor drifting\b/g;
  if(DRIFT_RE.test(t)){t=t.replace(DRIFT_RE," coilovers lower it 30mm limited slip diff bucket seats ");notes.push(c.drive==="RWD"?`Drift build: coilovers, a limited slip diff and bucket seats. The ${c.model} is rear-wheel drive, so it's a proper drift base. Only drift on a track or at a drift day, never on the road.`:`Drift build: coilovers, a limited slip diff and bucket seats. The ${c.model} is ${c.drive==="AWD"?"all-wheel":"front-wheel"} drive, though, and real drift cars are rear-wheel drive, like the BMW 440i. Only drift on a track or at a drift day, never on the road.`);}
  const track=/\b(track|full build|go wild|everything|race car|time attack|the (?:full )?works|go all out|all[- ]out)\b/.test(t);
  if(track){add("drop",{mm:35});add("brakes",{caliper:"red"});add("bodykit",{});add("spoiler",{type:"gt-wing"});add("wheels",{size:Math.min(21,c.wheel+1),style:"monoblock",finish:"gunmetal"});add("tune",{stage:2});add("exhaust",{});}
  // "19s" on its own means 19-inch wheels.
  if((/\b(1[7-9]|2[01])s\b/.test(t)||/wheel|\brims?\b|alloy/.test(t.replace(/steering wheel|wheel spacers?|wheel arch(es)?|fly ?wheels?|spare (?:wheel|tyre|tire)s?|space ?saver wheels?|(?:alloy|aluminium|aluminum) pedals?/g,"")))&&!remove.includes("wheels")){
    // Only take a size that has a unit ("19-inch", "19in", 19") or sits just before a wheel word ("19 bronze wheels"), so "20% tint" isn't read as 20-inch wheels.
    const sz=t.match(/\b(1[7-9]|2[01])\s*(?:"|”|''|-?\s?inch(?:es)?\b|in\b|s\b)/)||t.match(/\b(1[7-9]|2[01])\s+(?:[a-z]+\s+){0,2}(?:wheels?|rims?|alloys?)\b/);
    const style=/\bbbs\b|cross[- ]?spoke/.test(t)?"bbs-mesh":/\b(?:5|five)[- ]?spoke/.test(t)?"5-spoke":/\by[- ]?spoke/.test(t)?"y-spoke":/(?:split|twin)[- ]?spoke/.test(t)?"split-spoke":/mesh|cross/.test(t)?"mesh":/forged|mono/.test(t)?"monoblock":/dish|deep/.test(t)?"deep-dish":/turbo ?fan|fan/.test(t)?"turbofan":/spoke/.test(t)?"multi-spoke":"multi-spoke";
    const fc=colourNear(t,/wheel|rim|alloy/); let finish="gunmetal";
    if(fc){const name=(COLOURS.find(x=>x[1]===fc)||[""])[0];finish=Object.keys(RIM_FINISH).find(k=>name.includes(k))||(name.includes("grey")||name.includes("gray")?"gunmetal":"gunmetal");}
    // Plain words for size: "huge/massive" = 21", "bigger" = +1 or +2, "smaller" = -1.
    const plainSize=/huge|massive|giant|biggest/.test(t)?21:/much bigger|way bigger/.test(t)?Math.min(21,c.wheel+2):/smaller/.test(t)?Math.max(17,c.wheel-1):Math.min(21,c.wheel+1);
    // Finishes a colour doesn't name: machined (diamond-cut), chrome, matte black; and a polished lip.
    if(/machined|diamond[- ]?cut/.test(t)) finish="machined"; else if(/chrome\s+(?:[a-z0-9"”-]+\s+){0,3}(?:wheels?|rims?|alloys?)/.test(t)) finish="chrome"; else if(finish==="black"&&/matte?\s+black\s+(?:[a-z0-9"”-]+\s+){0,3}(?:wheels?|rims?|alloys?)/.test(t)) finish="matte-black";
    const lip=/polished lip|lipped|step(?:ped)? lip|with a lip|two[- ]?tone (?:wheels|rims)/.test(t);
    add("wheels",{size:sz?+sz[1]:plainSize,style,finish,...(lip?{lip:true}:{})});
  }
  // Word edges, so "flowers", "slower" or "teardrop" don't lower the car.
  if((air||springs||/\blower(s|ed|ing)?\b|\bdrop(s|ped)?\b|coilover|stance|\bslam|suspension|\blow\b(?![- ]?pro)|closer to the ground|sits? low|ground clearance/.test(t))&&!/lift|raise|higher/.test(t)&&!remove.includes("drop")){
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
  if(/spoiler|\bwing\b|duck ?tail/.test(ts)&&!remove.includes("spoiler")) add("spoiler",{type:/pedestal|boot wing|mid(?:-| )?(?:height )?wing/.test(ts)?"pedestal":/roof (?:spoiler )?ext|spoiler extension|roof spoiler|maxton/.test(ts)?"roof-ext":/duck/.test(ts)?"ducktail":/\blip\b|small|subtle/.test(ts)?"lip":/gt|big|huge|massive|giant|large|track|swan|tall|\bwing\b/.test(ts)?"gt-wing":"ducktail"});
  if(/\bbody ?kit|\blip ?kit|splitter|(?<!side ?)skirt|diffuser|aero|front lip|more aggressive|sportier look|sporty look|look sporty|look sportier|make it sportier|racier/.test(t)&&!remove.includes("bodykit")) add("bodykit",{});
  if(/wide ?body|widebody|wider|flare|arches|wide arch|over ?fenders?|fat|chunky/.test(t)&&!remove.includes("widebody")) add("widebody",/painted|body[- ]colou?r(?:ed)?|colou?r[- ]coded|to match/.test(t)?{painted:true}:{});
  // "No pops and bangs" asks for them to stay off, so it adds nothing.
  const NOPOPS_RE=/\b(?:no|without|remove|lose|get rid of|turn off|switch off)\s+(?:the\s+)?(?:pops|bangs|crackles?)(?:\s+(?:and|n|&)\s+bangs)?\b/g;
  const noPops=NOPOPS_RE.test(t); if(noPops){t=t.replace(NOPOPS_RE," ");notes.push("No pops and bangs: they're a remap setting, and a tuner can switch them off.");}
  if(/exhaust|louder|\bloud\b|noisier|pops|bangs|crackle|burble|growl|straight pipe|sounds? (better|meaner|angrier|nastier|sportier)|better sound/.test(t.replace(QUAD_TIPS_RE," "))&&!remove.includes("exhaust")) add("exhaust",{});
  if(/intake|induction|air filter|cold air/.test(t)) add("intake",{});
  // Pops and bangs are a remap setting (an overrun map), not just an exhaust part.
  const pops=/\bpops\b|\bbangs\b|\bcrackles?\b|\boverrun\b|\bburble (?:map|tune)\b/.test(t)&&!remove.includes("exhaust");
  // A downpipe is the usual stage 2 part, so on its own it means a stage 2 build.
  const downpipe=/\bdown ?pipes?\b/.test(t); if(downpipe&&!/stage ?3|big turbo|bigger turbo|hybrid turbo/.test(t)) notes.push("A downpipe is part of a stage 2 build, so it goes with the stage 2 remap.");
  // Side steps are an SUV/van part; point hatchback owners to side skirts instead.
  if(/\bside ?steps?\b|\brunning boards?\b/.test(t)) notes.push("Side steps don't really suit a hatchback. Try \"side skirts\" for a lower look along the sides.");
  // A power target ("300bhp", "make it 350 horsepower", "get it to 400hp") picks the lowest remap stage that reaches it (Car #177),
  // using the same numbers as the Studio panel (perf.js). The number is taken out so the plain "bhp" rule below doesn't add stage 1 again.
  let pwStage=0;
  {const m=t.match(/\b(\d{2,4})\s?(?:bhp|hp|horse ?power|ps)\b/);
   if(m&&!/stage ?[123]/.test(t)&&!remove.includes("tune")){
     const want=+m[1]; t=t.replace(m[0]," ");
     if(want<=c.hp) notes.push(`The ${c.model} already makes about ${c.hp}bhp as standard, so it doesn't need a remap for ${want}bhp.`);
     else{const s=[1,2,3].find(n=>perf(c,{tune:{stage:n}}).hp>=want); pwStage=s||3; const got=perf(c,{tune:{stage:pwStage}}).hp;
       notes.push(s?`Stage ${s} gets your ${c.model} to about ${got}bhp (standard is ${c.hp}bhp).`
         :`Even stage 3 only gets your ${c.model} to about ${got}bhp (standard is ${c.hp}bhp), so I've fitted that, the most the remaps here reach.`);}}}
  const st=t.match(/stage ?([123])/)||(downpipe&&[0,"2"])||(pwStage&&[0,String(pwStage)]);
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
  // Pops are stored on the remap (they crackle in the engine sound); a new stage keeps them, "no pops and bangs" switches them off.
  {const oldTune=!(reset||(switchCar&&switchCar!==state.car))&&state.mods.tune, tu=apply.find(a=>a.id==="tune");
   if(tu){if(pops||(!noPops&&oldTune&&oldTune.pops)) tu.params.pops=true;}
   else if(noPops&&oldTune&&oldTune.pops&&!remove.includes("tune")) add("tune",{stage:oldTune.stage});}
  if(/brake|caliper|stop better|stopping power/.test(t)&&!isCaliperPaint(t)&&!remove.includes("brakes")){const cc=colourNear(t,/brake|caliper/);const name=cc?(COLOURS.find(x=>x[1]===cc)||[""])[0]:"red";add("brakes",{caliper:Object.keys(CALIPER).find(k=>name.includes(k))||"red"});}
  // "tinted headlights" means smoked lights only, so hide tint words next to a lights word before looking for window tint.
  const tT=t.replace(/\btint(?:ed)?\s+(?:the\s+|my\s+)?(?:(?:head|tail|rear|front|fog)\s?)?lights?\b|\b(?:(?:head|tail|rear|front|fog)\s?)?lights?\s+tinted\b/g," ");
  if(/tint|\blimo\b|dark(er)? windows|black(ed)?[- ]?out windows|privacy glass/.test(tT)&&!remove.includes("tint")){const notInch="(?!\\s*-?\\s*(?:inch|in\\b|\"|”|s\\b))"; // so "tint and 20 inch wheels" isn't read as 20% tint
    const v=tT.match(/\b(20|35|50|70)\s*(?:%|per ?cent)/)||tT.match(new RegExp("\\btint\\w*\\s+(?:[a-z]+\\s+){0,2}(20|35|50|70)\\b"+notInch))||tT.match(new RegExp("\\b(20|35|50|70)\\b"+notInch+"\\s+(?:[a-z]+\\s+)?tint"));const limo=/\blimo\b|\b5\s*(?:%|per ?cent)/.test(tT); if(limo) notes.push("Limo tint (5%) is shown on the rear windows only: UK law says the front side windows must let through at least 70% of light.");
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
  // Neons (underglow), puddle/welcome lights, number plate bulbs and DRLs are their own parts, so they don't fit smoked lenses too (Car #113).
  const tL2=tL.replace(/\b(?:neon(?:\s+[a-z]+)?\s+lights?|neons?|puddle lights?|(?:door )?projector lights?|door (?:logo )?lights?|matrix (?:led )?(?:head)?lights?|daytime running lights?|drls?|(?:shift|rev) ?lights?|(?:welcome|approach) lights?|(?:number )?plate (?:lights?|bulbs?|lamps?))\b/g," ");
  if(!clearL&&!SMOKED_TAIL_RE.test(t)&&!SMOKED_HEAD_RE.test(t)&&/\bsmoked?\b|\b(head|tail) ?lights?\b|\blights\b|\blenses\b|dark(er)? lights|tinted lights/.test(tL2)&&!/light ?bar|underglow|angel|halo|led |dynamic|hid|xenon|brighter|sequential|eyelid|interior light|ambient/.test(t)&&!remove.includes("lights")) add("lights",{});
  // A colour right before a part ("gloss black mirror caps", "black roof", "red calipers") belongs to that part, not the paint.
  const colNames=COLOURS.map(x=>x[0]).sort((x,y)=>y.length-x.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  const tw0=t.replace(new RegExp(String.raw`\b(?:(?:gloss|glossy|matte?|satin|piano)\s+)?(?:`+colNames+String.raw`)\s+(?:wing\s+)?(?:mirror caps?|mirrors?|roof|wheels?|rims?|alloys?|calipers?|brakes?|stripes?|badges?|(?:kidney\s+|front\s+)?grilles?|kidneys?|bonnet|hood|(?:leather\s+|alcantara\s+)?seats?|(?:leather\s+|alcantara\s+)?seat covers?|(?:leather\s+)?interior(?!\s+(?:light|lighting|lights|trim))|leather|alcantara|(?:centre|center|wheel|hub)\s+caps?|edging|(?:painted\s+)?dash(?:board)?|(?:top\s+)?markers?|(?:contrast\s+)?stitching|(?:window\s+)?(?:trim|line))\b`,"g")," ")
    .replace(/\bpaint(?:ed)? (?:the |my )?(?:brake )?calipers? (?:in )?[a-z]+\b|\btwo[- ]?tone [a-z ]+? and [a-z]+\b/g," ");
  // The car's paint only comes from clauses about the car: a clause about another part ("chrome window trim",
  // "gloss black y-spoke wheels", "satin blue bonnet wrap") keeps its colour and finish to that part.
  const tw=tw0.split(/,|;|\band\b|\bplus\b|\bwith\b/).filter(cl=>!PART_CLAUSE_RE.test(cl)||/\b(?:car|whole|body|respray|full wrap)\b/.test(cl)).join(" , ");
  // "chrome delete" is the trim part, and "chrome turbofan wheels" is the wheels' finish; neither is a chrome wrap.
  const twc=tw.replace(/\bchrome delete\b/g," ").replace(new RegExp(CHROME_WHEELS_RE.source,"g")," ");
  const finish=/colou?r[- ]?shift|chameleon|iridescent|flip ?flop/.test(twc)?"chameleon":/brushed/.test(twc)?"brushed":/carbon[- ](?:look|fibre|fiber)? ?wrap|wrap(?:ped)? (?:it )?in carbon/.test(twc)?"carbon":/matte|matt\b/.test(twc)?"matte":/satin/.test(twc)?"satin":/chrome/.test(twc)?"chrome":/\bpearl(?:escent)?\b/.test(tw)?"pearl":/metallic|metal flake/.test(tw)?"metallic":"gloss";
  let wrapCol=colourNear(tw,/wrap|paint|respray|colou?r/);
  if(!wrapCol&&/matte|satin|chrome|gloss|metallic|pearl|shift|chameleon|brushed/.test(twc)) wrapCol=colourNear(twc,/matte|matt\b|satin|chrome|gloss|metallic|pearl(?:escent)?\b|colou?r[- ]?shift|chameleon|brushed(?: metal)?/);
  if(!wrapCol&&finish==="chameleon"&&/wrap/.test(twc)) wrapCol="#5b2d86";
  if(!wrapCol&&finish==="brushed"&&/wrap/.test(twc)) wrapCol="#c5c8cc";
  if(!wrapCol&&finish==="carbon") wrapCol="#2a2d31";
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
  if(refurb) items=[...items.filter(i=>i.name!==refurb.name),refurb];
  const removedCustom=items.length<had.length;
  // A cosmetic part asked for again in a new colour or finish ("tan seats" after "black seats") is changed, not doubled.
  for(const e of EXTRA_PARTS) if(COSMETIC_NEAR[e.name]&&e.re.test(t)&&items.some(i=>i.name===e.name&&i.text!==cosmeticText(e.name,t))) items=items.filter(i=>i.name!==e.name);
  for(const e of EXTRA_PARTS) if((e.re.test(t)||(e.name==="Caliper paint"&&isCaliperPaint(t))||(e.name==="Smoked tail lights"&&SMOKED_HEAD_RE.test(t)&&/(?:and|&) (?:the )?(?:tail|rear) ?lights?/.test(t)))&&!remWords.some(w=>e.re.test(w))&&!items.some(i=>i.name===e.name)&&!(e.name==="Side skirts"&&(state.mods.bodykit||apply.some(a=>a.id==="bodykit")))&&!(e.name==="Carbon mirror caps"&&!/carbon/.test(t)&&EXTRA_PARTS.some(x=>x.name==="Coloured mirror caps"&&x.re.test(t)))&&!(e.name==="Two-tone black roof"&&/seat|leather|alcantara|upholster/.test(t)&&!/roof/.test(t))) {let tx=e.text||(e.name==="Custom graphic wrap"?text.trim().slice(0,160):e.name.toLowerCase()); if(e.name==="LED underglow"||e.name==="LED ambient interior lighting"){const h=colourNear(t,e.name==="LED underglow"?/under ?glow|neon|underbody/:/interior lights?|ambient|led interior/); const c=h&&COLOURS.find(x=>x[1]===h); if(c) tx=c[0]+" "+tx;} tx=cosmeticText(e.name,t)||tx; if(e.name==="Windscreen sun strip"){const w=text.match(/\b(?:saying|that says|says|reading|reads)\s+["'“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,11}?)["'”]?(?=\s*(?:,|\.|!|$|\band\b|\bon\b|\bplease\b))/i); tx='a dark windscreen sun strip with white lettering saying "'+(w?w[1].trim().toUpperCase():"GTI")+'"';} items.push({name:e.name,price:e.price,text:tx});}
  if(!apply.length&&!remove.length&&!removedCustom&&items.length===had.length&&!reset&&!decat&&!hiddenNote.length&&!(switchCar&&switchCar!==state.car)){
    let m=t.match(/\b(?:let'?s do|lets get|can (?:i|you|we) (?:get|have|add|do|fit)|could (?:i|you) (?:get|add)|i'?d like|i would like|give me|chuck on|slap on|throw on|bolt on|add|fit|put on|put|give it|install|i want|want|get me|stick on|do)\s+(?:a |an |some |the |me )?([a-z0-9][a-z0-9 '\-]{2,40}?)(?=\s*(?:,|\.|!|$|\band\b|\bon it\b|\bplease\b))/);
    // A question ("what should i do first", "where do i start") is never a part name (Car #131).
    if(m&&adviceAsked(t)) m=null;
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
/* "is it fast", "is my car quick", "is the golf slow": a speed question, nothing is fitted (Car #128). */
const SPEED_IS=/^\s*(?:is|isn'?t|is not) (?:it|she|this|my car|the car|this car|my \w+|the \w+)(?: \w+)? (?:fast|quick|slow|rapid|nippy|powerful)\b/;
const SPEED_WANT=/\b(?:make|add|fit|give|increase|more|raise|improve|boost|faster|quicker|better|higher|remove|delimit|derestrict|unlimit)\b/;
const LEGAL_Q=/\b(?:road ?legal|legal|illegal|mot|insurance|insurer|insure)\b/;
const ASKING=/\?|^\s*(?:is|are|will|would|does|do|can|could|should|am|what|how|whats|what's)\b/;
const INFO_Q=/^\s*(?:what(?:'s| is| are| does| do)|whats|how (?:does|do)|tell me about|explain)\b/;
/* Advice questions ("should i get a remap", "is a stage 2 remap worth it", "would coilovers suit it", "does a remap void warranty")
   get the same what-it-is answer as INFO_Q; nothing is fitted until the user says "add it". */
const ADVICE_Q=/^\s*(?:should i|shall i|is\b.*\bworth|are .*\bworth|(?:would|will|could)\b.*\b(?:suit|look good|ruin|affect|void|hurt|wreck|be worth)|do(?:es)?\b.*\b(?:ruin|affect|void|suit|hurt|wreck)|(?:what|which)\b.*\bsuits?)\b/;
const WARRANTY_Q=/\bwarrant(?:y|ee)\b/;
const WARRANTY_NOTE="Warranty: if your car is still under the maker's warranty, a remap or suspension change can let the dealer refuse claims on related parts (engine, gearbox, suspension). Looks-only parts like wraps, wheels or tint usually don't affect it. Ask your dealer before you buy.";
function questionReply(low){
  const none={switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  const car=CARS.find(x=>x.id===state.car), mods=state.mods||{}, n=partCount(mods);
  if(SPEED_IS.test(low)||(SPEED_Q.test(low)||SPEED_TOPIC.test(low))&&(ASKING.test(low)||(SPEED_TOPIC.test(low)&&!SPEED_WANT.test(low)))){
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
    // Which Journal guide explains this rule in full (Journal ids in js/data/content.js); anything else -> the MOT guide.
    const GUIDE={tint:"tint",underglow:"underglow",wheels:"wheels",spacers:"wheels",wrap:"wrap",tune:"insurance"};
    if(keys.length) return {reply:[...new Set(keys)].map(k=>RULE[k]).join(" ")+" Tell your insurer about every mod, or a claim can be refused.",guide:GUIDE[keys[0]]||"mot",...none};
    const tips=["Tell your insurer about every mod, or a claim can be refused."];
    if(mods.tint) tips.push("Front side windows must let through at least 70% of light, and the windscreen 75%, so dark front tint can fail the MOT and get you a fine.");
    if(mods.exhaust||/exhaust|loud/.test(low)) tips.push("A loud or decat exhaust can fail the MOT's noise and emissions checks.");
    if(mods.drop) tips.push("Lowered cars are legal, but the tyres mustn't rub and the headlights may need re-aiming.");
    if(mods.tune) tips.push("A remap is legal, but it must be declared to your insurer.");
    if(n&&!mods.tint) tips.push("Nothing else on this build is illegal on its own if it's fitted well.");
    return {reply:(n?"For your build: ":`As standard your ${car.model} is fully road legal. If you add parts: `)+tips.join(" "),guide:/\binsur/.test(low)?"insurance":/\btint/.test(low)?"tint":"mot",...none};
  }
  const warranty=WARRANTY_Q.test(low)&&ASKING.test(low), advice=ADVICE_Q.test(low)||warranty;
  if(!INFO_Q.test(low)&&!advice) return null;
  const warn=warranty?" "+WARRANTY_NOTE:"", warnOnly=warranty?{reply:WARRANTY_NOTE,...none}:null;
  let part=low.replace(/[?]/g," ").replace(/\b(?:what|whats|what's|how|tell|me|about|explain|is|are|does|do|mean|means|meaning|a|an|the|it|they|them|that|this|on|my|car|for|to|work|works|good|actually|exactly|please|pls)\b/g," ");
  if(advice) part=part.replace(/\b(?:should|shall|would|will|could|i|we|get|getting|buy|add|fit|have|go|worth|really|suit|suits|look|looks|ruin|ruins|affect|affects|void|voids|hurt|hurts|wreck|wrecks|warranty|warrantee|ride|handling|which|best|mods?|modding|modifications?|any|of|be|with|its|or|not)\b/g," ");
  part=part.replace(/\s+/g," ").trim();
  if(!part) return warnOnly;
  const p=planParts(part), a=(p.apply||[]).find(x=>x.id!=="custom");
  if(!a) return extraReply(p,part,mods,car)||warnOnly;
  const q=sanitize(a.id,a.params,car), info=modInfo(a.id,q,car);
  if(!info||!info.what) return warnOnly;
  const on=JSON.stringify(mods[a.id])===JSON.stringify(q);
  if(!on) priceAsked=part;
  return {reply:(`${modLabel(a.id,q)}: ${info.what} ${info.effect||""} About £${Math.round(modPrice(a.id,q,car)).toLocaleString("en-GB")} fitted on the ${car.model}.${on?" It's already on your car.":' Say "add it" to try it.'}`+warn).replace(/\s+/g," "),priceQuestion:true,...none};
}
/* Extra parts asked about ("is underglow worth it", "should i get bucket seats", "what is a roll cage"): explain and price them,
   fit nothing until "add it" (Car #126). Uses the Price list wording (EXTRA_SAY in sections.js) when it's loaded. */
function extraReply(p,part,mods,car){
  const c=(p.apply||[]).find(x=>x.id==="custom"), items=((c&&c.params&&c.params.items)||[]).filter(i=>i.price);
  if(!items.length) return null;
  const have=(mods.custom&&mods.custom.items)||[], say=typeof EXTRA_SAY!=="undefined"?EXTRA_SAY:{};
  const off=items.filter(i=>!have.some(x=>x.name===i.name));
  const list=items.map(i=>{const d=String(say[i.name]||i.text||"").replace(/,? visible through the windows/,"").trim(), on=!off.includes(i);
    return `${i.name}: ${d?d[0].toUpperCase()+d.slice(1)+". ":""}About £${Math.round(i.price).toLocaleString("en-GB")} fitted.${on?" It's already on your car.":""}`;}).join(" ");
  const law=items.some(i=>i.name==="LED underglow")?" UK law: on the road it mustn't show red to the front, white to the back, or any blue or flashing light; the safe way is to only switch it on when parked.":"";
  if(off.length) priceAsked=part;
  return {reply:(list+law+(off.length?` Say "add it" to fit ${off.length>1?"them":"it"}.`:"")).replace(/\s+/g," "),priceQuestion:true,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
/* "What mods add value", "will mods affect resale value", "keep its value": a plain answer, nothing fitted (Car #128).
   "good value" / "value for money" are price questions, not this. */
const VALUE_Q=/\bresale\b|\b(?:add|adds|keep|keeps|hold|holds|affect|affects|lower|lowers|ruin|ruins|hurt|hurts|increase|increases|boost|raise|lose|loses|kill|kills)\b.*\bvalue\b/;
const VALUE_NOT=/\b(?:good|best|great|better|cheap) value\b|\bvalue for money\b/;
const VALUE_REPLY="Most mods don't add value: when you sell, dealers and buyers usually pay less for a modified car, and some won't buy one at all. To keep its value, keep the original parts so you can put them back, and pick parts that come off cleanly, like a wrap, wheels or window tint. A remap or body changes are the hardest to sell on. Either way, tell your insurer about every mod.";
/* "softer suspension", "make it comfier", "smoother ride": take a drop off instead of fitting coilovers (Car #133).
   "better mpg", "more economical": a plain answer, nothing fitted. */
const COMFORT_Q=/\b(?:soft(?:er)?|comf(?:ier|y)|(?:more )?comfortable|smoother|plush(?:er)?|less (?:harsh|firm|stiff|bumpy|crashy))(?: \w+)? (?:ride|suspension|setup|springs|dampers|shocks)\b|\bmake (?:it|the car|my car|her) (?:softer|comfier|comfy|more comfortable|smoother|plusher|less (?:harsh|firm|stiff|bumpy))\b|\b(?:quieter|smoother|better|nicer|comfier|softer|plusher) ride\b|\bride (?:comfort|quality)\b|\b(?:too|very|really|so) (?:harsh|stiff|firm|bumpy|crashy)\b/;
const MPG_Q=/\bmpg\b|\b(?:fuel |petrol )?econom(?:y|ical)\b|\bfuel (?:efficien\w*|saving)\b|\b(?:use|uses|using|burn|burns) less (?:fuel|petrol|diesel)\b|\bsave (?:on )?(?:fuel|petrol)\b/;
function comfortReply(low){
  const car=CARS.find(x=>x.id===state.car), mods=state.mods||{}, d=mods.drop, w=mods.wheels;
  const none={switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  if(MPG_Q.test(low)&&!COMFORT_Q.test(low)){
    const worse=[w&&w.size>car.wheel?"bigger wheels":"",d?"the drop":"",mods.widebody?"the wide arches":"",mods.spoiler?"the spoiler":""].filter(Boolean);
    return {reply:`For better mpg, the standard car is hard to beat: keep the ${car.wheel}″ wheels, check the tyre pressures every month, take off roof racks you're not using and drive smoothly.`
      +(car.turbo?` A remap can help a little on a turbo car like the ${car.model}, but most people use the extra power, so it rarely saves fuel.`:` The ${car.model} has no turbo, so a remap won't help much here.`)
      +(worse.length?` On your build, ${worse.join(", ").replace(/, ([^,]*)$/," and $1")} use a bit more fuel.`:"")+" Nothing has been changed.",...none};
  }
  const r=[];
  if(d&&!d.air) r.push(`I've taken the ${d.springs?"lowering springs":"coilovers"} off, so it's back on the standard suspension, the comfiest setup for the road.`);
  else if(d&&d.air) r.push("Air ride can be raised up for a softer ride, so I've left it on.");
  else r.push(`The standard suspension is already the comfiest setup for the ${car.model}, so I haven't fitted anything.`);
  r.push(`Lowering and bigger wheels make the ride firmer${w&&w.size>car.wheel?` (your ${w.size}″ wheels have thinner tyres; the standard ${car.wheel}″ are softer)`:""}.`);
  if(car.id==="golf") r.push("Adaptive dampers (DCC) are a factory option on the Golf GTI that let you pick a Comfort mode.");
  return {reply:r.join(" "),...none,remove:d&&!d.air?["drop"]:[]};
}
/* "change the colour", "new colour", "what colours can i have" with no colour named: list some choices, fit nothing (Car #143).
   Colour on another part ("colour of the wheels", "stitching colour") is left to the normal rules. */
const COLOUR_ASK=/\bcolou?rs?\b|\brespray\b|\bpaint ?job\b/;
const COLOUR_ASK_NOT=/\b(?:badges?|emblems?|wheels?|rims?|alloys?|calipers?|callipers?|seats?|stitching|interior|lights?|underglow|glow|tint|windows?|stripes?|roof|mirrors?|bonnet|belts?|grilles?|kidneys?|wrap|matte|satin|gloss|chrome|carbon)\b|custom-[0-9a-f]{6}/;
function colourAskReply(low){
  if(!COLOUR_ASK.test(low)||COLOUR_ASK_NOT.test(low)||PRICE_Q.test(low)) return null;
  if(COLOURS.some(c=>new RegExp("\\b"+c[0]+"\\b").test(low))) return null;
  const car=CARS.find(x=>x.id===state.car), w=(state.mods||{}).wrap;
  const now=w&&w.colour?`It's ${(w.finish?w.finish+" ":"")+colourName(w.colour).toLowerCase()} now (${w.paint?"a respray":"a wrap"}).`:`It's in the factory ${car.colourName||colourName(car.colour)} now.`;
  return {reply:`${now} Popular UK choices: Nardo grey, white, black, red, blue, British racing green, midnight purple or baby blue, and real factory colours like Kings Red or Estoril Blue work too. Say "paint it nardo grey" for a respray or "wrap it satin black" for a wrap (cheaper, and it peels off). You can also pick one on the Options panel under Paint and wrap. Nothing has been changed.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
/* "all wheel drive", "awd", "4wd", "rear wheel drive": the car's real drive, nothing fitted (Car #144).
   The wheels rule reads any "wheel", so this has to come first. */
const DRIVE_Q=/\b(?:all|four|4|front|rear|two|2)[- ]?wheel[- ]?drive\b|\bwheel[- ]drive\b|\b(?:awd|4wd|4x4|fwd|rwd|2wd|4motion|xdrive|quattro)\b/;
function driveReply(){
  const car=CARS.find(x=>x.id===state.car);
  const say={FWD:"front-wheel drive",RWD:"rear-wheel drive",AWD:"all-wheel drive"}[car.drive]||"front-wheel drive";
  const r=[`The ${car.model} is ${say}.`];
  if(car.id==="golf") r.push("The all-wheel drive Golf is the Golf R (4Motion), a different car from the factory.");
  r.push("Changing which wheels are driven isn't a bolt-on mod: it means a new gearbox, driveshafts, rear axle and floor, so it's cheaper to buy a car that already has it.");
  if(car.drive==="FWD") r.push(`For more grip out of corners, ${car.id==="golf"?'a limited slip diff helps (say "add an lsd")':"good tyres help most"}, and coilovers or anti-roll bars make it sharper.`);
  r.push("Nothing has been changed.");
  return {reply:r.join(" "),switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
/* "make it handle better", "more grip", "corner better": fit coilovers and anti-roll bars and say why (Car #129).
   Only when the normal rules find no part, so "lower it for better handling" works as before; questions are left to the advice rules. */
const HANDLE_Q=/\bhandl(?:e|es|ing)\b.*\b(?:better|sharper|nicer|well|properly)\b|\b(?:better|sharper|improved?|improve|more|tighter) handling\b|\bimprove (?:the |its |my )?handling\b|\b(?:more|better|extra) (?:grip|traction)\b|\bgrip(?:s|py)? better\b|\bcorner(?:s|ing)? (?:better|faster|flatter|harder|sharper|quicker)\b|\b(?:faster|better|quicker) (?:in|through|round|around) (?:the )?(?:corners|bends)\b|\bless (?:body )?roll\b|\bgo ?-?kart\b/;
function handlingReply(text,low){
  if(!HANDLE_Q.test(low)||PRICE_Q.test(low)||ADVICE_Q.test(low)||INFO_Q.test(low)) return null;
  if((planParts(text).apply||[]).length) return null;
  const car=CARS.find(x=>x.id===state.car), mods=state.mods||{}, d=mods.drop;
  const arb=((mods.custom&&mods.custom.items)||[]).some(i=>i.name==="Uprated anti-roll bars");
  const p=planParts(d?"add anti roll bars":"coilovers and add anti roll bars");
  if(arb) p.apply=(p.apply||[]).filter(a=>a.id!=="custom");
  const fit=[d?"":"coilovers (−30mm)",arb?"":"uprated anti-roll bars"].filter(Boolean);
  const r=[fit.length?`For sharper handling I've fitted ${fit.join(" and ")}: less body roll and quicker steering.`:"Your build already has the handling parts I'd pick first."];
  if(d&&fit.length) r.push(`I've kept your ${d.air?"air ride":d.springs?"lowering springs":"coilovers"} as they are.`);
  r.push("Good tyres matter most: a set of performance tyres is the biggest grip upgrade on any car.");
  r.push(car.id==="golf"?'Next step on the Golf: a limited slip diff for grip out of corners (say "add an lsd").':'A strut brace and a wheel alignment are good next steps (say "add a strut brace").');
  return {...p,reply:r.join(" ")};
}
/* Practical "can i get it on finance", "can i fit it myself", "where can i get it done", "how long does it take to fit",
   "is it diy": a plain answer, nothing fitted (Car #149). Before, "it on finance" / "it myself" became blank custom parts. */
const PRACTICAL_FIN=/\bfinance\b|\bpay (?:monthly|in instal?ments)\b|\bmonthly payments?\b|\bklarna\b|\bpaypal credit\b|\bspread the cost\b/;
const PRACTICAL_CHEAP=/\b(?:get|do|make|have) (?:it|this|that|them|my mods|the mods|the parts) (?:done |fitted )?cheaper\b|\bcheaper way\b|\bsave (?:some )?money on (?:it|this|mods|parts|my build)\b/;
const PRACTICAL_DELIVER=/\b(?:get|have) (?:it|this|that|them|the parts?) (?:delivered|posted|shipped)\b|\b(?:do|can) you (?:deliver|ship|post)\b|\bdelivery\b/;
const PRACTICAL_DIY=/\bmyself\b|\bdiy\b|\bat home\b|\bself[- ]fit\b|\bon my (?:own|drive)\b/;
const PRACTICAL_WHERE=/\bwhere (?:can|do|should|would|could) (?:i|you|we) (?:get|have|take)\b.*\b(?:done|fitted|installed|sorted|it|them)\b|\bwho (?:can|could|should|would) (?:fit|install|do)\b|\bfind a (?:garage|fitter|specialist|tuner)\b/;
const PRACTICAL_TIME=/\bhow long\b(?!.*(?:\b0-?6[02]\b|\b6[02] ?mph\b|\b0 to 6[02]\b))|\b(?:do|done|fit|fitted) (?:it|this|that|them|everything|the lot)? ?in (?:a|one) (?:day|weekend|morning|afternoon)\b|\bhow (?:quick|quickly|fast) can (?:you|they|i|it) (?:fit|do|be)\b/;
// [words, name, fitting time, who fits it, DIY advice, what to say to try it]
const PRACTICAL_PARTS=[
  [/\bremap|\btune\b|\bstage ?[123]\b|\becu\b/,"A remap","about an hour","a tuner","It isn't DIY: the tuner uses their own software.","add a remap"],
  [/\bwheels?\b|\brims?\b|\balloys?\b|\btyres?\b/,"New wheels and tyres","about an hour","a tyre shop","Leave it to a tyre shop: new tyres need fitting and balancing.","new wheels"],
  [/\btint\b|\bwindows?\b/,"Window tint","2 to 3 hours","a tint shop","Leave it to a tint shop: the film is hard to get on bubble-free.","dark windows"],
  [/\bcoilovers?\b|\bsprings?\b|\bsuspension\b|\blower(?:ed|ing)?\b|\bdrop\b|\bair ride\b/,"Coilovers or lowering springs","about half a day, plus a wheel alignment","a garage","Leave it to a garage: springs are under huge force and it needs an alignment after.","lower it"],
  [/\bexhaust\b|\bcat ?back\b|\bdownpipe\b|\btips?\b/,"A cat-back exhaust","1 to 2 hours","a garage with a ramp","Best at a garage: old bolts are often seized.","louder exhaust"],
  [/\bbrakes?\b|\bcalipers?\b|\bbbk\b/,"Big brakes","about half a day","a garage","Leave it to a garage: brakes are a safety part.","bigger brakes"],
  [/\bwrap\b/,"A full wrap","2 to 4 days","a wrap shop","It's a wrap-shop job; small bits like the roof or mirrors are possible at home with practice.","wrap it satin black"],
  [/\brespray\b|\bpaint\b/,"A respray","1 to 2 weeks","a bodyshop","It isn't DIY: it needs a paint booth.","paint it nardo grey"],
  [/\bspoiler\b|\bwing\b|\blip\b|\bsplitter\b|\bskirts?\b|\bdiffuser\b|\baero\b|\bbody ?kit\b|\bbonnet\b|\bwidebody\b|\barches\b/,"Body and aero parts","a few hours (a widebody takes 1 to 2 weeks)","a bodyshop","Some just bolt on, but most need drilling or paint matching, so a bodyshop is safer.","big spoiler"],
  [/\bintake\b|\binduction\b|\bair filter\b/,"An intake","about an hour","a garage","It's one of the easier DIY jobs with basic tools.","add an intake"],
  [/\bunderglow\b|\bleds?\b|\blights?\b|\bheadlights?\b/,"LED lights","1 to 3 hours","an auto electrician","An auto electrician is safest for the wiring.","underglow"],
  [/\bmirror caps?\b|\bgear knob\b|\bfloor mats?\b|\bbadges?\b|\bdebadge\b|\bseat covers?\b|\btrim\b/,"Small trim parts (mirror caps, mats, badges)","under an hour","home or any garage","They're easy to do yourself.",""]
];
function practicalReply(low){
  const fin=PRACTICAL_FIN.test(low), cheap=PRACTICAL_CHEAP.test(low), del=PRACTICAL_DELIVER.test(low), diy=PRACTICAL_DIY.test(low), where=PRACTICAL_WHERE.test(low), time=PRACTICAL_TIME.test(low);
  if(!(fin||cheap||del||diy||where||time)) return null;
  const car=CARS.find(x=>x.id===state.car), r=[];
  const named=PRACTICAL_PARTS.filter(p=>p[0].test(low));
  if(fin) r.push("Finance depends on who sells or fits the parts: many UK tuners, wheel and tyre shops offer pay-monthly (sometimes 0%), so ask them. Check the interest rate first, and remember a modified car can cost more to insure.");
  if(cheap) r.push("To spend less: get two or three quotes, look at good used parts (wheels especially), use a mobile fitter for tint or wheels, and do small trim bits yourself.");
  if(del) r.push("This site doesn't sell parts; the part cards on the Build page link to UK sellers, and most deliver in a few days. Bigger jobs still need a garage to fit them.");
  if(named.length&&(diy||time)){
    for(const p of named) r.push((time?`Fitting ${p[1][0].toLowerCase()+p[1].slice(1)} takes ${p[2]}, at ${p[3]}.`:p[1]+"?")+(diy?" "+p[4]:""));
  } else {
    if(time) r.push("Rough fitting times: a remap or new wheels about an hour, window tint 2 to 3 hours, coilovers or an exhaust half a day, a wrap 2 to 4 days, a respray 1 to 2 weeks. A typical first build of wheels, a drop and tint can be done in a day or two.");
    if(diy) r.push(`As a beginner, small trim parts (mirror caps, mats, badges) and an intake are fine to do yourself. Leave suspension, brakes, exhausts, tint, wraps and remaps to a garage or specialist: they need special tools, and some are safety parts.`);
  }
  if(where) r.push(`For fitting, an independent ${car.make==="Volkswagen"?"VW":car.make} specialist or performance garage near you is usually best; use a tint or wrap shop for those, and a tuner with a rolling road for a remap. Read reviews and ask to see cars they've done.`);
  r.push("The Price list shows what each part costs fitted. Nothing has been changed.");
  if(named.length===1&&named[0][5]&&(diy||time)) r.push(`Say "${named[0][5]}" to try it on.`);
  return {reply:r.join(" "),switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
/* "What's on my car", "what have i got", "list my parts", "show my build", "total cost": name the fitted parts, then the total (Car #130). */
const FITTED_Q=/\bwhat(?:'s| is|s)? (?:on|fitted (?:to|on)) (?:my|the|this) (?:car|golf|fiesta|bmw|build)\b|\bwhat(?:'s| is|s)? on (?:it|her)(?: now| so far)?\s*\??\s*$|\bwhat (?:have|has) (?:i|it) got\b(?! to\b)|\bwhat (?:mods|parts) (?:have i|do i have|are on|are fitted|has it|is it)\b|\bwhat(?:'s| is|s| has| have)? (?:been )?fitted\b|\blist (?:my|the|all (?:of )?(?:my|the)) (?:parts|mods|build)\b|\bshow (?:me )?(?:my|the) (?:build|parts|mods)\b|\btotal (?:cost|price)\b(?! (?:of|for) (?!my\b|the build\b|it\b))|\bwhat(?:'s| is|s) the total\b/;
/* "how much is insurance", "what insurance group is it", "will mods put my insurance up": the car's UK group and plain tips, nothing fitted (Car #179). */
const INSURE_Q=/\binsur(?:e|ed|ance|er|ers|ing)\b/;
const INSURE_ASK=/\bhow much\b|\bgroups?\b|\bgo(?:es)? up\b|\bputs? (?:\w+ ){0,3}up\b|\bcosts?\b|\bprices?\b|\bpricey\b|\bexpensive\b|\bcheap(?:er|est)?\b|\bdear\b|\bpremiums?\b|\bquotes?\b|\braise\b|\bincrease\b|\bhigher\b|\brise\b/;
function insuranceReply(){
  const car=CARS.find(x=>x.id===state.car), n=partCount(state.mods||{}), g=car.insuranceGroup;
  const band=!g?"":g<=10?" (a low group, one of the cheaper cars to insure, which is why it's a popular first car)":g<=30?" (a middle group)":g<=40?" (a high group, so expect a big quote if you're a young or new driver)":" (a very high group, so expect a big quote if you're a young or new driver)";
  const grp=g?`The ${car.model} is around insurance group ${g} out of 50${band}.`:`Insurance groups run from 1 to 50; check the ${car.model}'s group on a comparison site.`;
  return {reply:`${grp} Every mod must be declared to your insurer, or a claim can be refused. Power (a remap) and wheels or body kits put the price up most; tint and interior parts the least.${n?` Your build has ${n} part${n>1?"s":""}, so list ${n>1?"them all":"it"} when you get a quote.`:""} Get quotes with your mods listed before you buy any parts.`,guide:"insurance",switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
function buildReply(){
  const money=v=>"£"+Math.round(v).toLocaleString("en-GB");
  const cur=CARS.find(x=>x.id===state.car), bc=buildCost(cur,state.mods), n=partCount(state.mods);
  if(!n) return {reply:`Your ${cur.model} is still standard: about ${money(cur.price)} ${cur.used?"used":"new"}, with no parts added yet. Ask "how much is a remap" (or any part) to see its price.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  const names=Object.keys(state.mods).flatMap(id=>id==="custom"?((state.mods.custom&&state.mods.custom.items)||[]).map(i=>i.name):[modLabel(id,state.mods[id])]).filter(Boolean);
  const shown=names.slice(0,6).join("; ")+(names.length>6?` and ${names.length-6} more`:"");
  return {reply:`On your ${cur.model}: ${shown}. The car is about ${money(cur.price)} ${cur.used?"used":"new"}, plus ${money(bc)} for ${n} part${n>1?"s":""} with fitting, so about ${money(cur.price+bc)} in total. The Price list page shows what each part costs.`,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
}
function localPlan(text){
  // Your own colour: "#ff8800" is read as the colour name "custom-ff8800" (see registerCustomColours).
  text=String(text).replace(/#([0-9a-f]{6})\b/gi,(m,h)=>"custom-"+h.toLowerCase()); registerCustomColours(text);
  // priceAsked is cleared by applyPlan (chat.js) on the next real message, so behind-the-scenes checks can't wipe it.
  const low=" "+fixTypos(String(text).toLowerCase())+" ";
  if(priceAsked&&ADD_IT.test(low)){const asked=priceAsked; priceAsked=null; return planParts(asked);}
  if(FITTED_Q.test(low)) return buildReply();
  if(INSURE_Q.test(low)&&INSURE_ASK.test(low)) return insuranceReply();
  if(DRIVE_Q.test(low)&&!PRICE_Q.test(low)) return driveReply();
  if(VALUE_Q.test(low)&&!VALUE_NOT.test(low)) return {reply:VALUE_REPLY,switchCar:null,reset:false,apply:[],remove:[],notes:{}};
  if((COMFORT_Q.test(low)||MPG_Q.test(low))&&!PRICE_Q.test(low)) return comfortReply(low);
  {const c=colourAskReply(low); if(c) return c;}
  {const h=handlingReply(text,low); if(h) return h;}
  if(!PRICE_Q.test(low)){const pr=practicalReply(low); if(pr) return pr;}
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
  return buildReply();
}

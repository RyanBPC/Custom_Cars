/* Fills in the garage, price list and journal sections. */
"use strict";
/* ---------- garage ---------- */
// A car with a picture shows it with a tag ("AI picture" for Gemini photos, "3D model" for captures of the 3D view); others keep the drawing.
const garageArt=c=>c.photo?`<img src="${c.photo}" alt="${c.photoAlt||c.make+" "+c.model}" width="800" height="447" loading="lazy" decoding="async"><span class="ai-tag" aria-hidden="true">${c.photoTag||"AI picture"}</span>`:carSVG(c,{},{uid:"g"+c.id});
let garageBrand="all";
const garageCard=c=>`<article class="card"><div class="art${c.photo?" photo":""}">${garageArt(c)}</div><div class="body">
<div class="name"><b>${c.make} ${c.model}</b><span>${c.gen}</span></div>
<div class="kv"><div><small>Power</small><b>${c.hp}</b> bhp</div><div><small>Torque</small><b>${c.nm}</b> Nm</div><div><small>0–62</small><b>${c.t62.toFixed(1)}</b> s</div></div>
<p class="m3d${c.model3d?" on":""}">${c.model3d?"Full 3D model in the studio":"3D: simple stand-in shape for now (no full model yet)"}</p>
<p class="d">${c.blurb} ${c.engine}, ${c.drive}.</p>
<div class="row"><span class="price">${c.used?"Used from about":"From"} <b>${fmt(c.price)}</b></span><button class="btn sm primary" type="button" data-custom="${c.id}" aria-label="Customise the ${c.make} ${c.model}">Customise</button><a class="btn sm" href="${forSaleUrl(c)}" target="_blank" rel="noopener" aria-label="${c.make} ${c.model} for sale on AutoTrader (opens a new tab)">For sale ↗</a></div>
</div></article>`;
function renderGarage(){
  const tab=(id,label,n)=>`<button type="button" data-brand="${id}" aria-pressed="${garageBrand===id}">${label} <small>${n}</small></button>`;
  $("garageBrands").innerHTML=tab("all","All brands",CARS.length)+BRANDS.map(b=>tab(b,b,carsOf(b).length)).join("");
  // One grid, cars side by side (sorted by brand), rather than a stacked section per brand; the brand tabs above filter it.
  const shown=BRANDS.filter(b=>garageBrand==="all"||b===garageBrand);
  const list=shown.flatMap(b=>carsOf(b)),by=garageSortBy[garageSort];
  if(by)list.sort((a,b)=>by(a)-by(b));
  $("garageGrid").innerHTML=`<div class="grid garage-all">${list.map(garageCard).join("")}</div>`;
}
// "Sort by" next to the brand tabs (Website #156). Brand keeps the normal order; kept for this visit only.
let garageSort="brand";
const garageSortBy={price:c=>c.price,hp:c=>-c.hp,t62:c=>c.t62};
const garageSortLabel={brand:"brand",price:"price, cheapest first",hp:"power, most powerful first",t62:"0-62, quickest first"};
$("garageSort").addEventListener("change",e=>{garageSort=e.target.value in garageSortLabel?e.target.value:"brand";renderGarage();
  $("garageCount").textContent=`Sorted by ${garageSortLabel[garageSort]}`;});
// The tabs are rebuilt on every click, so put focus back on the pressed one and say how many cars are shown (for keyboard and screen-reader users).
$("garageBrands").addEventListener("click",e=>{const b=e.target.closest("[data-brand]");if(!b)return;garageBrand=b.dataset.brand;renderGarage();
  const t=$("garageBrands").querySelector(`[data-brand="${CSS.escape(garageBrand)}"]`);if(t)t.focus();
  const n=garageBrand==="all"?CARS.length:carsOf(garageBrand).length;$("garageCount").textContent=`Showing ${n} ${garageBrand==="all"?"":garageBrand+" "}${n===1?"car":"cars"}`;});
renderGarage();
$("garageGrid").addEventListener("click",e=>{const b=e.target.closest("[data-custom]");if(b){switchCar(b.dataset.custom,true);goTab("build");}});

/* Each price-list row can be tried on the 3D car: the phrase is sent to the chat parser, like typing it. */
const TRY_PHRASE={"Stage 1 remap":"stage 1 remap","Stage 2 package":"stage 2 tune","Stage 3 / big turbo or supercharger":"stage 3","Cold-air intake":"cold air intake","Valved cat-back exhaust":"valved exhaust","Flow-formed wheels (set of 4)":"19 inch multi-spoke wheels","Forged wheels (set of 4)":"forged wheels","Coilovers":"coilovers","Big brake kit":"big brake kit","Aero kit":"aero kit","Widebody arches":"widebody arches","Spoiler":"ducktail spoiler","Full vinyl wrap":"satin black wrap","Racing stripes":"racing stripes","Window tint":"window tint","Smoked lights":"smoked lights","Chrome delete":"chrome delete","Gloss black grille":"gloss black grille","Body-colour grille":"body coloured grille","Gloss black mirror caps":"gloss black mirror caps","Two-tone black roof":"two-tone black roof","Ceramic coating":"ceramic coating","Paint protection film":"paint protection film",
  // Extra parts whose own name the chat doesn't understand (Website #215). "uprated clutch" only fits manual cars, so the button hides on DSG/auto cars.
  "Coloured seat belts":"red seat belts","Private number plate":"private plate","Halo headlights":"halo lights","All-terrain tyres":"all terrain tyres","Side-exit exhaust":"side exit exhaust","Uprated clutch":"uprated clutch","Carbon-fibre bonnet":"carbon bonnet","Coloured mirror caps":"red mirror caps","Custom graphic wrap":"camo wrap"};
// Only offer the button when the parser really fits a catalogue part (or a named extra part) for that phrase.
const canTry=name=>{const ph=TRY_PHRASE[name];if(!ph)return false;try{return localPlan(ph).apply.some(a=>a.id!=="custom"||(a.params&&a.params.items||[]).some(it=>EXTRA_PARTS.some(x=>x.name===it.name)));}catch(e){return false;}};
const tryBtn=name=>canTry(name)?`<button class="btn sm try" type="button" data-try="${name}" aria-label="Try ${name} on the car">Try it on the car</button>`:"";
// Rows whose part is already on your car get an "On your car" tag instead of the Try button.
// The parser skips parts you already have, so ask it as if the car were stock (cached per car).
const stockPlans={};
const stockPlan=ph=>{const k=state.car+"|"+ph;if(!(k in stockPlans)){const m=state.mods;state.mods={};try{stockPlans[k]=localPlan(ph).apply;}catch(e){stockPlans[k]=[];}finally{state.mods=m;}}return stockPlans[k];};
const onCar=name=>{if(extraOnly(name))return ((state.mods.custom||{}).items||[]).some(x=>x.name===name);const ph=TRY_PHRASE[name];if(!ph)return false;const ap=stockPlan(ph);
  const need=[];ap.forEach(a=>{if(a.id==="custom"){(a.params&&a.params.items||[]).forEach(it=>{if(EXTRA_PARTS.some(x=>x.name===it.name))need.push(()=>((state.mods.custom||{}).items||[]).some(x=>x.name===it.name));});}
    else need.push(()=>{const m=state.mods[a.id];if(!m)return false;if(a.id==="wheels")return (m.style==="monoblock")===(a.params.style==="monoblock"); // forged vs flow-formed row
      return !(a.params&&a.params.stage!=null)||+m.stage===+a.params.stage;});});
  return need.length>0&&need.every(f=>f());};
// Extra parts (EXTRA_PARTS) get their own group, leaving out ones the rows above already cover.
// Their Try button sends the part's own name to the chat, and only shows when that really fits the part.
const EXTRA_SAY={"Windscreen sun strip":"A dark strip across the top of the windscreen with white lettering","Sport steering wheel":"A thicker, flat-bottomed sports steering wheel","Private number plate":"Your own registration on the plates (the DVLA charges extra for the number)","Sound system upgrade":"Better speakers and a subwoofer","Short shifter":"Shorter, quicker gear changes","Dash cam":"Front camera that records the road","Custom graphic wrap":"Your own printed design, like flames or camo","LED ambient interior lighting":"Coloured LED strips inside the cabin"};
const extraOnly=name=>!PRICE_ROWS.some(([,rs])=>rs.some(r=>r[0]===name))&&EXTRA_PARTS.some(e=>e.name===name);
const extraRows=()=>{const have=new Set(PRICE_ROWS.flatMap(([,rs])=>rs.map(r=>r[0])).concat(["Chrome delete and black badges"]));
  return EXTRA_PARTS.filter(e=>!have.has(e.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>{const t=(EXTRA_SAY[e.name]||e.text||"").replace(/,? visible through the windows/,""); // drop the AI-photo wording
    if(!(e.name in TRY_PHRASE)){const ph=e.name.toLowerCase();const ok=stockPlan(ph).some(a=>a.id==="custom"&&((a.params&&a.params.items)||[]).some(it=>it.name===e.name));TRY_PHRASE[e.name]=ok?ph:"";}
    return [e.name,t?t[0].toUpperCase()+t.slice(1):"","£"+e.price.toLocaleString("en-GB")];});};
// Split the extra parts into a few small groups so a beginner can find the lights or the interior parts. First match wins.
const EXTRA_GROUPS=[["Extra parts: inside the car",/seat|steering|harness|shifter|shift light|pedal|boost gauge|sound system|interior|roll cage|dashboard|floor mat/i],
  ["Extra parts: practical and legal",/tow|plate|dash cam|roof rack|mud flap|visor|bull bar|protection film|ceramic/i],
  ["Extra parts: lights",/light(?!weight)|underglow|indicator|eyelid|halo/i],
  ["Extra parts: engine, wheels and handling",/intercooler|flywheel|spare|clutch|exhaust|tips|spacer|refurb|lift kit|tyres|camber|snorkel|wheel finish|strut|diff|anti-roll|catch can|oil cooler|caliper|cent(re|er) cap|white letters/i],
  ["Extra parts: outside",/bonnet|vent|canard|sun strip|decal|grille|mirror|scoop|louvre|roof|wrap|numbers|skirt|window trim/i]];
const extraGroups=()=>{const rows=extraRows(),out=EXTRA_GROUPS.map(([g])=>[g,[]]),other=[];
  rows.forEach(r=>{const i=EXTRA_GROUPS.findIndex(([,re])=>re.test(r[0]));(i<0?other:out[i][1]).push(r);});
  if(other.length)out.push(["Other extras",other]);return out.filter(([,rs])=>rs.length);};
// Price list search (Website #214): everyday words find the list's words ("rims" finds wheels, "lowering" finds coilovers),
// and small typos are fixed by the chat's typo fixer ("exhust" finds exhaust). The typed text itself still matches as before.
const PRICE_SYN={rims:["wheel"],rim:["wheel"],alloys:["wheel"],alloy:["wheel"],lowering:["coilover","spring","lower"],lowered:["coilover","spring","lower"],lower:["coilover","spring"],drop:["coilover","spring"],slammed:["coilover","spring","air ride"],slam:["coilover","spring"],
  bodykit:["aero","skirt","widebody","splitter"],"body kit":["aero","skirt","widebody","splitter"],tune:["stage","remap"],tuning:["stage","remap"],remap:["stage"],chip:["stage","remap"],power:["stage","intake","turbo"],faster:["stage","intake"],
  loud:["exhaust"],louder:["exhaust"],pops:["exhaust"],brakes:["brake"],tints:["tint"],tinted:["tint"],windows:["tint"],wing:["spoiler"],paint:["wrap","colour"],respray:["wrap","colour"],suspension:["coilover","spring"],tyres:["tyre"],tires:["tyre"]};
const priceTerms=q=>{if(!q)return[];const out=new Set([q]);let f=q;try{if(typeof fixTypos==="function")f=fixTypos(q);}catch(e){}out.add(f);
  [q,f].forEach(s=>{(PRICE_SYN[s]||[]).forEach(t=>out.add(t));s.split(/\s+/).forEach(w=>(PRICE_SYN[w]||[]).forEach(t=>out.add(t)));});
  return [...out].filter(t=>t.length>1);};
function renderPrices(){
  const c=car(),n=partCount(state.mods);
  $("priceBuild").innerHTML=n?`Your build so far on the ${c.make} ${c.model}: <b>${fmt(buildCost(c,state.mods))}</b> in parts and fitting (${n} ${n===1?"part":"parts"}). <a href="#build">See it in the Build tab →</a>`:`Nothing fitted yet. Press "Try it on the car" on any row to see it on the 3D car.`;
  const row=r=>{const on=onCar(r[0]);return `<tr${on?' class="fitted"':""}><td>${r[0]}${on?'<span class="oncar">On your car</span>':tryBtn(r[0])}</td><td class="muted">${r[1]}</td><td class="p">${r[2]}</td></tr>`;};
  // Category tabs above the table, so it shows one group at a time ("All" shows the whole list).
  const groups=PRICE_ROWS.concat(extraGroups()),label=c=>({"Extra parts: inside the car":"Extras: interior","Extra parts: practical and legal":"Extras: practical","Extra parts: lights":"Extras: lights","Extra parts: engine, wheels and handling":"Extras: mechanical","Extra parts: outside":"Extras: outside","Trim & protection":"Trim & care"})[c]||c;
  if(priceCat!=="All"&&!groups.some(([c])=>c===priceCat))priceCat=groups[0][0];
  // Each tab gets an id and points at the table panel, which is labelled by whichever tab is chosen (screen readers).
  const tab=(id,txt,n,i)=>`<button type="button" role="tab" id="pcat-${i}" aria-controls="pricePanel" data-pcat="${id}" aria-selected="${priceCat===id}" tabindex="${priceCat===id?0:-1}">${txt}${n?` <small>${n}</small>`:""}</button>`;
  $("priceCats").innerHTML=groups.map(([c,rs],i)=>tab(c,label(c),rs.filter(r=>onCar(r[0])).length,i)).join("")+tab("All","All",0,groups.length);
  const selTab=$("priceCats").querySelector('[aria-selected="true"]');if(selTab)$("pricePanel").setAttribute("aria-labelledby",selTab.id);
  // While the search box has text, show matching rows from every group (name or "What you get"), ignoring the chosen tab.
  const q=($("priceSearch").value||"").trim().toLowerCase(),plain=t=>String(t).replace(/<[^>]*>/g,"").toLowerCase();
  const terms=priceTerms(q),hit=r=>terms.some(t=>plain(r[0]).includes(t)||plain(r[1]).includes(t));
  const shown=q?groups.map(([cat,rows])=>[cat,rows.filter(hit)]).filter(([,rs])=>rs.length):groups.filter(([cat])=>priceCat==="All"||cat===priceCat);
  const hits=shown.reduce((n,[,rs])=>n+rs.length,0);
  $("priceTable").innerHTML=`<thead><tr><th>Upgrade</th><th>What you get</th><th>Fitted price</th></tr></thead><tbody>`+(q&&!hits?`<tr><td colspan="3" class="none">No parts match. Try a simpler word like wheels or tint.</td></tr>`:shown.map(([cat,rows])=>`<tr class="cat"><th colspan="3" scope="colgroup">${cat}</th></tr>`+rows.map(row).join("")).join(""))+`</tbody>`;
  $("priceCount").textContent=q?(hits?`${hits} ${hits===1?"part matches":"parts match"} "${q}"`:"No parts match"):"";
}
let priceCat=PRICE_ROWS[0][0];
$("priceCats").addEventListener("click",e=>{const b=e.target.closest("[data-pcat]");if(!b)return;priceCat=b.dataset.pcat;renderPrices();const a=$("priceCats").querySelector(`[data-pcat="${CSS.escape(priceCat)}"]`);if(a)a.focus();});
$("priceCats").addEventListener("keydown",e=>{const t=e.target.closest("[data-pcat]");if(!t||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
  const all=[...$("priceCats").querySelectorAll("[data-pcat]")],i=all.indexOf(t),n=e.key==="Home"?0:e.key==="End"?all.length-1:(i+(e.key==="ArrowRight"?1:-1)+all.length)%all.length;e.preventDefault();all[n].click();});
$("priceSearch").addEventListener("input",renderPrices);
renderPrices();
window.addEventListener("hashchange",()=>{if(location.hash==="#prices")renderPrices();});
$("priceTable").addEventListener("click",e=>{const b=e.target.closest("[data-try]");if(!b)return;const ph=TRY_PHRASE[b.dataset.try];if(!ph)return;
  if(typeof hideAi3d==="function") hideAi3d();
  goTab("build"); applyPlan(localPlan(ph),ph);});

// Articles with a try phrase end with a button that fits that mod on the 3D car (same path as the price list).
const postTry=p=>{if(!p.try)return"";try{if(!localPlan(p.try).apply.length)return"";}catch(e){return"";}return`<p><button class="btn sm try" type="button" data-try-phrase="${p.try}" aria-label="Try ${p.try} on the car">Try ${p.try} on the car</button></p>`;};
/* Each article: the title is a real heading (so screen readers can jump between articles), and only "Read article" is the
   open/close button. Clicking the title or intro still opens it for mouse users. #journal/<id> links open the <details>. */
$("posts").innerHTML=POSTS.map((p,i)=>`<article class="post" aria-labelledby="post-t${i}"><span class="meta">${p.m}</span><h2 class="sub" id="post-t${i}">${p.t}</h2><p class="intro">${p.s}</p><details${p.id?` id="guide-${p.id}"`:""}><summary class="more"><span class="more-open">Read article<span class="visually-hidden">: ${p.t}</span> →</span><span class="more-close">Close article<span class="visually-hidden">: ${p.t}</span></span></summary><div class="content">${p.c}${postTry(p)}</div></details></article>`).join("");
$("posts").addEventListener("click",e=>{const h=e.target.closest(".post>h2, .post>.intro, .post>.meta");if(!h||getSelection().toString())return;const d=h.parentNode.querySelector("details");if(d)d.open=!d.open;});
$("posts").addEventListener("click",e=>{const b=e.target.closest("[data-try-phrase]");if(!b)return;const ph=b.dataset.tryPhrase;
  if(typeof hideAi3d==="function") hideAi3d();
  goTab("build"); applyPlan(localPlan(ph),ph);});

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
  $("garageGrid").innerHTML=BRANDS.filter(b=>garageBrand==="all"||b===garageBrand).map(b=>
    `<section class="brand-group" aria-label="${b}"><h2 class="sub">${b} <small>${carsOf(b).length} ${carsOf(b).length===1?"model":"models"}</small></h2><div class="grid">${carsOf(b).map(garageCard).join("")}</div></section>`).join("");
}
$("garageBrands").addEventListener("click",e=>{const b=e.target.closest("[data-brand]");if(b){garageBrand=b.dataset.brand;renderGarage();}});
renderGarage();
$("garageGrid").addEventListener("click",e=>{const b=e.target.closest("[data-custom]");if(b){switchCar(b.dataset.custom,true);goTab("build");}});

/* Each price-list row can be tried on the 3D car: the phrase is sent to the chat parser, like typing it. */
const TRY_PHRASE={"Stage 1 remap":"stage 1 remap","Stage 2 package":"stage 2 tune","Stage 3 / big turbo or supercharger":"stage 3","Cold-air intake":"cold air intake","Valved cat-back exhaust":"valved exhaust","Flow-formed wheels (set of 4)":"19 inch multi-spoke wheels","Forged wheels (set of 4)":"forged wheels","Coilovers":"coilovers","Big brake kit":"big brake kit","Aero kit":"aero kit","Widebody arches":"widebody arches","Spoiler":"ducktail spoiler","Full vinyl wrap":"satin black wrap","Racing stripes":"racing stripes","Window tint":"window tint","Smoked lights":"smoked lights","Chrome delete":"chrome delete","Gloss black grille":"gloss black grille","Gloss black mirror caps":"gloss black mirror caps","Two-tone black roof":"two-tone black roof","Ceramic coating":"ceramic coating","Paint protection film":"paint protection film"};
// Only offer the button when the parser really fits a catalogue part (or a named extra part) for that phrase.
const canTry=name=>{const ph=TRY_PHRASE[name];if(!ph)return false;try{return localPlan(ph).apply.some(a=>a.id!=="custom"||(a.params&&a.params.items||[]).some(it=>EXTRA_PARTS.some(x=>x.name===it.name)));}catch(e){return false;}};
const tryBtn=name=>canTry(name)?`<button class="btn sm try" type="button" data-try="${name}" aria-label="Try ${name} on the car">Try it on the car</button>`:"";
// Rows whose part is already on your car get an "On your car" tag instead of the Try button.
// The parser skips parts you already have, so ask it as if the car were stock (cached per car).
const stockPlans={};
const stockPlan=ph=>{const k=state.car+"|"+ph;if(!(k in stockPlans)){const m=state.mods;state.mods={};try{stockPlans[k]=localPlan(ph).apply;}catch(e){stockPlans[k]=[];}finally{state.mods=m;}}return stockPlans[k];};
const onCar=name=>{const ph=TRY_PHRASE[name];if(!ph)return false;const ap=stockPlan(ph);
  const need=[];ap.forEach(a=>{if(a.id==="custom"){(a.params&&a.params.items||[]).forEach(it=>{if(EXTRA_PARTS.some(x=>x.name===it.name))need.push(()=>((state.mods.custom||{}).items||[]).some(x=>x.name===it.name));});}
    else need.push(()=>{const m=state.mods[a.id];if(!m)return false;if(a.id==="wheels")return (m.style==="monoblock")===(a.params.style==="monoblock"); // forged vs flow-formed row
      return !(a.params&&a.params.stage!=null)||+m.stage===+a.params.stage;});});
  return need.length>0&&need.every(f=>f());};
function renderPrices(){
  const c=car(),n=partCount(state.mods);
  $("priceBuild").innerHTML=n?`Your build so far on the ${c.make} ${c.model}: <b>${fmt(buildCost(c,state.mods))}</b> in parts and fitting (${n} ${n===1?"part":"parts"}). <a href="#build">See it in the Build tab →</a>`:`Nothing fitted yet. Press "Try it on the car" on any row to see it on the 3D car.`;
  $("priceTable").innerHTML=`<thead><tr><th>Upgrade</th><th>What you get</th><th>Fitted price</th></tr></thead><tbody>`+PRICE_ROWS.map(([cat,rows])=>`<tr class="cat"><th colspan="3" scope="colgroup">${cat}</th></tr>`+rows.map(r=>{const on=onCar(r[0]);return `<tr${on?' class="fitted"':""}><td>${r[0]}${on?'<span class="oncar">On your car</span>':tryBtn(r[0])}</td><td class="muted">${r[1]}</td><td class="p">${r[2]}</td></tr>`;}).join("")).join("")+`</tbody>`;
}
renderPrices();
window.addEventListener("hashchange",()=>{if(location.hash==="#prices")renderPrices();});
$("priceTable").addEventListener("click",e=>{const b=e.target.closest("[data-try]");if(!b)return;const ph=TRY_PHRASE[b.dataset.try];if(!ph)return;
  if(typeof hideAi3d==="function") hideAi3d();
  goTab("build"); applyPlan(localPlan(ph),ph);});

// Articles with a try phrase end with a button that fits that mod on the 3D car (same path as the price list).
const postTry=p=>{if(!p.try)return"";try{if(!localPlan(p.try).apply.length)return"";}catch(e){return"";}return`<p><button class="btn sm try" type="button" data-try-phrase="${p.try}" aria-label="Try ${p.try} on the car">Try ${p.try} on the car</button></p>`;};
$("posts").innerHTML=POSTS.map(p=>`<details class="post"><summary><span class="meta">${p.m}</span><h2 class="sub">${p.t}</h2><p>${p.s}</p><span class="more">Read article →</span></summary><div class="content">${p.c}${postTry(p)}</div></details>`).join("");
$("posts").addEventListener("click",e=>{const b=e.target.closest("[data-try-phrase]");if(!b)return;const ph=b.dataset.tryPhrase;
  if(typeof hideAi3d==="function") hideAi3d();
  goTab("build"); applyPlan(localPlan(ph),ph);});

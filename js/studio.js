/* The studio: compare slider, car picker, specs, build sheet and number plate lookup. */
"use strict";
/* ---------- DOM refs ---------- */
const $=id=>document.getElementById(id);
const stage=$("stage"), afterL=$("afterLayer"), beforeL=$("beforeLayer"), split=$("split");
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

function setSplit(v){stage.style.setProperty("--split",v+"%");split.value=v;}
split.addEventListener("input",()=>{stage.classList.add("dragging");setSplit(split.value);});
split.addEventListener("change",()=>stage.classList.remove("dragging"));
split.addEventListener("pointerup",()=>stage.classList.remove("dragging"));

let calloutTimer=null, renderN=0;
function renderStage(prevMods,changed){
  // The 3D spin view (js/spin-view.js) and Front/Side photo views (js/photo/photo-view.js) draw the stage themselves.
  if(spinActive()){refreshSpin(changed);return;}
  if(photoActive()){renderPhotoStage();return;}
  const c=car(); renderN++;
  // Website #202: name the two drawings so "stock" and "your build" don't sound the same.
  const nm=c.make+" "+c.model, pn=partCount(state.mods);
  afterL.innerHTML=carSVG(c,state.mods,{uid:"a"+renderN,prev:reduce?null:prevMods,label:nm+", your build"+(pn?", with "+pn+(pn===1?" part":" parts"):", no parts yet")});
  beforeL.innerHTML=carSVG(c,{},{uid:"b"+renderN,label:nm+", stock"});
  if(changed&&changed.length){
    const co=$("callouts"); co.innerHTML=""; clearTimeout(calloutTimer);
    // With reduced motion the labels don't animate, so show them still and clear them after a moment.
    if(reduce) calloutTimer=setTimeout(()=>{co.innerHTML="";},2600);
    // Keep labels away from the stage edges so they aren't cut off on narrow screens.
    changed.forEach((id,i)=>{const a=anchorFor(c,id);const el=document.createElement("div");el.className="callout";el.style.left=Math.min(80,Math.max(20,a[0]))+"%";el.style.top=a[1]+"%";el.style.animationDelay=(.3+i*.25)+"s";el.style.opacity="0";el.textContent=(state.mods[id]?"+ ":"− ")+(state.mods[id]?modLabel(id,state.mods[id]):MODS[id].name);co.appendChild(el);});
  }
}
function renderPicker(){
  // The "3D" badge only means something when some cars are still stand-ins.
  const badge=!CARS.every(c=>c.model3d);
  const pickerBrand=car().make; // the brand row follows the car on show
  $("brandPicker").innerHTML=BRANDS.map(b=>`<button type="button" data-brand="${b}" aria-pressed="${b===pickerBrand}">${b}</button>`).join("");
  $("picker").innerHTML=carsOf(pickerBrand).map(c=>`<button type="button" data-car="${c.id}" aria-pressed="${c.id===state.car}" title="${c.model3d?"Full 3D model":"3D: simple stand-in shape for now (no full model yet)"}">${c.make} ${c.model}${badge&&c.model3d?' <span class="b3d">3D</span>':""}</button>`).join("");
}
$("picker").addEventListener("click",e=>{const b=e.target.closest("button[data-car]");if(b) switchCar(b.dataset.car,true);});
// Picking a brand loads its first model and shows the brand's other models to choose from.
$("brandPicker").addEventListener("click",e=>{const b=e.target.closest("button[data-brand]");if(b&&car().make!==b.dataset.brand) switchCar(carsOf(b.dataset.brand)[0].id,true);});

function renderInfo(){
  const c=car();
  $("carTitle").textContent=c.make+" "+c.model;
  $("carSub").textContent=c.gen+" · "+c.engine+" · "+c.drive+(state.plate?" · "+state.plate:"");
  const s=perf(c,{}), p=perf(c,state.mods);
  // Two cards: the car as it left the factory, and with your build. Changes are marked on the build card.
  const topSpeed=(x,base)=>c.limited?`${c.topSpeed} mph (limited)`:`${Math.round(c.topSpeed*Math.cbrt(x.hp/base.hp)-x.down/30)} mph${x===base?"":" (est.)"}`;
  const rows=[["Power","hp"," bhp",1],["Torque","nm"," Nm",1],["0–62 mph","t62"," s",-1],["Top speed","top","",0],["Weight","kg"," kg",-1],["Power-to-weight","ptw"," bhp/tonne",1],["Downforce at 100 mph","down"," kg",1]];
  const val=(x,k,u)=>k==="top"?topSpeed(x,s):k==="t62"?x[k].toFixed(1)+u:x[k].toLocaleString("en-GB")+u;
  const card=(title,x,isBuild)=>`<div class="statcard${isBuild?" build":""}"><h4>${title}</h4><dl>`+rows.map(([l,k,u,dir])=>{
    let chg="";
    if(isBuild&&k!=="top"){const d=Math.round((x[k]-s[k])*10)/10; if(d) chg=` <span class="${d*dir>0?"up":"down"}">${d>0?"+":"−"}${Math.abs(k==="t62"?d.toFixed(1):d)}</span>`;}
    return `<dt>${l}</dt><dd class="mono">${val(x,k,u)}${chg}</dd>`;
  }).join("")+`</dl></div>`;
  $("specs").innerHTML=card("Stock",s,false)+card(Object.keys(state.mods).length?"Your build":"Your build (no parts yet)",p,true);
  // Bars: a gain shows as gold past the grey stock bar; a loss shows the lost part of the stock bar in red.
  $("bars").innerHTML=[["Grip & handling",s.grip,p.grip],["Braking",s.brake,p.brake]].map(([l,a,b])=>{
    const d=b-a, track=d<0?`<i class="lost" style="width:${a}%"></i><b style="width:${b}%"></b>`:`<b style="width:${b}%"></b><i style="width:${a}%"></i>`;
    return `<div class="bar"><span>${l}</span><div class="track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${b}" aria-label="${l}: ${b} with your build, ${a} stock">${track}</div><span class="mono">${b}${d?` <small class="${d>0?"up":"down"}">${d>0?"+":"−"}${Math.abs(d)}</small>`:""}</span></div>`;
  }).join("");
  const ids=Object.keys(state.mods).sort((a,b)=>MODS[a].order-MODS[b].order);
  const pc=partCount(state.mods); $("modCount").textContent=pc+(pc===1?" part":" parts");
  $("fitted").innerHTML=ids.length?ids.map(id=>`<li><div>${modLabel(id,state.mods[id])}<small>${MODS[id].cat}</small></div><span class="mono">${fmt(modPrice(id,state.mods[id],c))}</span><button class="x" type="button" data-remove="${id}" aria-label="Remove ${MODS[id].name}">×</button></li>`).join(""):`<li class="empty">Stock. Ask the advisor for your first upgrade.</li>`;
  const bc=buildCost(c,state.mods);
  $("totals").innerHTML=`<div><span>Car, ${c.used?"used":"new"} (approx.)</span><span class="mono">${fmt(c.price)}</span></div><div><span>Parts and fitting</span><span class="mono">${fmt(bc)}</span></div><div class="grand"><span>Total</span><span class="mono">${fmt(c.price+bc)}</span></div>`;
  $("buyLink").href=forSaleUrl(c);
  $("buyLink").setAttribute("aria-label",`Find a ${c.make} ${c.model} for sale on AutoTrader (opens a new tab)`);
  // Used-only cars can't be test driven new, so just point to the maker's UK site.
  const mk=$("makerLink");
  mk.href=c.url;
  mk.textContent=c.used?`Visit ${c.make} UK ↗`:"Book a real test drive ↗";
  mk.setAttribute("aria-label",c.used?`Visit ${c.make} UK (opens a new tab)`:`Book a test drive at ${c.make} UK (opens a new tab)`);
  renderPicker(); // the brand and model rows follow the car on show
}
$("fitted").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(!b)return;const xs=[...$("fitted").querySelectorAll("[data-remove]")],i=xs.indexOf(b);const prev={...state.mods};delete state.mods[b.dataset.remove];commit(prev,[b.dataset.remove]);
  // keep keyboard focus on the list: the × now in that row, the one before, or Reset when empty
  const left=$("fitted").querySelectorAll("[data-remove]");(left[Math.min(i,left.length-1)]||$("resetBtn")).focus();});
$("resetBtn").addEventListener("click",()=>{const prev={...state.mods};const ch=Object.keys(prev);
  // Keep a copy so a mis-tap can be undone with "Bring it back" (like switchCar); a stock car stays silent.
  const kept=ch.length?{car:state.car,mods:JSON.parse(JSON.stringify(state.mods))}:null;
  state.mods={};commit(prev,ch);
  if(kept){addAI("Back to stock.");offerUndo(kept);}});

// Copy a link that opens this exact build (falls back to showing the link if copying isn't allowed).
$("shareBtn").addEventListener("click",async()=>{
  const b=$("shareBtn"),link=buildLink();
  // On this computer's own address a friend can't open the link, so don't suggest sharing it.
  const local=/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  try{
    await navigator.clipboard.writeText(link);b.textContent="Link copied ✓";setTimeout(()=>{b.textContent="Copy build link";},2500);
    if(local) addAI("Link copied. It reopens this build on this computer while the site is running. To show a friend, use Save picture.");
  }
  catch(e){window.prompt(local?"Copy this link to reopen your build on this computer:":"Copy this link to keep or share your build:",link);}
});

/* ---------- My builds: named builds kept in this browser (visits still start stock) ---------- */
const MY_KEY="customizacions.mybuilds", MY_MAX=12;
function loadMyBuilds(){try{const a=JSON.parse(localStorage.getItem(MY_KEY)||"[]");return Array.isArray(a)?a.filter(b=>b&&CARS.some(c=>c.id===b.car)&&b.mods&&typeof b.mods==="object"):[];}catch(e){return [];}}
function storeMyBuilds(a){try{localStorage.setItem(MY_KEY,JSON.stringify(a.slice(0,MY_MAX)));return true;}catch(e){return false;}}
function defaultBuildName(){
  const c=car(), ids=Object.keys(state.mods).sort((a,b)=>MODS[a].order-MODS[b].order);
  const bits=ids.slice(0,2).map(id=>modLabel(id,state.mods[id]).toLowerCase());
  return `${c.make} ${c.model}${bits.length?" - "+bits.join(", "):" - stock"}`.slice(0,60);
}
function renderMyBuilds(){
  const list=loadMyBuilds(), box=$("myBuilds"), ul=$("myBuildsList");
  box.hidden=!list.length; ul.innerHTML="";
  list.forEach((b,i)=>{
    const c=CARS.find(x=>x.id===b.car), mods=sanitizeAll(b.mods,c), kn=Object.keys(mods).length, n=partCount(mods);
    const li=document.createElement("li"), d=document.createElement("div"), sm=document.createElement("small");
    d.textContent=b.name; const lost=Object.keys(b.mods).length-kn; sm.textContent=`${c.make} ${c.model} · ${n} part${n===1?"":"s"}${lost>0?` (${lost} no longer available)`:""} · ${fmt(c.price+buildCost(c,mods))}`; d.appendChild(sm);
    const open=document.createElement("button"); open.type="button"; open.className="btn"; open.textContent="Open"; open.dataset.open=i; open.setAttribute("aria-label",`Open saved build ${b.name}`);
    const del=document.createElement("button"); del.type="button"; del.className="btn ghost"; del.textContent="Delete"; del.dataset.del=i; del.setAttribute("aria-label",`Delete saved build ${b.name}`);
    li.append(d,open,del); ul.appendChild(li);
  });
}
/* Save and Delete ask on the page itself (no browser pop-ups, which some phones block). */
function closeSaveRow(focusBtn){$("saveRow").hidden=true; if(focusBtn) $("saveBuildBtn").focus();}
$("saveBuildBtn").addEventListener("click",()=>{
  const row=$("saveRow"), inp=$("saveName");
  if(!row.hidden){closeSaveRow(false); return;}
  inp.value=defaultBuildName(); row.hidden=false; inp.focus(); inp.select();
});
$("saveCancel").addEventListener("click",()=>closeSaveRow(true));
$("saveRow").addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault(); closeSaveRow(true);}});
function hideSaveClash(){$("saveClash").hidden=true;}
function freeBuildName(nm,list){
  for(let i=2;;i++){const suf=` (${i})`, c=nm.slice(0,60-suf.length)+suf; if(!list.some(b=>b.name===c)) return c;}
}
$("saveName").addEventListener("input",hideSaveClash);
$("saveBuildBtn").addEventListener("click",hideSaveClash);
$("saveCancel").addEventListener("click",hideSaveClash);
$("saveReplace").addEventListener("click",()=>{hideSaveClash(); saveBuildAs(currentSaveName());});
$("saveBoth").addEventListener("click",()=>{hideSaveClash(); const nm=currentSaveName(); saveBuildAs(freeBuildName(nm,loadMyBuilds()));});
function currentSaveName(){return ($("saveName").value.trim()||defaultBuildName()).slice(0,60);}
$("saveRow").addEventListener("submit",e=>{
  e.preventDefault();
  const nm=currentSaveName();
  if(loadMyBuilds().some(b=>b.name===nm)){ // ask on the page before replacing an older build
    $("saveClashMsg").textContent=`You already have a build called "${nm}". Replace it?`;
    $("saveClash").hidden=false; $("saveReplace").focus(); return;
  }
  saveBuildAs(nm);
});
function saveBuildAs(nm){
  const list=loadMyBuilds().filter(b=>b.name!==nm); // Replace: same name swaps out the old one
  list.unshift({name:nm,car:state.car,mods:JSON.parse(JSON.stringify(state.mods)),date:new Date().toISOString()});
  const dropped=list.length>MY_MAX;
  if(!storeMyBuilds(list)){addAI("Sorry, this browser won't let me save builds. Use \"Copy build link\" instead.");return;}
  closeSaveRow(true); renderMyBuilds();
  const b=$("saveBuildBtn"); b.textContent="Saved ✓"; setTimeout(()=>{b.textContent="Save build";},2500);
  addAI(`Saved "${nm}" under My builds, below the build sheet.${dropped?" Your oldest saved build was removed to make room (12 is the most).":""}`);
}
$("myBuildsList").addEventListener("click",e=>{
  const o=e.target.closest("[data-open]"), x=e.target.closest("[data-del]"), yes=e.target.closest("[data-delyes]"), no=e.target.closest("[data-delno]"), list=loadMyBuilds();
  if(o){
    const b=list[+o.dataset.open]; if(!b) return;
    const kept=Object.keys(state.mods).length?{car:state.car,mods:JSON.parse(JSON.stringify(state.mods))}:null;
    if(state.plateCar&&state.plateCar!==b.car) clearPlate();
    state.car=b.car; state.mods=sanitizeAll(b.mods,car());
    save(); renderStage(null,null); setSplit(50); renderInfo(); refreshDriveCar();
    const gone=Object.keys(b.mods).filter(k=>!(k in state.mods)).map(k=>k.replace(/[-_]+/g," "));
    addAI(`Opened your saved build "${b.name}".${gone.length?` ${gone.length} part${gone.length===1?" from this build isn't":"s from this build aren't"} available any more: ${gone.join(", ")}.`:""}`);
    if(kept) setTimeout(()=>offerUndo(kept),0);
  } else if(x){
    // Swap Open/Delete for "Delete? Yes / No" in this row.
    const i=+x.dataset.del, b=list[i]; if(!b) return;
    const li=x.closest("li"); li.querySelectorAll("button").forEach(bt=>bt.remove());
    const q=document.createElement("span"); q.className="ask-del"; q.textContent="Delete?";
    const y=document.createElement("button"); y.type="button"; y.className="btn"; y.textContent="Yes"; y.dataset.delyes=i; y.setAttribute("aria-label",`Yes, delete ${b.name}. This can't be undone`);
    const n=document.createElement("button"); n.type="button"; n.className="btn ghost"; n.textContent="No"; n.dataset.delno=i; n.setAttribute("aria-label",`No, keep ${b.name}`);
    const wrap=document.createElement("span"); wrap.style.display="flex"; wrap.style.gap="6px"; wrap.style.alignItems="center"; wrap.style.gridColumn="2 / 4";
    wrap.append(q,y,n); li.appendChild(wrap); n.focus();
  } else if(yes){
    const i=+yes.dataset.delyes; if(!list[i]) return;
    list.splice(i,1); storeMyBuilds(list); renderMyBuilds();
    const first=$("myBuildsList").querySelector("button"); (first||$("saveBuildBtn")).focus();
  } else if(no){
    const i=+no.dataset.delno; renderMyBuilds();
    const back=$("myBuildsList").querySelector(`[data-del="${i}"]`); (back||$("saveBuildBtn")).focus();
  }
});
$("myBuildsList").addEventListener("keydown",e=>{
  if(e.key==="Escape"&&e.target.closest("[data-delno],[data-delyes]")){const i=e.target.dataset.delno??e.target.dataset.delyes; renderMyBuilds(); const back=$("myBuildsList").querySelector(`[data-del="${i}"]`); if(back) back.focus();}
});
renderMyBuilds();

function commit(prev,changed){save();renderStage(prev,changed);renderInfo();refreshDriveCar();}
function switchCar(id,announce){
  if(!CARS.some(c=>c.id===id)) return;
  const old=car();
  // Keep a copy of the build being replaced so the user can undo (e.g. after opening a gallery build).
  const kept=Object.keys(state.mods).length?{car:old.id,mods:JSON.parse(JSON.stringify(state.mods))}:null;
  state.car=id;
  const plateNote=announce&&old.id!==id?plateOnSwitch(id):"";
  state.mods={}; // a newly picked car starts stock
  save(); renderStage(null,null); setSplit(50); renderInfo(); refreshDriveCar();
  if(announce&&old.id!==id) addAI(`Loaded the ${car().make} ${car().model}. ${plateNote}It's stock. What would you like to change?`);
  if(kept) setTimeout(()=>offerUndo(kept),0); // after any message the caller adds
}
// Advisor message with a "Bring it back" button that restores the build switchCar replaced.
function offerUndo(kept){
  const k=CARS.find(c=>c.id===kept.car), n=partCount(kept.mods);
  const d=addAI(`Your previous ${k.make} ${k.model} build (${n} part${n===1?"":"s"}) is kept, in case you want it back.`);
  const b=document.createElement("button"); b.type="button"; b.className="btn undo-build"; b.textContent="Bring it back";
  b.addEventListener("click",()=>{
    if(state.plateCar&&state.plateCar!==kept.car) clearPlate();
    state.car=kept.car; state.mods=JSON.parse(JSON.stringify(kept.mods));
    save(); renderStage(null,null); setSplit(50); renderInfo(); refreshDriveCar();
    b.disabled=true; b.textContent="Brought back ✓";
    addAI(`Your ${k.make} ${k.model} build is back.`);
  });
  d.appendChild(b); scrollMsgs();
}

/* ---------- plate lookup (demo) ---------- */
const PLATE_HINT=$("plateMsg").innerHTML;
function clearPlate(){
  if(!state.plate) return;
  state.plate=""; state.plateCar=null; $("plate").value="";
  $("plateMsg").innerHTML=PLATE_HINT;
}
// Called when the user switches car. A plate we couldn't look up gets attached to the car they pick
// (that's what we asked them to do); a plate that belongs to a different car is cleared.
// Returns a sentence for the advisor to say, or "".
function plateOnSwitch(id){
  if(!state.plate) return "";
  if(state.plateCar===null){
    state.plateCar=id; const c=CARS.find(x=>x.id===id);
    $("plateMsg").textContent=`${state.plate} saved as your ${c.make} ${c.model}.`;
    return `Saved ${state.plate} as your ${c.model}. `;
  }
  if(state.plateCar!==id) clearPlate();
  return "";
}
$("plateForm").addEventListener("submit",e=>{e.preventDefault();lookupPlate($("plate").value);});
$("plateMsg").addEventListener("click",e=>{const b=e.target.closest("[data-plate]");if(b){$("plate").value=b.dataset.plate;lookupPlate(b.dataset.plate);}});
function lookupPlate(v){
  const raw=String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const msg=$("plateMsg");
  if(raw.length<2||raw.length>7){msg.textContent="Enter a UK registration, like AB12 CDE.";return;}
  const pretty=/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(raw)?raw.slice(0,4)+" "+raw.slice(4):raw;
  state.plate=pretty; $("plate").value=pretty;
  const hit=DEMO_PLATES[raw];
  state.plateCar=hit||null;
  if(hit){switchCar(hit,false);msg.textContent=`Found ${pretty}: ${car().make} ${car().model} (one of the three example plates).`;addAI(`I found ${pretty}. It's a ${car().make} ${car().model} with a ${car().engine}. What do you want to do to it?`);}
  else {msg.textContent=`We can't look up real plates yet, so pick your car above. ${pretty} will still show on the 3D car.`;renderInfo();save();}
}

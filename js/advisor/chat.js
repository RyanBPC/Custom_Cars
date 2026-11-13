/* The build advisor chat: messages, the AI prompt, and applying a plan to the build. */
"use strict";
/* ---------- AI chat ---------- */
const msgs=$("msgs"); let sample=null, chatHistory=[], busy=null;
function scrollMsgs(){msgs.scrollTop=msgs.scrollHeight;}
function addUser(t){const d=document.createElement("div");d.className="msg user";d.textContent=t;msgs.appendChild(d);scrollMsgs();}
function addAI(text,cards){
  const d=document.createElement("div");d.className="msg ai";
  const p=document.createElement("p");p.textContent=text;d.appendChild(p);
  if(cards&&cards.length){const w=document.createElement("div");w.className="modcards";cards.forEach(c=>w.appendChild(c));d.appendChild(w);}
  msgs.appendChild(d);scrollMsgs();return d;
}
function modCard(id,notes){
  const c=car(), p=state.mods[id], el=document.createElement("div");
  if(!p){el.className="modcard removed";el.innerHTML=`<div class="t">Removed: ${id==="drop"?"Lowered suspension":MODS[id].name}</div>`;return el;}
  const base=modInfo(id,p,c), n=(notes&&notes[id])||{};
  el.className="modcard";
  const t=document.createElement("div");t.className="t";t.innerHTML=`<b></b><span>${fmt(modPrice(id,p,c))}</span>`;t.querySelector("b").textContent=modLabel(id,p);
  const dl=document.createElement("dl");
  [["Does",n.what||base.what],["Effect",n.effect||base.effect],["Spec",base.spec]].forEach(([k,v])=>{const dt=document.createElement("dt");dt.textContent=k;const dd=document.createElement("dd");dd.textContent=String(v).slice(0,300);dl.append(dt,dd);});
  el.append(t,dl);return el;
}
const SUGGESTIONS=["Lower it on coilovers with 19-inch bronze wheels","Make it faster and louder","Full track build","Satin black wrap with a GT wing and red calipers","Switch to the BMW 440i with a widebody kit"];
$("suggest").innerHTML=SUGGESTIONS.map(s=>`<button type="button">${s}</button>`).join("");
$("suggest").addEventListener("click",e=>{const b=e.target.closest("button");if(b){$("askInput").value=b.textContent;$("askForm").requestSubmit();}});
$("askForm").addEventListener("submit",e=>{e.preventDefault();if(busy){busy.abort();return;}const t=$("askInput").value.trim();if(!t)return;$("askInput").value="";ask(t);});

function catalogueText(){
  return `CATALOGUE (id: params)
- tune: stage 1|2|3 (1 = remap, 2 = remap + downpipe + intake, 3 = big turbo or supercharger)
- intake: no params
- exhaust: no params (valved stainless cat-back)
- wheels: size 17|18|19|20|21, style "multi-spoke"|"mesh"|"monoblock"|"deep-dish"|"turbofan", finish "silver"|"gunmetal"|"black"|"bronze"|"gold"|"white"
- drop: mm 15 to 50 (coilovers, how much lower); add air: true for air ride / bagged, or springs: true for lowering springs (cheaper, fixed drop)
- brakes: caliper "red"|"yellow"|"black"|"blue"|"gold"|"green"|"orange"
- bodykit: no params (splitter, skirts, diffuser)
- widebody: no params (arch flares)
- spoiler: type "lip"|"ducktail"|"gt-wing"
- wrap: colour (hex like "#16181c"), finish "gloss"|"satin"|"matte"|"chrome"|"metallic"|"pearl" (metallic = fine flake, pearl = pearlescent colour shift; use these when the user says metallic, pearl or pearlescent)
- stripes: colour (hex)
- tint: vlt 5|20|35|50 (rear windows only, UK law)
- lights: no params (smoked lenses)
- custom: items [{name, price (typical UK fitted £, or null), text (how it looks, for a photo)}] for ANY part not listed above (underglow, carbon bonnet, roll cage, roof rack…). Keep existing custom items when adding more.
  When one of these fits, use its exact name and price (the 3D car can show the ones marked *): ${EXTRA_PARTS.map(e=>e.name+" £"+e.price+(e.in3d?"*":"")).join("; ")}
CARS: ${CARS.map(c=>c.id+" = "+c.make+" "+c.model).join("; ")}`;
}
const RULES=`You are the build advisor inside Custom Cars, a UK car customisation website. The user describes what they want in plain English. You pick modifications from the catalogue, and the website animates them onto the car and calculates prices and performance itself.

${catalogueText()}

Rules:
- Use only catalogue ids and the listed parameter values.
- Keep the current build unless the user asks to change or remove parts. To change a part, put it in "apply" with new params. To take a part off, put its id in "remove". Set "reset": true only if they want to go back to stock.
- Vague requests are fine: "faster" means tune stage 1 or 2, "louder" means exhaust, "track build" means coilovers, brakes, aero kit, GT wing, wheels and tune.
- If they ask for something not in the catalogue (engine swap, gearbox swap), say it is not in the studio yet and offer the nearest option.
- If they name a car from CARS, set "switchCar" to its id. If they name a car that is not listed, say so and suggest the closest listed car.
- "reply": 2 to 4 short sentences in UK English. Be specific to their car. Mention UK legal or insurance points when relevant (front window tint limits, telling the insurer about mods, MOT noise and lights).
- "notes": for each part you apply, a "what" sentence (what the part is and does) and an "effect" sentence (how it changes this car's look, handling or performance).
Reply with only JSON in this shape:
{"reply":"...","switchCar":null,"reset":false,"apply":[{"id":"wheels","params":{"size":19,"style":"monoblock","finish":"bronze"}}],"remove":[],"notes":{"wheels":{"what":"...","effect":"..."}}}`;

/* ---------- one-step undo of the last chat change ---------- */
// "undo", "undo that", "go back", "take that off" on their own. "undo everything" still resets (local parser).
const UNDO_RE=/^\s*(?:please\s+)?(?:undo(?: that| it| the last (?:change|one|thing|bit))?|undo last change|go back(?: one step)?|take that (?:off|back)|change it back|put it back)\s*(?:please)?[.!]*\s*$/i;
let lastChange=null, undoBtn=null;
const snapBuild=()=>JSON.stringify({car:state.car,mods:state.mods});
function undoLast(){
  if(!lastChange){addAI("Nothing to undo yet.");return;}
  if(snapBuild()!==lastChange.after){lastChange=null;dropUndoBtn();addAI("You've changed the build since then, so there's no single step to undo. Use the × next to a part to take it off.");return;}
  const b=lastChange.before, prev={...state.mods}, carBack=b.car!==state.car;
  if(carBack&&state.plateCar&&state.plateCar!==b.car) clearPlate();
  state.car=b.car; state.mods=JSON.parse(JSON.stringify(b.mods)); lastChange=null; dropUndoBtn("Undone ✓");
  if(carBack){save();renderStage(null,null);setSplit(50);renderInfo();refreshDriveCar();}
  else commit(prev,[...new Set([...Object.keys(prev),...Object.keys(state.mods)])]);
  addAI(`Undone. The car is back how it was${carBack?` (${car().make} ${car().model})`:""}.`);
}
function dropUndoBtn(label){if(!undoBtn)return;if(label){undoBtn.disabled=true;undoBtn.textContent=label;}else undoBtn.remove();undoBtn=null;}

async function ask(text){
  addUser(text);
  if(UNDO_RE.test(text)){undoLast();return;}
  const think=document.createElement("div");think.className="msg ai thinking";think.textContent="Working on it";msgs.appendChild(think);scrollMsgs();
  const btn=$("askBtn");btn.textContent="Stop";
  let plan=null;
  if(sample){
    const ctl=new AbortController();busy=ctl;
    const c=car();
    const stateText=`Current car: ${c.make} ${c.model} (${c.gen}), ${c.engine}, ${c.hp}bhp, ${c.nm}Nm, ${c.drive}, stock wheels ${c.wheel}in.\nCurrent build: ${JSON.stringify(state.mods)}\n\nUser says: ${text}`;
    const turns=[{role:"user",content:RULES},...chatHistory.slice(-8),{role:"user",content:stateText}];
    try{ plan=await sample.json(turns,{modelTier:"quick",cache:false,signal:ctl.signal}); }
    catch(e){
      if(e&&e.code==="cancelled"){think.remove();busy=null;btn.textContent="Send";return;}
      if(e&&["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(e.code)){sample=null;setMode(false);}
      plan=null;
    }
    busy=null;
  }
  if(!plan||typeof plan!=="object") plan=localPlan(text);
  think.remove(); btn.textContent="Send";
  applyPlan(plan,text);
}
function applyPlan(plan,text){
  if(!plan||!plan.priceQuestion) priceAsked=null; // "add it" only fits a part asked about in the message just before
  const prev={...state.mods}, before0={car:state.car,mods:JSON.parse(JSON.stringify(state.mods))}; let carChanged=false;
  if(plan.switchCar&&CARS.some(c=>c.id===plan.switchCar)&&plan.switchCar!==state.car){state.car=plan.switchCar;carChanged=true;state.mods={};plateOnSwitch(plan.switchCar);}
  if(plan.reset) state.mods={};
  (Array.isArray(plan.remove)?plan.remove:[]).forEach(id=>{delete state.mods[id];});
  const applied=[];
  (Array.isArray(plan.apply)?plan.apply:[]).forEach(a=>{if(a&&MODS[a.id]){state.mods[a.id]=sanitize(a.id,a.params,car());applied.push(a.id);}});
  state.mods=sanitizeAll(state.mods,car());
  const changed=[...new Set([...Object.keys(prev),...Object.keys(state.mods)])].filter(k=>JSON.stringify(prev[k])!==JSON.stringify(state.mods[k]));
  if(carChanged){save();renderStage(null,null);renderInfo();refreshDriveCar();setTimeout(()=>{const p2={};commit(p2,Object.keys(state.mods));},350);}
  else commit(prev,changed);
  const c=car(), before=perf(c,prev), after=perf(c,state.mods);
  let reply=String(plan.reply||"Done.").slice(0,900);
  if(changed.length&&after.hp!==before.hp&&!carChanged) reply+=` Power is now ${after.hp}bhp (${after.hp>before.hp?"+":""}${after.hp-before.hp}).`;
  const d=addAI(reply,changed.sort((a,b)=>MODS[a].order-MODS[b].order).map(id=>modCard(id,plan.notes)));
  if(changed.length||carChanged){
    // Only the newest change can be undone, so older Undo buttons go.
    dropUndoBtn(); lastChange={before:before0,after:snapBuild()};
    const b=document.createElement("button"); b.type="button"; b.className="btn undo-build"; b.textContent="Undo";
    b.setAttribute("aria-label","Undo this change"); b.addEventListener("click",()=>{addUser("Undo");undoLast();});
    d.appendChild(b); undoBtn=b; scrollMsgs();
  }
  chatHistory.push({role:"user",content:text},{role:"assistant",content:String(plan.reply||"")});
}


function setMode(live){
  $("aiDot").classList.toggle("live",live);
  $("aiMode").textContent=live?"AI live · understands any request":"Built-in assistant · keyword mode";
}
setMode(false); $("aiMode").textContent="Connecting…";
(async()=>{
  try{ if(window.claude&&claude.use){ sample=await claude.use("sample"); } }catch(e){sample=null;}
  setMode(!!sample);
})();

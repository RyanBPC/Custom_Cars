/* The current car, build and plate, saved in the browser; plus checks that keep any build valid. */
"use strict";
/* ---------- state ---------- */
// plateCar: the car id the plate belongs to, or null if we couldn't look the plate up.
let state={car:"golf",mods:{},plate:"",plateCar:null};
// Saved builds used the old project name as their key; move them over once.
try{const old=localStorage.getItem("modvista.build");if(old!==null){if(localStorage.getItem("customizacions.build")===null)localStorage.setItem("customizacions.build",old);localStorage.removeItem("modvista.build");}}catch(e){}
// Every visit starts stock: parts only go on when the user asks in the chat. The car and plate are remembered.
try{const s=JSON.parse(localStorage.getItem("customizacions.build")||"null");if(s&&CARS.some(c=>c.id===s.car)){state={car:s.car,mods:{},plate:s.plate||"",plateCar:CARS.some(c=>c.id===s.plateCar)?s.plateCar:null};}}catch(e){}
function save(){try{localStorage.setItem("customizacions.build",JSON.stringify(state));}catch(e){}}
const car=()=>CARS.find(c=>c.id===state.car);
// How many parts a build has: each extra part (underglow, roll cage...) counts on its own, not as one "custom" part.
function partCount(mods){mods=mods||{};return Object.keys(mods).reduce((n,id)=>n+(id==="custom"?((mods.custom&&Array.isArray(mods.custom.items))?mods.custom.items.length:0):1),0);}

function nearest(arr,v){return arr.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);}
function toColour(v,fallback){
  if(validHex(v)) return (v[0]==="#"?v:"#"+v).toLowerCase();
  const s=String(v||"").toLowerCase(); const f=COLOURS.find(c=>s.includes(c[0])); return f?f[1]:fallback;
}
function sanitize(id,p,c){
  p=p||{};
  switch(id){
    case "tune": {const st=parseInt(p.stage,10);return {stage:[1,2,3].includes(st)?st:1};}
    case "wheels": return {size:nearest([17,18,19,20,21],parseInt(p.size,10)||c.wheel+1),style:WHEEL_STYLES.includes(p.style)?p.style:"multi-spoke",finish:RIM_FINISH[p.finish]?p.finish:"gunmetal"};
    case "drop": {const d={mm:Math.max(15,Math.min(50,Math.round((parseInt(p.mm,10)||30)/5)*5))}; if(p.air===true) d.air=true; else if(p.springs===true) d.springs=true; return d;}
    case "brakes": return {caliper:CALIPER[p.caliper]?p.caliper:"red"};
    case "spoiler": return {type:["lip","ducktail","gt-wing","roof-ext","pedestal"].includes(p.type)?p.type:"ducktail"};
    case "wrap": {const w={colour:toColour(p.colour,"#16181c"),finish:["gloss","satin","matte","chrome","metallic","pearl"].includes(p.finish)?p.finish:"gloss"}; if(p.paint===true&&w.finish!=="chrome") w.paint=true; return w;}
    case "stripes": return {colour:toColour(p.colour,"#ecebe6")};
    case "tint": return {vlt:nearest([5,20,35,50],parseInt(p.vlt,10)||35)};
    case "custom": return {items:(Array.isArray(p.items)?p.items:[]).slice(0,30).map(i=>({name:String(i&&i.name||"").slice(0,60),price:Number.isFinite(+i.price)&&+i.price>0?Math.round(+i.price):null,text:String(i&&i.text||"").slice(0,160),...(i&&i.reg?{reg:String(i.reg).toUpperCase().replace(/[^A-Z0-9 ]/g,"").slice(0,8)}:{}),...(i&&i.style?{style:cleanPlateStyle(i.style)}:{})})).filter(i=>i.name)};
    default: return {};
  }
}
function sanitizeAll(m,c){const o={};for(const k in m) if(MODS[k]) o[k]=sanitize(k,m[k],c);return o;}

/* ---------- build links ---------- */
// A shared link carries the car and parts (not the plate) as ?b=... before the #tab.
function buildCode(){const j=JSON.stringify({c:state.car,m:state.mods});return btoa(unescape(encodeURIComponent(j))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function buildLink(){return location.origin+location.pathname+"?b="+buildCode()+"#build";}
// Opening a build link fits that build (checked by sanitizeAll), then tidies the address so a reload starts as normal.
try{const code=new URLSearchParams(location.search).get("b");if(code){
  const j=JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g,"+").replace(/_/g,"/")))));
  if(j&&CARS.some(c=>c.id===j.c)&&j.m&&typeof j.m==="object"){if(j.c!==state.car){state.car=j.c;state.plate="";state.plateCar=null;}state.mods=sanitizeAll(j.m,car());window.fromBuildLink=true;}
  history.replaceState(null,"",location.pathname+location.hash);
}}catch(e){}

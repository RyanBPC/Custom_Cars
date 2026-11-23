/* Draws each car as an SVG picture, including fitted parts and the fitting animations. */
"use strict";
/* ---------- car renderer ---------- */
const GROUND=262, TYRE=46, WCY=GROUND-TYRE, ARCH=54, HALF=51.6;
const RATIO={17:.6,18:.64,19:.68,20:.72,21:.76};
const GEO={
 hatch:{rear:100,front:712,Rw:205,Fw:590,sill:226,belt:156,roofY:96,
   upper:g=>`M${g.rear+12} ${g.sill} L${g.rear} ${g.sill-24} L${g.rear-2} ${g.belt+2} L118 132 Q134 ${g.roofY+4} 200 ${g.roofY} Q320 ${g.roofY-4} 430 ${g.roofY} Q474 ${g.roofY+6} 548 ${g.belt-4}`,
   rearGlass:[[142,150],[196,104],[326,100],[326,150]], frontGlass:[[338,150],[338,100],[426,101],[528,152]],
   spoiler:{x:196,y:94,kind:"roof"}, tail:{x:100,y:150}, doors:[330,"5"]},
 saloon:{rear:72,front:728,Rw:198,Fw:600,sill:226,belt:158,roofY:96,
   upper:g=>`M${g.rear+12} ${g.sill} L${g.rear} ${g.sill-24} L${g.rear-2} 162 Q${g.rear} 150 92 150 L205 146 Q240 ${g.roofY+4} 272 ${g.roofY} L450 ${g.roofY-1} Q490 ${g.roofY+6} 560 ${g.belt-4}`,
   rearGlass:[[222,150],[278,104],[356,102],[356,152]], frontGlass:[[368,152],[368,102],[444,103],[540,153]],
   spoiler:{x:96,y:150,kind:"deck"}, tail:{x:72,y:158}, doors:[362,"4"]},
 coupe:{rear:82,front:728,Rw:205,Fw:602,sill:226,belt:160,roofY:104,
   upper:g=>`M${g.rear+12} ${g.sill} L${g.rear} ${g.sill-24} L${g.rear-1} 152 Q${g.rear+4} 144 112 142 Q200 112 300 ${g.roofY} L440 ${g.roofY-1} Q484 ${g.roofY+8} 562 ${g.belt-4}`,
   rearGlass:[[262,152],[306,112],[372,110],[372,153]], frontGlass:[[384,153],[384,110],[436,108],[540,155]],
   spoiler:{x:116,y:142,kind:"deck"}, tail:{x:82,y:152}, doors:[380,"2"]},
 roadster:{rear:96,front:714,Rw:210,Fw:590,sill:226,belt:160,roofY:120,
   upper:g=>`M${g.rear+12} ${g.sill} L${g.rear} ${g.sill-24} L${g.rear-1} ${g.belt-2} Q${g.rear+4} ${g.belt-12} 140 ${g.belt-12} L300 ${g.belt-11} L470 ${g.belt-8} L520 ${g.belt-6}`,
   rearGlass:null, frontGlass:[[470,152],[438,114],[450,113],[486,152]],
   spoiler:{x:124,y:148,kind:"deck"}, tail:{x:96,y:156}, doors:[0,"2"]}
};
function bodyPath(g){
  const f=g.front, b=g.belt, s=g.sill;
  return g.upper(g)+` L${f-60} ${b+4} Q${f-6} ${b+10} ${f} ${b+32} L${f+2} ${s-16} Q${f} ${s} ${f-18} ${s} L${(g.Fw+HALF).toFixed(1)} ${s} A${ARCH} ${ARCH} 0 1 0 ${(g.Fw-HALF).toFixed(1)} ${s} L${(g.Rw+HALF).toFixed(1)} ${s} A${ARCH} ${ARCH} 0 1 0 ${(g.Rw-HALF).toFixed(1)} ${s} Z`;
}
const pts = a => a.map(p=>p.join(",")).join(" ");
function paintStops(c,finish){
  if(finish==="matte") return [[0,lighten(c,.07)],[1,darken(c,.22)]];
  if(finish==="satin") return [[0,lighten(c,.2)],[.5,c],[1,darken(c,.42)]];
  if(finish==="chrome") return [[0,lighten(c,.75)],[.32,lighten(c,.2)],[.47,darken(c,.55)],[.56,lighten(c,.5)],[1,darken(c,.35)]];
  return [[0,lighten(c,.34)],[.36,c],[.72,darken(c,.32)],[1,darken(c,.6)]];
}
function grad(id,stops){return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}"/>`).join("")}</linearGradient>`;}
function eff(car,m){
  m=m||{};
  return {
    size:m.wheels?m.wheels.size:car.wheel, style:m.wheels?m.wheels.style:"stock", finish:m.wheels?m.wheels.finish:(car.id==="c911"||car.id==="m3"?"gunmetal":"silver"),
    drop:m.drop?m.drop.mm*0.2:0, paint:m.wrap?m.wrap.colour:car.colour, pfin:m.wrap?m.wrap.finish:"gloss",
    caliper:m.brakes?CALIPER[m.brakes.caliper]||CALIPER.red:"#4a4e54", bigBrake:!!m.brakes,
    spoiler:m.spoiler?m.spoiler.type:null, kit:!!m.bodykit, wide:!!m.widebody, exhaust:!!m.exhaust,
    tint:m.tint?m.tint.vlt:null, stripe:m.stripes?m.stripes.colour:null, smoked:!!m.lights
  };
}
function P(cx,cy,r,a){return[(cx+r*Math.cos(a)).toFixed(1),(cy+r*Math.sin(a)).toFixed(1)];}
function rimSpokes(cx,cy,r,style,col){
  const hi=lighten(col,.3), lo=darken(col,.45); let s="";
  const n = {stock:5,"multi-spoke":10,mesh:12,monoblock:5,"deep-dish":6,turbofan:12}[style]||5;
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2-Math.PI/2;
    if(style==="stock"){ for(const o of [-.09,.09]){const p1=P(cx,cy,r*.2,a+o*1.6),p2=P(cx,cy,r*.86,a+o),p3=P(cx,cy,r*.86,a+o*.4),p4=P(cx,cy,r*.2,a+o*.6);s+=`<polygon points="${[p1,p2,p3,p4].map(p=>p.join(",")).join(" ")}" fill="${col}" stroke="${lo}" stroke-width=".6"/>`;} }
    else if(style==="multi-spoke"){const w=.055,p1=P(cx,cy,r*.2,a-w*1.5),p2=P(cx,cy,r*.87,a-w*.6),p3=P(cx,cy,r*.87,a+w*.6),p4=P(cx,cy,r*.2,a+w*1.5);s+=`<polygon points="${[p1,p2,p3,p4].map(p=>p.join(",")).join(" ")}" fill="${col}" stroke="${lo}" stroke-width=".5"/>`;}
    else if(style==="mesh"){for(const d of [-.42,.42]){const p1=P(cx,cy,r*.22,a),p2=P(cx,cy,r*.86,a+d);s+=`<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${col}" stroke-width="${(r*.07).toFixed(1)}" stroke-linecap="round"/>`;}}
    else if(style==="monoblock"){const p1=P(cx,cy,r*.18,a-.34),p2=P(cx,cy,r*.87,a-.17),p3=P(cx,cy,r*.87,a+.17),p4=P(cx,cy,r*.18,a+.34);s+=`<polygon points="${[p1,p2,p3,p4].map(p=>p.join(",")).join(" ")}" fill="${col}" stroke="${hi}" stroke-width=".8"/>`;}
    else if(style==="deep-dish"){const p1=P(cx,cy,r*.18,a-.2),p2=P(cx,cy,r*.66,a-.12),p3=P(cx,cy,r*.66,a+.12),p4=P(cx,cy,r*.18,a+.2);s+=`<polygon points="${[p1,p2,p3,p4].map(p=>p.join(",")).join(" ")}" fill="${col}" stroke="${lo}" stroke-width=".6"/>`;}
    else if(style==="turbofan"){const p1=P(cx,cy,r*.22,a),p2=P(cx,cy,r*.86,a+.55),p3=P(cx,cy,r*.86,a+.3),c=P(cx,cy,r*.6,a+.05);s+=`<path d="M${p1} Q${c} ${p2} L${p3} Q${P(cx,cy,r*.55,a+.2)} ${P(cx,cy,r*.22,a+.25)} Z" fill="${col}" stroke="${lo}" stroke-width=".5"/>`;}
  }
  if(style==="turbofan") s=`<circle cx="${cx}" cy="${cy}" r="${(r*.86).toFixed(1)}" fill="${darken(col,.55)}"/>`+s;
  if(style==="mesh") s+=`<circle cx="${cx}" cy="${cy}" r="${(r*.86).toFixed(1)}" fill="none" stroke="${col}" stroke-width="2"/>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="${(r*.2).toFixed(1)}" fill="${col}" stroke="${lo}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${(r*.08).toFixed(1)}" fill="${lo}"/>`;
  return s;
}
function wheel(cx,cy,E,opts){
  const r=TYRE*(RATIO[E.size]||.64), col=RIM_FINISH[E.finish]||RIM_FINISH.silver;
  const disc=r*(E.bigBrake?.8:.7);
  let s=`<circle cx="${cx}" cy="${cy}" r="${TYRE}" fill="#101215"/><circle cx="${cx}" cy="${cy}" r="${TYRE-3}" fill="none" stroke="#1d2024" stroke-width="2"/>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${darken(col,.35)}"/>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="${(r*.9).toFixed(1)}" fill="#0b0d10"/>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="${disc.toFixed(1)}" fill="#5d636a"/><circle cx="${cx}" cy="${cy}" r="${(disc*.55).toFixed(1)}" fill="#3a3f45"/>`;
  const a1=E.bigBrake?-1.45:-1.25,a2=E.bigBrake?-.15:-.4,ri=disc*(E.bigBrake?.45:.55),ro=disc*1.04;
  const c1=P(cx,cy,ro,a1),c2=P(cx,cy,ro,a2),c3=P(cx,cy,ri,a2),c4=P(cx,cy,ri,a1);
  s+=`<path d="M${c1} A${ro.toFixed(1)} ${ro.toFixed(1)} 0 0 1 ${c2} L${c3} A${ri.toFixed(1)} ${ri.toFixed(1)} 0 0 0 ${c4} Z" fill="${E.caliper}"/>`;
  let lip="";
  if(E.style==="deep-dish") lip=`<circle cx="${cx}" cy="${cy}" r="${(r*.82).toFixed(1)}" fill="none" stroke="${lighten(col,.45)}" stroke-width="${(r*.2).toFixed(1)}"/>`;
  else lip=`<circle cx="${cx}" cy="${cy}" r="${(r*.95).toFixed(1)}" fill="none" stroke="${lighten(col,.25)}" stroke-width="2.2"/>`;
  const spokes=rimSpokes(cx,cy,r*(E.style==="deep-dish"?.95:1),E.style,col);
  return {base:s, rim:lip+`<g class="spin" data-cx="${cx}" data-cy="${cy}">${spokes}</g>`};
}
function carSVG(car,mods,o){
  o=o||{}; const u=o.uid||"c"; const g=GEO[car.style]; const E=eff(car,mods);
  const prev=o.prev?eff(car,o.prev):null; const A=!!prev;
  const ch=k=>A&&JSON.stringify(prev[k])!==JSON.stringify(E[k]);
  const f=g.front,r=g.rear,b=g.belt,s=g.sill;
  const body=bodyPath(g);
  const paintNew=`url(#${u}pN)`;
  let defs=grad(u+"pN",paintStops(E.paint,E.pfin));
  if(A) defs+=grad(u+"pO",paintStops(prev.paint,prev.pfin));
  defs+=grad(u+"gl",[[0,"#6a7d8f"],[.5,"#26323d"],[1,"#0f141a"]]);
  defs+=`<linearGradient id="${u}cf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2f35"/><stop offset=".5" stop-color="#16191d"/><stop offset="1" stop-color="#25292e"/></linearGradient>`;
  defs+=`<linearGradient id="${u}ex" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a4b66"/><stop offset=".5" stop-color="#c2a36d"/><stop offset="1" stop-color="#8d7ea8"/></linearGradient>`;
  defs+=`<filter id="${u}bl" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="7"/></filter>`;
  const dropAnim=(from,to)=>A&&from!==to?`<animateTransform attributeName="transform" type="translate" from="0 ${from}" to="0 ${to}" dur="1.1s" begin="0.15s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".25 .8 .25 1"/>`:"";
  const dFrom=A?prev.drop:E.drop;
  const appear=(on,delay,dx,dy)=>A&&on?` opacity="0"><animate attributeName="opacity" from="0" to="1" dur=".5s" begin="${delay}s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="${dx||0} ${dy||0}" to="0 0" dur=".8s" begin="${delay}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .9 .3 1"/`:"";
  let svg=`<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${car.make} ${car.model}"><defs>${defs}</defs>`;
  svg+=`<ellipse cx="${(r+f)/2}" cy="${GROUND+2}" rx="${(f-r)/2+14}" ry="11" fill="#000" opacity=".7" filter="url(#${u}bl)"/>`;
  // arch liners (move with body)
  svg+=`<g transform="translate(0 ${dFrom})">${dropAnim(dFrom,E.drop)}<circle cx="${g.Rw}" cy="${WCY-4}" r="${ARCH}" fill="#07080a"/><circle cx="${g.Fw}" cy="${WCY-4}" r="${ARCH}" fill="#07080a"/></g>`;
  // wheels
  const wChanged=ch("size")||ch("style")||ch("finish")||ch("bigBrake")||ch("caliper");
  for(const cx of [g.Rw,g.Fw]){
    const w=wheel(cx,WCY,E);
    if(A&&wChanged){
      const ow=wheel(cx,WCY,prev);
      svg+=`<g>${ow.base}${ow.rim}<animate attributeName="opacity" from="1" to="0" dur=".35s" begin=".3s" fill="freeze"/></g>`;
      svg+=`<g opacity="0">${w.base}<g>${w.rim}<animateTransform attributeName="transform" type="rotate" from="-540 ${cx} ${WCY}" to="0 ${cx} ${WCY}" dur="1.2s" begin=".35s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".15 .7 .3 1"/></g><animate attributeName="opacity" from="0" to="1" dur=".3s" begin=".35s" fill="freeze"/></g>`;
    } else svg+=w.base+w.rim;
  }
  // body group
  svg+=`<g transform="translate(0 ${dFrom})">${dropAnim(dFrom,E.drop)}`;
  // exhaust (behind bumper)
  if(E.exhaust){ svg+=`<g${appear(ch("exhaust"),.9,28,0)}><rect x="${r-14}" y="${s-14}" width="30" height="9" rx="4.5" fill="url(#${u}ex)"/><rect x="${r-14}" y="${s-4}" width="30" height="9" rx="4.5" fill="url(#${u}ex)"/><ellipse cx="${r-13}" cy="${s-9.5}" rx="2.5" ry="4" fill="#0a0b0d"/><ellipse cx="${r-13}" cy="${s+.5}" rx="2.5" ry="4" fill="#0a0b0d"/></g>`; }
  else svg+=`<rect x="${r-4}" y="${s-8}" width="16" height="7" rx="3.5" fill="#7b8087"/>`;
  // body: old paint, then new paint swept on
  const wrapChanged=ch("paint")||ch("pfin");
  if(wrapChanged){
    svg+=`<path d="${body}" fill="url(#${u}pO)"/>`;
    svg+=`<clipPath id="${u}sw"><rect x="${r-20}" y="0" width="0" height="300"><animate attributeName="width" from="0" to="${f-r+50}" dur="1.3s" begin=".05s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".5 0 .3 1"/></rect></clipPath>`;
    svg+=`<path d="${body}" fill="${paintNew}" clip-path="url(#${u}sw)"/>`;
    svg+=`<rect x="${r-20}" y="60" width="4" height="180" fill="#fff" opacity=".85" filter="url(#${u}bl)"><animate attributeName="x" from="${r-20}" to="${f+30}" dur="1.3s" begin=".05s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".5 0 .3 1"/><animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.1;.85;1" dur="1.3s" begin=".05s" fill="freeze"/></rect>`;
  } else svg+=`<path d="${body}" fill="${paintNew}"/>`;
  // reflections
  const hiOp={gloss:.32,satin:.14,matte:0,chrome:.5}[E.pfin]||.3;
  if(hiOp) svg+=`<path d="M${r+24} ${b+8} L${f-60} ${b+9} L${f-56} ${b+15} L${r+22} ${b+16} Z" fill="#fff" opacity="${hiOp}"/>`;
  svg+=`<path d="M${r+20} ${b+30} Q${(r+f)/2} ${b+26} ${f-30} ${b+30}" stroke="#fff" stroke-opacity=".12" stroke-width="1.5" fill="none"/>`;
  svg+=`<path d="M${g.Rw+HALF+4} ${s-6} L${g.Fw-HALF-4} ${s-6}" stroke="#000" stroke-opacity=".35" stroke-width="3"/>`;
  // stripes
  if(E.stripe){
    const st=`<path d="M${r+8} ${b+19} L${f-14} ${b+21}" stroke="${E.stripe}" stroke-width="8" fill="none"/><path d="M${r+8} ${b+26} L${f-12} ${b+28}" stroke="${E.stripe}" stroke-width="2" fill="none"/>`;
    if(ch("stripe")) svg+=`<clipPath id="${u}st"><rect x="${r}" y="0" width="0" height="300"><animate attributeName="width" from="0" to="${f-r+20}" dur=".9s" begin="1.1s" fill="freeze"/></rect></clipPath><g clip-path="url(#${u}st)">${st}</g>`;
    else svg+=st;
  }
  // glass
  const gl=g.frontGlass, rg=g.rearGlass;
  svg+=`<polygon points="${pts(gl)}" fill="url(#${u}gl)" stroke="#0b0e12" stroke-width="1.5"/>`;
  if(rg){
    const tOp=E.tint?({5:.98,20:.95,35:.85,50:.7})[E.tint]:0, tFrom=prev&&prev.tint?({5:.98,20:.95,35:.85,50:.7})[prev.tint]:0;
    svg+=`<polygon points="${pts(rg)}" fill="url(#${u}gl)" stroke="#0b0e12" stroke-width="1.5"/>`;
    if(E.tint) svg+=`<polygon points="${pts(rg)}" fill="#050608" opacity="${ch("tint")?tFrom:tOp}">${ch("tint")?`<animate attributeName="opacity" from="${tFrom}" to="${tOp}" dur=".8s" begin="1s" fill="freeze"/>`:""}</polygon>`;
    svg+=`<path d="M${rg[0][0]+10} ${rg[0][1]-4} L${rg[1][0]+8} ${rg[1][1]+6}" stroke="#fff" stroke-opacity=".18" stroke-width="5"/>`;
  } else {
    svg+=`<rect x="318" y="118" width="30" height="36" rx="8" fill="#15181c"/><rect x="356" y="122" width="24" height="32" rx="7" fill="#15181c"/>`;
  }
  svg+=`<path d="M${gl[2][0]-6} ${gl[2][1]+8} L${gl[3][0]-30} ${gl[3][1]-6}" stroke="#fff" stroke-opacity=".2" stroke-width="5"/>`;
  // doors + handle + mirror
  const dx=g.doors[0];
  svg+=`<g stroke="#000" stroke-opacity=".45" stroke-width="1.2" fill="none">`;
  if(dx) svg+=`<path d="M${dx+6} ${b-2} L${dx+2} ${s-6}"/>`;
  svg+=`<path d="M${g.Fw-62} ${b+4} L${g.Fw-62} ${s-6}"/>`;
  if(g.doors[1]!=="2") svg+=`<path d="M${g.Rw+64} ${b+2} Q${g.Rw+58} ${s-30} ${g.Rw+60} ${s-6}"/>`;
  svg+=`</g>`;
  const hx=dx?dx+22:430;
  svg+=`<rect x="${hx}" y="${b+10}" width="24" height="5" rx="2.5" fill="${darken(E.paint,.45)}"/>`;
  svg+=`<path d="M${gl[3][0]-18} ${gl[3][1]-2} q-4 -14 14 -16 l10 2 q2 12 -8 16 z" fill="${paintNew}" stroke="#000" stroke-opacity=".3"/>`;
  // lights
  const hl=E.smoked?"#3a4048":"#e9eef2", tl=E.smoked?"#3a0d12":"#c0161f";
  const lAnim=ch("smoked")?(from,to)=>`<animate attributeName="fill" from="${from}" to="${to}" dur=".6s" begin="1s" fill="freeze"/>`:()=>"";
  svg+=`<path d="M${f-56} ${b+9} L${f-10} ${b+15} L${f-5} ${b+25} L${f-48} ${b+21} Z" fill="${ch("smoked")?(prev.smoked?"#3a4048":"#e9eef2"):hl}">${lAnim(prev&&prev.smoked?"#3a4048":"#e9eef2",hl)}</path>`;
  svg+=`<path d="M${f-50} ${b+18} L${f-12} ${b+21}" stroke="#ffd9a0" stroke-opacity=".7" stroke-width="1.5"/>`;
  svg+=`<rect x="${g.tail.x-2}" y="${g.tail.y-6}" width="22" height="10" rx="3" fill="${ch("smoked")?(prev.smoked?"#3a0d12":"#c0161f"):tl}">${lAnim(prev&&prev.smoked?"#3a0d12":"#c0161f",tl)}</rect>`;
  svg+=`<rect x="${f-36}" y="${s-24}" width="28" height="9" rx="3" fill="#0d0f12" opacity=".8"/>`;
  // widebody flares
  if(E.wide){
    let fl="";
    for(const cx of [g.Rw,g.Fw]) fl+=`<path d="M${cx-HALF-8} ${s+2} A${ARCH+6} ${ARCH+6} 0 0 1 ${cx+HALF+8} ${s+2}" stroke="${paintNew}" stroke-width="13" fill="none"/><path d="M${cx-HALF-12} ${s+2} A${ARCH+11} ${ARCH+11} 0 0 1 ${cx+HALF+12} ${s+2}" stroke="#000" stroke-opacity=".4" stroke-width="1.4" fill="none"/>`+[ -1.1,-0.6,-0.1,0.4,0.9].map(t=>{const p=P(cx,WCY-4,ARCH+6,-Math.PI/2+t);return `<circle cx="${p[0]}" cy="${p[1]}" r="1.6" fill="#c8ccd0"/>`;}).join("");
    svg+=`<g${appear(ch("wide"),.6,0,-12)}>${fl}</g>`;
  }
  // aero kit
  if(E.kit){
    const kit=`<path d="M${f-70} ${s-2} L${f+4} ${s-6} L${f+12} ${s+3} L${f-70} ${s+5} Z" fill="url(#${u}cf)"/><rect x="${g.Rw+HALF+2}" y="${s-6}" width="${g.Fw-g.Rw-2*HALF-4}" height="11" rx="2" fill="url(#${u}cf)"/><path d="M${r-2} ${s-4} L${r+74} ${s-2} L${r+74} ${s+5} L${r-6} ${s+6} Z" fill="url(#${u}cf)"/>`+[14,30,46].map(x=>`<path d="M${r+x} ${s-2} l-4 8" stroke="#555b62" stroke-width="2"/>`).join("")+`<path d="M${f-14} ${s-30} l16 -2 l-3 6 z" fill="url(#${u}cf)"/>`;
    svg+=`<g${appear(ch("kit"),.6,0,14)}>${kit}</g>`;
  }
  // spoiler
  if(E.spoiler){
    const sp=g.spoiler; let sv="";
    if(sp.kind==="roof"){
      if(E.spoiler==="lip"||E.spoiler==="roof-ext") sv=`<path d="M${sp.x+16} ${sp.y-1} L${sp.x-22} ${sp.y+2} L${sp.x-46} ${sp.y+9} L${sp.x-12} ${sp.y+8} Z" fill="${paintNew}" stroke="#000" stroke-opacity=".3"/>`;
      else if(E.spoiler==="ducktail") sv=`<path d="M${sp.x+24} ${sp.y-1} Q${sp.x-20} ${sp.y-6} ${sp.x-58} ${sp.y-2} L${sp.x-30} ${sp.y+12} L${sp.x-6} ${sp.y+6} Z" fill="${paintNew}" stroke="#000" stroke-opacity=".3"/>`;
      else sv=`<path d="M${sp.x-10} ${sp.y} L${sp.x-22} ${sp.y-30} M${sp.x+28} ${sp.y-1} L${sp.x+18} ${sp.y-30}" stroke="#1b1e22" stroke-width="5"/><path d="M${sp.x-74} ${sp.y-30} Q${sp.x-10} ${sp.y-46} ${sp.x+40} ${sp.y-36} L${sp.x+40} ${sp.y-28} Q${sp.x-10} ${sp.y-34} ${sp.x-74} ${sp.y-24} Z" fill="url(#${u}cf)"/><rect x="${sp.x-78}" y="${sp.y-44}" width="6" height="24" rx="1.5" fill="#1b1e22"/>`;
    } else {
      if(E.spoiler==="lip"||E.spoiler==="roof-ext") sv=`<path d="M${sp.x+44} ${sp.y-1} L${sp.x-6} ${sp.y-1} L${sp.x-14} ${sp.y-9} Z" fill="${paintNew}" stroke="#000" stroke-opacity=".3"/>`;
      else if(E.spoiler==="ducktail") sv=`<path d="M${sp.x+76} ${sp.y-2} Q${sp.x+20} ${sp.y-6} ${sp.x-16} ${sp.y-22} L${sp.x-10} ${sp.y-1} Z" fill="${paintNew}" stroke="#000" stroke-opacity=".3"/>`;
      else sv=`<path d="M${sp.x+46} ${sp.y-2} L${sp.x+30} ${sp.y-42} M${sp.x+10} ${sp.y-1} L${sp.x-4} ${sp.y-42}" stroke="#1b1e22" stroke-width="5"/><path d="M${sp.x-46} ${sp.y-42} Q${sp.x+20} ${sp.y-58} ${sp.x+80} ${sp.y-46} L${sp.x+80} ${sp.y-38} Q${sp.x+20} ${sp.y-46} ${sp.x-46} ${sp.y-35} Z" fill="url(#${u}cf)"/><rect x="${sp.x-50}" y="${sp.y-56}" width="6" height="26" rx="1.5" fill="#1b1e22"/>`;
    }
    svg+=`<g${appear(ch("spoiler"),.8,0,26)}>${sv}</g>`;
  }
  svg+=`</g></svg>`;
  return svg;
}
function anchorFor(car,id){
  const g=GEO[car.style];
  const m={wheels:[g.Fw,WCY-50],drop:[g.Rw,WCY-62],spoiler:[g.spoiler.x,g.spoiler.y-(g.spoiler.kind==="roof"?40:46)],bodykit:[g.front-30,g.sill-8],widebody:[g.Rw,g.sill-58],exhaust:[g.rear,g.sill-14],tune:[g.front-110,g.belt-6],intake:[g.front-140,g.belt],brakes:[g.Fw+10,WCY-30],wrap:[(g.rear+g.front)/2,g.belt+20],tint:[g.rearGlass?g.rearGlass[1][0]+40:300,(g.rearGlass?g.rearGlass[1][1]:120)-6],stripes:[(g.rear+g.front)/2+80,g.belt+16],lights:[g.front-30,g.belt+6]}[id];
  // The 800×300 drawing sits centred in an 800×330 stage, so add the 15-unit top gap.
  return m?[m[0]/800*100,(m[1]+15)/330*100]:[50,40];
}

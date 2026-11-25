/* The virtual test drive: road drawing, simple physics, gears and 0-62 timing. */
"use strict";
/* ---------- test drive ---------- */
const road=$("road"), cvs=$("roadCanvas"), cx2=cvs.getContext("2d");
let dMode="build", drv={running:false,v:0,gear:1,rpm:0,thr:false,shift:0,dist:0,t0:null,done:false,last:0,wheelA:0,times:{},more:{},r:{}};
/* Share of top speed each gear reaches at the redline, by number of gears (6 if a car doesn't say). */
const GEAR_TOP={5:[.3,.48,.66,.84,1],6:[.26,.4,.55,.7,.85,1],7:[.23,.35,.48,.61,.74,.87,1],8:[.2,.31,.42,.53,.64,.76,.88,1]};
const gearsOf=c=>GEAR_TOP[c.gears]||GEAR_TOP[6];
/* Power cut while changing gear: a DSG is near-instant, a torque-converter auto is quick, a manual is slowest. */
const shiftTime=c=>({dsg:.08,auto:.14}[c.box]||.22);
/* Plain-English gearbox name for the info line, e.g. "7-speed DSG". */
const boxName=c=>(GEAR_TOP[c.gears]?c.gears:6)+"-speed "+({dsg:"DSG",auto:"auto"}[c.box]||"manual");
function dMods(){return dMode==="build"?state.mods:{};}
/* The car on the road: a side-on picture of the real 3D model (stock or your build) with its near-side wheels
   cut out as circles that spin. Until the 3D view has the car loaded, the simple drawing stands in. */
function drawDriveCar(){
  const v=window.Viewer3D, p=v&&v.profile&&car().model3d?v.profile(dMode==="stock"?"stock":"build"):null;
  if(!p||p.id!==car().id){$("driveCar").innerHTML=carSVG(car(),dMods(),{uid:"d"});return false;}
  const el=$("driveCar"); el.classList.add("real");
  el.innerHTML=`<div class="car3d" style="aspect-ratio:${p.aspect}"><img src="${p.url}" alt="">${p.wheels.map(w=>
    `<span class="wheel3d" style="left:${(w.x-w.r)*100}%;top:${(w.y-w.r*p.aspect)*100}%;width:${w.r*200}%;aspect-ratio:1;background-image:url(${p.url});background-size:${50/w.r}% auto;background-position:${(w.x-w.r)/(1-2*w.r)*100}% ${(w.y-w.r*p.aspect)/(1-2*w.r*p.aspect)*100}%"></span>`).join("")}</div>`;
  return true;
}
// The 3D car loads (and its add-on parts arrive) after the page: redraw the road car when they do, if it's showing.
let driveRedraw=null;
const redrawDriveSoon=()=>{clearTimeout(driveRedraw);driveRedraw=setTimeout(()=>{if(!$("drive").hidden)drawDriveCar();},400);};
["viewer3d-model","viewer3d-addon-loaded"].forEach(ev=>window.addEventListener(ev,redrawDriveSoon));
window.addEventListener("hashchange",()=>{if(location.hash==="#drive")redrawDriveSoon();});
function refreshDriveCar(){
  if(!drawDriveCar()) redrawDriveSoon();
  const p=perf(car(),dMods()); $("drivePower").textContent=p.hp+" bhp · "+p.kg+" kg · "+boxName(car());
  // If the engine is running in the test drive, restart it so it sounds like the current build.
  if(drv.running) engine.start(car(),dMods());
  // A different car means a different gearbox: start the run again so the gear and 0-62 timer fit it.
  if(drv.car&&drv.car!==car()) resetRun();
  // Keep the last 0-62 of each setup so stock and your build can be compared; a new car clears both,
  // a changed build clears only the build's time.
  const bk=JSON.stringify(state.mods||{});
  if(drv.car&&drv.car!==car()){drv.times={};drv.more={};} else if(drv.bk!==undefined&&drv.bk!==bk){drv.times.build=null;drv.more.build=null;}
  drv.bk=bk; showTimes();
  drv.car=car();
  drv.gear=Math.min(drv.gear||1,gearsOf(car()).length);
}
/* Both remembered times under the run result, e.g. "Stock 5.90s · Your build 5.23s: 0.67s quicker". */
function showTimes(){
  const el=$("runBoth"); if(!el) return;
  const s=drv.times.stock, b=drv.times.build, f=t=>`<b class="mono">${t.toFixed(2)}s</b>`;
  if(s==null&&b==null){el.textContent="";return;}
  let h=`Stock ${s!=null?f(s):"<span class=\"muted\">not timed yet</span>"} · Your build ${b!=null?f(b):"<span class=\"muted\">not timed yet</span>"}`;
  if(s!=null&&b!=null){const d=s-b; h+=Math.abs(d)<.005?": the same":`: ${Math.abs(d).toFixed(2)}s ${d>0?"quicker":"slower"}`;}
  // Car #153: the 30-70 (overtaking) and quarter-mile times for each setup, once any are timed.
  const ms=drv.more.stock||{}, mb=drv.more.build||{}, g=t=>t!=null?`<b class="mono">${t.toFixed(1)}s</b>`:"<span class=\"muted\">–</span>";
  if(ms.a!=null||mb.a!=null) h+=`<br>30–70 mph: Stock ${g(ms.a)} · Your build ${g(mb.a)}`;
  if(ms.q!=null||mb.q!=null) h+=`<br>Quarter mile: Stock ${g(ms.q)} · Your build ${g(mb.q)}`;
  el.innerHTML=h;
}
/* The current run's result: 0-62 first, then 30-70 and the quarter mile as they are reached (all virtual). */
function showRun(c){
  const r=drv.r; if(r.t62==null){$("runResult").textContent="";return;}
  let h=`Virtual 0–62 mph: <b class="mono">${r.t62.toFixed(2)}s</b> <span class="muted">(${dMode==="build"?"your build; estimated":"stock; manufacturer claims"} ${perf(c,dMods()).t62.toFixed(1)}s)</span>`;
  const x=[]; if(r.a!=null) x.push(`30–70: <b class="mono">${r.a.toFixed(1)}s</b>`); if(r.q!=null) x.push(`Quarter mile: <b class="mono">${r.q.toFixed(1)}s</b>`);
  if(x.length) h+=`<br><span class="muted">Virtual</span> ${x.join(" · ")}`; else h+=`<br><span class="muted">Keep the throttle down for 30–70 and the quarter mile</span>`;
  $("runResult").innerHTML=h;
}
function setDMode(m){dMode=m;$("dStock").setAttribute("aria-pressed",m==="stock");$("dBuild").setAttribute("aria-pressed",m==="build");refreshDriveCar();resetRun();}
$("dStock").addEventListener("click",()=>setDMode("stock"));
$("dBuild").addEventListener("click",()=>setDMode("build"));
function resetRun(){drv.v=0;drv.gear=1;drv.t0=null;drv.done=false;drv.r={};$("runResult").textContent="";}
function stopDriveEngine(){if(drv.running){drv.running=false;road.classList.remove("live");engine.stop();$("engineBtn").textContent="Start engine";$("throttle").disabled=true;$("driveHint").textContent="Start the engine to drive";drv.thr=false;}}
$("engineBtn").addEventListener("click",()=>{
  if(drv.running){stopDriveEngine();return;}
  stopRev();
  if(!engine.start(car(),dMods())){$("runResult").textContent="Sound is not supported in this browser.";}
  drv.running=true; road.classList.add("live"); resetRun(); $("engineBtn").textContent="Stop engine"; $("throttle").disabled=false; $("driveHint").textContent="Hold the throttle or press Space";
  drv.last=performance.now();
  // Move focus to the throttle so releasing Space can't "click" the Stop engine button.
  $("throttle").focus();
});
const thrBtn=$("throttle");
// Capture the finger so sliding slightly off the button doesn't cut the throttle.
const thrOn=e=>{if(!drv.running)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}drv.thr=true;thrBtn.classList.add("on");};
const thrOff=()=>{drv.thr=false;thrBtn.classList.remove("on");};
thrBtn.addEventListener("pointerdown",thrOn);["pointerup","pointerleave","pointercancel"].forEach(ev=>thrBtn.addEventListener(ev,thrOff));
road.addEventListener("pointerdown",thrOn);["pointerup","pointerleave","pointercancel"].forEach(ev=>road.addEventListener(ev,thrOff));
// Stop the phone long-press menu, which would otherwise cancel the throttle mid-launch.
[thrBtn,road].forEach(el=>el.addEventListener("contextmenu",e=>e.preventDefault()));
// Track whether the test drive is on screen: keys only work there, and the road isn't redrawn when it's hidden and idle.
let driveVisible=true, keyThrottle=false;
new IntersectionObserver(es=>{driveVisible=es[0].isIntersecting;if(driveVisible)drv.dirty=true;},{threshold:.25}).observe($("drive"));
// Space / Up arrow act as the throttle only while the test drive is on screen or focused, so they still scroll the rest of the page.
document.addEventListener("keydown",e=>{if((e.code==="Space"||e.code==="ArrowUp")&&drv.running&&(driveVisible||$("drive").contains(document.activeElement))&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){e.preventDefault();drv.thr=true;keyThrottle=true;thrBtn.classList.add("on");}});
// If the key was used as the throttle, also block its keyup so no focused button gets "clicked".
document.addEventListener("keyup",e=>{if(e.code==="Space"||e.code==="ArrowUp"){if(keyThrottle){e.preventDefault();keyThrottle=false;}thrOff();}});
// Turn the engine off when you leave the Test drive page or switch tabs, so it never drones on unseen.
// (Checked after the router has run, so a hidden page means the drive is gone from view.)
window.addEventListener("hashchange",()=>setTimeout(()=>{if(!$("drive").offsetParent)stopDriveEngine();},0));
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopDriveEngine();});
// Alt-Tab while holding Space loses the keyup, so let go of the throttle when the window loses focus.
window.addEventListener("blur",()=>{keyThrottle=false;thrOff();});

function sizeCanvas(){const r=road.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);cvs.width=Math.round(r.width*d);cvs.height=Math.round(r.height*d);drv.dirty=true;}
new ResizeObserver(sizeCanvas).observe(road); sizeCanvas();
/* "Reduce motion" (an OS setting): hills, posts and speed streaks stay still; only the lane dashes move, so speed still shows. */
const driveCalm=window.matchMedia?matchMedia("(prefers-reduced-motion: reduce)"):{matches:false};
driveCalm.addEventListener?.("change",()=>{drv.dirty=true;});
function drawRoad(){
  const W=cvs.width,H=cvs.height,x=cx2,d=drv.dist,calm=driveCalm.matches,sd=calm?0:d;
  const sky=x.createLinearGradient(0,0,0,H*.62);sky.addColorStop(0,"#0f1a2b");sky.addColorStop(.7,"#3a3550");sky.addColorStop(1,"#c98a52");
  x.fillStyle=sky;x.fillRect(0,0,W,H);
  x.fillStyle="rgba(255,214,160,.85)";x.beginPath();x.arc(W*.78,H*.5,H*.07,0,Math.PI*2);x.fill();
  const hills=(base,amp,speed,col,f)=>{x.fillStyle=col;x.beginPath();x.moveTo(0,H);for(let i=0;i<=W;i+=W/60){const wx=(i+sd*speed)/W*f;x.lineTo(i,base-amp*(Math.sin(wx*2.1)*.6+Math.sin(wx*5.3)*.25+Math.sin(wx*.7)*.4));}x.lineTo(W,H);x.fill();};
  hills(H*.58,H*.08,6,"#242238",3);
  hills(H*.62,H*.05,18,"#17171f",6);
  x.fillStyle="#101216";x.fillRect(0,H*.64,W,H*.36);
  x.fillStyle="#1c1f25";x.fillRect(0,H*.66,W,H*.24);
  x.fillStyle="#2b2f36";x.fillRect(0,H*.655,W,H*.008);
  const dash=W*.12,gap=W*.1,off=(d*60)%(dash+gap);
  x.fillStyle="#d8d2c2";for(let i=-off;i<W;i+=dash+gap) x.fillRect(i,H*.885,dash,H*.008);
  const pg=W*.22,po=(sd*60)%pg;x.fillStyle="#cfd3d8";
  for(let i=-po;i<W+pg;i+=pg){x.fillRect(i,H*.6,W*.006,H*.06);x.fillStyle="#d14a2a";x.fillRect(i,H*.6,W*.006,H*.012);x.fillStyle="#cfd3d8";}
  if(!calm&&drv.v>25){x.strokeStyle=`rgba(255,255,255,${Math.min(.18,(drv.v-25)/200)})`;x.lineWidth=1;for(let i=0;i<14;i++){const y=H*(.2+((i*37)%50)/100),len=W*.15,xx=(W-((d*90+i*173)%(W+len)));x.beginPath();x.moveTo(xx,y);x.lineTo(xx+len,y);x.stroke();}}
}
/* One physics step, shared by the live drive and the off-screen calibration run. */
const MPH=0.44704, driveCalCache={};
function driveStep(s,c,P,m,cal,thr,dt){
  const red=c.redline, mu={FWD:.72,RWD:.85,AWD:1.05}[c.drive]*(cal.muK||1);
  let F=0, shifted=false;
  if(s.shift>0) s.shift-=dt;
  else if(thr) F=Math.min(P/Math.max(s.v,2.5),mu*m*9.81);
  const drag=cal.cd*s.v*s.v+.012*m*9.81+(thr?0:.06*m*9.81);
  s.v=Math.max(0,Math.min(cal.vMax,s.v+(F-drag)/m*dt));
  const G=gearsOf(c), gt=G[s.gear-1]*cal.vGear*1.02;
  s.rpm=Math.max(thr&&s.gear===1?2200+s.v/gt*red:900,red*s.v/gt);
  if(s.rpm>=red*.97&&s.gear<G.length){s.gear++;s.shift=shiftTime(c);shifted=true;}
  if(!thr&&s.gear>1&&s.rpm<red*.35) s.gear--;
  s.rpm=Math.min(s.rpm,red);
  return shifted;
}
/* Tune each car once so the stock car matches its real 0-62 time and top speed.
   k scales power (kept for the build too); cd is the drag that lets stock reach topSpeed. */
function driveCal(c){
  if(driveCalCache[c.id]) return driveCalCache[c.id];
  const st=perf(c,{}), m=st.kg+80, vT=(c.topSpeed||155)*MPH, roll=.012*m*9.81;
  const vAim=c.limited?vT*1.08:vT+0.5*MPH; // limited cars must actually reach the limiter
  const mk=k=>{const P=st.hp*745.7*.8*k;return {k,cd:Math.max(.05,(P/vAim-roll)/(vAim*vAim)),vGear:vT,vMax:c.limited?vT:vT*1.5};};
  const t62=cal=>{const s={v:0,gear:1,shift:0,rpm:0},P=st.hp*745.7*.8*cal.k;let t=0;
    while(s.v<62/2.237&&t<60){driveStep(s,c,P,m,cal,true,1/60);t+=1/60;}return t;};
  let lo=.2,hi=4;
  for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(t62(mk(mid))>c.t62)lo=mid;else hi=mid;}
  return driveCalCache[c.id]=mk((lo+hi)/2);
}
/* Car #115: tune a build the same way, so the road run lands on the Build page's 0-62 (perf() is the
   source of truth). Extra grip from the build (lowering, wider wheels...) helps the launch a little,
   and if power alone can't reach the estimate (traction-limited), launch grip makes up the rest. */
const driveBuildCache={};
function driveBuildCal(c,mods){
  const base=driveCal(c), key=c.id+"|"+JSON.stringify(mods||{});
  if(!mods||!Object.keys(mods).length) return base;
  if(driveBuildCache[key]) return driveBuildCache[key];
  const p=perf(c,mods), st=perf(c,{}), m=p.kg+80, aim=p.t62;
  const run=cal=>{const s={v:0,gear:1,shift:0,rpm:0},P=p.hp*745.7*.8*cal.k;let t=0;
    while(s.v<62/2.237&&t<60){driveStep(s,c,P,m,cal,true,1/60);t+=1/60;}return t;};
  const at=(kb,muK)=>({...base,k:base.k*kb,muK});
  let muK=1+Math.max(0,p.grip-st.grip)*.004, lo=.3, hi=3;
  if(run(at(hi,muK))>aim){let a=muK,b=2;for(let i=0;i<20;i++){const mid=(a+b)/2;if(run(at(hi,mid))>aim)a=mid;else b=mid;}muK=b;}
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(run(at(mid,muK))>aim)lo=mid;else hi=mid;}
  return driveBuildCache[key]=at((lo+hi)/2,muK);
}
function driveLoop(now){
  if(!driveVisible&&!drv.running){drv.last=now;requestAnimationFrame(driveLoop);return;}
  // Website #151: standing still with the engine off nothing moves, so draw the road once (first frame,
  // after a resize or coming back on screen) and skip the physics and redraws until the engine starts.
  if(!drv.running&&drv.v===0){drv.last=now;if(drv.dirty!==false){drv.dirty=false;drawRoad();}requestAnimationFrame(driveLoop);return;}
  const dt=Math.min(.05,(now-(drv.last||now))/1000); drv.last=now;
  const c=car(), p=perf(c,dMods()), m=p.kg+80, cal=driveBuildCal(c,dMods());
  const red=c.redline, P=p.hp*745.7*.8*cal.k;
  if(drv.running){
    if(drv.thr&&drv.t0===null&&drv.v<.5){drv.t0=now;drv.done=false;drv.r={};drv.m=0;drv.t30=null;$("runResult").textContent="";}
    if(driveStep(drv,c,P,m,cal,drv.thr,dt)) c.box==="dsg"?engine.burst(.035,1100,.06):engine.burst(.05,900,.05); // DSG: shorter, sharper pop
    engine.set(drv.rpm,drv.thr&&drv.shift<=0?1:0);
    const mph=drv.v*2.237;
    if(drv.t0!==null&&!drv.done&&mph>=62){drv.done=true;const t=(now-drv.t0)/1000;drv.r.t62=t;showRun(c);drv.times[dMode]=t;showTimes();}
    // Car #153: real metres since the start (drv.dist is scaled for drawing), the 30-70 split and the quarter mile (402 m).
    if(drv.t0!==null){
      const el=(now-drv.t0)/1000, r=drv.r; let nu=false; drv.m+=drv.v*dt;
      if(drv.t30==null&&mph>=30) drv.t30=el;
      if(r.a==null&&drv.t30!=null&&mph>=70){r.a=el-drv.t30;nu=true;}
      if(r.q==null&&drv.m>=402.3){r.q=el;nu=true;}
      if(nu){const k=drv.more[dMode]||(drv.more[dMode]={}); if(r.a!=null) k.a=r.a; if(r.q!=null) k.q=r.q; if(r.t62!=null) showRun(c); showTimes();}
    }
    if(drv.v<.3&&!drv.thr) drv.t0=null;
    $("mph").textContent=Math.round(mph);$("gear").textContent=drv.v<.2&&!drv.thr?"N":drv.gear;$("rpmTxt").textContent=Math.round(drv.rpm/50)*50;$("rpmBar").style.width=(drv.rpm/red*100)+"%";
  }
  drv.dist+=drv.v*dt*.06;
  drv.wheelA=(drv.wheelA+drv.v*dt/0.33*57.3)%360;
  document.querySelectorAll("#driveCar .spin").forEach(g=>g.setAttribute("transform",`rotate(${drv.wheelA.toFixed(1)} ${g.dataset.cx} ${g.dataset.cy})`));
  document.querySelectorAll("#driveCar .wheel3d").forEach(w=>{w.style.transform=`rotate(${drv.wheelA.toFixed(1)}deg)`;});
  drawRoad();
  requestAnimationFrame(driveLoop);
}
requestAnimationFrame(driveLoop);

/* The 'Hear stock' and 'Hear your build' rev demos. */
"use strict";
/* studio rev demo */
let revRAF=null, revBtn=null;
function playRev(which,btn){
  if(revBtn===btn){stopRev();return;}
  stopRev(); stopDriveEngine();
  const c=car(), m=which==="build"?state.mods:{};
  const quiet=which==="build"&&!(m.exhaust||m.intake||m.tune);
  $("soundNote").hidden=!quiet;
  if(!engine.start(c,m)) return;
  revBtn=btn; btn.innerHTML=revLabel(btn,true); btn.setAttribute("aria-pressed","true");
  const red=c.redline, seq=[[0,900,0],[900,900,0],[1100,4200,1],[1450,1500,0],[1900,900,0],[2300,1200,1],[3900,red*.98,1],[4000,red*.98,0],[4900,900,0],[5600,900,0]];
  const t0=performance.now(), carId=state.car;
  const tick=now=>{
    if(state.car!==carId){stopRev();return;} // car switched mid-demo: don't keep playing the old car's sound
    const t=now-t0; let i=0; while(i<seq.length-1&&seq[i+1][0]<t) i++;
    if(i>=seq.length-1){stopRev();return;}
    const a=seq[i],b=seq[i+1],k=(t-a[0])/(b[0]-a[0]);
    engine.set(a[1]+(b[1]-a[1])*Math.min(1,k*(b[2]?1:1.6)),b[2]);
    revRAF=requestAnimationFrame(tick);
  };
  revRAF=requestAnimationFrame(tick);
}
function stopRev(){if(revRAF)cancelAnimationFrame(revRAF);revRAF=null;if(revBtn){revBtn.innerHTML=revLabel(revBtn,false);revBtn.setAttribute("aria-pressed","false");revBtn=null;engine.stop();}}
// Button text: the ▶/■ symbol is hidden from screen readers; while playing it says "Stop" plus a hidden "stock sound"/"your build sound".
function revLabel(btn,playing){const stock=btn.id==="hearStock";return playing?`<span aria-hidden="true">■</span> Stop<span class="visually-hidden"> ${stock?"stock":"your build"} sound</span>`:`<span aria-hidden="true">▶</span> ${stock?"Hear stock":"Hear your build"}`;}
$("hearStock").addEventListener("click",e=>playRev("stock",e.currentTarget));
$("hearBuild").addEventListener("click",e=>playRev("build",e.currentTarget));
// Stop the demo when you switch browser tab or leave the page it's on, so it never drones on unseen at high revs
// (the browser pauses the rev sequence in a hidden tab but the engine sound would keep going). Same as the Test drive.
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopRev();});
window.addEventListener("hashchange",()=>setTimeout(()=>{if(revBtn&&!revBtn.offsetParent)stopRev();},0));
$("soundTry").addEventListener("click",()=>{stopRev();$("soundNote").hidden=true;applyPlan(localPlan("louder exhaust"),"louder exhaust");});

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
  revBtn=btn; btn.textContent="■ Stop";
  const red=c.redline, seq=[[0,900,0],[900,900,0],[1100,4200,1],[1450,1500,0],[1900,900,0],[2300,1200,1],[3900,red*.98,1],[4000,red*.98,0],[4900,900,0],[5600,900,0]];
  const t0=performance.now();
  const tick=now=>{
    const t=now-t0; let i=0; while(i<seq.length-1&&seq[i+1][0]<t) i++;
    if(i>=seq.length-1){stopRev();return;}
    const a=seq[i],b=seq[i+1],k=(t-a[0])/(b[0]-a[0]);
    engine.set(a[1]+(b[1]-a[1])*Math.min(1,k*(b[2]?1:1.6)),b[2]);
    revRAF=requestAnimationFrame(tick);
  };
  revRAF=requestAnimationFrame(tick);
}
function stopRev(){if(revRAF)cancelAnimationFrame(revRAF);revRAF=null;if(revBtn){revBtn.textContent=revBtn.id==="hearStock"?"▶ Hear stock":"▶ Hear your build";revBtn=null;engine.stop();}}
$("hearStock").addEventListener("click",e=>playRev("stock",e.currentTarget));
$("hearBuild").addEventListener("click",e=>playRev("build",e.currentTarget));
$("soundTry").addEventListener("click",()=>{stopRev();$("soundNote").hidden=true;applyPlan(localPlan("louder exhaust"),"louder exhaust");});

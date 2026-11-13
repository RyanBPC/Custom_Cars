/* Engine sound, made live with the Web Audio API (no sound files). */
"use strict";
/* ---------- engine sound ---------- */
class Engine{
  constructor(){this.ctx=null;this.on=false;}
  start(c,m){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;this.ctx=new AC();
      // One shared 2-second noise buffer, made once and reused by every start.
      const b=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=b;
    }
    if(this.on) this.stop(true);
    const x=this.ctx; x.resume&&x.resume();
    this.p={cyl:c.cyl,turbo:c.turbo||(m.tune&&m.tune.stage===3),v8:c.cyl===8,ex:!!m.exhaust,red:c.redline,int:!!m.intake,stage:m.tune?m.tune.stage:0};
    const out=x.createDynamicsCompressor(); out.connect(x.destination);
    const master=x.createGain(); master.gain.value=0; master.connect(out);
    const filt=x.createBiquadFilter(); filt.type="lowpass"; filt.Q.value=4; filt.connect(master);
    const shaper=x.createWaveShaper(); const k=this.p.ex?28:14, n=1024, curve=new Float32Array(n);
    for(let i=0;i<n;i++){const v=i*2/n-1;curve[i]=(1+k)*v/(1+k*Math.abs(v));} shaper.curve=curve; shaper.connect(filt);
    const body=x.createGain(); body.gain.value=.55; body.connect(shaper);
    const o1=x.createOscillator();o1.type="sawtooth";o1.connect(body);
    const g2=x.createGain();g2.gain.value=.5;g2.connect(body);const o2=x.createOscillator();o2.type="square";o2.connect(g2);
    const g3=x.createGain();g3.gain.value=.18;g3.connect(body);const o3=x.createOscillator();o3.type="triangle";o3.connect(g3);
    let lfo=null; if(this.p.v8||this.p.cyl===5||this.p.cyl===3){lfo=x.createOscillator();lfo.type="sine";const lg=x.createGain();lg.gain.value=this.p.v8?.35:.18;lfo.connect(lg);lg.connect(body.gain);lfo.start();}
    const buf=this.noise;
    const ns=x.createBufferSource();ns.buffer=buf;ns.loop=true;const bp=x.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1400;bp.Q.value=.6;const ng=x.createGain();ng.gain.value=0;ns.connect(bp);bp.connect(ng);ng.connect(master);ns.start();
    let tg=null,to=null; if(this.p.turbo){to=x.createOscillator();to.type="sine";tg=x.createGain();tg.gain.value=0;to.connect(tg);tg.connect(out);to.start();}
    [o1,o2,o3].forEach(o=>o.start());
    this.n={out,master,filt,o1,o2,o3,lfo,ng,tg,to,ns,buf};
    this.on=true; this.lastLoad=0; this.set(900,0);
    master.gain.setTargetAtTime(this.vol(0),x.currentTime,.1);
    return true;
  }
  vol(load){return (.09+.13*load)*(this.p.ex?1.45:1);}
  set(rpm,load){
    if(!this.on) return; const x=this.ctx,t=x.currentTime,n=this.n,p=this.p;
    const f=rpm/60*p.cyl/2;
    n.o1.frequency.setTargetAtTime(f,t,.025); n.o2.frequency.setTargetAtTime(f/2,t,.025); n.o3.frequency.setTargetAtTime(f*1.5,t,.025);
    if(n.lfo) n.lfo.frequency.setTargetAtTime(f/(p.v8?4:2.5),t,.05);
    n.filt.frequency.setTargetAtTime((220+rpm*.2+load*700)*(p.ex?1.5:1),t,.04);
    n.master.gain.setTargetAtTime(this.vol(load),t,.05);
    n.ng.gain.setTargetAtTime(load*(p.int?.06:.03)*(rpm/p.red),t,.05);
    if(n.tg){n.to.frequency.setTargetAtTime(2400+rpm*.7,t,.2);n.tg.gain.setTargetAtTime(load*.012*(rpm/p.red)*(p.stage>=2?1.6:1),t,.25);}
    if(this.lastLoad>.5&&load<.1){ if(p.turbo&&rpm>3000) this.burst(.25,2500,.08); if(p.ex&&rpm>3800) for(let i=0;i<5;i++) setTimeout(()=>this.burst(.05+Math.random()*.04,400,.22),80+i*90+Math.random()*60); }
    this.lastLoad=load;
  }
  burst(dur,hp,amp){
    if(!this.on) return; const x=this.ctx,t=x.currentTime;
    const s=x.createBufferSource();s.buffer=this.n.buf;const h=x.createBiquadFilter();h.type="highpass";h.frequency.value=hp;const g=x.createGain();
    g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(h);h.connect(g);g.connect(this.n.out);s.start(t,Math.random());s.stop(t+dur+.05);
  }
  stop(now){
    if(!this.on) return; const n=this.n,x=this.ctx,t=x.currentTime;
    n.master.gain.setTargetAtTime(0,t,now?.01:.15); if(n.tg) n.tg.gain.setTargetAtTime(0,t,.05);
    const all=[n.o1,n.o2,n.o3,n.lfo,n.to,n.ns].filter(Boolean);
    setTimeout(()=>{all.forEach(o=>{try{o.stop();}catch(e){}});try{n.out.disconnect();}catch(e){}},now?60:700);
    this.on=false;
  }
}
const engine=new Engine();

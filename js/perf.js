/* Performance model: power, torque, weight, 0-62 time, grip and braking for a build. */
"use strict";
/* ---------- performance ---------- */
/* Rough real changes from extra parts (Car #111): kg, grip, hp share (turbo-only where noted). Unlisted parts change nothing. */
const EXTRA_PERF={"Carbon-fibre bonnet":{kg:-10},"Carbon roof":{kg:-5},"Bucket seats":{kg:-20},"Roll cage":{kg:30,grip:2},
  "Bull bar":{kg:15},"Roof rack":{kg:6},"Lift kit":{kg:25,grip:-6},"All-terrain tyres":{grip:-8},"Uprated intercooler":{hp:.01,turbo:true},
  "Negative camber setup":{grip:3},"Wheel spacers":{grip:1},"Tow bar":{kg:12},"Racing harnesses":{kg:2},"Snorkel":{kg:3},"LED light bar":{kg:3},
  "Limited slip diff":{grip:3},"Uprated anti-roll bars":{grip:2},"Strut brace":{grip:1}};
function perf(car,m){
  m=m||{}; let hp=0,nm=0,kg=car.kg,grip=car.handling,brake=car.braking,down=0;
  if(m.tune){const t=TUNE_GAIN[car.turbo?"t":"n"][m.tune.stage];hp+=t[0];nm+=t[1];}
  if(m.intake){hp+=.015;nm+=.01;}
  if(m.exhaust){hp+=car.turbo?.02:.03;nm+=.02;kg-=6;}
  if(m.wheels){const d=m.wheels.size-car.wheel;grip+=Math.min(d,1)*1.5;kg+=(m.wheels.style==="monoblock"?-8:0)+d*4;}
  if(m.drop){const mm=m.drop.mm;grip+=mm<=30?5+mm/10:Math.max(5,8-(mm-30)*.05);} // best around 30mm; lower runs out of travel
  if(m.widebody){grip+=4;kg+=12;}
  if(m.bodykit){grip+=2;kg+=6;down+=25;}
  if(m.spoiler){const s={lip:[10,1,0],ducktail:[25,2,1],"gt-wing":[90,5,4]}[m.spoiler.type];down+=s[0];kg+=s[1];grip+=s[2];}
  if(m.brakes){brake+=14;kg+=2;}
  ((m.custom&&m.custom.items)||[]).forEach(i=>{const e=EXTRA_PERF[i.name];if(!e||(e.turbo&&!car.turbo))return;kg+=e.kg||0;grip+=e.grip||0;hp+=e.hp||0;});
  const HP=Math.round(car.hp*(1+hp)), NM=Math.round(car.nm*(1+nm));
  const floor=Math.min(car.t62,{FWD:4.3,RWD:3.4,AWD:2.7}[car.drive]);
  const t62=Math.max(floor,car.t62*Math.pow((car.hp/car.kg)/(HP/kg),.72));
  return {hp:HP,nm:NM,kg:Math.round(kg),t62:Math.round(t62*10)/10,ptw:Math.round(HP/(kg/1000)),grip:Math.min(100,Math.round(grip)),brake:Math.min(100,Math.round(brake)),down};
}
function buildCost(car,m){return Object.keys(m||{}).reduce((a,k)=>a+modPrice(k,m[k],car),0);}

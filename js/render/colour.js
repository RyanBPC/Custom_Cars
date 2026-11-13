/* Small colour helpers used by the car drawing. */
"use strict";
/* ---------- colour utils ---------- */
function hexToRgb(h){h=h.replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255];}
function rgbToHex(r,g,b){return"#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
function mix(a,b,t){const A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);}
const lighten=(c,t)=>mix(c,"#ffffff",t), darken=(c,t)=>mix(c,"#000000",t);
function validHex(h){return /^#?[0-9a-f]{6}$/i.test(String(h||""));}

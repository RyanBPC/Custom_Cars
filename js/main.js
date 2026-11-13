/* Start-up: draws the page for the saved (or default) car and says hello. Loaded last. */
"use strict";
/* ---------- init ---------- */
renderPicker(); renderStage(null,null); setSplit(50); renderInfo(); refreshDriveCar();
if(state.plate) $("plate").value=state.plate;
if(window.fromBuildLink&&Object.keys(state.mods).length) addAI(`This build was opened from a link: ${Object.keys(state.mods).length} part${Object.keys(state.mods).length===1?"":"s"} fitted to the ${car().make} ${car().model}. Keep chatting to change it.`);
else addAI(`Hi, I'm your build advisor. You're looking at the ${car().make} ${car().model}. Tell me what you'd like, such as "drop it 30mm with 19-inch bronze wheels" or "make it louder", and I'll fit it.`);

/* Native range semantics, with a rotary face and vertical pointer gestures. */
(() => {
 'use strict';
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 function fraction(input){const min=Number(input.min),max=Number(input.max),value=Number(input.value);return input.dataset.knobScale==='log'?(Math.log(value)-Math.log(min))/(Math.log(max)-Math.log(min)):(value-min)/(max-min);}
 function update(input){input.closest('.knob-control')?.style.setProperty('--knob-position',clamp(fraction(input),0,1));}
 function init(root){
  for(const input of root.querySelectorAll('[data-knob]')){
   const surface=input.closest('.knob-surface');let gesture=null;
   input.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();input.focus();input.setPointerCapture(event.pointerId);
    gesture={pointer:event.pointerId,x:event.clientX,y:event.clientY,value:fraction(input)};
   });
   input.addEventListener('pointermove',event=>{
    if(!gesture||gesture.pointer!==event.pointerId)return;
    const t=clamp(gesture.value+((gesture.y-event.clientY)+(event.clientX-gesture.x)*.4)/150*(event.shiftKey ? .15 : 1),0,1);
    const min=Number(input.min),max=Number(input.max),step=Number(input.step)||.01;
    const raw=input.dataset.knobScale==='log'?Math.exp(Math.log(min)+t*(Math.log(max)-Math.log(min))):min+t*(max-min);
    input.value=String(clamp(min+Math.round((raw-min)/step)*step,min,max));input.dispatchEvent(new Event('input',{bubbles:true}));
   });
   for(const event of ['pointerup','pointercancel','lostpointercapture'])input.addEventListener(event,()=>{gesture=null;surface.classList.remove('is-turning');});
   input.addEventListener('pointerdown',()=>surface.classList.add('is-turning'));
   input.addEventListener('input',()=>update(input));update(input);
  }
 }
 window.SynthKnobs={init,update};
})();

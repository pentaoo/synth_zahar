/* Drag a musical fragment into a gap in a ring. A click remains a click. */
(() => {
 'use strict';
 function mount(root,api){
  const ghost=document.createElement('div');ghost.className='pattern-drag-ghost';ghost.hidden=true;ghost.setAttribute('aria-hidden','true');root.append(ghost);
  const ring=root.querySelector('[data-fields]'),preview=document.createElementNS('http://www.w3.org/2000/svg','svg');preview.setAttribute('viewBox','0 0 1000 1000');preview.classList.add('pattern-drop-preview');preview.setAttribute('aria-hidden','true');preview.style.display='none';
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');preview.append(path);ring.append(preview);
  let drag=null,ignoreUntil=0;
  function begin(event,fragment){if(event.button!==0)return;drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,fragment,moved:false,target:null};event.currentTarget.setPointerCapture(event.pointerId);}
  function move(event){
   if(!drag||event.pointerId!==drag.pointer)return;
   if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
   drag.moved=true;ghost.hidden=false;ghost.style.left=event.clientX+14+'px';ghost.style.top=event.clientY-20+'px';
   const target=api.target(event.clientX,event.clientY);drag.target=target?.allowed?target:null;
   ghost.textContent=window.PhrasePresets.groups[drag.fragment.group].presets[drag.fragment.preset].name+(target?target.allowed?' · вставить фразу':' · 16 фраз':' · перетащи на кольцо');
   preview.style.display=drag.target?'':'none';
   if(drag.target){path.setAttribute('d',window.CompositionTools.sectorPath(target.count+1,target.radii));path.style.transform='rotate('+target.index*360/(target.count+1)+'deg)';}
   api.preview(drag.target);
  }
  function finish(event,cancel=false){
   if(!drag||event.pointerId!==drag.pointer)return;const previous=drag;drag=null;ghost.hidden=true;preview.style.display='none';api.preview(null);
   if(previous.moved){ignoreUntil=performance.now()+400;if(!cancel&&previous.target)api.insert(previous.fragment,previous.target);}
  }
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',event=>finish(event));window.addEventListener('pointercancel',event=>finish(event,true));
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){finish({pointerId:drag.pointer},true);event.preventDefault();}});
  return {begin,didDrag:()=>performance.now()<ignoreUntil};
 }
 window.PatternDrag={mount};
})();

/* The selected phrase is a view onto its own data; it never owns the transport. */
(() => {
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value)),clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
 function mount(root,api){
  const panel=root.querySelector('[data-live-editor]'),canvas=panel.querySelector('canvas'),context=canvas.getContext('2d'),overlay=panel.querySelector('[data-live-sources]');
  const select=panel.querySelector('[data-live-source]'),brush=panel.querySelector('[data-live-brush]'),beats=panel.querySelector('[data-live-beats]');
  const buttons=new Map(),histories=new Map();let selectedId=null,key=null,gesture=null,geom={left:26,right:600,top:26,bottom:180};
  const selected=model=>model?.snapshot.scenes.autumn.find(source=>source.id===selectedId);
  const history=()=>{if(!histories.has(key))histories.set(key,[]);return histories.get(key);};
  function remember(){const model=api.get();if(!model)return;const stack=history();stack.push(clone({sources:model.snapshot.scenes.autumn,nextId:model.snapshot.nextId,selectedId}));if(stack.length>20)stack.shift();}
  function change(update,record=true){if(record)remember();api.update(update);render();}
  function message(text){panel.querySelector('[data-live-status]').textContent=text;}
  function add(x=.5,y=.5){
   const model=api.get();if(!model)return;if(model.snapshot.scenes.autumn.length>=16){message('В этой фразе уже 16 источников');return;}
   change(snapshot=>{const source=api.create(brush.value,snapshot,x,y);snapshot.scenes.autumn.push(source);selectedId=source.id;snapshot.selectedId=source.id;});api.selectSource(selectedId);
  }
  function remove(){if(!api.get()||!selected(api.get()))return;change(snapshot=>{snapshot.scenes.autumn=snapshot.scenes.autumn.filter(source=>source.id!==selectedId);selectedId=snapshot.scenes.autumn[0]?.id||null;});}
  function copy(){const source=selected(api.get());if(!source)return;if(api.get().snapshot.scenes.autumn.length>=16){message('В этой фразе уже 16 источников');return;}
   change(snapshot=>{const next=clone(source);next.id=snapshot.nextId++;next.y=clamp(next.y+.08,.08,.92);snapshot.scenes.autumn.push(next);selectedId=next.id;});}
  function undo(){const previous=history().pop();if(!previous)return;selectedId=previous.selectedId;api.update(snapshot=>{snapshot.scenes.autumn=previous.sources;snapshot.nextId=previous.nextId;snapshot.selectedId=selectedId;});render();}
  function choose(id){selectedId=id;api.selectSource(id);render();}
  function position(source){return {x:geom.left+source.x*(geom.right-geom.left),y:geom.bottom-source.y*(geom.bottom-geom.top)};}
  function coordinates(event){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left-geom.left)/(geom.right-geom.left),0,1),y:clamp((geom.bottom-(event.clientY-rect.top))/(geom.bottom-geom.top),.08,.92)};}
  function start(event,id){if(event.button!==0)return;event.preventDefault();choose(id);event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);gesture={pointer:event.pointerId,id,x:event.clientX,y:event.clientY,recorded:false};}
  function move(event){if(!gesture||gesture.pointer!==event.pointerId)return;if(!gesture.recorded){if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<3)return;remember();gesture.recorded=true;}const p=coordinates(event);change(snapshot=>{const source=snapshot.scenes.autumn.find(source=>source.id===gesture.id);if(source){source.x=api.snap(p.x,snapshot);source.y=p.y;}},false);}
  function keydown(event,id){
   if(['Delete','Backspace'].includes(event.key)){event.preventDefault();selectedId=id;remove();}
   else if(event.key.startsWith('Arrow')){event.preventDefault();choose(id);change(snapshot=>{
    const source=selected({snapshot});
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
     const direction=event.key==='ArrowLeft'?-1:1,notes=api.notes(snapshot),note=48+source.x*24;
     const next=direction<0?[...notes].reverse().find(value=>value<note-.01):notes.find(value=>value>note+.01);
     source.x=notes.length?(next===undefined?source.x:(next-48)/24):clamp(source.x+direction/24,0,1);
    }
    if(event.key==='ArrowUp')source.y=clamp(source.y+.04,.08,.92);if(event.key==='ArrowDown')source.y=clamp(source.y-.04,.08,.92);
   });}
  }
  function draw(model){
   const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),width=rect.width,height=rect.height;if(!width||!height)return;
   if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
   context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);geom={left:26,right:width-26,top:26,bottom:height-26};
   context.strokeStyle='#a5b497';context.globalAlpha=.22;context.lineWidth=1;
   for(const note of api.notes(model.snapshot)){const x=geom.left+(note-48)/24*(geom.right-geom.left);context.beginPath();context.moveTo(x,geom.top);context.lineTo(x,geom.bottom);context.stroke();}
   context.globalAlpha=.5;context.beginPath();context.moveTo(geom.left,geom.bottom);context.lineTo(geom.right,geom.bottom);context.stroke();context.globalAlpha=1;
   for(const source of model.snapshot.scenes.autumn){const p=position(source),channel=api.channel(source),color=channel===0?'#6a8791':channel===1?'#82935b':'#7b8b72';
    context.strokeStyle=color;context.fillStyle=color;
    const length=model.snapshot.phraseLength,angle=Math.PI*2/length;
    for(let step=0;step<length;step++){context.globalAlpha=source.steps.includes(step)?.75:.14;context.lineWidth=source.id===selectedId?2.2:1.4;context.beginPath();context.arc(p.x,p.y,19,-Math.PI/2+step*angle+.06,-Math.PI/2+(step+1)*angle-.06);context.stroke();}
    context.globalAlpha=source.muted?.25:.85;context.beginPath();if(channel===2){context.moveTo(p.x-5,p.y-3);context.lineTo(p.x+5,p.y+3);context.moveTo(p.x-5,p.y+3);context.lineTo(p.x+5,p.y-3);context.stroke();}else{context.arc(p.x,p.y,6,0,Math.PI*2);context.fill();}
    if(model.playing&&source.steps.includes(model.step)){context.globalAlpha=.14;context.beginPath();context.arc(p.x,p.y,24,0,Math.PI*2);context.fill();}context.globalAlpha=1;
   }
   for(const [id,button] of buttons){const source=model.snapshot.scenes.autumn.find(source=>source.id===id);if(!source)continue;const p=position(source);button.style.left=p.x+'px';button.style.top=p.y+'px';}
  }
  function render(){
   const model=api.get();panel.hidden=!model;root.classList.toggle('is-phrase-editor-open',!!model);if(!model)return;
   if(key!==model.key){key=model.key;selectedId=model.snapshot.scenes.autumn.find(source=>api.channel(source)===1&&source.type!=='fog')?.id||model.snapshot.scenes.autumn[0]?.id||null;gesture=null;message('');}
   if(!selected(model))selectedId=model.snapshot.scenes.autumn[0]?.id||null;
   panel.querySelector('[data-live-title]').textContent=model.name;
   panel.querySelector('[data-live-context]').textContent=model.playing?'Эта фраза звучит сейчас':'Правки прозвучат при её исполнении';
   const sources=model.snapshot.scenes.autumn,signature=JSON.stringify(sources.map(source=>[source.id,source.type,source.x,source.sound.octave,source.sound.channel]));
   if(select.dataset.signature!==signature){select.dataset.signature=signature;select.replaceChildren(...sources.map(source=>{const option=document.createElement('option');option.value=source.id;option.textContent=api.name(source);return option;}));}select.value=selectedId||'';select.disabled=!sources.length;
   for(const [id,button] of buttons)if(!sources.some(source=>source.id===id)){button.remove();buttons.delete(id);}
   for(const source of sources){let button=buttons.get(source.id);if(!button){button=document.createElement('button');button.type='button';button.className='live-source';button.dataset.liveSourceId=source.id;button.addEventListener('pointerdown',event=>start(event,source.id));button.addEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>gesture=null);button.addEventListener('keydown',event=>keydown(event,source.id));button.addEventListener('click',event=>{if(event.detail===0)choose(source.id);});overlay.append(button);buttons.set(source.id,button);}button.setAttribute('aria-label',api.name(source));button.setAttribute('aria-pressed',String(source.id===selectedId));}
   const length=model.snapshot.phraseLength;if(beats.children.length!==length){beats.replaceChildren(...Array.from({length},(_,step)=>{const button=document.createElement('button');button.type='button';button.textContent=step+1;button.dataset.liveBeat=step;button.addEventListener('click',()=>change(snapshot=>{const source=selected({snapshot});if(!source)return;source.steps=source.steps.includes(step)?source.steps.filter(value=>value!==step):[...source.steps,step].sort((a,b)=>a-b);}));return button;}));}
   for(const button of beats.children){const step=Number(button.dataset.liveBeat);button.disabled=!selected(model);button.setAttribute('aria-pressed',String(!!selected(model)?.steps.includes(step)));button.setAttribute('aria-label','Доля '+(step+1)+' выбранного источника');button.dataset.playing=String(model.playing&&model.step===step);}
   for(const name of ['delete','copy'])panel.querySelector('[data-live-'+name+']').disabled=!selected(model);panel.querySelector('[data-live-undo]').disabled=!history().length;
   draw(model);
  }
  select.addEventListener('change',()=>choose(Number(select.value)));
  panel.querySelector('[data-live-add]').addEventListener('click',()=>add());panel.querySelector('[data-live-delete]').addEventListener('click',remove);panel.querySelector('[data-live-copy]').addEventListener('click',copy);panel.querySelector('[data-live-undo]').addEventListener('click',undo);
  panel.querySelector('[data-live-close]').addEventListener('click',api.close);panel.querySelector('[data-live-cue]').addEventListener('click',api.cue);
  canvas.addEventListener('pointerdown',event=>{if(event.button===0){const p=coordinates(event);add(p.x,p.y);}});
  canvas.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add();}});
  panel.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();undo();}});
  render();return {render};
 }
 window.LivePhraseEditor={mount};
})();

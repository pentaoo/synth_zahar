import {OuroborosAudio} from './engine.mjs?v=chains-5';
import {clamp,wrap} from './folk-score.mjs?v=ritual-10';
import {CreatureLife} from './creature-state.mjs?v=chains-2';
import {SPELLS,SPELL_WORDS} from './spell-book.mjs?v=chains-2';
import {RING_NAMES,SPECIES,parseCommand,nextCell,cellLabel} from './chain-model.mjs?v=chains-2';
import {TouchPinch} from './touch-pinch.mjs';
import {mobileLayout,ritualSize} from './ritual-geometry.mjs?v=chains-4';
import {WheelScratch} from './wheel-scratch.mjs';
import {PinchScale,MIN_SCALE} from './pinch-scale.mjs?v=ritual-9';
import {HandMotion,ScratchResponse,SCRATCH_INPUT} from './scratch-motion.mjs';
import {RINGS,TAU,ringMetrics,bodyPoint,project,unproject,BodyIntent,controlRect,grid} from './body-geometry.mjs?v=chains-4';
import {shortcut} from './input-shortcuts.mjs?v=chains-2';
import {ViewState,Finale} from './view-state.mjs?v=chains-2';
import {InkMass} from './ink-physics.mjs?v=chains-2';
import {EngravingRenderer} from './engraving-renderer.mjs?v=chains-7';

const $=id=>document.getElementById(id),root=$('ouroboros'),stage=$('stage'),canvas=$('canvas'),inkButton=$('ink'),probe=$('audio-state'),panel=$('channel-panel'),minimap=$('minimap'),dialog=$('sound-dialog');
const voicePanel=$('voice-panel'),spellLine=$('spell-line'),spellInput=$('spell-input'),feedback=$('spell-feedback'),life=new CreatureLife(),touchPinch=new TouchPinch();
let lastIncantation=null,casting=false,selectedUid='',pendingLead='',pointer={x:0,y:0};
const audible={},pendingWrites=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const transportKind=new URLSearchParams(location.search).get('transport')==='slip'?'slip':'vinyl';
const model={phase:0,backgroundPhase:0,speed:0,rate:1,peak:0,playing:false,scratching:false,queued:-1,rings:[null,null,null]};
const view=new ViewState(),finale=new Finale(),ink=new InkMass(),hand=new HandMotion(),scratchVisual=new ScratchResponse();
let renderer,width=0,height=0,baseRadius=100,gesture=null,keyboard=null,starting=null,restarting=false,lastFrame=performance.now(),lastStateAt=performance.now(),pinchTimer,pinchTicket=0,statusTimer,lastSelected=-1,lastProbe=0,focusPending=false,returnFocus=false,compressionPressure=0,keyboardChannel=1,hinted=false;
const audio=new OuroborosAudio(state=>{
  Object.assign(model,state);lastStateAt=performance.now();sync();settleWrites();
  probe.dataset.phase=state.phase.toFixed(6);probe.dataset.speed=state.speed.toFixed(3);probe.dataset.rate=(state.rate||1).toFixed(4);
  probe.dataset.peak=state.peak.toFixed(5);probe.dataset.scratching=String(state.scratching);probe.dataset.transport=transportKind;
  probe.dataset.minSpeed=Math.min(Number(probe.dataset.minSpeed||0),state.speed).toFixed(3);
  probe.dataset.modeMix=(state.modeMix||0).toFixed(3);
  if(state.rings)probe.dataset.ringClock=JSON.stringify(state.rings.map(r=>r&&{phase:+r.phase.toFixed(4),segments:r.segments,version:r.version,pending:r.pending}));
  if(transportKind==='slip'){probe.dataset.backgroundPhase=(state.backgroundPhase||0).toFixed(6);probe.dataset.slipMix=(state.slipMix||0).toFixed(4);}
  else{
    probe.dataset.releaseCount=String(state.releaseCount||0);if(Number.isFinite(state.releasePhase))probe.dataset.releasePhase=state.releasePhase.toFixed(6);
    probe.dataset.coasting=String(!!state.coasting);probe.dataset.coastVelocity=(state.coastVelocity||0).toFixed(3);
    probe.dataset.coastStarts=String(state.coastStarts||0);probe.dataset.texturePeak=(state.texturePeak||0).toFixed(5);
  }
},{transport:transportKind});
const chains=audio.chains;
for(const s of chains.all)audible[s.uid]=[...s.cells];
selectedUid=chains.all[0]?.uid||'';
root.dataset.transport=transportKind;
root.dataset.modality='pointer';
// Only real keyboard navigation shows focus rings; Escape and typing do not.
window.addEventListener('pointerdown',()=>{root.dataset.modality='pointer';},true);
window.addEventListener('keydown',event=>{root.dataset.modality=event.key==='Tab'?'keyboard':root.dataset.modality==='keyboard'&&/^(Shift|Enter| |Escape|Arrow)/.test(event.key)?'keyboard':'pointer';},true);
if(transportKind==='slip'){$('transport-description').textContent='Сохранённый Slip: после штриха музыка возвращается в текущее фоновое время. Цепочки змей в этом режиме не звучат.';$('texture-routing').hidden=true;}
const wheel=new WheelScratch({
  grab:()=>audio.grab(view.progress>0?view.selected:1),motion:(v,a)=>applyScratch(v,a),release:options=>audio.release(options),
  changed:state=>{root.dataset.wheelScratching=String(state.active);if(!gesture)stage.dataset.gesture=state.active?'scratch':'';}
});
const pinch=new PinchScale({
  started:()=>{clearTimeout(pinchTimer);pinchTicket++;wheel.suspend(performance.now());endGesture();audio.cancelScratch();scratchVisual.clear();root.dataset.pinching='true';},
  changed:(scale,rate)=>{audio.setRate(rate);root.dataset.scale=scale.toFixed(4);probe.dataset.scale=scale.toFixed(4);probe.dataset.targetRate=rate.toFixed(4);layoutInk();},
  boundary:value=>{if(finale.state!=='ready')return;compressionPressure+=Math.max(0,Math.log(MIN_SCALE/value));if(compressionPressure>.18)beginFinale();},
  ended:()=>{wheel.resume(performance.now());root.dataset.pinching='false';compressionPressure=0;}
});
root.dataset.momentum=typeof WheelEvent!=='undefined'&&'momentum' in WheelEvent.prototype?'native':'heuristic';

function message(text,persistent=false){clearTimeout(statusTimer);feedback.textContent=text;spellInput.removeAttribute('aria-invalid');if(text&&!persistent)statusTimer=setTimeout(()=>{if(feedback.textContent===text)feedback.textContent='';},4200);}
function endPinch(){clearTimeout(pinchTimer);pinchTicket++;pinch.end();}
function applyScratch(v,angle){audio.motion(v);scratchVisual.excite(v,angle,performance.now());probe.dataset.inputVelocity=v.toFixed(3);}
function sync(){
  root.dataset.running=String(audio.playing);
  root.setAttribute('aria-label','Музыкальный инструмент Уроборос. '+(finale.state==='ended'?'Круг завершён. Пробел — новый круг.':audio.playing?'Играет. Пробел — пауза.':'Пауза. Пробел — играть.'));
}
// Edits are heard from the next pass of the phrase; until then the runes are outlined.
function settleWrites(){
  for(let i=pendingWrites.length-1;i>=0;i--){const w=pendingWrites[i],ring=model.rings?.[w.channel];if(ring&&ring.version>=w.version){audible[w.uid]=w.cells;pendingWrites.splice(i,1);}}
}
async function start(){
  if(finale.state!=='ready'||restarting)return false;
  if(audio.playing)return true;if(starting)return starting;
  root.dataset.loading='true';
  starting=(async()=>{try{const ok=await audio.play();if(ok&&!hinted){hinted=true;message(firstHint(),true);}return ok;}catch(e){message(e.message,true);return false;}finally{starting=null;root.dataset.loading='false';sync();}})();
  return starting;
}
function firstHint(){return 'Впиши имя змеи — она прилетит: '+SPECIES.filter(s=>!chains.rings[s.channel].some(c=>c.id===s.id)).map(s=>s.name).join(', ')+'.';}
function endGesture(){
  if(gesture?.type==='scratch'||keyboard==='scratch')audio.release();
  audio.endInk();ink.release();gesture=null;keyboard=null;hand.reset();stage.dataset.gesture=wheel.active?'scratch':'';
}
function cancelGesture(){wheel.cancel();endGesture();audio.cancelScratch();scratchVisual.clear();}
function pause(){
  touchPinch.clear();endPinch();wheel.reset();endGesture();audio.pause();scratchVisual.clear();
  if(finale.state==='closing')finale.paused=true;sync();
}
function togglePlay(){
  if(finale.state==='ended')return restart();
  if(finale.state==='closing'){finale.togglePause();sync();return;}
  return audio.playing||starting||restarting?pause():start();
}
function beginFinale(){
  if(!finale.begin())return;
  const scene=renderer?.scene;
  if(scene)finale.pose={view:{...scene.view},remaining:{...scene.remaining},path:scene.bend,angle:scene.rings[view.selected].headAngle};
  cancelGesture();endPinch();view.target=view.progress;view.pending=null;view.closeAfter=null;focusPending=returnFocus=false;audio.finish();root.dataset.finale='closing';message('');sync();
}
async function restart(){
  if(restarting)return;restarting=true;
  finale.reset();lastIncantation=null;feedback.textContent='';view.close(true);ink.reset();compressionPressure=0;pinch.set(1);root.dataset.finale='ready';pendingWrites.length=0;
  try{await audio.restart();for(const s of chains.all)audible[s.uid]=[...s.cells];selectedUid=chains.all[0]?.uid||'';populateControls();}catch(e){message(e.message,true);}finally{restarting=false;sync();}
}
const snakeOf=uid=>chains.find(uid);
function openChannel(index,angle=0,uid=''){
  if(finale.state!=='ready'||!chains.rings[index].length)return;
  if(!snakeOf(uid)||snakeOf(uid).channel!==index)uid=chains.rings[index][0].uid;
  // In the large view a click only moves the inscription to another snake of the ring.
  if(view.selected===index&&view.progress>.97&&view.target===1&&!view.closing){selectedUid=uid;populateControls();return;}
  selectedUid=uid;pendingLead=uid;
  if(view.progress===0||reduced.matches){view.leadUid=uid;if(mobileLayout(width,height)){const skin=renderer?.skins[snakeOf(uid).id];if(skin)view.focusAngle=-Math.PI/2-(skin.neck-skin.eye[0])/(skin.bottom-skin.top)*skin.width/skin.height*RINGS[index].width/(RINGS[index].ratio*pinch.scale);}}
  view.open(index,angle,reduced.matches);keyboardChannel=index;focusPending=true;returnFocus=false;
}
function closeView(){view.close(reduced.matches);focusPending=false;returnFocus=true;}
minimap.addEventListener('click',closeView);
function coordinates(event){const r=stage.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
function eventTime(event){const now=performance.now();return Number.isFinite(event.timeStamp)&&Math.abs(event.timeStamp-now)<60000?event.timeStamp:now;}
function moveInk(point,time){
  if(!renderer?.scene)return;
  const scene=renderer.scene,p=unproject(point,scene.overview),r=Math.max(1,scene.windowRadius);
  const x=clamp(.5+p.x/(r*2),0,1),y=clamp(.5-p.y/(r*2),0,1),previous=gesture?.inkPosition;
  const dt=Math.max(.008,(time-(gesture?.lastAt||time-16))/1000);
  const energy=previous?clamp(Math.hypot(x-previous.x,y-previous.y)/dt*.13,0,1):0;
  ink.touch((x-.5)*2,(.5-y)*2);audio.moveInk(x,y,energy);
  if(gesture){gesture.lastAt=time;gesture.inkPosition={x,y};}
  return {x,y};
}
stage.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'||finale.state!=='ready')return;
  stage.setPointerCapture(event.pointerId);
  if(touchPinch.down(event.pointerId,event.clientX,event.clientY)){
    event.preventDefault();pinch.touchStart();stage.setPointerCapture(event.pointerId);
  }
},{capture:true});
stage.addEventListener('pointermove',event=>{
  if(event.pointerType!=='touch')return;const ratio=touchPinch.move(event.pointerId,event.clientX,event.clientY);
  if(ratio!==null){event.preventDefault();if(finale.state==='ready')pinch.touchChange(ratio);}
},{capture:true});
for(const name of ['pointerup','pointercancel'])stage.addEventListener(name,event=>{if(event.pointerType==='touch'&&touchPinch.up(event.pointerId))endPinch();},{capture:true});
stage.addEventListener('pointerdown',async event=>{
  if(event.button!==0||gesture||pinch.source||restarting||finale.state!=='ready'||!renderer?.scene)return;
  if(event.target.closest('button')&&event.target!==inkButton)return;
  const p=coordinates(event),rune=view.progress===1?renderer.hitRune(p):null;
  if(rune){event.preventDefault();turnRune(rune,event.shiftKey?-1:1);return;}
  const hit=renderer.hit(p),scene=renderer.scene;
  const inInk=view.progress<.02&&Math.hypot(p.x-scene.overview.tx,p.y-scene.overview.ty)<scene.windowRadius;
  if(!hit&&!inInk)return;
  event.preventDefault();stage.setPointerCapture(event.pointerId);
  const current={type:hit?'body':'ink',pointer:event.pointerId,hit,intent:new BodyIntent(p.x,p.y,eventTime(event)),last:p,lastAt:performance.now(),velocity:0,ready:false,started:false,wasPlaying:audio.playing,at:performance.now()};gesture=current;hand.reset();
  if(hit){canvas.focus({preventScroll:true});stage.dataset.gesture='held';}
  else{
    // A short tap on the abyss plays or pauses; holding it sings with the ink.
    inkButton.focus({preventScroll:true});stage.dataset.gesture='ink';const xy=moveInk(p,performance.now());
    if(await start()&&gesture===current){current.ready=true;current.voiceTimer=setTimeout(()=>{if(gesture===current){current.singing=true;audio.startInk(current.inkPosition?.x??xy.x,current.inkPosition?.y??xy.y);probe.dataset.inkGestures=String(Number(probe.dataset.inkGestures||0)+1);}},230);}
  }
});
async function beginScratch(current){
  if(current.started)return;current.started=true;current.type='scratch';wheel.cancel();audio.cancelScratch();stage.dataset.gesture='scratch';
  if(await start()&&gesture===current){current.ready=true;audio.grab(current.hit.channel);if(current.velocity)applyScratch(current.velocity,current.hit.angle);}
}
stage.addEventListener('pointermove',event=>{
  if(!renderer?.scene)return;const p=coordinates(event);pointer=p;
  if(!gesture){stage.dataset.hover=view.progress===1&&renderer.hitRune(p)?'rune':renderer.hit(p)?'scratch':'';return;}
  if(gesture.pointer!==event.pointerId)return;
  if(gesture.type==='ink'){const xy=moveInk(p,performance.now());if(gesture.intent.move(p.x,p.y)&&!gesture.singing&&gesture.ready){clearTimeout(gesture.voiceTimer);gesture.singing=true;audio.startInk(xy.x,xy.y);}return;}
  if(!gesture.intent.move(p.x,p.y))return;
  const current=gesture,candidate=renderer.hit(p),hit=candidate?.channel===current.hit.channel?candidate:current.hit,scene=renderer.scene;
  const ring=scene.rings[current.hit.channel],along=bodyPoint(ring,Math.min(hit.s,ring.length),scene.bend),c=Math.cos(scene.view.rotation),s=Math.sin(scene.view.rotation);
  const tx=along.tx*c-along.ty*s,ty=along.tx*s+along.ty*c;
  const seconds=-((p.x-current.last.x)*tx+(p.y-current.last.y)*ty)/Math.max(30,ring.radius)*SCRATCH_INPUT.mouseSecondsPerRadian;
  const velocity=hand.push(seconds,eventTime(event));current.last=p;current.hit=hit;
  if(velocity!==null){current.velocity=velocity;if(current.ready)applyScratch(velocity,hit.angle);}
  beginScratch(current);
});
function pointerEnd(event){
  if(gesture?.pointer!==event.pointerId)return;
  const current=gesture,select=current.type==='body'&&current.intent.release(eventTime(event),event.type!=='pointerup')==='select';
  const tap=current.type==='ink'&&event.type==='pointerup'&&!current.singing&&!current.intent.dragging&&performance.now()-current.at<450;
  clearTimeout(current.voiceTimer);endGesture();
  if(select)openChannel(current.hit.channel,current.hit.angle,current.hit.uid);
  if(tap&&current.wasPlaying)pause();
}
for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,pointerEnd);
stage.addEventListener('wheel',event=>{
  if(finale.state!=='ready')return;
  if(event.ctrlKey){
    event.preventDefault();if(pinch.wheel(event.deltaY,event.deltaMode,height)){clearTimeout(pinchTimer);const ticket=++pinchTicket;pinchTimer=setTimeout(()=>{if(ticket===pinchTicket&&pinch.source==='wheel')endPinch();},170);}return;
  }
  if(pinch.source){event.preventDefault();return;}
  if(!event.deltaY||gesture?.type==='scratch'||keyboard==='scratch')return;
  const hit=renderer?.hit(coordinates(event));if(!hit&&!wheel.active)return;
  event.preventDefault();if(!audio.playing){message('Нажми пробел или коснись бездны, затем веди по телу.');return;}
  wheel.move({deltaY:event.deltaY,deltaMode:event.deltaMode,pageHeight:height,timeStamp:eventTime(event),inside:!!hit,angle:hit?.angle||0,momentum:typeof event.momentum==='boolean'?event.momentum:undefined});
},{passive:false});
stage.addEventListener('gesturestart',e=>{if(finale.state==='ready'){e.preventDefault();pinch.safariStart();}},{passive:false});
stage.addEventListener('gesturechange',e=>{e.preventDefault();if(finale.state==='ready')pinch.safariChange(e.scale);},{passive:false});
stage.addEventListener('gestureend',e=>{e.preventDefault();if(pinch.source!=='safari')return;if(finale.state==='ready')pinch.safariChange(e.scale);endPinch();},{passive:false});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('keydown',event=>{
  const inLine=event.target===spellInput,nativeText=event.target.matches('input:not([type=range]),textarea,select,[contenteditable=true]');
  if(inLine){
    if(event.code==='Escape'){event.preventDefault();event.stopPropagation();if(spellInput.value){spellInput.value='';spellInput.removeAttribute('aria-invalid');}else{spellInput.blur();if(!voicePanel.hidden)toggleVoice(false);else closeView();}}
    return;
  }
  // Typing anywhere writes into the line: names, words and runic notation.
  if(!nativeText&&!dialog.open&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&finale.state==='ready'&&(event.key==='/'||/^[\p{L}0-9·.]$/u.test(event.key))&&event.key.toLowerCase()!=='i'){
    // Insert the first character ourselves: focus moves during keydown.
    event.preventDefault();spellInput.focus({preventScroll:true});if(event.key!=='/'){spellInput.value+=event.key;spellInput.setSelectionRange(spellInput.value.length,spellInput.value.length);}spellInput.removeAttribute('aria-invalid');return;
  }
  if(event.code==='Space'&&event.target===inkButton&&!dialog.open){event.preventDefault();if(!event.repeat)togglePlay();return;}
  const command=shortcut({code:event.code,key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,tag:event.target.tagName,type:event.target.type,dialog:dialog.open});
  if(!command)return;
  event.preventDefault();
  if(command==='back'){if(!voicePanel.hidden){toggleVoice(false);return;}closeView();return;}
  if(event.repeat)return;
  if(command==='play'){togglePlay();return;}
  if(command==='service'){endPinch();cancelGesture();dialog.showModal();return;}
  if(finale.state!=='ready')return;
  if(command==='smaller'||command==='larger'){endPinch();cancelGesture();pinch.set(pinch.scale*(command==='smaller'?.9:1/.9));return;}
});
canvas.addEventListener('keydown',e=>{
  if(finale.state!=='ready')return;
  const filled=[0,1,2].filter(i=>chains.rings[i].length);if(!filled.length)return;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const at=Math.max(0,filled.indexOf(keyboardChannel));keyboardChannel=filled[(at+(e.key==='ArrowDown'?1:filled.length-1))%filled.length];canvas.setAttribute('aria-label',RING_NAMES[keyboardChannel]+'. Enter — открыть кольцо. Стрелки вверх и вниз — выбрать кольцо.');}
  if(e.key==='Enter'){e.preventDefault();openChannel(filled.includes(keyboardChannel)?keyboardChannel:filled[0]);}
});
canvas.addEventListener('keydown',async e=>{
  if(!['ArrowLeft','ArrowRight'].includes(e.key)||finale.state!=='ready')return;e.preventDefault();
  if(!keyboard){wheel.cancel();keyboard='scratch';if(!await start()||keyboard!=='scratch')return;audio.grab(view.selected);}
  applyScratch(e.key==='ArrowRight'?3.5:-3.5,-Math.PI/2);
});
canvas.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key))endGesture();});
inkButton.addEventListener('keydown',async e=>{
  if(finale.state!=='ready')return;
  if(e.key==='Enter'){e.preventDefault();if(e.repeat||keyboard)return;keyboard='ink';ink.touch(ink.fingerX,ink.fingerY);if(await start()&&keyboard==='ink')audio.startInk(.5+ink.fingerX*.5,.5-ink.fingerY*.5);}
  else if(e.key.startsWith('Arrow')){e.preventDefault();ink.fingerX=clamp(ink.fingerX+(e.key==='ArrowRight'?.08:e.key==='ArrowLeft'?-.08:0),-1,1);ink.fingerY=clamp(ink.fingerY+(e.key==='ArrowDown'?.08:e.key==='ArrowUp'?-.08:0),-1,1);audio.moveInk(.5+ink.fingerX*.5,.5-ink.fingerY*.5,.2);}
});
inkButton.addEventListener('keyup',e=>{if(e.key==='Enter')endGesture();});
for(const el of [canvas,inkButton])el.addEventListener('blur',()=>{if(keyboard)endGesture();});
function format(key,value){if(key==='brightness')return Math.round(value)+' Гц';if(key==='pan')return Math.abs(value)<.025?'Центр':(value<0?'Л ':'П ')+Math.round(Math.abs(value)*100)+'%';return Math.round(value*100)+'%';}
function populateControls(){
  const index=view.selected,state=audio.getChannelState(index),snake=snakeOf(selectedUid);
  $('channel-title').textContent=RING_NAMES[index]+(snake&&snake.channel===index?' · '+snake.name:'');
  $('wave-row').hidden=index===2;$('punch-row').hidden=index!==2;if(index<2)$('channel-wave').value=state.wave;
  for(const input of panel.querySelectorAll('[data-param]')){const key=input.dataset.param;input.value=state[key];panel.querySelector('[data-value="'+key+'"]').textContent=format(key,state[key]);}
  const ring=chains.rings[index];
  $('phrase-choices').replaceChildren(...ring.map((s,i)=>{const b=document.createElement('button');b.type='button';b.textContent=s.name+(ring.filter(o=>o.id===s.id).length>1?' '+(ring.filter(o=>o.id===s.id).indexOf(s)+1):'');b.setAttribute('aria-pressed',String(s.uid===selectedUid));b.setAttribute('aria-label','Змея '+(i+1)+': '+s.name+'. Надпись: '+s.cells.map(c=>cellLabel(index,c)).join(', '));b.addEventListener('click',()=>{selectedUid=s.uid;populateControls();});return b;}));
  probe.dataset.selectedChannel=String(index);probe.dataset.selectedPhrase=selectedUid;
}
for(const input of panel.querySelectorAll('[data-param]'))input.addEventListener('input',()=>{
  const key=input.dataset.param,value=Number(input.value);audio.setChannelParam(view.selected,key,value);panel.querySelector('[data-value="'+key+'"]').textContent=format(key,value);
  probe.dataset.channelSettings=JSON.stringify(audio.channelSettings);
});
$('channel-wave').addEventListener('change',async e=>{
  const index=view.selected;e.target.disabled=true;
  try{await audio.changeWave(index,e.target.value);}catch(error){message(error.message,true);}finally{e.target.disabled=false;if(index===view.selected)populateControls();}
});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
for(const b of document.querySelectorAll('[data-scratch-mode]'))b.addEventListener('click',()=>{audio.setScratchMode(b.dataset.scratchMode);for(const choice of document.querySelectorAll('[data-scratch-mode]'))choice.setAttribute('aria-pressed',String(choice===b));});
function layoutInk(){
  const r=ringMetrics(2,baseRadius,pinch.scale).radius-baseRadius*RINGS[2].width*.65,size=Math.max(44,r*2);
  Object.assign(inkButton.style,{left:width/2-size/2+'px',top:height*(mobileLayout(width,height)?.45:.51)-size/2+'px',width:size+'px',height:size+'px'});
}
function resize(){
  const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;baseRadius=ritualSize(width,height);view.safeTop=parseFloat(getComputedStyle(root).paddingTop)||0;root.dataset.mobile=String(mobileLayout(width,height));
  renderer?.resize(width,height,devicePixelRatio||1);ink.resize(baseRadius);layoutInk();
}
function updateViewUi(scene){
  if(lastIncantation&&!casting&&!spellInput.hasAttribute('aria-invalid')&&feedback.dataset.kind==='spell'){
    const active=audio.spells.effects.some(e=>(lastIncantation.key==='clear'?e.targets.some(id=>lastIncantation.targets.includes(id)):e.id===lastIncantation.id)&&audio.spells.strength(e)>.001);
    feedback.textContent=lastIncantation.word+' · '+lastIncantation.recipient+' · '+(active?(audio.playing?(lastIncantation.key==='clear'?'затухает':'действует'):'пауза'):'завершено');
  }
  const p=view.progress,mobile=scene.mobile;
  root.style.setProperty('--controls-top',Math.round(scene.mini.y+scene.mini.size+(mobile?92:16))+'px');
  root.style.setProperty('--controls-height',Math.max(85,Math.min(390,height*(height<520?.56:.64)-scene.mini.y-scene.mini.size-(mobile?100:28)))+'px');
  // The line is always there: under the circle in the overview, above the controls in the large view.
  // Desktop: the line lives in the first two grid columns, the log in the last two.
  const g=grid(width),lineWidth=mobile?Math.min(330,width-40):Math.max(240,g.span(2));
  const focusLine=p>.5&&finale.state==='ready';
  const lineY=focusLine?(mobile?scene.mini.y+scene.mini.size+8:Math.max(20,controlRect(width,height).y-118)):(mobile?height*.77:(height-spellLine.offsetHeight)/2);
  // Keep the whole line block on screen, and above the on-screen keyboard when it is open.
  const vv=window.visualViewport,visibleBottom=vv?Math.min(height,vv.offsetTop+vv.height-stage.getBoundingClientRect().top):height;
  const lineTop=Math.max(8,Math.min(lineY,visibleBottom-spellLine.offsetHeight-8));
  Object.assign(spellLine.style,{left:(mobile?(width-lineWidth)/2:g.x(0))+'px',top:lineTop+'px',width:lineWidth+'px'});
  // The log keeps the full height of its columns; the miniature sits top centre, as on the phone.
  spellLog.hidden=mobile;Object.assign(spellLog.style,{left:g.x(5)+'px',width:g.span(2)+'px',top:'16px',height:Math.max(0,height-32)+'px'});
  // Desktop: while a snake's settings fill the first two columns the line steps aside.
  spellLine.hidden=finale.state==='closing'||(!mobile&&focusLine);
  minimap.setAttribute('aria-label',mobile?'Вся композиция. Нажми, чтобы вернуться.':'Остальные кольца. Нажми, чтобы вернуться.');
  panel.hidden=p<.97||view.target===0||finale.state!=='ready';if(!voicePanel.hidden&&(p>0||finale.state!=='ready'))toggleVoice(false);minimap.hidden=!scene.miniActive||finale.state!=='ready';inkButton.hidden=p>0||finale.state!=='ready';
  root.dataset.view=p>.1?'focus':'overview';
  if(lastSelected!==view.selected){lastSelected=view.selected;const ring=chains.rings[view.selected];view.leadUid=ring.some(s=>s.uid===pendingLead)?pendingLead:ring[0]?.uid||'';if(!ring.some(s=>s.uid===selectedUid))selectedUid=view.leadUid;populateControls();}
  Object.assign(minimap.style,{left:scene.mini.x+'px',top:scene.mini.y+'px',width:scene.mini.size+'px',height:scene.mini.size+'px'});
  if(view.settled&&focusPending&&p===1&&!gesture&&!keyboard){focusPending=false;if(document.activeElement!==spellInput)panel.querySelector(view.selected===2?'[data-param="punch"]':'select').focus({preventScroll:true});}
  if(view.settled&&returnFocus&&p===0&&!gesture&&!keyboard){returnFocus=false;if(document.activeElement!==spellInput)canvas.focus({preventScroll:true});}
}
// Each ring has its own clock: phase of its own loop, extrapolated between reports.
function clocks(now){
  const elapsed=audio.playing?(now-lastStateAt)/1000:0;
  return [0,1,2].map(i=>{const r=model.rings?.[i];if(!r)return null;return {phase:wrap(r.phase+elapsed*model.speed/r.seconds,1),segments:r.segments,uids:audio.playingUids(i)||chains.rings[i].map(s=>s.uid),seconds:r.seconds};});
}
function soundingUids(ringClocks){
  const out=new Set();if(!audio.playing)return out;
  ringClocks.forEach(c=>{if(!c)return;const k=Math.min(c.segments-1,Math.floor(c.phase*c.segments));if(c.uids[k])out.add(c.uids[k]);});return out;
}
function frame(now){
  const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;view.spelling=document.activeElement===spellInput;view.update(dt,reduced.matches);
  const wasEnded=finale.state==='ended';finale.update(dt,reduced.matches);if(!wasEnded&&finale.state==='ended'){root.dataset.finale='ended';view.close(true);finale.pose=null;sync();}
  const analysis=audio.readAnalysis(),inner=ringMetrics(2,baseRadius,pinch.scale,0,finale.progress);
  ink.update(dt,analysis,Math.max(0,inner.radius-inner.thickness*.65),audio.playing,reduced.matches);
  const ringClocks=clocks(now),rates=ringClocks.map(c=>c?TAU*model.speed/c.seconds:0),sounding=soundingUids(ringClocks);
  const uids=chains.all.map(s=>s.uid);
  const creatureStates=life.update(now/1000,dt,{snakes:uids,active:sounding,playing:audio.playing,pointer:document.activeElement===spellInput?{x:width*.5,y:height*.85}:pointer,eyes:renderer?.scene?.eyes,selected:selectedUid,contact:gesture?.hit?.uid||'',spells:audio.spells,reduced:reduced.matches});
  const stageBox=stage.getBoundingClientRect(),avoid=[spellLine,panel,voicePanel,minimap,scrollText].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {x:r.left-stageBox.left-8,y:r.top-stageBox.top-8,w:r.width+16,h:r.height+16};});
  const scene=renderer?.render({dt,avoid,life:creatureStates,baseRadius,compression:pinch.scale,chains:chains.rings,clocks:reduced.matches?[]:ringClocks,rates,selectedUid,audible,viewState:view,ink,scratch:{angle:scratchVisual.angle,strength:scratchVisual.strengthAt(now),direction:scratchVisual.direction},finale:finale.progress,finalePose:finale.pose,reduced:reduced.matches});
  if(scene){
    updateViewUi(scene);
    if(finale.state==='ended'){const x=renderer.ctx;x.fillStyle='#000';x.beginPath();x.arc(width/2,height*.51,1.2,0,TAU);x.fill();}
    if(now-lastProbe>120){
      lastProbe=now;probe.dataset.view=view.progress===0?'overview':view.progress===1?'focus':'transition';probe.dataset.viewProgress=view.progress.toFixed(3);probe.dataset.closing=String(view.closing);probe.dataset.finale=finale.state;probe.dataset.finaleProgress=finale.progress.toFixed(3);
      probe.dataset.rings=JSON.stringify(scene.rings.map(r=>({radius:r.radius,width:r.thickness,visibleLength:r.length,swallowed:r.swallowed,headAngle:r.headAngle,snakes:chains.rings[r.index].length})));
      probe.dataset.animationStage=scene.stage;probe.dataset.selectedVisible=String(scene.visible);probe.dataset.rotation='clockwise';probe.dataset.flying=String(scene.flying);
      probe.dataset.chains=JSON.stringify(chains.rings.map(r=>r.map(s=>({uid:s.uid,name:s.name,cells:s.cells.join('')}))));
      probe.dataset.creatures=JSON.stringify(scene.creatures.map(c=>({uid:c.uid,id:c.id,channel:c.channel,part:c.part,length:c.length,offset:c.offset,eye:scene.eyes[c.uid]})));
      probe.dataset.runes=JSON.stringify(renderer.runeHits.map(h=>({x:Math.round(h.x),y:Math.round(h.y),uid:h.uid,index:h.index})));
      probe.dataset.sounding=JSON.stringify([...sounding]);probe.dataset.pendingWrites=String(pendingWrites.length);
      probe.dataset.life=JSON.stringify(creatureStates);probe.dataset.spells=JSON.stringify(audio.spells.effects.map(e=>({id:e.id,key:e.key,targets:e.targets,strength:audio.spells.strength(e)})));
      probe.dataset.spellBeat=String(audio.spells.beat);probe.dataset.voice=audio.voice?.word||'';probe.dataset.voiceCount=String(audio.voice?.spoken||0);probe.dataset.voiceError=audio.voiceError;probe.dataset.voiceLevel=(analysis.voice||0).toFixed(3);
      root.dataset.level=analysis.level.toFixed(5);probe.dataset.channelLevels=JSON.stringify(Array.from(analysis.channels));probe.dataset.channelSettings=JSON.stringify(audio.channelSettings);
    }
  }
  requestAnimationFrame(frame);
}
// ——— The line: names summon, "убрать имя" removes, words cast, runes write ———
function recipient(scope){
  const focus=view.progress>.5&&view.target===1,snake=snakeOf(selectedUid);
  if(scope==='all'||(!scope&&!focus))return {targets:chains.all.map(s=>s.uid),voice:true,label:'весь круг'};
  if(scope==='ring'){const ch=focus?view.selected:snake?.channel??1;return {targets:chains.rings[ch].map(s=>s.uid),voice:false,label:'кольцо '+RING_NAMES[ch]};}
  return {targets:snake?[snake.uid]:[],voice:false,label:snake?snake.name:'никто'};
}
function summon(species){
  const first=!chains.rings[species.channel].some(s=>s.id===species.id),result=chains.summon(species.id);if(!result.ok){message(result.error,true);return;}
  audible[result.snake.uid]=[...result.snake.cells];renderer?.summon(species.channel,result.snake.uid,result.created);
  if(result.created&&view.progress>0&&view.selected!==species.channel)closeView();
  if(view.selected===species.channel&&view.progress>0)populateControls();
  audio.syncChains();start();
  message(species.name+(first?' прилетает · ':' · ещё одна такая же · ')+RING_NAMES[species.channel]+(result.created?'':' · вступит со следующей фразы'));
}
function removeSnake(species){
  const before=chains.rings[species.channel].map(s=>s.uid),result=chains.remove(species.id);if(!result.ok){message(result.error,true);return;}
  renderer?.release(result.snake.uid);delete audible[result.snake.uid];
  if(selectedUid===result.snake.uid)selectedUid=chains.rings[species.channel][0]?.uid||chains.all[0]?.uid||'';
  if(result.emptied&&view.progress>0&&view.selected===species.channel)closeView();
  else if(view.leadUid===result.snake.uid){view.leadUid=chains.rings[species.channel][0]?.uid||'';}
  if(view.selected===species.channel)populateControls();
  audio.syncChains();message(species.name+' улетает'+(before.length>1?' · в кольце осталось '+(before.length-1):''));
}
function write(uid,cells){
  const snake=snakeOf(uid);if(!snake||!chains.write(uid,cells))return false;
  pendingWrites.push({uid,channel:snake.channel,version:chains.versions[snake.channel],cells:[...cells]});
  audio.syncChains();if(view.selected===snake.channel)populateControls();
  probe.dataset.lastWrite=JSON.stringify({uid,cells:cells.join('')});return true;
}
function turnRune(hit,step){
  const snake=snakeOf(hit.uid);if(!snake)return;const cells=[...snake.cells];
  cells[hit.index]=nextCell(snake.channel,cells[hit.index],step);
  if(hit.index===0&&cells[0]==='-')cells[0]=nextCell(snake.channel,'-',step);
  selectedUid=snake.uid;if(write(snake.uid,cells))message(snake.name+' · '+(hit.index+1)+' доля: '+cellLabel(snake.channel,cells[hit.index])+' · со следующего прохода');
}
// The log of this game: everything entered in the line, small and centred,
// each entry on its own line, the newest at the bottom.
const spellLog=$('spell-log'),scrollText=$('spell-log-text');
function layoutScroll(){if(!spellLog.hidden)spellLog.classList.toggle('overflowing',scrollText.offsetHeight>spellLog.clientHeight);}
function logLine(text){
  const line=document.createElement('span');line.textContent=text;scrollText.append(line);
  while(scrollText.childElementCount>200)scrollText.firstElementChild.remove();
  layoutScroll();
}
$('spell-form').addEventListener('submit',async e=>{
  e.preventDefault();if(casting||!spellInput.value.trim())return;
  logLine(spellInput.value.trim());await runLine();spellInput.value='';renderLexicon();
});
window.addEventListener('resize',()=>requestAnimationFrame(layoutScroll));
async function runLine(){
  const text=spellInput.value,focus=view.progress>.5&&view.target===1,snake=snakeOf(selectedUid);
  if(/^\s*голос\s*$/i.test(text)){spellInput.value='';audio.speakWord(text);toggleVoice(true);return;}
  const command=parseCommand(text,{spells:SPELLS,channel:focus&&snake?snake.channel:-1});
  if(command.type==='empty')return;
  spellInput.removeAttribute('aria-invalid');spellInput.value='';feedback.dataset.kind='';
  // Every word is read aloud; a word that is also a name or a spell then acts.
  if(command.type==='unknown'){audio.speakWord(text);feedback.textContent='«'+text.trim()+'»';return;}
  if(command.type==='summon'){audio.speakWord(text);summon(command.species);return;}
  if(command.type==='remove'){audio.speakWord(text);removeSnake(command.species);return;}
  if(command.type==='write'){if(write(snake.uid,command.cells))message(snake.name+' · новая надпись · со следующего прохода');return;}
  const to=recipient(command.scope);if(!to.targets.length){message('Некому произнести: в круге нет змей.',true);return;}
  casting=true;feedback.textContent='ᛁ '+command.spell.word+' · ожидает';const ok=await start();casting=false;if(!ok)return;
  const result=audio.castSpell(command.spell.word,{targets:to.targets,voice:to.voice});
  if(result.ok){lastIncantation={key:result.spell.key,id:result.id,targets:result.targets,word:result.spell.word,recipient:to.label};feedback.dataset.kind='spell';feedback.textContent=result.spell.rune+' '+result.spell.word+' · '+to.label;probe.dataset.lastCast=JSON.stringify({id:result.id,key:result.spell.key,targets:result.targets});}
}
// Hints under the line: three names, every word, and the voice.
// Tags under the line: the names not yet on the field, then every word, then the voice.
// A tag is said at once, like typing it and pressing Enter; the line stays empty.
function renderLexicon(){
  const absent=SPECIES.filter(s=>!chains.rings[s.channel].some(c=>c.id===s.id)).map(s=>s.name);
  $('spell-lexicon').replaceChildren(...[...absent,null,...SPELLS.map(s=>s.word),'голос'].map(word=>{
    if(!word){const gap=document.createElement('span');gap.className='lexicon-gap';return gap;}
    const b=document.createElement('button');b.type='button';b.textContent=word;
    b.addEventListener('click',()=>{if(casting)return;spellInput.value=word;$('spell-form').requestSubmit();});return b;}));
}
renderLexicon();
// ——— Voice of the abyss ———
const voiceFormat={level:v=>Math.round(v/.6*100)+'%',pitch:v=>'×'+v.toFixed(2),tone:v=>Math.round(v)+' Гц',robot:v=>Math.round(v*100)+'%',carrier:v=>Math.round(v)+' Гц'};
function populateVoice(){
  const v=audio.voiceSettings;
  for(const input of voicePanel.querySelectorAll('[data-voice]')){const key=input.dataset.voice;input.value=v[key];voicePanel.querySelector('[data-voice-value="'+key+'"]').textContent=voiceFormat[key](v[key]);}
  $('voice-every').value=String(v.every);probe.dataset.voiceSettings=JSON.stringify(v);
}
function toggleVoice(open=voicePanel.hidden){
  if(open&&(view.progress>0||finale.state!=='ready')){if(view.progress>0)closeView();}
  voicePanel.hidden=!open;root.dataset.voicePanel=String(open);if(open){populateVoice();voicePanel.querySelector('[data-voice]').focus({preventScroll:true});}
}
for(const input of voicePanel.querySelectorAll('[data-voice]'))input.addEventListener('input',()=>{audio.setVoiceParam(input.dataset.voice,Number(input.value));populateVoice();});
$('voice-every').addEventListener('change',e=>{audio.setVoiceParam('every',Number(e.target.value));populateVoice();});
$('voice-close').addEventListener('click',()=>toggleVoice(false));
$('voice-say').addEventListener('click',async()=>{if(await start())audio.sayVoice();});
// The on-screen keyboard must not resize the stage or scroll the page: the line moves above it instead.
const unscroll=()=>{if(window.scrollX||window.scrollY)window.scrollTo(0,0);};
window.addEventListener('scroll',unscroll);window.visualViewport?.addEventListener('resize',unscroll);window.visualViewport?.addEventListener('scroll',unscroll);
try{
  renderer=new EngravingRenderer(canvas,$('ink-canvas'));new ResizeObserver(resize).observe(stage);resize();
  renderer.initialize().then(()=>{if(!feedback.textContent)message(mobileLayout(width,height)?'Коснись бездны в центре — играть. Впиши имя змеи — она прилетит.':'Пробел — играть. Впиши имя змеи — она прилетит.',true);}).catch(e=>message(e.message,true));requestAnimationFrame(frame);
}catch(e){message(e.message,true);}
populateControls();sync();

/* Musical fragments use scale degrees, so they follow the phrase's tuning. */
(() => {
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const groups={
  melody:{name:'Мелодия',presets:[{name:'Мотив',line:[0,null,2,1,0,3,2,null]},{name:'Лестница',line:[0,1,2,3,4,null,2,1]},{name:'Вопрос — ответ',line:[0,2,null,1,3,2,1,0]},{name:'Арпеджио',line:[0,2,4,2,0,2,4,6]}]},
  chords:{name:'Аккорды',presets:[{name:'Трезвучие',tones:[0,2,4]},{name:'Септаккорд',tones:[0,2,4,6]},{name:'Открытый',tones:[0,4,9]},{name:'Пульсация',tones:[0,2,4],pulse:true}]},
  bass:{name:'Бас',presets:[{name:'Опора',line:[0,null,null,null,0,null,4,null]},{name:'Пружина',line:[0,null,4,0,null,4,0,null]},{name:'Пульс',line:[0,0,4,0,0,0,4,0]},{name:'С паузами',line:[0,null,null,4,0,null,null,2]}]},
  drums:{name:'Ритм',presets:[{name:'Ровно',kick:[0,4],snare:[2,6],hat:[0,2,4,6]},{name:'Шаг',kick:[0,2,4,6],snare:[2,6],hat:[0,1,2,3,4,5,6,7]},{name:'Ломаный',kick:[0,3,4,7],snare:[2,6],hat:[0,1,3,4,5,7]},{name:'Разгон',kick:[0,3,4,6],snare:[2,6,7],hat:[0,1,2,3,4,5,6,7]}]}
 };
 function belongs(source,group){
  const held=source.type==='fog'||source.type==='aurora',channel=held?1:source.sound?.channel==='auto'||source.sound?.channel===undefined?(source.type==='raven'||source.type==='asteroid'?2:source.type==='drop'||source.type==='comet'?0:1):Number(source.sound.channel);
  return group==='chords'?held:group==='melody'?channel===1&&!held:group==='bass'?channel===0:channel===2;
 }
 function notesFor(snapshot,notes){
  if(notes?.length)return [...notes].sort((a,b)=>a-b);
  const tonic=snapshot.scaleSettings?.autumn?.tonic||0;
  return Array.from({length:25},(_,i)=>48+i).filter(note=>[0,3,5,7,10].includes(((note-tonic)%12+12)%12));
 }
 const nearest=(notes,note)=>notes.reduce((best,value)=>Math.abs(value-note)<Math.abs(best-note)?value:best);
 function plan(snapshot,group,index,notes){
  const preset=groups[group]?.presets[index];if(!preset)throw new Error('Неизвестная заготовка');
  notes=notesFor(snapshot,notes);const length=snapshot.phraseLength,sources=snapshot.scenes.autumn;
  const roots=sources.filter(source=>belongs(source,'chords')).map(source=>48+source.x*24);
  let root=roots.length?Math.min(...roots):sources.find(source=>belongs(source,'bass'))?.x*24+48;
  if(!Number.isFinite(root))root=48+(snapshot.scaleSettings?.autumn?.tonic||0);
  while(root>60)root-=12;root=nearest(notes,root);
  const reach=preset.line?Math.max(...preset.line.filter(degree=>degree!==null)):6;
  const rootIndex=notes.indexOf(root),leadIndex=Math.max(0,Math.min(notes.length-1-reach,notes.indexOf(nearest(notes,root+12))));
  const pitch=(offset,lead=false)=>notes[Math.max(0,Math.min(notes.length-1,(lead?leadIndex:rootIndex)+offset))];
  const repeat=steps=>Array.from({length},(_,step)=>step).filter(step=>steps.includes(step%8));
  if(group==='drums')return [['kick-deep',preset.kick,.44],['snare-dry',preset.snare,.29],['hat-closed',preset.hat,.18]].map(([brush,steps,y])=>({brush,x:0,y,steps:repeat(steps),sound:{}}));
  if(group==='chords')return preset.tones.map((offset,i)=>({brush:'held',x:(pitch(offset)-48)/24,y:.16+i*.035,steps:preset.pulse?repeat([0,1,4,5]):Array.from({length},(_,step)=>step),sound:{attack:preset.pulse?.04:.2,sustain:.48,release:.45,pan:(i-(preset.tones.length-1)/2)*.16}}));
  const grouped=new Map();
  for(let step=0;step<length;step++){
   const degree=preset.line[step%8];if(degree===null)continue;const note=pitch(degree,group==='melody');
   if(!grouped.has(note))grouped.set(note,[]);grouped.get(note).push(step);
  }
  return [...grouped].map(([note,steps],i)=>({brush:group==='bass'?'0':'1',x:(note-48)/24,y:group==='bass'?.48:.46+i*.025,steps,sound:{octave:group==='bass'?-1:0,duration:group==='bass'?.12:.16,attack:.008,decay:.16,sustain:.4,release:group==='bass'?.14:.26}}));
 }
 function insert(snapshot,{group='melody',preset=0,append=false,notes},create){
  const intents=plan(snapshot,group,preset,notes),result=clone(snapshot);
  if(!append)result.scenes.autumn=result.scenes.autumn.filter(source=>!belongs(source,group));
  if(result.scenes.autumn.length+intents.length>16)throw new Error('Не хватает места: до 16 нод. Выбери «Заменить» или убери лишние ноды.');
  let first=null;
  for(const intent of intents){const source=create(intent.brush,result,intent.x,intent.y);source.steps=intent.steps;Object.assign(source.sound,intent.sound);result.scenes.autumn.push(source);first??=source.id;}
  result.selectedId=first;return result;
 }
 function transform(snapshot,{group='melody',action='variation',variation=1,notes}){
  const result=clone(snapshot),sources=result.scenes.autumn.filter(source=>belongs(source,group)),length=result.phraseLength;
  if(!sources.length)throw new Error('Сначала вставь '+groups[group].name.toLowerCase());
  notes=notesFor(snapshot,notes);
  const ranks=sources.map(source=>notes.indexOf(nearest(notes,48+source.x*24))),preferred=variation%3===0?-1:1;
  const direction=preferred>0&&Math.max(...ranks)>=notes.length-1?-1:preferred<0&&Math.min(...ranks)<=0?1:preferred;
  for(const [index,source] of sources.entries()){
   const steps=source.steps;
   if(action==='shift'||action==='variation'&&group==='drums')source.steps=steps.map(step=>(step+1)%length).sort((a,b)=>a-b);
   if(action==='sparse'){const reduced=steps.filter((_,i)=>i%2===0);source.steps=reduced;}
   if(action==='dense')source.steps=[...new Set(steps.flatMap(step=>[step,(step+1)%length]))].sort((a,b)=>a-b);
   if(action==='variation'&&group!=='drums'){
    const note=48+source.x*24;
    if(group==='chords'){
     if(index===(variation-1)%sources.length)source.x=(note+(note+12<=72?12:-12)-48)/24;
    }else if(group==='melody'||index%2===variation%2){
     const at=notes.indexOf(nearest(notes,note));
     source.x=(notes[Math.max(0,Math.min(notes.length-1,at+direction))]-48)/24;
    }
    if(group==='melody')source.steps=steps.map(step=>(step+(variation%2?1:2))%length).sort((a,b)=>a-b);
    if(group==='bass')source.steps=steps.map(step=>(step+(variation%2?1:0))%length).sort((a,b)=>a-b);
   }
  }
  return result;
 }
 const api={groups,belongs,plan,insert,transform};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.PhrasePresets=api;
})();

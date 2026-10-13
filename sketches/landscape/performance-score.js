/* Eight related phrases, authored as independent melody, bass and drum parts. */
(() => {
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const all=Array.from({length:8},(_,i)=>i);
 const phrases=[
  {name:'Зерно',chord:'Dm',root:50,fifth:57,pad:[50,53,57],lead:[62,null,65,64,62,null,60,null],energy:.66},
  {name:'Ответ',chord:'B♭',root:58,fifth:65,pad:[58,62,65],lead:[65,69,70,69,65,64,62,65],energy:.82},
  {name:'Подъём',chord:'F',root:53,fifth:60,pad:[53,57,60],lead:[69,72,69,67,65,67,69,65],energy:.92},
  {name:'Поворот',chord:'C',root:48,fifth:55,pad:[48,55,62],lead:[67,64,62,60,62,64,67,null],energy:.82},
  {name:'Тень',chord:'Gm',root:55,fifth:62,pad:[55,58,62],lead:[70,69,67,65,62,65,67,69],energy:.76},
  {name:'Разгон',chord:'B♭',root:58,fifth:65,pad:[58,62,65],lead:[65,67,69,70,69,65,64,62],energy:.92},
  {name:'Вершина',chord:'C',root:48,fifth:55,pad:[48,55,62],lead:[67,69,72,69,67,65,64,60],energy:1},
  {name:'Возврат',chord:'Dm',root:50,fifth:57,pad:[50,53,57],lead:[65,64,62,null,60,62,null,null],energy:.56}
 ];
 const patchDefaults={
  selectedVoice:1,
  voices:[
   {wave:'sine',noise:.01,brightness:1900,fm:.2,harmonicity:2,detune:3,motion:.08,lfoRate:2.5,attack:.01,release:.25},
   {wave:'triangle',noise:0,brightness:4800,fm:.12,harmonicity:2.76,detune:5,motion:.08,lfoRate:.8,attack:.01,release:.25}
  ],drums:{kick:1,snare:1,hat:1,gain:.8,tone:.7,decay:.18,noise:.3,brightness:10000,drive:.06,echo:.035,space:.045},drive:.1,echo:.16,space:.2,swing:.06,master:.36
 };
 function fields(base,kind='melody'){
  return phrases.map((phrase,index)=>{
   const snapshot=copy(base),sources=[];
   const source=(role,note,steps,y,sound={})=>{
    const channel=role==='bass'?0:role==='drum'?2:1;
    const type=role==='pad'?'fog':role==='drum'?'raven':channel===0?'drop':'leaf';
    const instrument=role==='drum'?sound.instrument:channel===0?'wave-sine':'wave-triangle';
    sources.push({id:sources.length+1,type,x:(note-48)/24,y,steps:[...steps],muted:false,sound:{gain:1,pan:0,octave:role==='bass'?-1:0,detune:0,duration:.12,attack:.006,decay:.14,sustain:.35,release:.22,brightness:5000,channel:String(channel),instrument,wave:role==='drum'?'auto':channel===0?'sine':'triangle',noise:role==='drum'?1:0,...sound}});
   };
   if(kind==='bass'){
    // The bass anchors downbeats; the fifth answers in the gaps of the lead.
    source('bass',phrase.root,index===0||index===7?[0,4]:[0,3,4,6],.48*phrase.energy,{duration:.1,decay:.16,sustain:.55,release:.12,brightness:1800});
    source('bass',phrase.fifth,index===7?[6]:[2,7],.37*phrase.energy,{duration:.09,release:.1,brightness:1500});
   }else if(kind==='drums'){
    const sparse=index===0||index===7;
    source('drum',48,sparse?[0,4]:index===5||index===6?[0,3,4,6]:[0,4],.4*phrase.energy,{instrument:'kick-deep',duration:.26,attack:.002,release:.03});
    source('drum',48,sparse?[6]:[2,6],.28*phrase.energy,{instrument:'snare-dry',duration:.13,attack:.002,release:.03,pan:-.04});
    source('drum',48,sparse?[0,2,4,6]:all,.17*phrase.energy,{instrument:'hat-closed',duration:.08,attack:.002,release:.03,pan:.15});
   }else{
    // Grouping by pitch preserves the lead and its rests without accompaniment.
    const melody=new Map();phrase.lead.forEach((note,step)=>{if(note!==null){if(!melody.has(note))melody.set(note,[]);melody.get(note).push(step);}});
    for(const [note,steps] of melody)source('lead',note,steps,.47*phrase.energy,{duration:.13,decay:.15,sustain:.4,release:.24,pan:.08});
   }
   snapshot.worldKey='autumn';snapshot.bpm=96;snapshot.phraseLength=8;snapshot.scenes={autumn:sources,space:[]};snapshot.nextId=sources.length+1;snapshot.selectedId=sources[0]?.id||null;snapshot.tool=sources[0]?.type||'leaf';snapshot.toolInstrument=sources[0]?.sound.instrument||'wave-triangle';snapshot.scaleSettings.autumn={tonic:2,mode:'minor'};snapshot.waveforms.autumn=['sine','triangle'];
   const fx=snapshot.soundSettings.autumn;fx.effects.synth={...fx.effects.synth,brightness:11000,drive:.1,delayMix:.16,delayTime:.3125,feedback:.28,reverbMix:.2,room:2.2};fx.effects.drum={...fx.effects.drum,brightness:10000,drive:.06,delayMix:.035,delayTime:.15625,feedback:.1,reverbMix:.045,room:.9};
   return {id:index+1,name:phrase.name,repeats:1,snapshot};
  });
 }
 function partFields(base,kind){
  return fields(base,kind);
 }
 const api={phrases,fields,partFields,patchDefaults};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.PerformanceScore=api;
})();

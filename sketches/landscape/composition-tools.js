/* Circular phrase layout and first-run music. No DOM or audio access. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const instruments = typeof module!=='undefined'&&module.exports ? require('./instruments.js') : window.LandscapeInstruments;
  const copy = value => JSON.parse(JSON.stringify(value));
  const point = (radius, angle) => [500 + radius * Math.cos(angle), 500 + radius * Math.sin(angle)];
  function sectorGeometry(count, options = {}) {
    const {outer=462,inner=208,gap=20}=options,halfGap=gap/2,start=-Math.PI/2,end=start+TAU/count;
    const edge=(radius,angle,side)=>{
      const along=Math.sqrt(radius*radius-halfGap*halfGap);
      return [500+along*Math.cos(angle)-side*halfGap*Math.sin(angle),500+along*Math.sin(angle)+side*halfGap*Math.cos(angle)];
    };
    return {outer,inner,halfGap,start,end,outerStart:edge(outer,start,1),innerStart:edge(inner,start,1),outerEnd:edge(outer,end,-1),innerEnd:edge(inner,end,-1)};
  }
  function sectorPath(count, options = {}) {
    const g=sectorGeometry(count,options),{outer,inner,halfGap,start,end}=g,corner=Math.min(20,(outer-inner)/3);
    const notchRadius=addButtonRadius({outer,inner})+8,middle=(outer+inner)/2;
    const notchExtent=Math.sqrt(notchRadius*notchRadius-halfGap*halfGap);
    const notchCorner=Math.min(corner,Math.max(2,Math.sqrt(outer*outer-halfGap*halfGap)-middle-notchExtent-4));
    const startCorner=options.notchStart?notchCorner:corner,endCorner=options.notchEnd?notchCorner:corner;
    const outerStart=start+Math.asin(halfGap/outer),outerEnd=end-Math.asin(halfGap/outer);
    const innerStart=start+Math.asin(halfGap/inner),innerEnd=end-Math.asin(halfGap/inner);
    const print=values=>values.map(value=>value.toFixed(3)).join(' ');
    const p=(radius,angle)=>print(point(radius,angle));
    const trimmed=(coordinates,angle,amount)=>print([coordinates[0]+Math.cos(angle)*amount,coordinates[1]+Math.sin(angle)*amount]);
    const edgePoint=(along,angle,side)=>print([500+along*Math.cos(angle)-side*halfGap*Math.sin(angle),500+along*Math.sin(angle)+side*halfGap*Math.cos(angle)]);
    const notch=(angle,side,from)=>` L ${edgePoint(middle+from*notchExtent,angle,side)} A ${notchRadius} ${notchRadius} 0 0 0 ${edgePoint(middle-from*notchExtent,angle,side)}`;
    const largeOuter=outerEnd-outerStart-(startCorner+endCorner)/outer>Math.PI?1:0;
    const largeInner=innerEnd-innerStart-(startCorner+endCorner)/inner>Math.PI?1:0;
    // Neighboring cut edges are parallel offsets of the same radial line.
    // Their separation stays constant at both the inner and outer circles.
    // Only the two sides of the top seam curve around the add button.
    return `M ${trimmed(g.outerStart,start,-startCorner)} Q ${print(g.outerStart)} ${p(outer,outerStart+startCorner/outer)} A ${outer} ${outer} 0 ${largeOuter} 1 ${p(outer,outerEnd-endCorner/outer)} Q ${print(g.outerEnd)} ${trimmed(g.outerEnd,end,-endCorner)}${options.notchEnd?notch(end,-1,1):''} L ${trimmed(g.innerEnd,end,endCorner)} Q ${print(g.innerEnd)} ${p(inner,innerEnd-endCorner/inner)} A ${inner} ${inner} 0 ${largeInner} 0 ${p(inner,innerStart+startCorner/inner)} Q ${print(g.innerStart)} ${trimmed(g.innerStart,start,startCorner)}${options.notchStart?notch(start,1,-1):''} Z`;
  }
  function addButtonRadius({outer,inner}) {
    return Math.min(26,(outer-inner)*.15);
  }
  function slotAtPoint(x, y, count) {
    if (!count || Math.hypot(x,y) < .01) return null;
    const angle = (Math.atan2(y,x) + Math.PI / 2 + TAU) % TAU;
    return Math.min(count-1, Math.floor(angle / TAU * count));
  }
  function insertionAtPoint(x,y,count){
    if(!count||Math.hypot(x,y)<.01)return null;
    const angle=(Math.atan2(y,x)+Math.PI/2+TAU)%TAU;
    return Math.min(count,Math.round(angle/TAU*count));
  }
  function reordered(items, id, target) {
    const result = [...items], from = result.findIndex(item => item.id === id);
    if (from < 0) return result;
    const [item] = result.splice(from,1);
    result.splice(Math.max(0,Math.min(result.length,target)),0,item);
    return result;
  }
  function demoSnapshot(base, variant) {
    const result = copy(base), palettes = [[48,55,60,64],[50,57,62,65],[53,60,65,69],[55,62,67,71]];
    const notes = palettes[variant % palettes.length], shift = Math.floor(variant / 4) % 3 * 2;
    const source = (id,type,note,y,steps,sound={}) => ({id,type,x:(note-48)/24,y,steps,muted:false,sound:{gain:1,pan:0,octave:0,detune:0,duration:.16,attack:.01,decay:.14,sustain:.3,release:.22,brightness:4200,channel:type==='drop'?'0':type==='raven'?'2':'1',instrument:type==='raven'?'kick-deep':type==='drop'?'wave-sine':'wave-triangle',wave:type==='drop'?'sine':type==='raven'?'auto':'triangle',noise:0,...sound}});
    const patterns = [[0,4],[0,2,4,6],[0,1,3,4,5,7],[0,3,6]];
    result.worldKey='autumn';result.bpm=96;result.phraseLength=8;result.selectedId=1;result.tool='drop';result.nextId=6;
    result.scaleSettings.autumn={tonic:0,mode:'major'};
    result.scenes={autumn:[
      source(1,'drop',notes[2]+shift,.52,patterns[variant%4],{pan:-.15}),
      source(2,'leaf',notes[3],.38,variant%2?[1,3,5,7]:[2,6],{duration:.22,pan:.2,brightness:2800}),
      source(3,'raven',48,.24,variant%4===0?[0,4]:[0,2,4,6]),
      source(4,'fog',notes[0],.19,[0,1,2,3,4,5,6,7],{sustain:.65,attack:.09,brightness:1900}),
    ],space:[]};
    result.waveforms.autumn=variant%2?['sine','triangle']:['triangle','sine'];
    return result;
  }
  function demoFields(base, count=4, offset=0) {
    return Array.from({length:count},(_,index)=>({id:index+1,name:'Фраза '+(index+1),repeats:1,snapshot:demoSnapshot(base,index+offset)}));
  }
  const PART_NAMES={main:'Основная',bass:'Бас',melody:'Мелодия',drums:'Барабаны'};
  function ringRadii(count,index) {
    if(count===1)return {outer:462,inner:208};
    const thickness=(462-84-(count-1)*20)/count,outer=462-index*(thickness+20);
    return {outer,inner:outer-thickness};
  }
  function layerBeatRate(length,repeats,fieldCount,cycleBeats,tempo) {
    return length*repeats*fieldCount*tempo/(cycleBeats*60);
  }
  function partFields(base,kind,count=kind==='bass'?3:4,offset=0) {
    const voice=(source,id,changes={})=>{const preset=instruments.get(id);return {...source,...changes,type:preset.type,sound:{...source.sound,...preset.settings,instrument:id,channel:preset.category==='waves'?(kind==='melody'?'1':'0'):'auto',pan:0}};};
    return demoFields(base,count,offset).map((field,localIndex)=>{
      const index=localIndex+offset;
      const snapshot=field.snapshot,sources=snapshot.scenes.autumn;
      if(kind==='bass') {
        snapshot.scenes.autumn=[voice(sources[0],['wave-sine','wave-triangle','wave-square'][index%3],{x:[0,5/24,7/24][index%3],y:.42,steps:[0,3,6]})];
        snapshot.waveforms.autumn=['triangle','sine'];
      }else if(kind==='melody')snapshot.scenes.autumn=[voice(sources[0],index%2?'wave-triangle':'wave-sine'),voice(sources[1],index%2?'wave-square':'wave-sawtooth')];
      else if(kind==='drums')snapshot.scenes.autumn=[
        voice(sources[2],'kick-deep',{steps:[[0,4],[0,2,4,6],[0,3,4,6],[0,2,3,6]][index%4],y:.4}),
        voice(sources[2],'snare-dry',{id:5,x:0,y:.32,steps:[2,6]}),
        voice(sources[2],'hat-closed',{id:6,x:0,y:.22,steps:[0,1,2,3,4,5,6,7]})
      ];
      snapshot.nextId=Math.max(snapshot.nextId,...snapshot.scenes.autumn.map(source=>source.id+1));
      snapshot.tool=snapshot.scenes.autumn[0]?.type || 'drop';snapshot.toolInstrument=snapshot.scenes.autumn[0]?.sound.instrument || 'default';
      snapshot.selectedId=snapshot.scenes.autumn[0]?.id||null;return field;
    });
  }
  function defaultTheme(snapshot) {
    if(!snapshot||snapshot.worldKey!=='space'||!Array.isArray(snapshot.scenes?.space))return snapshot;
    const result=copy(snapshot),types={comet:'drop',star:'leaf',asteroid:'raven',aurora:'fog'};
    const highest=Math.max(0,...Object.values(result.scenes).flat().map(source=>source.id));
    result.scenes.autumn=result.scenes.space.map((source,index)=>({...source,id:highest+index+1,type:types[source.type]}));
    result.selectedId=result.scenes.autumn[0]?.id||null;result.nextId=highest+result.scenes.autumn.length+1;
    if(result.scaleSettings?.space)result.scaleSettings.autumn=copy(result.scaleSettings.space);
    if(result.waveforms?.space)result.waveforms.autumn=copy(result.waveforms.space);
    if(result.soundSettings?.space)result.soundSettings.autumn=copy(result.soundSettings.space);
    result.worldKey='autumn';result.tool=types[result.tool]||'drop';
    return result;
  }
  const api={sectorGeometry,sectorPath,addButtonRadius,slotAtPoint,insertionAtPoint,reordered,demoSnapshot,demoFields,defaultTheme,PART_NAMES,ringRadii,layerBeatRate,partFields};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.CompositionTools=api;
})();

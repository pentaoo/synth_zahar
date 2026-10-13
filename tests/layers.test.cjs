'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,between}=require('./helpers/audio-fixture.cjs');

async function layered(performanceMode=false) {
  const f=await fixture([0,1]);
  if(performanceMode)f.evaluate(`performancePatch=${JSON.stringify(require("../sketches/landscape/performance-score.js").patchDefaults)};const score=window.PerformanceScore;Object.assign(modes,{minor:{steps:[0,2,3,5,7,8,10]},major:{steps:[0,2,4,5,7,9,11]}});`);
  f.evaluate(`
    let sound=engine,layers=[],selectedLayerId=1,currentLayerId=1,compositionTempo=160,cycleBeats=8,editorView='composition',audioHost=null,pendingPersistence=false;
    let fields=[],activeFieldId=1,queuedFieldId=null,sequenceEnabled=true,fieldCycle=0,selectedFieldId=1,fieldDrag=null,ignoreFieldClickUntil=0,renderedFields=null,renderedLayers=null;
    let elapsed=0,beat=0,nextPhraseBeat=0,lastTime=0,audioAnchor=0,wallAnchor=0,playingStepAt=null;
    let phraseEvents=[],particles=[],ripples=[],ghost=null,drag=null;
    let liveEditorOpen=false,patternInsertion=null,marquee=null,resettingPerformance=false;const liveUI={resets:0,reset(){this.resets++;}};
    const STORAGE_KEY='test-score',storage=new Map(),localStorage={setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)||null};
    const MAX_FIELDS=16,FALL_TIME=.8,stats={hits:[],peak:0},performance={now:()=>sound.context?.currentTime*1000||0};
    const node={dataset:{},style:{},children:[],setAttribute(){},scrollIntoView(){}};
    const q=()=>node,all=()=>[],status=()=>{},openInspector=()=>{},sync=()=>{},syncFields=()=>{},syncPlayhead=()=>{},paint=()=>{},resize=()=>{},resizeRing=()=>{},requestAnimationFrame=()=>{};
    const root={dataset:{}},remember=()=>{},persist=()=>{},commit=()=>{};
  `+between('  const activeField =','  function persist() {')+
  between('  function restore(saved) {','  const starterSnapshot=')+
  between('  function syncViewControls() {','  function resizeRing() {')+
  between('  function nextFieldId() {','  function syncFields() {')+
  between('  function anchorClock(){','  function addSource(')+
  between('  function generatePhraseBeats() {','  canvas.addEventListener(')+
  between('  function liveEditorModel() {','  function syncPerformance() {')+
  between('  function pause(){','  q(\'[data-action="play"]\').addEventListener')+`
    const starterSnapshot=fieldSnapshot();
    phraseLength=2;bpm=160;scenes.space=[];
    const base=fieldSnapshot();
    const makeFields=(count,length)=>Array.from({length:count},(_,i)=>({id:i+1,name:'Фраза '+(i+1),repeats:1,snapshot:{...clone(base),phraseLength:length}}));
    const outer=makeFields(4,2),inner=makeFields(3,3);
    inner[0].repeats=2;inner[1].snapshot.waveforms.autumn=['square','sine'];
    installLayers([{id:1,kind:'main',gain:1,muted:false,fields:outer,activeFieldId:1},{id:2,kind:'bass',gain:.8,muted:false,fields:inner,activeFieldId:1}]);
    globalThis.layered={
      init:initializeLayers,
      advance(time){audioHost.context.advance(time);frame(time*1000);},
      state:()=>{storeCurrentLayer();return {tempo:compositionTempo,scope:editorView,running,selectedLayerId,layers:layers.map(layer=>({id:layer.id,active:layer.context.activeFieldId,queued:layer.context.queuedFieldId,beat:layer.context.beat,elapsed:layer.context.elapsed,fields:clone(layer.fields)})),hits:clone(stats.hits)};},
      engines:()=>layers.map(layer=>layer.engine),choose:chooseField,select:selectLayer,tempo:setCompositionTempo,scope:setEditorView,pause,serial,remove:removeLayer,add:addLayer,addField,reorder:reorderField,
      inspect(id,layerId){liveEditorOpen=true;inspectField(id,layerId);},model:liveEditorModel,edit:updateLivePhrase,insertPattern:insertPatternPhrase,
      preset(group,preset=0,append=false){const model=liveEditorModel(),result=phrasePresets.insert(model.snapshot,{group,preset,append,notes:notesForSnapshot(model.snapshot)},createLiveSource);updateLivePhrase(snapshot=>{snapshot.scenes.autumn=result.scenes.autumn;snapshot.nextId=result.nextId;snapshot.selectedId=result.selectedId;});},
      patch:()=>typeof performancePatch==='undefined'?null:clone(performancePatch),
      setPatch(value){performancePatch=clone(value);},loadScore:loadPerformanceScore,restart:restartPerformance,
      previous:()=>JSON.parse(storage.get(STORAGE_KEY+'-before-demo')||'null'),editorResets:()=>liveUI.resets,
      async reload(){const saved=serial();pause();restore(saved);resetAllTransport();await initializeLayers();},
      resume(){anchorClock();running=true;},
      mute(id){const layer=layers.find(item=>item.id===id);layer.muted=layer.engine.muted=true;withLayer(layer,()=>{sound.stop();sound.configure(undefined,false);});},
      settings:()=>layers.map(layer=>layer.context.waveforms.autumn.slice()),
    };
  `);
  const c=f.evaluate('layered');await c.init();c.advance(0);
  c.tickTo=time=>{for(let t=c.engines()[0].context.currentTime+.01;t<time;t+=.01)c.advance(t);c.advance(time);};
  return c;
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);

test('four phrases and three phrases share a revolution despite different lengths and repeats',async()=>{
  const c=await layered();c.tickTo(3.81);
  const hits=c.state().hits;
  for(const id of [1,2]) {
    const starts=hits.filter(hit=>hit.layerId===id&&hit.fieldId===1&&hit.step===0);
    close(starts[0].audioAt,.8);close(starts.at(-1).audioAt,3.8);
    assert.equal(c.state().layers.find(layer=>layer.id===id).active,1);
  }
  const bass2=hits.find(hit=>hit.layerId===2&&hit.fieldId===2);close(bass2.audioAt,1.8);
  const outer2=hits.find(hit=>hit.layerId===1&&hit.fieldId===2);close(outer2.audioAt,1.55);
});
test('layers share one context and output meter while retaining independent channels and settings',async()=>{
  const c=await layered(),[outer,inner]=c.engines();
  assert.equal(outer.context,inner.context);assert.equal(outer.meter,inner.meter);assert.equal(outer.compressor,inner.compressor);
  assert.notEqual(outer.channels[0],inner.channels[0]);assert.notEqual(outer.master,inner.master);
  assert.equal(outer.context.nodes.filter(node=>node.kind==='DynamicsCompressor').length,1);
  assert.equal(outer.meter.connections.filter(node=>node===outer.context.destination).length,1);
  assert.deepEqual(Array.from(c.settings(),waves=>Array.from(waves)),[['triangle','sine'],['triangle','sine']]);
  c.tickTo(1.81);
  assert.deepEqual(Array.from(c.settings(),waves=>Array.from(waves)),[['triangle','sine'],['square','sine']]);
});
test('restoring a layered composition reuses the audio context and disconnects retired outputs',async()=>{
  const c=await layered(),old=c.engines(),context=old[0].context;
  for(let i=0;i<3;i++){await c.reload();for(const engine of c.engines())assert.equal(engine.context,context);}
  for(const engine of old)assert.equal(engine.master.connections.length,0);
  assert.equal(context.nodes.filter(node=>node.kind==='DynamicsCompressor').length,1);
});
test('manual next phrase affects only its ring and selecting another layer keeps both clocks running',async()=>{
  const c=await layered();c.tickTo(.91);c.choose(3,2);
  assert.equal(c.state().layers[0].queued,null);assert.equal(c.state().layers[1].queued,3);
  c.tickTo(1.81);assert.equal(c.state().layers[0].active,2);assert.equal(c.state().layers[1].active,3);
  close(c.state().layers[0].elapsed,1.81);close(c.state().layers[1].elapsed,1.81);
});
test('changing global BPM updates every phrase and speeds every revolution equally',async()=>{
  const c=await layered();c.tickTo(.91);c.tempo(80);
  assert.equal(c.state().tempo,80);
  for(const layer of c.state().layers)for(const field of layer.fields)assert.equal(field.snapshot.bpm,80);
  const resetAt=c.engines()[0].context.currentTime;c.tickTo(resetAt+6.81);
  const hits=c.state().hits.filter(hit=>hit.at>6);
  for(const id of [1,2])close(hits.find(hit=>hit.layerId===id&&hit.fieldId===1&&hit.step===0).audioAt,resetAt+6.8);
});
test('phrase view pauses the composition, previews only the selected phrase and never advances to another',async()=>{
  const c=await layered();c.tickTo(.91);c.choose(2,2);c.scope('field');
  assert.equal(c.state().running,false);assert.equal(c.state().scope,'field');
  assert.equal(c.engines()[0].master.gain.value,0);assert.ok(c.engines()[1].master.gain.value>0);
  c.choose(2,2);const before=c.state().hits.length;c.resume();c.tickTo(4);
  const newHits=c.state().hits.slice(before);assert.ok(newHits.length>0);
  assert.ok(newHits.every(hit=>hit.layerId===2&&hit.fieldId===2));
  assert.equal(c.state().layers[0].active,1);assert.equal(c.state().layers[0].elapsed,0);
  assert.equal(c.state().layers[1].active,2);
});
test('changing the layer during solo preview pauses and silences the previous layer',async()=>{
  const c=await layered();c.scope('field');c.resume();c.tickTo(.81);
  assert.ok(c.engines()[0].held.size);c.select(2);
  assert.equal(c.state().running,false);assert.equal(c.engines()[0].held.size,0);
  assert.equal(c.engines()[0].master.gain.value,0);assert.ok(c.engines()[1].master.gain.value>0);
});
test('muting one ring stops its held voice and leaves the other ring playing',async()=>{
  const c=await layered();c.tickTo(.81);const [outer,inner]=c.engines();
  assert.ok(outer.held.size);assert.ok(inner.held.size);const note=outer.held.get(1).oscillator;
  c.mute(2);assert.equal(inner.held.size,0);assert.equal(outer.held.get(1).oscillator,note);
  const before=c.state().hits.length;c.tickTo(1.81);
  assert.ok(c.state().hits.slice(before).every(hit=>hit.layerId===1));assert.ok(outer.active.size);
});
test('deleting the final ring stops playback, survives restore and allows a new ring on the same audio context',async()=>{
  const c=await layered();c.tickTo(.81);const [outer,inner]=c.engines(),context=outer.context;
  c.remove(1);assert.equal(outer.held.size,0);assert.equal(outer.master.connections.length,0);
  assert.equal(c.state().running,true);assert.equal(c.state().layers[0].id,2);assert.ok(inner.held.size);
  c.remove(2);assert.equal(c.state().running,false);assert.equal(inner.held.size,0);assert.equal(inner.master.connections.length,0);
  assert.equal(c.serial().layers.length,0);assert.equal(c.serial().fields.length,0);
  await c.reload();assert.equal(c.serial().layers.length,0);
  await c.add('bass');await c.init();const saved=c.serial();
  assert.equal(saved.layers.length,1);assert.equal(saved.selectedLayerId,1);assert.equal(saved.layers[0].kind,'bass');
  assert.equal(c.engines()[0].context,context);assert.equal(context.nodes.filter(node=>node.kind==='DynamicsCompressor').length,1);
  require('../sketches/landscape/layout-files.js').validateSnapshot(saved);
});

test('adding a party during playback leaves existing clocks and held notes uninterrupted',async()=>{
  const c=await layered();c.tickTo(.91);const before=c.state(),[outer,inner]=c.engines();
  const notes=[outer.held.get(1).oscillator,inner.held.get(1).oscillator];
  await c.add('drums');const after=c.state();assert.equal(after.running,true);assert.equal(after.layers.length,3);
  for(let i=0;i<2;i++){close(after.layers[i].elapsed,before.layers[i].elapsed);close(after.layers[i].beat,before.layers[i].beat);assert.equal(c.engines()[i].held.get(1).oscillator,notes[i]);}
  assert.equal(c.engines()[2].context,outer.context);c.tickTo(1.81);
  assert.ok(c.state().hits.some(hit=>hit.layerId===3));assert.ok(c.state().hits.some(hit=>hit.layerId===1&&hit.audioAt>.91));
});
test('new phrases are selected for live editing and the ninth phrase saves and imports',async()=>{
  const c=await layered(true);c.tickTo(.91);const before=c.state().layers[0],note=c.engines()[0].held.get(1).oscillator;
  for(let i=0;i<5;i++)c.addField();const after=c.state();
  assert.equal(after.layers[0].fields.length,9);close(after.layers[0].elapsed,before.elapsed);close(after.layers[0].beat,before.beat);
  assert.equal(c.engines()[0].held.get(1).oscillator,note);assert.equal(c.model().name,'Фраза 9');assert.equal(c.model().playing,false);
  const files=require('../sketches/landscape/layout-files.js'),saved=files.decode(files.encode(c.serial(),'Девять фраз')).snapshot;
  assert.equal(saved.layers[0].fields.length,9);
  while(c.state().layers[0].fields.length<16)c.addField();c.addField();assert.equal(c.state().layers[0].fields.length,16);
});
test('editing an inactive phrase changes only its data, then a cue plays it on the next beat',async()=>{
  const c=await layered(true);c.tickTo(.91);const before=c.state(),notes=c.engines().map(engine=>engine.held.get(1).oscillator);
  c.inspect(3,1);c.edit(snapshot=>{snapshot.scenes.autumn[0].x=.25;snapshot.scenes.autumn[0].steps=[0];});
  const after=c.state();assert.equal(after.running,true);assert.equal(after.layers[0].active,1);
  for(let i=0;i<2;i++){close(after.layers[i].elapsed,before.layers[i].elapsed);assert.equal(c.engines()[i].held.get(1).oscillator,notes[i]);}
  assert.equal(after.layers[0].fields[2].snapshot.scenes.autumn[0].x,.25);
  c.choose(3,1);c.tickTo(1.21);assert.equal(c.state().layers[0].active,3);assert.equal(c.state().layers[1].active,1);
});
test('live deletion silences only the selected source and preserves the other party clock',async()=>{
  const c=await layered(true);c.tickTo(.91);c.inspect(1,1);const before=c.state(),other=c.engines()[1].held.get(1).oscillator;
  c.edit(snapshot=>{snapshot.scenes.autumn=[];});const after=c.state();
  assert.equal(after.running,true);close(after.layers[0].elapsed,before.layers[0].elapsed);close(after.layers[1].elapsed,before.layers[1].elapsed);
  assert.equal(c.engines()[0].held.size,0);assert.equal(c.engines()[1].held.get(1).oscillator,other);
  assert.equal(c.serial().layers[0].fields[0].snapshot.scenes.autumn.length,0);
});

test('a live beat edit cancels a strike in the audio lookahead without stopping other voices',async()=>{
 const c=await layered(true);c.tickTo(.91);c.inspect(1,1);
 c.edit(snapshot=>{snapshot.scenes.autumn.push({...structuredClone(snapshot.scenes.autumn[0]),id:2,type:'drop',steps:[1],sound:{...snapshot.scenes.autumn[0].sound,channel:'0',instrument:'wave-sine',wave:'sine'}});snapshot.nextId=3;});
 c.tickTo(1.16);const engine=c.engines()[0],pending=[...engine.voices.values()].find(voice=>voice.id===2),otherCount=c.engines()[1].active.size,otherClock=c.state().layers[1].elapsed;
 assert.ok(pending&&pending.start>engine.context.currentTime,'the next strike was already prepared');
 c.edit(snapshot=>{snapshot.scenes.autumn.find(source=>source.id===2).steps=[];});
 assert.ok(![...engine.voices.values()].some(voice=>voice.id===2));assert.equal(c.engines()[1].active.size,otherCount);close(c.state().layers[1].elapsed,otherClock);
 c.tickTo(1.21);assert.ok(!c.state().hits.some(hit=>hit.layerId===1&&hit.id===2));assert.equal(c.state().running,true);
});

test('a preset replaces one live party without pausing or replacing the other ring held voice',async()=>{
 const c=await layered(true);c.tickTo(.91);c.inspect(1,1);const before=c.state(),other=c.engines()[1].held.get(1).oscillator;
 c.preset('melody',1);const after=c.state();assert.equal(after.running,true);close(after.layers[0].elapsed,before.layers[0].elapsed);close(after.layers[1].elapsed,before.layers[1].elapsed);
 assert.equal(c.engines()[1].held.get(1).oscillator,other);assert.ok(c.model().snapshot.scenes.autumn.some(source=>source.type==='leaf'));
 c.tickTo(1.21);assert.ok(c.state().hits.some(hit=>hit.layerId===1&&hit.type==='leaf'));
});
test('dropping a preset inserts a phrase between neighbors while both party clocks continue',async()=>{
 const c=await layered(true);c.tickTo(.91);const before=c.state(),notes=c.engines().map(engine=>engine.held.get(1).oscillator);
 const result=c.insertPattern({group:'chords',preset:1},{layerId:1,index:2});assert.equal(result.ok,true);
 const after=c.state();assert.deepEqual(Array.from(after.layers[0].fields,field=>field.id),[1,2,5,3,4]);assert.equal(c.model().name,'Септаккорд');
 for(let i=0;i<2;i++){close(after.layers[i].elapsed,before.layers[i].elapsed);close(after.layers[i].beat,before.layers[i].beat);assert.equal(c.engines()[i].held.get(1).oscillator,notes[i]);}
 assert.equal(after.layers[0].active,1);require('../sketches/landscape/layout-files.js').validateSnapshot(c.serial());
});

test('each fresh start loads the authored score instead of the saved edited composition',async()=>{
 const c=await layered(true);c.inspect(1,1);c.preset('melody',1);c.tempo(140);await c.add('drums');
 const patch=c.patch();patch.voices[1].noise=.9;patch.drums.kick=0;c.setPatch(patch);
 const edited=c.serial();await c.reload();assert.equal(c.state().layers.length,3);
 c.loadScore();const fresh=c.serial();
 assert.equal(c.state().running,false);assert.equal(fresh.layers.length,1);assert.equal(fresh.compositionTempo,96);assert.equal(fresh.cycleBeats,64);
 assert.equal(fresh.sequenceEnabled,true);assert.equal(fresh.activeFieldId,1);
 assert.deepEqual(Array.from(fresh.fields,field=>field.name),require('../sketches/landscape/performance-score.js').phrases.map(phrase=>phrase.name));
 assert.deepEqual(JSON.parse(JSON.stringify(c.patch())),require('../sketches/landscape/performance-score.js').patchDefaults);
 assert.equal(fresh.fields[0].snapshot.scaleSettings.autumn.tonic,2);assert.equal(fresh.fields[0].snapshot.scaleSettings.autumn.mode,'minor');
 assert.notDeepEqual(JSON.parse(JSON.stringify(fresh.fields[0].snapshot.scenes)),JSON.parse(JSON.stringify(edited.fields[0].snapshot.scenes)));
});
test('restart restores the score during playback and reuses the audio output',async()=>{
 const c=await layered(true);c.loadScore();await c.init();c.resume();c.tickTo(.91);
 const old=c.engines()[0],context=old.context;c.inspect(1,1);c.preset('chords',1);c.tempo(135);await c.add('bass');
 const patch=c.patch();patch.voices[0].wave='square';patch.drums.gain=0;patch.echo=.8;c.setPatch(patch);
 const edited=c.serial();await c.restart();const reset=c.serial();
 assert.equal(c.state().running,true);assert.equal(c.state().scope,'composition');assert.equal(reset.layers.length,1);
 assert.equal(reset.fields.length,8);assert.equal(reset.compositionTempo,96);assert.equal(reset.activeFieldId,1);
 assert.equal(c.state().layers[0].queued,null);close(c.state().layers[0].elapsed,0);close(c.state().layers[0].beat,0);
 assert.equal(c.engines()[0].context,context);assert.equal(old.master.connections.length,0);
 assert.equal(context.nodes.filter(node=>node.kind==='DynamicsCompressor').length,1);assert.equal(c.editorResets(),1);
 assert.deepEqual(JSON.parse(JSON.stringify(c.patch())),require('../sketches/landscape/performance-score.js').patchDefaults);
 assert.deepEqual(JSON.parse(JSON.stringify(c.previous().fields)),JSON.parse(JSON.stringify(edited.fields)));
 c.tickTo(context.currentTime+.91);assert.ok(c.state().hits.some(hit=>hit.type==='leaf'));
 c.inspect(1,1);c.preset('chords',2);assert.equal(c.state().running,true);
});
test('repeated paused restarts rebuild independent notes and recover an empty composition',async()=>{
 const c=await layered(true);await c.restart();const original=JSON.parse(JSON.stringify(c.serial().fields));
 c.pause();c.inspect(1,1);c.preset('melody',2);await c.restart();
 assert.equal(c.state().running,false);assert.deepEqual(JSON.parse(JSON.stringify(c.serial().fields)),original);
 c.remove(1);assert.equal(c.state().layers.length,0);await c.restart();
 assert.equal(c.state().running,false);assert.equal(c.state().layers.length,1);assert.equal(c.serial().fields.length,8);
 c.inspect(1,1);c.edit(snapshot=>{snapshot.scenes.autumn=[];});await c.restart();
 assert.deepEqual(JSON.parse(JSON.stringify(c.serial().fields)),original);assert.equal(c.editorResets(),4);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,between}=require('./helpers/audio-fixture.cjs');

async function layered() {
  const f=await fixture([0,1]);
  f.evaluate(`
    let sound=engine,layers=[],selectedLayerId=1,currentLayerId=1,compositionTempo=160,cycleBeats=8,editorView='composition',audioHost=null,pendingPersistence=false;
    let fields=[],activeFieldId=1,queuedFieldId=null,sequenceEnabled=true,fieldCycle=0,selectedFieldId=1,fieldDrag=null,ignoreFieldClickUntil=0,renderedFields=null,renderedLayers=null;
    let elapsed=0,beat=0,nextPhraseBeat=0,lastTime=0,audioAnchor=0,wallAnchor=0,playingStepAt=null;
    let phraseEvents=[],particles=[],ripples=[],ghost=null,drag=null;
    const MAX_FIELDS=8,FALL_TIME=.8,stats={hits:[],peak:0},performance={now:()=>sound.context?.currentTime*1000||0};
    const node={dataset:{},style:{},children:[],setAttribute(){},scrollIntoView(){}};
    const q=()=>node,all=()=>[],status=()=>{},sync=()=>{},syncFields=()=>{},syncPlayhead=()=>{},paint=()=>{},resize=()=>{},requestAnimationFrame=()=>{};
    const root={dataset:{}},remember=()=>{},persist=()=>{},commit=()=>{};
  `+between('  const activeField =','  function persist() {')+
  between('  function restore(saved) {','  const starterSnapshot=')+
  between('  function setEditorView(view) {','  function resizeRing() {')+
  between('  function nextFieldId() {','  function syncFields() {')+
  between('  function anchorClock(){','  function addSource(')+
  between('  function generatePhraseBeats() {','  canvas.addEventListener(')+
  between('  function pause(){','  q(\'[data-action="play"]\').addEventListener')+`
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
      engines:()=>layers.map(layer=>layer.engine),choose:chooseField,select:selectLayer,tempo:setCompositionTempo,scope:setEditorView,pause,serial,
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

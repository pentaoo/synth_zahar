'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,between}=require('./helpers/audio-fixture.cjs');

async function composition(repeats=2) {
  const f=await fixture([0,1]);
  f.evaluate(`
    const sound=engine,MAX_FIELDS=8,FALL_TIME=.8;let layers=[],selectedLayerId=1,currentLayerId=1,compositionTempo=96,cycleBeats=32,editorView='composition',audioHost=null,pendingPersistence=false;
    let fields=[],activeFieldId=1,queuedFieldId=null,sequenceEnabled=true,fieldCycle=0,selectedFieldId=1,fieldDrag=null,ignoreFieldClickUntil=0;
    let elapsed=0,beat=0,nextPhraseBeat=0,lastTime=0,audioAnchor=0,wallAnchor=0,playingStepAt=null;
    let phraseEvents=[],particles=[],ripples=[],ghost=null,drag=null;
    const stats={hits:[],peak:0},performance={now:()=>engine.context.currentTime*1000};
    const node={dataset:{},children:[],setAttribute(){},scrollIntoView(){}};
    const q=()=>node,status=()=>{},sync=()=>{},syncFields=()=>{},syncPlayhead=()=>{},paint=()=>{},requestAnimationFrame=()=>{};
    const remember=()=>{},persist=()=>{},commit=()=>{};
  `+between('  const activeField =','  function persist() {')+
  between('  function nextFieldId() {','  function syncFields() {')+
  between('  function anchorClock(){','  function addSource(')+
  between('  function generatePhraseBeats() {','  canvas.addEventListener(')+
  between('  function pause(){','  q(\'[data-action="play"]\').addEventListener')+`
    bpm=160;phraseLength=2;scene()[0].type='drop';scene()[0].sound.channel='auto';
    fields=[1,2,3].map(id=>({id,name:'Поле '+id,repeats:1,snapshot:fieldSnapshot()}));
    fields[0].repeats=${repeats};fields[1].snapshot.bpm=120;fields[1].snapshot.phraseLength=1;
    fields[2].snapshot.phraseLength=3;
    globalThis.composition={
      advance(time){engine.context.advance(time);frame(time*1000);},
      state:()=>({activeFieldId,queuedFieldId,fieldCycle,elapsed,playingStep,fields:clone(fields),hits:clone(stats.hits)}),
      choose:chooseField,move:moveField,pause,
      resume(){anchorClock();running=true;sound.syncHeld();},
      sequence(value){sequenceEnabled=value;},serial,
      single(){fields=fields.slice(0,1);},
      held(){scene()[0].type='fog';fields.forEach(field=>field.snapshot.scenes.autumn[0].type='fog');},
    };
  `);
  const c=f.evaluate('composition');
  c.advance(0);
  c.tickTo=time=>{for(let t=f.engine.context.currentTime+.01;t<time;t+=.01)c.advance(t);c.advance(time);};
  return {c,engine:f.engine};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);

test('automatic progression counts complete loops, changes tempo and length, and wraps without an extra fall delay',async()=>{
  const {c}=await composition();
  c.tickTo(2.2);assert.equal(c.state().activeFieldId,1);assert.equal(c.state().fieldCycle,1);
  c.tickTo(2.31);assert.equal(c.state().activeFieldId,2);
  const first=c.state().hits.find(hit=>hit.fieldId===2);close(first.at,2.3);close(first.audioAt,2.3);
  c.tickTo(2.81);assert.equal(c.state().activeFieldId,3);close(c.state().hits.find(hit=>hit.fieldId===3).at,2.8);
  c.tickTo(3.94);assert.equal(c.state().activeFieldId,1);close(c.state().hits.filter(hit=>hit.fieldId===1).at(-1).at,3.925);
});
test('manual choice waits for the next loop and overrides both repeat count and automatic destination',async()=>{
  const {c}=await composition(8);c.tickTo(.91);c.choose(3);
  assert.equal(c.state().activeFieldId,1);assert.equal(c.state().queuedFieldId,3);
  c.tickTo(1.48);assert.equal(c.state().activeFieldId,1);
  c.tickTo(1.56);assert.equal(c.state().activeFieldId,3);assert.equal(c.state().queuedFieldId,null);
  close(c.state().hits.find(hit=>hit.fieldId===3).audioAt,1.55);
});
test('reordering during playback keeps the current loop and changes the next automatic field',async()=>{
  const {c}=await composition(1);c.tickTo(.91);c.move(3,-1);
  assert.equal(c.state().activeFieldId,1);close(c.state().elapsed,.91);
  assert.deepEqual(Array.from(c.state().fields,field=>field.id),[1,3,2]);
  c.tickTo(1.56);assert.equal(c.state().activeFieldId,3);
});
test('another manual choice replaces the queue; choosing it again cancels the override',async()=>{
  const {c}=await composition(1);c.tickTo(.91);c.choose(3);c.choose(2);
  assert.equal(c.state().queuedFieldId,2);c.choose(2);assert.equal(c.state().queuedFieldId,null);
  c.tickTo(1.56);assert.equal(c.state().activeFieldId,2);
});
test('pause freezes loop count and queued choice; resume continues to the same boundary',async()=>{
  const {c,engine}=await composition(8);c.tickTo(.91);c.choose(3);c.pause();
  const paused=c.state();c.advance(5);close(c.state().elapsed,paused.elapsed);assert.equal(engine.active.size,0);
  c.resume();c.tickTo(5.66);assert.equal(c.state().activeFieldId,3);
  close(c.state().hits.find(hit=>hit.fieldId===3).audioAt,5.64);
});
test('a single field or disabled sequencing loops in place, while manual choice still works',async()=>{
  const {c}=await composition(1);c.sequence(false);c.tickTo(2.4);assert.equal(c.state().activeFieldId,1);
  c.choose(3);c.tickTo(3.06);assert.equal(c.state().activeFieldId,3);
  const single=(await composition(1)).c;single.single();single.tickTo(3);assert.equal(single.state().activeFieldId,1);
});
test('field transition releases the previous hold at the audio boundary and starts the destination hold',async()=>{
  const {c,engine}=await composition(1);c.held();c.tickTo(.81);
  const previous=engine.held.get(1).oscillator;
  c.tickTo(1.52);const destination=engine.held.get(1).oscillator;
  assert.notEqual(previous,destination);close(previous.stopAt,1.55);close(destination.startAt,1.55);
  c.tickTo(1.56);assert.equal(engine.held.get(1).oscillator,destination);
});
test('pausing during a scheduled transition stops both the retiring and destination voices',async()=>{
  const {c,engine}=await composition(1);c.held();c.tickTo(.81);
  const previous=engine.held.get(1).oscillator;c.tickTo(1.52);
  const destination=engine.held.get(1).oscillator;c.pause();
  close(previous.stopAt,1.52);close(destination.stopAt,1.52);assert.equal(engine.active.size,0);
});

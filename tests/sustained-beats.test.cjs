'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the browser engine with a controllable audio clock, without a DOM
// or sound device. These checks follow phrase beats rather than wall time.
const source = fs.readFileSync(path.join(__dirname, '../sketches/landscape/landscape.js'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
class Parameter {
  constructor() {this.value=0;this.events=[];}
  setValueAtTime(v,t) {this.value=v;this.events.push(['set',v,t]);}
  setTargetAtTime(v,t) {this.value=v;this.events.push(['target',v,t]);}
  linearRampToValueAtTime(v,t) {this.value=v;this.events.push(['ramp',v,t]);}
  exponentialRampToValueAtTime(v,t) {this.value=v;this.events.push(['exponential',v,t]);}
  cancelScheduledValues(t) {this.events.push(['cancel',t]);}
  cancelAndHoldAtTime(t) {this.events.push(['hold',t]);}
}
class AudioNode {
  constructor(kind) {
    this.kind=kind;this.connections=[];
    for(const name of ['gain','pan','frequency','detune','Q','delayTime','threshold','ratio','knee','attack','release'])this[name]=new Parameter();
  }
  connect(node) {this.connections.push(node);return node;}
  disconnect() {this.connections=[];}
  start(time) {this.startAt=time;}
  stop(time=0) {this.stopAt=time;}
  getFloatTimeDomainData(data) {data.fill(0);}
  getByteFrequencyData(data) {data.fill(0);}
  get frequencyBinCount() {return this.fftSize/2;}
}
class AudioContext {
  constructor() {this.currentTime=0;this.sampleRate=8000;this.state='running';this.nodes=[];this.destination=new AudioNode('destination');}
  resume() {return Promise.resolve();}
  createBuffer(count,length) {const channels=Array.from({length:count},()=>new Float32Array(length));return {getChannelData:i=>channels[i]};}
  advance(time) {
    this.currentTime=time;
    for(const node of this.nodes)if(node.stopAt!==undefined&&node.stopAt<=time&&!node.ended){node.ended=true;node.onended?.();}
  }
}
for(const kind of ['Gain','DynamicsCompressor','Analyser','BiquadFilter','WaveShaper','Delay','Convolver','StereoPanner','Oscillator','BufferSource']) {
  AudioContext.prototype['create'+kind]=function(){const node=new AudioNode(kind);this.nodes.push(node);return node;};
}
async function fixture(steps) {
  const context=vm.createContext({window:{AudioContext},Float32Array,Uint8Array,console});
  vm.runInContext(`
    const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
    const PITCH_MIN=48,PITCH_SPAN=24,MAX_SOURCES=16;
    let phraseLength=8,playingStep=null,running=true,activatedHeld=new Set(),worldKey='autumn',selectedId=1,tool='fog',bpm=80,nextId=2,showAudio=false;
    let scaleSettings={autumn:{tonic:0,mode:'majorPent'},space:{tonic:0,mode:'minorPent'}};
    const modes={majorPent:{},minorPent:{}};
    const frequencyFor=n=>440*Math.pow(2,(n-69)/12),noteFor=x=>48+x*24,snapX=x=>x;
    const legacySteps=interval=>Array.from({length:32},(_,i)=>i).filter(i=>i%interval===0);
  `+between('  const worlds=', '  const defaultScenes=')+between('  const allPhraseSteps=', '  const position=')+
  between('  const SOURCE_DEFAULTS', '  let soundSettings')+`
    let soundSettings={autumn:clone(MIX_DEFAULTS),space:clone(MIX_DEFAULTS)},waveforms={autumn:['triangle','sine'],space:['sine','sawtooth']};
    const mix=()=>soundSettings[worldKey],world=()=>worlds[worldKey],scene=()=>scenes[worldKey],typeFor=id=>world().types.find(t=>t.id===id);
    const sourceChannel=e=>typeFor(e.type).sustained?1:typeFor(e.type).channel;
    const cleanSourceSettings=(settings={})=>({...SOURCE_DEFAULTS,...settings});
    const cleanMix=()=>clone(MIX_DEFAULTS);
    let scenes={autumn:[{id:1,type:'fog',x:.5,y:.6,steps:[],muted:false,sound:{...SOURCE_DEFAULTS,sustain:.6}}],space:[]};
  `+between('  class Sound {', '  const sound=new Sound();')+between('  function serial() {', '  function persist() {')+
  between('  function restore(saved){', '  restore(window.openai')+`
    const engine=new Sound();
    globalThis.fixture={engine,item:()=>scene()[0],serial,restore,
      setStep(step,time){engine.context.advance(time);playingStep=step;activatedHeld.add(1);engine.syncHeld();},
      setRunning(value){running=value;},setLength(value){phraseLength=value;},stepsFor:e=>sourceSteps(e)};
  `,context);
  const f=context.fixture;
  f.item().steps=[...steps];
  await f.engine.init();
  return f;
}

test('adjacent selected beats and the loop boundary share one oscillator and one attack', async()=>{
  const f=await fixture([0,1,7]);
  f.engine.scheduleHeldStep(7,.8);f.setStep(7,.8);
  const node=f.engine.held.get(1).oscillator;
  const envelopeEvents=f.engine.held.get(1).gate.gain.events.length;
  for(const [step,time] of [[0,1.55],[1,2.3]]){f.engine.scheduleHeldStep(step,time);f.setStep(step,time);assert.equal(f.engine.held.get(1).oscillator,node);}
  assert.equal(f.engine.held.get(1).gate.gain.events.length,envelopeEvents,'Continuation must not repeat the attack or reset ADSR');
});
test('unselected beats schedule silence at their audio boundary; a later run starts again',async()=>{
  const f=await fixture([0,1,4]);
  f.engine.scheduleHeldStep(0,.8);f.setStep(0,.8);
  const first=f.engine.held.get(1).oscillator;
  f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  assert.equal(f.engine.voices.get(first).end,1.55);
  f.setStep(2,1.55);assert.equal(f.engine.held.size,0);
  f.engine.context.advance(1.58);assert.equal(f.engine.active.size,0);
  f.engine.scheduleHeldStep(3,2.3);f.setStep(3,2.3);assert.equal(f.engine.held.size,0);
  f.engine.scheduleHeldStep(4,3.05);f.setStep(4,3.05);
  assert.notEqual(f.engine.held.get(1).oscillator,first);
});
test('editing a scheduled rest keeps the current note alive when the beat becomes selected',async()=>{
  const f=await fixture([0,1]);
  f.engine.scheduleHeldStep(1,.8);f.setStep(1,.8);
  const first=f.engine.held.get(1).oscillator;
  f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  f.item().steps.push(2);f.engine.cancelHeldSchedules();f.engine.syncHeld();
  assert.equal(f.engine.voices.get(first).end,Infinity);
  f.engine.scheduleHeldStep(2,1.55);f.setStep(2,1.55);
  assert.equal(f.engine.held.get(1).oscillator,first);
  assert.equal(first.stopAt,undefined,'Cancelling a future rest must cancel its oscillator stop too');
});
test('dragging a held source updates a pending onset and preserves a pending rest',async()=>{
  const f=await fixture([0,1]);
  f.engine.scheduleHeldStep(0,.8);
  f.item().x=.75;f.item().y=.4;f.engine.syncHeld();
  const held=f.engine.held.get(1);
  assert.equal(held.oscillator.frequency.events.at(-1)[2],.8,'Pending pitch edits use the onset time');
  f.setStep(0,.8);f.engine.context.advance(1.51);f.engine.scheduleHeldStep(2,1.55);
  f.item().y=.7;f.engine.syncHeld();
  assert.equal(held.releaseAt,1.55);
  assert.equal(f.engine.voices.get(held.oscillator).end,1.55);
  assert.equal(held.gate.gain.events.at(-1)[2],1.558,'Volume edits preserve the upcoming fade');
});
test('empty selection is silent, and removing the current beat stops its held note',async()=>{
  const f=await fixture([]);
  for(let step=0;step<8;step++){f.engine.scheduleHeldStep(step,.8+step*.75);f.setStep(step,.8+step*.75);}
  assert.equal(f.engine.active.size,0);
  f.item().steps=[0];f.engine.scheduleHeldStep(0,7);f.setStep(0,7);assert.equal(f.engine.held.size,1);
  f.item().steps=[];f.engine.cancelHeldSchedules();f.engine.syncHeld();assert.equal(f.engine.held.size,0);
});
test('mute, pause and source removal stop holds; resume during a rest stays silent',async()=>{
  const f=await fixture([0]);
  f.engine.scheduleHeldStep(0,.8);f.setStep(0,.8);
  f.item().muted=true;f.engine.syncHeld();assert.equal(f.engine.held.size,0);
  f.item().muted=false;f.engine.syncHeld();assert.equal(f.engine.held.size,1);
  f.setRunning(false);f.engine.stop();assert.equal(f.engine.held.size,0);
  f.setRunning(true);f.setStep(1,1.55);assert.equal(f.engine.held.size,0);
  f.setStep(0,2.3);f.item().type='drop';f.engine.syncHeld();assert.equal(f.engine.held.size,0);
});
test('old whole-phrase holds migrate; new selections, including silence, survive saving',async()=>{
  const f=await fixture([]);
  const old=JSON.parse(JSON.stringify(f.serial()));old.version=4;old.scenes.autumn[0].steps=[];
  f.restore(old);assert.equal(f.item().steps.length,32);assert.equal(f.stepsFor(f.item()).length,8);
  for(const steps of [[1,2,7],[]]){f.item().steps=steps;const saved=JSON.parse(JSON.stringify(f.serial()));assert.equal(saved.version,5);f.restore(saved);assert.deepEqual(Array.from(f.item().steps),steps);}
  f.item().steps=[1,15,31];f.setLength(2);assert.deepEqual(Array.from(f.stepsFor(f.item())),[1]);f.setLength(32);assert.deepEqual(Array.from(f.stepsFor(f.item())),[1,15,31]);
});

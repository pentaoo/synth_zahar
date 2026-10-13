'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the browser engine with a controllable audio clock, without a DOM
// or sound device. These checks follow phrase beats rather than wall time.
const source = fs.readFileSync(path.join(__dirname, '../../sketches/landscape/landscape.js'), 'utf8');
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
  const context=vm.createContext({window:{AudioContext,LandscapeInstruments:require('../../sketches/landscape/instruments.js'),LandscapeFiles:require('../../sketches/landscape/layout-files.js'),CompositionTools:require('../../sketches/landscape/composition-tools.js'),SelectionTools:require('../../sketches/landscape/selection-tools.js')},Float32Array,Uint8Array,console});
  vm.runInContext(`
    const layoutFiles=window.LandscapeFiles,compositionTools=window.CompositionTools,instruments=window.LandscapeInstruments,selectionTools=window.SelectionTools;let layoutName='',toolInstrument='default';
    let selectedSourceIds=new Set([1]),selectedPhraseKeys=new Set(),phraseSelectionCleared=false,compositionSourceFilter='all';
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
    const sourceChannel=e=>typeFor(e.type).sustained?1:e.sound.channel==='auto'?(instruments.get(e.sound.instrument)?.channel??typeFor(e.type).channel):Number(e.sound.channel);
    const cleanSourceSettings=(settings={})=>({...SOURCE_DEFAULTS,...settings});
    const cleanMix=()=>clone(MIX_DEFAULTS);
    let scenes={autumn:[{id:1,type:'fog',x:.5,y:.6,steps:[],muted:false,sound:{...SOURCE_DEFAULTS,sustain:.6}}],space:[]};
  `+between('  class Sound {', '  let sound=new Sound();')+between('  function fieldSnapshot() {', '  const activeField =')+
  between('  function restoreField(saved){', '  function restore(saved)')+
  between('  const phraseKey=', '  function beginMarquee(')+`
    const engine=new Sound();
    globalThis.fixture={engine,item:()=>scene()[0],serial:fieldSnapshot,restore:restoreField,
      setStep(step,time){engine.context.advance(time);playingStep=step;activatedHeld.add(1);engine.syncHeld();},
      setRunning(value){running=value;},setLength(value){phraseLength=value;},stepsFor:e=>sourceSteps(e)};
  `,context);
  const f=context.fixture;
  f.item().steps=[...steps];
  await f.engine.init();
  f.evaluate = code => vm.runInContext(code,context);
  return f;
}

module.exports={fixture,between};

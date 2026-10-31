import {renderScore,clamp,DEFAULT_WAVES,BPM} from './folk-score.mjs?v=ritual-10';
import {SpellBook} from './spell-book.mjs?v=chains-2';
import {CREATURES} from './ritual-model.mjs';
import {createSpellRack,silentSpells} from './spell-rack.mjs?v=chains-2';
import {RitualVoice,voiceDefaults,VOICE_RANGES,speakAloud} from './ritual-voice.mjs?v=chains-4';
import {channelDefaults,channelValue} from './channel-state.mjs?v=chains-3';
import {Chains} from './chain-model.mjs?v=chains-2';
import {renderRing,masterStems} from './chain-score.mjs?v=chains-2';

// One persistent worker renders ring buffers; stale results are dropped by key.
class RingRenderer{
  constructor(){this.serial=0;this.waiting=new Map();}
  render(sampleRate,channel,cells,options){
    if(!globalThis.Worker)return Promise.resolve(renderRing(sampleRate,channel,cells,options));
    if(!this.worker){
      this.worker=new Worker(new URL('./chain-worker.mjs',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{const job=this.waiting.get(data.id);if(!job)return;this.waiting.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data);};
      this.worker.onerror=()=>{for(const job of this.waiting.values())job.reject(new Error('Не удалось подготовить звук кольца.'));this.waiting.clear();this.worker?.terminate();this.worker=null;};
    }
    const id=++this.serial;
    return new Promise((resolve,reject)=>{this.waiting.set(id,{resolve,reject});this.worker.postMessage({id,sampleRate,channel,cells,pipe:options.pipe,wave:options.wave});});
  }
  dispose(){this.worker?.terminate();this.worker=null;this.waiting.clear();}
}

function makeScore(sampleRate,waves) {
  if(!globalThis.Worker) return Promise.resolve(renderScore(sampleRate,waves));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./score-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};
    worker.onerror=()=>{worker.terminate();reject(new Error('Не удалось подготовить звук. Обнови страницу.'));};
    worker.postMessage({sampleRate,waves});
  });
}
const driveCurve=amount=>{
  const curve=new Float32Array(1024),strength=1+amount*15;
  for(let i=0;i<curve.length;i++) {const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*strength)/Math.tanh(strength);}
  return curve;
};
const FRICTION=[110,220,82.41];
const TRANSPORTS={
  vinyl:{module:'./transport-vinyl-worklet.js?v=scrub-1',processor:'ouroboros-vinyl-transport'},
  slip:{module:'./transport-worklet.js',processor:'ouroboros-transport'}
};

export class OuroborosAudio {
  constructor(onstate=()=>{},{transport='vinyl'}={}) {
    this.transportKind=transport==='slip'?'slip':'vinyl';
    this.channelSettings=channelDefaults();this.inkMacro=null;this.spells=new SpellBook();this.phraseAudio=true;this.voiceError='';
    this.voiceSettings=voiceDefaults();this.chains=new Chains();this.ringKeys=['','',''];this.ringOrder=[new Map(),new Map(),new Map()];this.ringRenderer=new RingRenderer();this.chainMode=this.transportKind==='vinyl';
    this.channelSettings[0].wave=DEFAULT_WAVES[0];this.channelSettings[1].wave=DEFAULT_WAVES[1];
    this.onstate=onstate;this.waves=[...DEFAULT_WAVES];this.playing=false;this.ready=null;this.rate=1;this.scratchMode='scales';this.playIntent=0;
    this.state={phase:0,backgroundPhase:0,speed:0,rate:1,peak:0,motion:0,power:0,slipMix:0,modeMix:0,playing:false,scratching:false,queued:-1};this.ink=null;
  }
  async initialize() {
    if(this.ready) return this.ready;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context) throw new Error('Этот браузер не поддерживает Web Audio.');
    this.context=new Context({latencyHint:'interactive'});
    const resume=this.context.resume();
    this.ready=(async()=>{
      await resume;
      if(!this.context.audioWorklet) throw new Error('Для скретча нужен браузер с AudioWorklet. Открой страницу через localhost или HTTPS.');
      const score=this.chainMode?{stems:masterStems(this.context.sampleRate),phraseStems:[],beats:16}:await makeScore(this.context.sampleRate,this.waves);
      const definition=TRANSPORTS[this.transportKind];
      await this.context.audioWorklet.addModule(new URL(definition.module,import.meta.url));
      const outputChannelCount=Array(this.transportKind==='vinyl'?10:9).fill(1);
      this.transport=new AudioWorkletNode(this.context,definition.processor,{numberOfInputs:0,numberOfOutputs:outputChannelCount.length,outputChannelCount});
      this.buildGraph();
      if(this.voiceRack){this.voice=new RitualVoice(this.context,this.voiceRack.input);this.voice.configure(this.voiceSettings);
      await this.voice.load().catch(error=>{this.voiceError=error.message;});}
      await new Promise(resolve=>{
        this.transport.port.onmessage=({data})=>{
          if(data.ready) resolve();
          else {this.state={...this.state,...data};this.spells.advance(data.travelBeats||0);this.updateSpells();this.voice?.advance(data.travelBeats||0,this.playing,data.speed>0);this.onstate(this.state);}
        };
        this.transport.port.postMessage({type:'load',stems:score.stems,phraseStems:score.phraseStems.length?score.phraseStems:undefined,beats:score.beats},[...score.stems,...score.phraseStems].map(stem=>stem.buffer));
      });
      if(this.chainMode)await this.syncChains();
      this.setRate(this.rate);
      this.setScratchMode(this.scratchMode);
      this.context.onstatechange=()=>{if(this.context.state==='suspended'&&this.playing){this.playing=false;this.transport.port.postMessage({type:'play',value:false});this.endInk();this.voice?.stop();this.state.playing=false;this.onstate(this.state);}};
      return this;
    })().catch(async error=>{await this.context.close?.().catch(()=>{});this.ready=null;throw error;});
    return this.ready;
  }
  impulse(seconds) {
    const c=this.context,buffer=c.createBuffer(2,Math.floor(c.sampleRate*seconds),c.sampleRate);
    let seed=913;
    for(let channel=0;channel<2;channel++) {
      const pcm=buffer.getChannelData(channel);
      for(let n=0;n<pcm.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const t=n/c.sampleRate,decay=seconds>3?(.35*(1-n/pcm.length)**1.8+.65*Math.exp(-(((t-.9)/.34)**2)))*(1-n/pcm.length): (1-n/pcm.length)**2.8;pcm[n]=(seed/2147483648-1)*decay*.38;}
    }
    return buffer;
  }
  buildGraph() {
    const c=this.context;
    this.master=c.createGain();this.master.gain.value=.62;
    this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-12;this.compressor.ratio.value=7;this.compressor.knee.value=10;this.compressor.attack.value=.003;this.compressor.release.value=.12;
    this.analyser=c.createAnalyser();this.analyser.fftSize=1024;this.samples=new Float32Array(1024);this.spectrum=new Uint8Array(512);
    this.analysisState={level:0,low:0,high:0,centroid:0,bass:0,melody:0,drums:0,channels:new Float32Array(3),waveform:this.samples};
    this.master.connect(this.compressor).connect(this.analyser).connect(c.destination);
    const impulse=this.impulse(.72);
    this.channels=[0,1,2].map((channel)=>{
      const input=c.createGain(),body=c.createBiquadFilter(),filter=c.createBiquadFilter(),drive=c.createWaveShaper(),preDrive=c.createGain(),makeup=c.createGain(),dry=c.createGain(),pan=c.createStereoPanner(),level=c.createGain(),analyser=c.createAnalyser();
      body.type='peaking';body.frequency.value=140;body.Q.value=.8;body.gain.value=0;
      filter.type='lowpass';filter.Q.value=.65;filter.frequency.value=[2300,5200,8000][channel];drive.curve=driveCurve(1);drive.oversample='2x';preDrive.gain.value=1.6/16;makeup.gain.value=1/Math.tanh(1.6);dry.gain.value=[.85,.88,.76][channel];pan.pan.value=[-.08,.12,0][channel];analyser.fftSize=256;
      if(!this.phraseAudio)this.transport.connect(input,channel);input.connect(body).connect(filter).connect(preDrive).connect(drive).connect(makeup).connect(dry).connect(pan).connect(level).connect(analyser).connect(this.master);
      const send=c.createGain(),delay=c.createDelay(1),feedback=c.createGain(),echo=c.createGain(),reverb=c.createConvolver(),space=c.createGain();
      delay.delayTime.value=60/BPM*.75;feedback.gain.value=.18;echo.gain.value=channel===2?.025:.055;
      makeup.connect(send).connect(delay).connect(feedback).connect(delay);delay.connect(echo).connect(pan);
      reverb.buffer=impulse;space.gain.value=channel===2?.025:.065;send.connect(reverb).connect(space).connect(pan);
      return {input,body,filter,drive,preDrive,makeup,dry,pan,level,analyser,samples:new Float32Array(256),send,delay,feedback,echo,space,amount:.04};
    });
    for(let i=0;i<3;i++)this.applyChannel(i);
    if(this.phraseAudio&&this.chainMode){
      // One spell rack per ring; it carries the values of the snake now sounding.
      const hall=this.impulse(3.6);
      this.ringRacks=[0,1,2].map(i=>{const rack=createSpellRack(c,this.channels[i].input,hall);this.transport.connect(rack.input,4+i);return rack;});
      this.voiceRack=createSpellRack(c,this.master,hall);
      this.inkRack=createSpellRack(c,this.channels[1].input,hall);
    }else if(this.phraseAudio){
      const hall=this.impulse(3.6);
      this.phraseRacks=CREATURES.map((creature,i)=>{const rack=createSpellRack(c,this.channels[creature.channel].input,hall);this.transport.connect(rack.input,(this.transportKind==='vinyl'?4:3)+i);return rack;});
      this.voiceRack=createSpellRack(c,this.master,hall);
      this.inkRack=createSpellRack(c,this.channels[1].input,hall);
    }
    // The recitative comes from the abyss: the ink reads this level.
    if(this.voiceRack){this.voiceAnalyser=c.createAnalyser();this.voiceAnalyser.fftSize=512;this.voiceSamples=new Float32Array(512);this.voiceRack.input.connect(this.voiceAnalyser);}
    if(this.transportKind==='vinyl'){
      this.texture=c.createGain();this.texture.gain.value=.95;
      this.transport.connect(this.texture,3);this.texture.connect(this.master);
    }
  }
  castSpell(word,target){
    const result=this.spells.cast(word,target);if(result.ok){this.updateSpells();if(this.voice?.say(result.spell.key))this.openVoice();else this.speakWord(result.spell.word);}return result;
  }
  // The snake sounding now in each ring, from the record position of that ring.
  activeSnake(index){
    const ring=this.chains.rings[index],state=this.state.rings?.[index];if(!ring.length)return null;
    if(!state)return ring[0];const at=Math.floor(state.phase*state.segments)%Math.max(1,state.segments),uid=this.ringOrder[index].get(state.version)?.[at];
    return ring.find(s=>s.uid===uid)||ring[Math.min(ring.length-1,at)];
  }
  playingUids(index){const state=this.state.rings?.[index];return state?this.ringOrder[index].get(state.version)||null:null;}
  syncChains(){
    if(!this.chainMode||!this.transport||!this.context)return Promise.resolve();
    const versions=this.chains.versions,jobs=[];
    for(let i=0;i<3;i++){
      const key=versions[i]+(i===0?':'+versions[1]+':'+this.chains.rings[1].length:'')+':'+(this.waves[i]||'');
      if(key===this.ringKeys[i])continue;this.ringKeys[i]=key;
      const cells=this.chains.rings[i].map(s=>[...s.cells]),pipe=this.chains.rings[1].map(s=>[...s.cells]),version=versions[i];
      this.ringOrder[i].set(version,this.chains.rings[i].map(s=>s.uid));if(this.ringOrder[i].size>24)this.ringOrder[i].delete(this.ringOrder[i].keys().next().value);
      if(!cells.length){this.transport.port.postMessage({type:'ring',index:i,pcm:null});continue;}
      jobs.push(this.ringRenderer.render(this.context.sampleRate,i,cells,{pipe,wave:this.waves[i]||'sawtooth'}).then(ring=>{
        if(this.ringKeys[i]!==key||!this.transport)return;
        this.transport.port.postMessage({type:'ring',index:i,pcm:ring.pcm,segments:ring.segments,version},[ring.pcm.buffer]);
      }).catch(error=>{this.voiceError=error.message;}));
    }
    return Promise.all(jobs);
  }
  updateSpells(){
    this.ringRacks?.forEach((rack,i)=>{const snake=this.activeSnake(i);rack.apply(snake?this.spells.values(snake.uid):silentSpells());});
    this.phraseRacks?.forEach((rack,i)=>rack.apply(this.spells.values(CREATURES[i].id)));
    this.voiceRack?.apply(this.spells.allVoiceValues());
    this.inkRack?.apply(this.spells.allVoiceValues());
  }
  async play() {
    const intent=++this.playIntent;
    await this.initialize();await this.context.resume();if(intent!==this.playIntent)return false;this.playing=true;
    this.master.gain.setTargetAtTime(.62,this.context.currentTime,.015);
    this.transport.port.postMessage({type:'play',value:true});this.state.playing=true;this.onstate(this.state);
    return true;
  }
  pause() {
    this.playIntent++;
    if(!this.transport)return;
    this.playing=false;this.transport.port.postMessage({type:'play',value:false});this.endInk();this.voice?.stop();
    this.setScratchSend(1);
    this.master.gain.setTargetAtTime(0,this.context.currentTime,.025);this.state={...this.state,playing:false,scratching:false,motion:0,power:0,slipMix:0,coasting:false,coastVelocity:0,texturePeak:0};this.onstate(this.state);
  }
  // The rubbed ring hums its own note: bass A2, bagpipe A3, drums E2.
  grab(channel) {
    if(!this.transport)return;
    if(!this.playing){this.transport.port.postMessage({type:'grab'});return;}
    if(FRICTION[channel])this.transport.port.postMessage({type:'friction',frequency:FRICTION[channel]});this.transport.port.postMessage({type:'grab'});this.setScratchSend(.22);
  }
  motion(velocity) {if(this.transport&&Number.isFinite(velocity))this.transport.port.postMessage({type:'motion',velocity});}
  // Paused, the snakes can still be turned by hand without a sound: the record
  // moves silently and the music later continues from where it was left.
  async prepareScrub() {
    if(this.playing)return true;
    try{await this.initialize();if(this.context.state!=='running')await this.context.resume();}catch{return false;}
    if(!this.playing&&this.master){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setValueAtTime(0,now);}
    return !!this.transport&&this.context.state==='running';
  }
  release({coastVelocity=0}={}) {this.transport?.port.postMessage({type:'release',coastVelocity});this.setScratchSend(1);}
  cancelScratch(){this.transport?.port.postMessage({type:this.transportKind==='vinyl'?'cancel':'release'});this.setScratchSend(1);}
  setVoiceParam(key,value){
    const range=VOICE_RANGES[key];if(!range||!Number.isFinite(value))return false;
    this.voiceSettings[key]=Math.max(range[0],Math.min(range[1],value));this.voice?.configure(this.voiceSettings);return true;
  }
  // Every typed word is read aloud: recorded words through the robot chain, the rest by the system voice.
  // Paused, the master opens for the voice alone: the record's envelope stays shut.
  openVoice(){if(!this.playing&&this.master)this.master.gain.setTargetAtTime(.62,this.context.currentTime,.015);}
  // Every typed word goes through the voice of the abyss and its settings.
  async speakWord(text){
    this.voice?.stop();const speech=this.liveSpeech={on:false};
    try{await this.initialize();if(this.context.state!=='running')await this.context.resume();}catch{}
    if(this.voice){
      this.openVoice();
      if(await this.voice.speak(text))return true;
    }
    return speakAloud(text,this.voiceSettings,{onstart:()=>{speech.on=true;},onend:()=>{speech.on=false;}});
  }
  sayVoice(){return this.voice?.say(this.voice.recitative++%2?'recitative-b':'recitative-a')||false;}
  getChannelState(index){return this.channelSettings[index]?{...this.channelSettings[index]}:null;}
  setChannelParam(index,key,value){
    if(!Number.isInteger(index)||!this.channelSettings[index])return false;
    const valid=channelValue(key,value);if(valid===null)return false;
    this.channelSettings[index][key]=valid;this.applyChannel(index);return true;
  }
  applyChannel(index){
    const nodes=this.channels?.[index];if(!nodes)return;
    const state=this.channelSettings[index],macro=this.inkMacro,now=this.context.currentTime;
    const brightness=macro?state.brightness*(.35+macro.x*2):state.brightness;
    const amount=clamp(state.saturation+(macro?macro.y*.28+macro.energy*.13:0),0,1),strength=1+amount*15;
    nodes.filter.frequency.setTargetAtTime(clamp(brightness,180,16000),now,.025);
    nodes.level.gain.setTargetAtTime(state.level,now,.02);nodes.pan.pan.setTargetAtTime(state.pan,now,.02);
    nodes.preDrive.gain.setTargetAtTime(strength/16,now,.02);nodes.makeup.gain.setTargetAtTime(1/Math.tanh(strength),now,.02);
    nodes.echo.gain.setTargetAtTime(state.echo+(macro?macro.y*.1:0),now,.04);nodes.space.gain.setTargetAtTime(state.reverb+(macro?macro.y*.13:0),now,.04);
    if(index===2)nodes.body.gain.setTargetAtTime((state.punch-.35)*12,now,.025);
  }
  finish(){
    this.playIntent++;this.playing=false;this.cancelScratch();this.endInk();this.voice?.stop();
    this.transport?.port.postMessage({type:'play',value:false});
    if(this.master){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setValueAtTime(this.master.gain.value,now);this.master.gain.linearRampToValueAtTime(0,now+.18);}
    this.state={...this.state,playing:false,scratching:false,coasting:false,coastVelocity:0};this.onstate(this.state);
  }
  async restart(){
    this.pause();
    const intent=this.playIntent;
    if(this.ready)await this.ready.catch(()=>{});
    if(this.context){this.context.onstatechange=null;await this.context.close().catch(()=>{});}
    this.voice?.reset();this.voice=null;this.spells.reset();this.chains.reset();this.ringKeys=['','',''];this.ringOrder.forEach(m=>m.clear());
    this.context=null;this.transport=null;this.channels=null;this.ready=null;this.master=null;this.analyser=null;this.scratchSend=undefined;this.rate=1;
    this.state={...this.state,phase:0,backgroundPhase:0,rate:1,speed:0,peak:0,playing:false,queued:-1};
    if(intent!==this.playIntent){this.onstate(this.state);return false;}
    return this.play();
  }
  setScratchSend(value){
    if(!this.channels||this.scratchSend===value)return;
    this.scratchSend=value;
    for(const channel of this.channels)channel.send.gain.setTargetAtTime(value,this.context.currentTime,value<1?.008:.025);
  }
  setScratchMode(value){
    if(!['scales','vinyl','synth'].includes(value))return;
    this.scratchMode=value;this.transport?.port.postMessage({type:'mode',value});
  }
  cue(section) {this.transport?.port.postMessage({type:'cue',section});}
  setRate(value) {
    if(!Number.isFinite(value)||value<=0)return;
    this.rate=clamp(value,.25,4);
    this.transport?.port.postMessage({type:'rate',value:this.rate});
    if(this.channels)for(const channel of this.channels)channel.delay.delayTime.setTargetAtTime(60/BPM*.75/this.rate,this.context.currentTime,.06);
    for(const rack of [...(this.ringRacks||[]),...(this.phraseRacks||[]),this.voiceRack,this.inkRack])rack?.echoDelay?.delayTime.setTargetAtTime(60/BPM*.75/this.rate,this.context.currentTime,.06);
  }
  async changeWave(channel,wave) {
    if(channel<0||channel>1||!['sine','triangle','sawtooth','square'].includes(wave))return;
    this.channelSettings[channel].wave=wave;
    this.waves[channel]=wave;
    if(!this.transport)return;
    const generation=(this.generation||0)+1;this.generation=generation;
    if(this.chainMode){await this.syncChains();return;}
    const score=await makeScore(this.context.sampleRate,this.waves);
    if(this.generation===generation)this.transport.port.postMessage({type:'load',stems:score.stems,phraseStems:score.phraseStems,beats:score.beats},[...score.stems,...score.phraseStems].map(stem=>stem.buffer));
  }
  startInk(x,y) {
    if(!this.context||!this.playing)return;
    this.endInk();
    const c=this.context,osc=c.createOscillator(),second=c.createOscillator(),fm=c.createOscillator(),depth=c.createGain(),mix=c.createGain(),gate=c.createGain();
    osc.type=this.waves[1];second.type='sine';fm.type='sine';mix.gain.value=.22;gate.gain.value=0;
    osc.connect(gate);second.connect(mix).connect(gate);fm.connect(depth).connect(osc.frequency);gate.connect(this.inkRack?.input||this.channels[1].input);
    for(const node of [osc,second,fm])node.start();
    gate.gain.setTargetAtTime(.055,c.currentTime,.035);
    this.ink={osc,second,fm,depth,mix,gate};this.moveInk(x,y,0);
  }
  moveInk(x,y,energy=0) {
    if(!this.context||!this.channels)return;
    x=clamp(x,0,1);y=clamp(y,0,1);energy=clamp(energy,0,1);
    const now=this.context.currentTime;this.inkMacro={x,y,energy};for(let i=0;i<3;i++)this.applyChannel(i);
    if(this.ink) {
      const f=110*2**(x*2),voice=this.ink;
      voice.osc.frequency.setTargetAtTime(f,now,.025);voice.second.frequency.setTargetAtTime(f*2.003,now,.025);
      voice.fm.frequency.setTargetAtTime(f*(1.5+y),now,.025);voice.depth.gain.setTargetAtTime(f*(.03+y*.24+energy*.3),now,.03);
    }
  }
  endInk() {
    this.inkMacro=null;for(let i=0;i<3;i++)this.applyChannel(i);
    if(!this.ink)return;
    const voice=this.ink,now=this.context.currentTime;this.ink=null;
    voice.gate.gain.setTargetAtTime(0,now,.06);
    for(const node of [voice.osc,voice.second,voice.fm]) node.stop(now+.4);
    voice.osc.onended=()=>{for(const node of Object.values(voice))node.disconnect();};
  }
  level() {
    if(!this.analyser)return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum=0;for(const sample of this.samples)sum+=sample*sample;
    return Math.sqrt(sum/this.samples.length);
  }
  readAnalysis(){
    if(!this.analysisState)this.analysisState={level:0,low:0,high:0,centroid:0,bass:0,melody:0,drums:0,channels:new Float32Array(3),waveform:new Float32Array(1024)};
    const out=this.analysisState;out.level=this.level();
    if(!this.analyser||!this.playing){out.low=out.high=out.centroid=out.bass=out.melody=out.drums=0;out.channels.fill(0);return out;}
    this.analyser.getByteFrequencyData(this.spectrum);
    let low=0,high=0,total=0,weighted=0;
    for(let i=0;i<this.spectrum.length;i++){const value=this.spectrum[i]/255;if(i<6)low+=value;if(i>55)high+=value;total+=value;weighted+=value*i/this.spectrum.length;}
    out.low=clamp(low/6,0,1);out.high=clamp(high/(this.spectrum.length-56)*3,0,1);out.centroid=total?weighted/total:0;
    for(let i=0;i<3;i++){const channel=this.channels[i];channel.analyser.getFloatTimeDomainData(channel.samples);let sum=0;for(const v of channel.samples)sum+=v*v;out.channels[i]=Math.sqrt(sum/channel.samples.length);}
    if(this.voiceAnalyser){this.voiceAnalyser.getFloatTimeDomainData(this.voiceSamples);let sum=0;for(const v of this.voiceSamples)sum+=v*v;out.voice=clamp(Math.sqrt(sum/this.voiceSamples.length)*9,0,1);}else out.voice=0;
    if(this.liveSpeech?.on)out.voice=Math.max(out.voice,.3+.25*Math.abs(Math.sin(performance.now()/70)));
    out.bass=clamp(out.channels[0]*8,0,1);out.melody=clamp(out.channels[1]*6,0,1);out.drums=clamp(out.channels[2]*10,0,1);return out;
  }
}

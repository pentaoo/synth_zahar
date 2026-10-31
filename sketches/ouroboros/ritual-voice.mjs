const FILES=['vault','rage','split','clear','recitative-a','recitative-b'];
// Words added later may still lack a recording; the voice then stays silent for them.
const OPTIONAL=['echo','fog','ice','tremble'];
export const VOICE_RANGES=Object.freeze({level:[0,.6],pitch:[.6,1.4],robot:[0,1],tone:[350,3200],every:[0,64],carrier:[20,140]});
export const voiceDefaults=()=>({level:.18,pitch:.94,robot:.6,tone:1250,every:16,carrier:43});
const crush=robot=>{const steps=Math.max(4,Math.round(64-robot*67)),curve=new Float32Array(1024);for(let i=0;i<1024;i++)curve[i]=Math.round(Math.tanh((i/511.5-1)*(1+robot*3.3))*steps)/steps;return curve;};
// Any typed word without a recording is synthesised on the page by eSpeak NG
// (Russian, GPL-3, ~18 MB wasm fetched once from the CDN on the first phrase),
// so it goes through the same robot chain as the recordings. If eSpeak cannot
// load, the system voice (Milena where present) reads it outside the chain.
const ESPEAK='https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.js';
let espeak=null;
function espeakEngine(){
  if(!espeak){
    espeak=(async()=>{
      const [{default:ESpeakNg},module]=await Promise.all([import(ESPEAK),(async()=>{const r=await fetch(new URL('espeak-ng.wasm',ESPEAK));if(!r.ok)throw new Error('eSpeak '+r.status);return WebAssembly.compile(await r.arrayBuffer());})()]);
      return {ESpeakNg,module};
    })();
    espeak.catch(()=>{espeak=null;});
  }
  return espeak;
}
// Text → WAV bytes. Each phrase runs the eSpeak command once on the compiled module.
export async function synthesise(text){
  const {ESpeakNg,module}=await espeakEngine(),words=String(text).replace(/^[\s-]+/,'').trim();if(!words)return null;
  const m=await ESpeakNg({arguments:['-v','ru','-s','150','-w','/speech.wav',words],print(){},printErr(){},
    instantiateWasm(imports,done){WebAssembly.instantiate(module,imports).then(instance=>done(instance,module));return {};}});
  return m.FS.readFile('/speech.wav');
}
let ruVoice=null;
const pickVoice=synth=>{const list=synth.getVoices?.()||[];ruVoice=list.find(v=>/milena/i.test(v.name))||list.find(v=>/^ru/i.test(v.lang))||ruVoice;return ruVoice;};
export function speakAloud(text,settings=voiceDefaults(),{onstart,onend}={}){
  const synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,words=String(text).trim();
  if(!synth||!Utterance||!words)return false;
  if(!ruVoice){pickVoice(synth);synth.addEventListener?.('voiceschanged',()=>pickVoice(synth),{once:true});}
  synth.cancel();const u=new Utterance(words);u.lang='ru-RU';if(ruVoice)u.voice=ruVoice;
  u.pitch=Math.max(.1,Math.min(2,settings.pitch-.4));u.rate=.88;u.volume=Math.max(0,Math.min(1,settings.level/.3));
  u.onstart=()=>onstart?.();u.onend=u.onerror=()=>onend?.();synth.speak(u);return true;
}
export class RitualVoice {
  constructor(context,destination){
    this.context=context;this.destination=destination;this.buffers=new Map();this.active=null;this.nextRecitative=5;this.recitative=0;this.epoch=0;this.spoken=0;this.enabled=true;
    const c=context;this.filter=c.createBiquadFilter();this.filter.type='bandpass';this.filter.frequency.value=1250;this.filter.Q.value=.65;
    this.robot=c.createWaveShaper();const curve=new Float32Array(1024);for(let i=0;i<1024;i++)curve[i]=Math.round(Math.tanh((i/511.5-1)*3)*24)/24;this.robot.curve=curve;
    this.ring=c.createGain();this.level=c.createGain();this.level.gain.value=.18;
    this.carrier=c.createOscillator();this.carrier.frequency.value=43;this.carrier.type='square';this.ring.gain.value=.62;
    this.depth=c.createGain();this.depth.gain.value=.32;this.carrier.connect(this.depth).connect(this.ring.gain);this.carrier.start();
    this.filter.connect(this.robot).connect(this.ring).connect(this.level).connect(destination);
  }
  async load(){
    const fetchOne=async key=>{const r=await fetch(new URL(`./assets/voice/${key}.wav?v=chains-2`,import.meta.url));if(!r.ok)throw new Error('Не загрузилась речь: '+key);const buffer=await this.context.decodeAudioData(await r.arrayBuffer());if(buffer.length<100)throw new Error('Пустая запись речи: '+key);this.buffers.set(key,buffer);};
    await Promise.all([...FILES.map(fetchOne),...OPTIONAL.map(key=>fetchOne(key).catch(()=>{}))]);
  }
  // Voice settings: loudness, pitch, how robotic, the formant band and how often the abyss speaks.
  configure(settings){
    const now=this.context.currentTime;this.settings={...(this.settings||voiceDefaults()),...settings};const v=this.settings;
    this.level.gain.setTargetAtTime(v.level,now,.03);this.filter.frequency.setTargetAtTime(v.tone,now,.03);
    this.ring.gain.setTargetAtTime(1-v.robot*.63,now,.03);this.depth.gain.setTargetAtTime(v.robot*.53,now,.03);this.carrier.frequency.setTargetAtTime(v.carrier,now,.03);
    if(this.robotAmount!==v.robot){this.robot.curve=crush(v.robot);this.robotAmount=v.robot;}
    if(this.active)this.active.playbackRate.setTargetAtTime(v.pitch,now,.03);
    return v;
  }
  // A typed phrase: synthesised, then played through the robot chain like a recording.
  async speak(text){
    const epoch=++this.epoch;let bytes;try{bytes=await synthesise(text);}catch{return false;}
    if(!bytes||epoch!==this.epoch)return !!bytes;
    const buffer=await this.context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if(epoch!==this.epoch)return true;this.buffers.set('typed',buffer);return this.say('typed');
  }
  say(key){if(!this.enabled||!this.buffers.has(key))return false;this.stop();const source=this.context.createBufferSource();source.buffer=this.buffers.get(key);source.playbackRate.value=this.settings?.pitch??.94;source.connect(this.filter);source.start();this.active=source;this.word=key;this.spoken++;source.onended=()=>{source.disconnect();if(this.active===source)this.active=null;};return true;}
  advance(heardBeats,playing,forward=true){if(!playing){if(this.active&&/^recitative/.test(this.word))this.stop();return;}const every=this.settings?.every??16;if(every>0&&heardBeats>=this.nextRecitative&&forward){this.nextRecitative=heardBeats+every;if(!this.active)this.say(this.recitative++%2?'recitative-b':'recitative-a');}}
  stop(){this.epoch++;if(this.active){try{this.active.stop();}catch{}this.active.disconnect();this.active=null;}this.word='';}
  reset(){this.stop();this.nextRecitative=5;this.recitative=0;}
}

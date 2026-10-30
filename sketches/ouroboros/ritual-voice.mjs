const FILES=['vault','rage','split','clear','recitative-a','recitative-b'];
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
  async load(){await Promise.all(FILES.map(async key=>{const r=await fetch(new URL(`./assets/voice/${key}.wav`,import.meta.url));if(!r.ok)throw new Error('Не загрузилась речь: '+key);const buffer=await this.context.decodeAudioData(await r.arrayBuffer());if(buffer.length<100)throw new Error('Пустая запись речи: '+key);this.buffers.set(key,buffer);}));}
  say(key){if(!this.enabled||!this.buffers.has(key))return false;this.stop();const source=this.context.createBufferSource();source.buffer=this.buffers.get(key);source.playbackRate.value=.94;source.connect(this.filter);source.start();this.active=source;this.word=key;this.spoken++;source.onended=()=>{source.disconnect();if(this.active===source)this.active=null;};return true;}
  advance(heardBeats,playing,forward=true){if(!playing){this.stop();return;}if(heardBeats>=this.nextRecitative&&forward){this.nextRecitative=heardBeats+16;if(!this.active)this.say(this.recitative++%2?'recitative-b':'recitative-a');}}
  stop(){this.epoch++;if(this.active){try{this.active.stop();}catch{}this.active.disconnect();this.active=null;}this.word='';}
  reset(){this.stop();this.nextRecitative=5;this.recitative=0;}
}

// One uninterrupted musical clock, one temporary hand-controlled reader.
// Slip blends readers instead of fast-forwarding a backlog of positions.
class OuroborosTransport extends AudioWorkletProcessor {
  constructor(){
    super();
    this.stems=null;this.length=0;this.background=0;this.position=0;
    this.playing=false;this.scratching=false;this.speed=0;this.rate=1;this.rateTarget=1;
    this.motion=0;this.motionTarget=0;this.hold=0;this.power=0;
    this.mix=0;this.mixTarget=0;this.mixStep=0;this.pendingRelease=0;this.strokeRendered=false;
    this.mode=0;this.modeTarget=0;this.carrier=0;this.seed=9173;
    this.envelope=0;this.peak=0;this.report=0;this.queued=-1;this.dirty=true;
    this.previousInput=new Float64Array(9);this.previousOutput=new Float64Array(9);this.travelBeats=0;
    this.rateSmooth=1-Math.exp(-1/(sampleRate*.025));
    this.motionSmooth=1-Math.exp(-1/(sampleRate*.0012));
    this.motionDecay=Math.exp(-1/(sampleRate*.012));
    this.releaseDecay=Math.exp(-1/(sampleRate*.002));
    this.levelSmooth=1-Math.exp(-1/(sampleRate*.0018));
    this.modeSmooth=1-Math.exp(-1/(sampleRate*.007));
    this.powerSmooth=1-Math.exp(-1/(sampleRate*.004));
    this.dc=Math.exp(-2*Math.PI*18/sampleRate);
    this.returnFrames=Math.max(1,Math.round(sampleRate*.018));
    this.attackFrames=Math.max(1,Math.round(sampleRate*.002));
    this.port.onmessage=({data})=>this.command(data);
  }
  mod(value,length){return ((value%length)+length)%length;}
  command(data){
    if(data.type==='load'){
      const stems=data.stems;
      if(!Array.isArray(stems)||stems.length!==3||!stems[0]?.length||stems.some(s=>s.length!==stems[0].length))return;
      this.stems=stems;this.length=stems[0].length;this.beat=this.length/(Number.isFinite(data.beats)&&data.beats>0?data.beats:16);
      this.phraseStems=Array.isArray(data.phraseStems)&&data.phraseStems.length===6&&data.phraseStems.every(s=>s.length===this.length)?data.phraseStems:null;
      this.background=this.mod(this.background,this.length);this.position=this.mod(this.position,this.length);
      this.port.postMessage({ready:true});
    }else if(data.type==='play'){
      this.playing=!!data.value;
      if(!this.playing){
        this.scratching=false;this.mix=0;this.mixTarget=0;this.mixStep=0;
        this.motion=0;this.motionTarget=0;this.hold=0;this.pendingRelease=0;this.power=0;
        this.position=this.background;
      }
    }else if(data.type==='grab'&&this.playing)this.grab();
    else if(data.type==='motion'&&this.playing&&Number.isFinite(data.velocity)){
      if(!this.scratching)this.grab();
      this.motionTarget=Math.max(-12,Math.min(12,data.velocity));this.hold=Math.round(sampleRate*.018);
    }else if(data.type==='release'&&this.scratching){
      // Retain a fast mouse impulse when all messages precede one audio block.
      if(!this.strokeRendered&&Math.abs(this.motionTarget)>.001)this.pendingRelease=Math.round(sampleRate*.008);
      else this.slip();
    }else if(data.type==='rate'&&Number.isFinite(data.value)&&data.value>0)this.rateTarget=Math.max(.25,Math.min(4,data.value));
    else if(data.type==='mode')this.modeTarget=data.value==='synth'?1:0;
    else if(data.type==='cue'&&Number.isInteger(data.section)&&data.section>=0&&data.section<4)this.queued=data.section;
    this.dirty=true;
  }
  grab(){
    if(this.mix<.0001)this.position=this.background;
    this.scratching=true;this.motionTarget=0;this.hold=0;this.pendingRelease=0;this.strokeRendered=false;
    this.queued=-1;
    this.mixTarget=1;this.mixStep=(1-this.mix)/this.attackFrames;
  }
  slip(){
    this.scratching=false;this.motionTarget=0;this.hold=0;this.pendingRelease=0;
    this.mixTarget=0;this.mixStep=-this.mix/this.returnFrames;this.dirty=true;
  }
  process(inputs,outputs){
    if(!this.stems)return true;
    const frames=outputs[0]?.[0]?.length||128;
    let peak=0;
    for(let n=0;n<frames;n++){
      this.rate+=(this.rateTarget-this.rate)*this.rateSmooth;
      if(this.hold>0)this.hold--;else this.motionTarget*=this.motionDecay;
      if(!this.scratching)this.motionTarget*=this.releaseDecay;
      this.motion+=(this.motionTarget-this.motion)*this.motionSmooth;
      this.speed=this.playing?this.rate+this.motion:0;
      this.envelope+=((this.playing?1:0)-this.envelope)*this.levelSmooth;
      this.mode+=(this.modeTarget-this.mode)*this.modeSmooth;
      const magnitude=Math.abs(this.motion),powerTarget=this.scratching?magnitude/(magnitude+1.5):0;
      this.power+=(powerTarget-this.power)*this.powerSmooth;
      if(this.mix<this.mixTarget)this.mix=Math.min(this.mixTarget,this.mix+this.mixStep);
      else if(this.mix>this.mixTarget)this.mix=Math.max(this.mixTarget,this.mix+this.mixStep);
      const a=this.mod(this.position,this.length),ai=Math.floor(a),an=(ai+1)%this.length,af=a-ai;
      const b=this.background,bi=Math.floor(b),bn=(bi+1)%this.length,bf=b-bi;
      const effect=this.mode*this.power,depth=effect*.62;
      const normalization=1/Math.sqrt((1-depth)**2+depth*depth*.5);
      const steps=32+992*(1-effect)**3;
      this.carrier+=2*Math.PI*(140+2200*this.power*this.power+Math.abs(this.motion)*65)/sampleRate;
      if(this.carrier>Math.PI*2)this.carrier-=Math.PI*2;
      const carrier=Math.cos(this.carrier);
      this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      const noise=this.seed/2147483648-1;
      for(let channel=0;channel<(this.phraseStems?9:3);channel++){
        const pcm=channel<3?this.stems[channel]:this.phraseStems[channel-3];
        const hand=pcm[ai]+(pcm[an]-pcm[ai])*af,live=pcm[bi]+(pcm[bn]-pcm[bi])*bf;
        let value=live+(hand-live)*this.mix;
        if(effect>.00001){
          const crushed=Math.round(value*steps)/steps;
          const grain=value+(crushed-value)*effect;
          value=(grain*(1-depth)+grain*carrier*depth)*normalization+noise*Math.abs(value)*effect*.055;
        }
        // Removes static DC at a turnaround without a broad silence gate.
        const filtered=value-this.previousInput[channel]+this.dc*this.previousOutput[channel];
        this.previousInput[channel]=value;this.previousOutput[channel]=filtered;
        const output=filtered*this.envelope;
        const outputIndex=channel;
        if(outputs[outputIndex]?.[0])outputs[outputIndex][0][n]=output;
        peak=Math.max(peak,Math.abs(output));
      }
      if(this.playing){
        this.travelBeats+=Math.abs(this.speed)/this.beat;
        const previousBeat=Math.floor(this.background/this.beat);
        this.background+=this.rate;
        const boundary=Math.floor(this.background/this.beat)>previousBeat;
        this.background=this.mod(this.background,this.length);
        if(this.mix>0||this.scratching)this.position=this.mod(this.position+this.speed,this.length);
        else this.position=this.background;
        if(this.queued>=0&&boundary){
          if(!this.scratching&&this.mix===0){this.mix=1;this.mixTarget=0;this.mixStep=-1/this.returnFrames;}
          this.background=this.queued*this.length/4;this.queued=-1;this.dirty=true;
        }
        if(this.scratching)this.strokeRendered=true;
        if(this.pendingRelease>0&&--this.pendingRelease===0)this.slip();
        if(!this.scratching&&this.mix===0)this.position=this.background;
      }
    }
    this.peak=Math.max(peak,this.peak*.92);this.report+=frames;
    if(this.dirty||this.report>=sampleRate/60){
      this.dirty=false;this.report=0;
      let difference=this.position-this.background;
      if(difference>this.length/2)difference-=this.length;
      if(difference<-this.length/2)difference+=this.length;
      this.port.postMessage({
        phase:this.mod(this.background+difference*this.mix,this.length)/this.length,
        backgroundPhase:this.background/this.length,speed:this.speed,rate:this.rate,peak:this.peak,
        travelBeats:this.travelBeats,motion:this.motion,power:this.power,slipMix:this.mix,modeMix:this.mode,
        playing:this.playing,scratching:this.scratching,queued:this.queued
      });
    }
    return true;
  }
}
registerProcessor('ouroboros-transport',OuroborosTransport);

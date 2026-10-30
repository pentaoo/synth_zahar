// A record has one musical position. The hand changes its speed; releasing it
// restores the motor there, with a bounded throw after a strong wheel flick.
// No parallel clock or Slip seek. Surface friction has its own fourth output.
class OuroborosVinylTransport extends AudioWorkletProcessor {
  constructor(){
    super();
    this.stems=null;this.length=0;this.position=0;
    this.playing=false;this.scratching=false;this.speed=0;this.rate=1;this.rateTarget=1;
    this.motion=0;this.motionTarget=0;this.hold=0;this.power=0;
    this.pendingRelease=0;this.strokeRendered=false;this.releasePhase=null;this.releaseCount=0;
    this.pendingCoastVelocity=0;this.motionAge=Infinity;
    this.coastStart=0;this.coastVelocity=0;this.coastFrames=0;this.coastRemaining=0;this.coastStarts=0;
    this.textureLevel=0;this.textureLow=0;this.textureInput=0;this.textureOutput=0;this.texturePeak=0;
    // A second reader exists only for an explicitly requested I–IV jump.
    this.cuePosition=0;this.cueMix=0;this.queued=-1;
    this.mode=0;this.modeTarget=0;this.carrier=0;this.seed=9173;
    this.envelope=0;this.peak=0;this.report=0;this.dirty=true;
    this.previousInput=new Float64Array(12);this.previousOutput=new Float64Array(12);this.travelBeats=0;
    // Snake chains: each ring loops its own buffer of N 8-beat phrases.
    this.rings=[0,1,2].map(()=>({pcm:null,length:0,segments:0,position:0,gain:0,target:0,version:0,next:null,old:null,oldPosition:0,mix:0}));
    this.ringIn=1-Math.exp(-1/(sampleRate*.05));this.ringOut=1-Math.exp(-1/(sampleRate*.35));
    this.rateSmooth=1-Math.exp(-1/(sampleRate*.025));
    this.motionSmooth=1-Math.exp(-1/(sampleRate*.0012));
    this.motionDecay=Math.exp(-1/(sampleRate*.012));
    this.levelSmooth=1-Math.exp(-1/(sampleRate*.0018));
    this.modeSmooth=1-Math.exp(-1/(sampleRate*.007));
    this.powerSmooth=1-Math.exp(-1/(sampleRate*.004));
    this.textureAttack=1-Math.exp(-1/(sampleRate*.003));this.textureRelease=1-Math.exp(-1/(sampleRate*.018));
    this.textureLowpass=1-Math.exp(-2*Math.PI*Math.min(6200,sampleRate*.4)/sampleRate);
    this.textureHighpass=Math.exp(-2*Math.PI*220/sampleRate);
    this.dc=Math.exp(-2*Math.PI*18/sampleRate);
    this.cueStep=1/Math.max(1,Math.round(sampleRate*.018));
    this.port.onmessage=({data})=>this.command(data);
  }
  mod(value){return ((value%this.length)+this.length)%this.length;}
  command(data){
    if(data.type==='load'){
      const stems=data.stems;
      if(!Array.isArray(stems)||stems.length!==3||!stems[0]?.length||stems.some(s=>s.length!==stems[0].length))return;
      this.stems=stems;this.length=stems[0].length;this.beat=this.length/(Number.isFinite(data.beats)&&data.beats>0?data.beats:16);
      this.phraseStems=Array.isArray(data.phraseStems)&&data.phraseStems.length===6&&data.phraseStems.every(s=>s.length===this.length)?data.phraseStems:null;
      this.position=this.mod(this.position);this.cuePosition=this.mod(this.cuePosition);
      this.port.postMessage({ready:true});
    }else if(data.type==='play'){
      this.playing=!!data.value;
      if(!this.playing){
        this.scratching=false;this.motion=0;this.motionTarget=0;this.hold=0;
        this.pendingRelease=0;this.pendingCoastVelocity=0;this.power=0;this.cueMix=0;this.speed=0;
        this.stopCoast();this.textureLevel=0;this.textureLow=0;this.textureInput=0;this.textureOutput=0;
      }
    }else if(data.type==='grab'&&this.playing)this.grab();
    else if(data.type==='motion'&&this.playing&&Number.isFinite(data.velocity)){
      if(!this.scratching)this.grab();
      this.motionTarget=Math.max(-12,Math.min(12,data.velocity));this.hold=Math.round(sampleRate*.018);this.motionAge=0;
    }else if(data.type==='release'&&this.scratching){
      // If the entire flick precedes one audio block, let its impulse sound.
      // A normally rendered stroke returns to the motor immediately on release.
      if(!this.strokeRendered&&Math.abs(this.motionTarget)>.001){
        if(!this.pendingRelease)this.pendingRelease=Math.max(1,Math.round(sampleRate*.008));
        this.pendingCoastVelocity=Number.isFinite(data.coastVelocity)?data.coastVelocity:0;
      }else this.release(data.coastVelocity);
    }else if(data.type==='cancel'){
      if(this.scratching)this.release();
      this.stopCoast();this.motion=0;this.motionTarget=0;this.hold=0;this.pendingRelease=0;this.pendingCoastVelocity=0;
    }else if(data.type==='rate'&&Number.isFinite(data.value)&&data.value>0)this.rateTarget=Math.max(.25,Math.min(4,data.value));
    else if(data.type==='mode')this.modeTarget=data.value==='synth'?1:0;
    else if(data.type==='ring')this.ring(data);
    else if(data.type==='cue'&&Number.isInteger(data.section)&&data.section>=0&&data.section<4)this.queued=data.section;
    this.dirty=true;
  }
  ring({index,pcm,segments,version}){
    const r=this.rings[index];if(!r)return;
    if(!(pcm instanceof Float32Array)||!pcm.length||!(segments>0)){r.target=0;r.next=null;return;}
    const entry={pcm,segments,version:version|0};
    if(!r.pcm||r.gain<.001&&r.target===0){
      // A new ring enters at the current bar phase, so its beats align with the record.
      const bar=(this.beat||pcm.length/segments/8)*8;
      Object.assign(r,{pcm,length:pcm.length,segments,version:entry.version,next:null,old:null,mix:0,target:1,position:((this.position%bar)+bar)%bar});
    }else{r.next=entry;r.target=1;}
  }
  swap(r){
    // Edits and new snakes enter at a phrase boundary, never mid-phrase.
    const next=r.next;r.next=null;r.old=r.pcm;r.oldPosition=r.position;r.mix=1;
    r.pcm=next.pcm;r.length=next.pcm.length;r.segments=next.segments;r.version=next.version;r.position=((r.position%r.length)+r.length)%r.length;
  }
  grab(){
    this.stopCoast();
    this.scratching=true;this.motionTarget=0;this.hold=0;this.pendingRelease=0;this.strokeRendered=false;
    this.queued=-1;
  }
  stopCoast(){this.coastStart=0;this.coastVelocity=0;this.coastRemaining=0;}
  release(velocity=0){
    this.scratching=false;this.motion=0;this.motionTarget=0;this.hold=0;this.pendingRelease=0;
    this.pendingCoastVelocity=0;this.stopCoast();
    if(this.playing&&Number.isFinite(velocity)&&this.motionAge<sampleRate*.16){
      const force=Math.max(0,Math.min(1,(Math.abs(velocity)-3.2)/8.8)),strength=force*force*(3-2*force);
      if(strength>.0001){
        this.coastStart=Math.sign(velocity)*5.5*strength;
        this.coastVelocity=this.coastStart;this.coastFrames=Math.round(sampleRate*(.1+.1*strength));
        this.coastRemaining=this.coastFrames;this.coastStarts++;
      }
    }
    this.speed=this.playing?this.rate:0;
    this.releasePhase=this.position/this.length;this.releaseCount++;this.dirty=true;
    // Keep the reader and filter history: changing speed here never seeks or
    // crossfades to an unrelated point. The optional throw advances this reader.
  }
  grooveHash(index,salt){
    let value=(index|0)^salt;value=Math.imul(value^(value>>>16),0x45d9f3b);
    value=Math.imul(value^(value>>>16),0x45d9f3b);return ((value^(value>>>16))>>>0)/2147483648-1;
  }
  process(inputs,outputs){
    if(!this.stems)return true;
    const frames=outputs[0]?.[0]?.length||128;
    let peak=0,texturePeak=0;
    for(let n=0;n<frames;n++){
      this.rate+=(this.rateTarget-this.rate)*this.rateSmooth;
      if(this.hold>0)this.hold--;else this.motionTarget*=this.motionDecay;
      this.motion+=(this.motionTarget-this.motion)*this.motionSmooth;
      if(this.coastRemaining>0)this.coastVelocity=this.coastStart*(this.coastRemaining/this.coastFrames)**2;
      this.speed=this.playing?this.rate+this.motion+this.coastVelocity:0;
      this.envelope+=((this.playing?1:0)-this.envelope)*this.levelSmooth;
      this.mode+=(this.modeTarget-this.mode)*this.modeSmooth;
      const magnitude=Math.abs(this.motion)+Math.abs(this.coastVelocity),powerTarget=this.scratching||this.coastRemaining>0?magnitude/(magnitude+1.5):0;
      this.power+=(powerTarget-this.power)*this.powerSmooth;
      const ai=Math.floor(this.position),an=(ai+1)%this.length,af=this.position-ai;
      const bi=Math.floor(this.cuePosition),bn=(bi+1)%this.length,bf=this.cuePosition-bi;
      const effect=this.mode*this.power,depth=effect*.62;
      const normalization=1/Math.sqrt((1-depth)**2+depth*depth*.5),steps=32+992*(1-effect)**3;
      this.carrier+=2*Math.PI*(140+2200*this.power*this.power+magnitude*65)/sampleRate;
      if(this.carrier>Math.PI*2)this.carrier-=Math.PI*2;
      const carrier=Math.cos(this.carrier);
      this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      const noise=this.seed/2147483648-1;
      for(let channel=0;channel<(this.phraseStems?9:3);channel++){
        const pcm=channel<3?this.stems[channel]:this.phraseStems[channel-3];
        let value=pcm[ai]+(pcm[an]-pcm[ai])*af;
        if(this.cueMix>0){const old=pcm[bi]+(pcm[bn]-pcm[bi])*bf;value+=(old-value)*this.cueMix;}
        if(effect>.00001){
          const crushed=Math.round(value*steps)/steps,grain=value+(crushed-value)*effect;
          value=(grain*(1-depth)+grain*carrier*depth)*normalization+noise*Math.abs(value)*effect*.055;
        }
        const filtered=value-this.previousInput[channel]+this.dc*this.previousOutput[channel];
        this.previousInput[channel]=value;this.previousOutput[channel]=filtered;
        const output=filtered*this.envelope;
        const outputIndex=channel<3?channel:channel+1;
        if(outputs[outputIndex]?.[0])outputs[outputIndex][0][n]=output;
        peak=Math.max(peak,Math.abs(output));
      }
      for(let i=0;i<3;i++){
        const r=this.rings[i];if(!r.pcm)continue;
        r.gain+=(r.target-r.gain)*(r.target>r.gain?this.ringIn:this.ringOut);
        const ri=Math.floor(r.position),rn=(ri+1)%r.length,rf=r.position-ri;
        let value=r.pcm[ri]+(r.pcm[rn]-r.pcm[ri])*rf;
        if(r.mix>0){const o=r.old,ol=o.length,op=((r.oldPosition%ol)+ol)%ol,oi=Math.floor(op),of=op-oi,old=o[oi]+(o[(oi+1)%ol]-o[oi])*of;value+=(old-value)*r.mix;}
        if(effect>.00001){
          const crushed=Math.round(value*steps)/steps,grain=value+(crushed-value)*effect;
          value=(grain*(1-depth)+grain*carrier*depth)*normalization+noise*Math.abs(value)*effect*.055;
        }
        const k=9+i,filtered=value-this.previousInput[k]+this.dc*this.previousOutput[k];
        this.previousInput[k]=value;this.previousOutput[k]=filtered;
        const output=filtered*this.envelope*r.gain;
        if(outputs[4+i]?.[0])outputs[4+i][0][n]=output;
        peak=Math.max(peak,Math.abs(output));
        if(r.target===0&&r.gain<1e-4){r.pcm=null;r.old=null;r.gain=0;r.segments=0;this.dirty=true;}
      }
      // The hiss and dust live in the groove: the same point can be rubbed
      // backwards and forwards. They are audible in rests, on a separate bus.
      const textureTarget=this.playing?magnitude/(magnitude+1.2):0;
      this.textureLevel+=(textureTarget-this.textureLevel)*(textureTarget>this.textureLevel?this.textureAttack:this.textureRelease);
      let texture=0;
      if(this.textureLevel>1e-7){
        const white=this.grooveHash(ai,1979),nextWhite=this.grooveHash(an,1979),raw=white+(nextWhite-white)*af;
        this.textureLow+=(raw-this.textureLow)*this.textureLowpass;
        const grain=this.position/(sampleRate*.0015),cell=Math.floor(grain),dust=this.grooveHash(cell,7219);
        const crackle=dust>.985?((dust-.985)/.015)*Math.exp(-(grain-cell)*28)*(this.grooveHash(cell,43)>0?1:-1):0;
        const surface=this.textureLow*.18+crackle*.12;
        const filtered=surface-this.textureInput+this.textureHighpass*this.textureOutput;
        this.textureInput=surface;this.textureOutput=filtered;
        texture=filtered*this.textureLevel*this.envelope;
      }else{this.textureLevel=0;this.textureLow=0;this.textureInput=0;this.textureOutput=0;}
      if(outputs[3]?.[0])outputs[3][0][n]=texture;
      texturePeak=Math.max(texturePeak,Math.abs(texture));peak=Math.max(peak,Math.abs(texture));
      if(this.playing){
        this.travelBeats+=Math.abs(this.speed)/this.beat;
        const previousBeat=Math.floor(this.position/this.beat),next=this.position+this.speed;
        const boundary=this.speed>0&&Math.floor(next/this.beat)>previousBeat;
        this.position=this.mod(next);
        for(const r of this.rings){
          if(!r.pcm)continue;
          const segment=r.length/r.segments,raw=r.position+this.speed,crossed=Math.floor(raw/segment)!==Math.floor(r.position/segment);
          r.position=((raw%r.length)+r.length)%r.length;
          if(r.mix>0){r.oldPosition+=this.speed;r.mix=Math.max(0,r.mix-this.cueStep);if(!r.mix)r.old=null;}
          if(r.next&&crossed){this.swap(r);this.dirty=true;}
        }
        if(this.cueMix>0){this.cuePosition=this.mod(this.cuePosition+this.speed);this.cueMix=Math.max(0,this.cueMix-this.cueStep);}
        if(this.queued>=0&&boundary){
          this.cuePosition=this.position;this.cueMix=1;
          this.position=this.queued*this.length/4;this.queued=-1;this.dirty=true;
        }
        if(this.scratching)this.strokeRendered=true;
        this.motionAge++;
        if(this.coastRemaining>0&&--this.coastRemaining===0){this.stopCoast();this.dirty=true;}
        if(this.pendingRelease>0&&--this.pendingRelease===0)this.release(this.pendingCoastVelocity);
      }
    }
    this.peak=Math.max(peak,this.peak*.92);this.texturePeak=Math.max(texturePeak,this.texturePeak*.9);this.report+=frames;
    if(this.dirty||this.report>=sampleRate/60){
      this.dirty=false;this.report=0;
      this.port.postMessage({
        transportKind:'vinyl',phase:this.position/this.length,speed:this.speed,rate:this.rate,peak:this.peak,
        travelBeats:this.travelBeats,motion:this.motion,power:this.power,modeMix:this.mode,cueMix:this.cueMix,
        releasePhase:this.releasePhase,releaseCount:this.releaseCount,
        coasting:this.coastRemaining>0,coastVelocity:this.coastVelocity,coastStarts:this.coastStarts,texturePeak:this.texturePeak,
        playing:this.playing,scratching:this.scratching,queued:this.queued,
        rings:this.rings.map(r=>r.pcm?{phase:r.position/r.length,segments:r.segments,version:r.version,seconds:r.length/sampleRate,gain:r.gain,pending:!!r.next}:null)
      });
    }
    return true;
  }
}
registerProcessor('ouroboros-vinyl-transport',OuroborosVinylTransport);

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function transport(stems,sampleRate=8000){
  let Processor;const messages=[];
  const context={sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:message=>messages.push(message)};}},registerProcessor(name,constructor){Processor=constructor;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sketches/ouroboros/transport-worklet.js'),'utf8'),context);
  const processor=new Processor(),send=message=>processor.port.onmessage({data:message});
  send({type:'load',stems});
  const render=(blocks=1,frames=128)=>{
    const result=[[],[],[]];
    for(let i=0;i<blocks;i++){
      const output=Array.from({length:3},()=>[new Float32Array(frames)]);
      processor.process([],output);output.forEach((channels,index)=>result[index].push(...channels[0]));
    }
    return result;
  };
  return {processor,send,render,messages};
}
const fixture=(length=16000)=>Array.from({length:3},(_,channel)=>Float32Array.from({length},(_,i)=>Math.sin(i*.07)*(channel+1)*.1));
const rms=pcm=>Math.sqrt(pcm.reduce((sum,value)=>sum+value*value,0)/pcm.length);
const difference=(a,b)=>rms(a.map((v,i)=>v-b[i]));
const circularDistance=(a,b,length)=>Math.abs(((a-b+length*1.5)%length)-length/2);
function wheelHarness(WheelScratch,send=()=>{}){
  const callbacks=[],events=[];let grabs=0,releases=0;
  const wheel=new WheelScratch({
    grab(){grabs++;send({type:'grab'});},
    motion(velocity,angle){events.push({velocity,angle});send({type:'motion',velocity});},
    release(){releases++;send({type:'release'});},
    schedule(fn){callbacks.push(fn);return callbacks.length;},unschedule(){}
  });
  const move=(deltaY,timeStamp,extra={})=>wheel.move({deltaY,timeStamp,inside:true,angle:.7,...extra});
  return {wheel,move,callbacks,events,get grabs(){return grabs;},get releases(){return releases;}};
}

test('ouroboros score has four different musical parts and three finite independent synthesized stems',async()=>{
  const {renderScore}=await import('../sketches/ouroboros/score.mjs');
  const score=renderScore(8000);
  assert.equal(score.beats,16);assert.equal(score.stems.length,3);
  for(const stem of score.stems) {
    assert.equal(stem.length,score.length);
    assert.ok(stem.every(Number.isFinite));assert.ok(rms(stem)>.01);
    assert.ok(stem.every(value=>Math.abs(value)<.8));
  }
  const energies=Array.from({length:4},(_,i)=>rms(score.stems[2].slice(Math.floor(score.length*i/4),Math.floor(score.length*(i+1)/4))));
  assert.ok(energies[2]>energies[0]*1.5,'the third part develops the rhythm');
  for(const stem of score.stems)assert.ok(Math.abs(stem[0]-stem.at(-1))<.04,'note tails wrap without a hard loop edge');
  const other=renderScore(8000,['square','triangle']);
  assert.notDeepEqual(score.stems[0].slice(100,130),other.stems[0].slice(100,130));
  assert.notDeepEqual(score.stems[1].slice(100,130),other.stems[1].slice(100,130));
  assert.deepEqual(score.stems[2],other.stems[2],'wave choices do not replace the drum recipe');
});

test('the new phrase has bass rests, struck piano decay and independent wave selections',async()=>{
  const {renderScore}=await import('../sketches/ouroboros/score.mjs');
  const score=renderScore(8000),beat=60/score.bpm,window=(pcm,a,b)=>pcm.slice(Math.round(a*8000),Math.round(b*8000));
  const bass=score.stems[0],piano=score.stems[1];
  assert.ok(rms(window(bass,.06,.22))>rms(window(bass,beat,beat*1.5))*10,'the bass leaves real room between harmonic supports');
  assert.ok(rms(window(piano,.03,.13))>rms(window(piano,.38,.47))*3,'the piano has an attack and damps before its next entrance');
  assert.ok(rms(window(piano,beat*15.65,beat*15.98))<.001,'the final bar leaves a clear scratch response space');
  const bassOnly=renderScore(8000,['square','sine']),pianoOnly=renderScore(8000,['triangle','square']);
  assert.deepEqual(score.stems[1],bassOnly.stems[1]);assert.deepEqual(score.stems[0],pianoOnly.stems[0]);
  assert.ok(difference(piano,pianoOnly.stems[1])>.001);
  for(let part=1;part<4;part++)assert.ok(difference(window(piano,0,beat*4),window(piano,beat*part*4,beat*(part+1)*4))>.03);
});


test('the three channels reverse together while a separate musical clock keeps advancing',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(12);const background=p.background;
  send({type:'grab'});send({type:'motion',velocity:-5});const sound=render(1);
  assert.ok(p.speed<0);
  assert.equal(p.background,background+128);
  assert.ok(circularDistance(p.position,p.background,p.length)>100);
  for(let i=0;i<sound[0].length;i++){
    assert.ok(Math.abs(sound[1][i]-sound[0][i]*2)<1e-6);
    assert.ok(Math.abs(sound[2][i]-sound[0][i]*3)<1e-6);
  }
  assert.ok(rms(sound[0])>.01);
});

test('a stationary gesture and event gaps keep the motor running without a silence gate',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(8);const before=p.background;
  send({type:'grab'});render(8);
  assert.equal(p.background,before+1024);assert.ok(Math.abs(p.speed-1)<1e-8);
  send({type:'motion',velocity:-4});render(12);assert.ok(Math.abs(p.speed-1)<1e-4);
  assert.ok(rms(render(3)[0])>.01);assert.ok(p.envelope>.99);
});

test('a strong stroke reverses within a few milliseconds instead of draining a position backlog',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(6);send({type:'grab'});
  for(let i=0;i<12;i++){send({type:'motion',velocity:12});render(1);}
  assert.ok(p.speed>10);
  send({type:'motion',velocity:-12});
  let reversedAt=-1;
  for(let n=0;n<64;n++){render(1,1);if(p.speed<0&&reversedAt<0)reversedAt=n;}
  assert.ok(reversedAt>=0&&reversedAt<32,'opposite input wins within 4 ms at 8 kHz');
  assert.ok(p.speed<-8);
});

test('release crossfades to the current background position rather than continuing from the scratched place',()=>{
  const edited=transport(fixture()),control=transport(fixture());
  for(const t of [edited,control]){t.send({type:'play',value:true});t.render(10);}
  edited.send({type:'grab'});edited.send({type:'motion',velocity:-6});
  edited.render(3);control.render(3);
  assert.ok(circularDistance(edited.processor.position,control.processor.background,16000)>100);
  edited.send({type:'release'});
  edited.render(3);control.render(3);
  assert.equal(edited.processor.background,control.processor.background);
  assert.equal(edited.processor.position,control.processor.position);
  assert.equal(edited.processor.mix,0);
  assert.ok(Math.abs(edited.processor.speed-1)<1e-5);
});

test('Slip crosses the loop seam at pinched tempo, and pause preserves clock and selected rate',()=>{
  const edited=transport(fixture()),control=transport(fixture());
  for(const t of [edited,control]){t.send({type:'rate',value:2.5});t.send({type:'play',value:true});t.render(48);}
  edited.send({type:'grab'});edited.send({type:'motion',velocity:-7});
  edited.render(8);control.render(8);
  edited.send({type:'release'});edited.render(3);control.render(3);
  assert.ok(circularDistance(edited.processor.position,control.processor.background,16000)<1e-8);
  assert.equal(edited.processor.background,control.processor.background);
  const p=edited.processor,paused=p.background;
  edited.send({type:'play',value:false});edited.send({type:'rate',value:2});edited.render(24);
  assert.equal(p.background,paused);assert.equal(p.position,paused);
  assert.equal(p.motion,0);assert.equal(p.mix,0);assert.equal(p.power,0);
  assert.ok(Math.abs(p.rate-2)<1e-6);
  edited.send({type:'play',value:true});edited.render(4);assert.ok(Math.abs(p.speed-2)<1e-6);
});

test('a new gesture interrupts a Slip transition and immediately accepts its direction',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(8);
  send({type:'grab'});send({type:'motion',velocity:7});render(2);
  send({type:'release'});render(1,48);assert.ok(p.mix>0&&p.mix<1);
  send({type:'grab'});send({type:'motion',velocity:-8});render(1,40);
  assert.ok(p.speed<0);assert.ok(p.mix>.99);assert.equal(p.pendingRelease,0);
});

test('a mouse flick received before one audio block is audible and then returns cleanly to Slip',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(8);
  send({type:'grab'});send({type:'motion',velocity:-6});send({type:'release'});
  let minimum=1;const samples=[];
  for(let n=0;n<100;n++){samples.push(...render(1,1)[0]);minimum=Math.min(minimum,p.speed);}
  assert.ok(minimum<0);assert.ok(rms(samples)>.01);
  render(4);assert.equal(p.mix,0);assert.equal(p.position,p.background);
  assert.ok(Math.abs(p.speed-1)<1e-5);
});

test('forward/reverse boundaries and malformed commands never produce non-finite output',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(4);send({type:'grab'});
  for(const velocity of [-12,12,-12,8]){
    send({type:'motion',velocity});assert.ok(render(8).flat().every(Number.isFinite));
    assert.ok(p.position>=0&&p.position<p.length);
  }
  for(const velocity of [NaN,Infinity])send({type:'motion',velocity});
  for(const value of [NaN,Infinity,-1,0])send({type:'rate',value});
  assert.equal(p.rateTarget,1);assert.ok(render(3).flat().every(Number.isFinite));
});

test('part queue follows the background clock and a new grab retains the original queue-cancellation rule',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(2);
  send({type:'cue',section:3});send({type:'grab'});assert.equal(p.queued,-1);
  send({type:'motion',velocity:-5});send({type:'cue',section:2});render(8);
  assert.equal(p.queued,-1);assert.ok(p.background>=p.length/2&&p.background<p.length*.6);
  send({type:'release'});render(3);assert.equal(p.position,p.background);
});

test('vinyl and synth use identical transport, differ audibly on the same score, and have comparable RMS',async()=>{
  const {renderScore}=await import('../sketches/ouroboros/score.mjs');
  const score=renderScore(8000),a=transport(score.stems),b=transport(score.stems);
  b.send({type:'mode',value:'synth'});
  for(const t of [a,b]){t.send({type:'play',value:true});t.render(24);t.send({type:'grab'});}
  const left=[],right=[];
  for(const velocity of [-5,4,-6,7,-3,5]){
    for(let block=0;block<5;block++){
      for(const t of [a,b])t.send({type:'motion',velocity});
      left.push(...a.render(1).flat());right.push(...b.render(1).flat());
    }
  }
  assert.equal(a.processor.position,b.processor.position);assert.equal(a.processor.background,b.processor.background);
  assert.ok(right.every(Number.isFinite));assert.ok(Math.max(...right.map(Math.abs))<1);
  assert.ok(difference(left,right)>.01);
  const db=20*Math.log10(rms(right)/rms(left));
  assert.ok(Math.abs(db)<3,'RMS difference must stay within 3 dB, got '+db);
  for(const t of [a,b]){t.send({type:'release'});t.render(24);}
  assert.ok(difference(a.render(4).flat(),b.render(4).flat())<1e-6,'synth coloration ends after the gesture');
});

test('mode switching during a stroke blends without seeking or changing base tempo',()=>{
  const a=transport(fixture()),b=transport(fixture());
  for(const t of [a,b]){t.send({type:'rate',value:2});t.send({type:'play',value:true});t.render(24);t.send({type:'grab'});t.send({type:'motion',velocity:-5});t.render(1);}
  b.send({type:'mode',value:'synth'});a.render(1,1);b.render(1,1);
  assert.ok(b.processor.mode>0&&b.processor.mode<1);
  assert.equal(a.processor.position,b.processor.position);assert.equal(a.processor.rate,b.processor.rate);
  b.render(8);b.send({type:'mode',value:'vinyl'});b.render(1,1);
  assert.ok(b.processor.mode>0&&b.processor.mode<1);
});

test('a slow turnaround is not silenced by a broad speed threshold',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(8);send({type:'grab'});send({type:'motion',velocity:-1});
  const sound=render(1,96);
  assert.ok(Math.abs(p.speed)<.001);assert.ok(p.envelope>.99);
  assert.ok(rms(sound[0].slice(-32))>1e-4,'DC rejection may decay a held sample but must not hard-gate a turnaround');
});

test('wheel starts only on the body, latches through pointer drift, and small motion has no dead zone',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  const h=wheelHarness(WheelScratch);
  assert.equal(h.move(1,0,{inside:false}),false);assert.equal(h.grabs,0);
  assert.equal(h.move(1,16),true);assert.ok(Math.abs(h.events.at(-1).velocity)>.1);
  h.move(-2,32,{inside:false,angle:2});
  assert.equal(h.grabs,1);assert.equal(h.events.at(-1).angle,.7);
  assert.ok(h.events.at(-1).velocity>0,'a reversal changes direction immediately');
});

test('wheel units and event cadence normalize; huge and invalid deltas remain controlled',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  const a=wheelHarness(WheelScratch),b=wheelHarness(WheelScratch),c=wheelHarness(WheelScratch);
  a.move(48,0);b.move(3,0,{deltaMode:1});c.move(.06,0,{deltaMode:2,pageHeight:800});
  assert.equal(a.events[0].velocity,b.events[0].velocity);assert.equal(a.events[0].velocity,c.events[0].velocity);
  const fast=wheelHarness(WheelScratch),slow=wheelHarness(WheelScratch);
  fast.move(2,0);fast.move(2,8);slow.move(4,0);slow.move(4,16);
  assert.ok(Math.abs(fast.events.at(-1).velocity-slow.events.at(-1).velocity)<1e-8);
  a.move(1e100,16);assert.ok(Math.abs(a.events.at(-1).velocity)<=12);
  const invalid=wheelHarness(WheelScratch);
  for(const value of [NaN,Infinity,0])assert.equal(invalid.move(value,0),false);
  assert.equal(invalid.grabs,0);
});

test('native momentum ends the hand gesture and direct input immediately starts another',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  const h=wheelHarness(WheelScratch);
  h.move(20,0,{momentum:false});
  assert.equal(h.move(15,16,{momentum:true}),false);assert.equal(h.releases,1);
  assert.equal(h.move(1,24,{momentum:false}),true);assert.equal(h.grabs,2);
  for(let i=0;i<8;i++)assert.equal(h.move(1/(i+1),40+i*16,{momentum:false}),true);
});

test('fallback inertia is suppressed, but a new reversal or sharp direct stroke wins',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  const h=wheelHarness(WheelScratch);
  const accepted=[40,32,25,18,12,8,5].map((delta,i)=>h.move(delta,i*16));
  assert.ok(accepted.slice(0,3).every(Boolean));assert.equal(accepted.at(-1),false);
  assert.equal(h.releases,1);
  assert.equal(h.move(-2,120),true,'opposite physical action must not be swallowed as inertia');
  h.wheel.cancel();h.wheel.tail=true;h.wheel.lastDelta=2;
  assert.equal(h.move(20,136),true,'a strong fresh same-direction stroke is recognized');
});

test('pinch blocks old inertia without losing a fresh reverse input; stale timers cannot end a new stroke',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  const h=wheelHarness(WheelScratch);
  h.move(20,0);const oldTimer=h.callbacks.at(-1);
  h.wheel.suspend(20);h.wheel.resume(60);
  assert.equal(h.move(10,80),false);assert.equal(h.move(-2,90),true);
  const releases=h.releases;oldTimer();assert.equal(h.releases,releases);assert.equal(h.wheel.active,true);
  h.wheel.reset();h.move(2,400);oldTimer();assert.equal(h.wheel.active,true);
  h.callbacks.at(-1)();assert.equal(h.wheel.active,false);
});

test('pause clears an unresolved flick and never resurrects it on resume',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(4);
  send({type:'grab'});send({type:'motion',velocity:-6});send({type:'release'});send({type:'play',value:false});
  const position=p.background;render(16);
  assert.equal(p.background,position);assert.equal(p.position,position);assert.equal(p.pendingRelease,0);
  send({type:'play',value:true});render(2);assert.equal(p.motion,0);assert.ok(Math.abs(p.speed-1)<1e-8);
});

test('contact response follows hand direction and strength without changing hit geometry',async()=>{
  const {HandMotion,ScratchResponse,onScratchBody}=await import('../sketches/ouroboros/scratch-motion.mjs');
  const hand=new HandMotion(),v=hand.push(.02,0);assert.ok(v>0);
  assert.ok(hand.push(-.02,16)<0);hand.reset();assert.equal(hand.push(NaN,24),null);
  const response=new ScratchResponse();response.excite(.2,.7,100);const small=response.strength;
  response.excite(5,.7,110);assert.ok(response.strength>small);
  response.excite(-4,1,120);assert.equal(response.direction,-1);
  assert.ok(response.strengthAt(400)<.03);
  for(const scale of [.35,.6,1]){
    const radius=300*scale;assert.equal(onScratchBody(radius*.6,radius),false);
    assert.equal(onScratchBody(radius*.8,radius),true);assert.equal(onScratchBody(radius*1.1,radius),true);
    assert.equal(onScratchBody(radius*1.25,radius),false);
  }
  response.clear();assert.equal(response.strengthAt(500),0);
});

test('a late initialization cannot resume playback after focus loss or pause',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs');
  const audio=new OuroborosAudio();let complete;
  audio.context={resume:()=>Promise.resolve()};
  audio.initialize=()=>new Promise(resolve=>{complete=resolve;});
  const starting=audio.play();audio.pause();complete();
  assert.equal(await starting,false);assert.equal(audio.playing,false);
});

test('angular dragging remains continuous through the top seam',async()=>{
  const {angleDelta}=await import('../sketches/ouroboros/score.mjs');
  assert.ok(Math.abs(angleDelta(-Math.PI+.02,Math.PI-.02)-.04)<1e-10);
  assert.ok(Math.abs(angleDelta(Math.PI-.02,-Math.PI+.02)+.04)<1e-10);
});

test('pinching to half the radius doubles playback speed, and incremental wheel changes reverse cleanly',async()=>{
  const {PinchScale}=await import('../sketches/ouroboros/pinch-scale.mjs');
  const changes=[];let starts=0,ends=0;
  const pinch=new PinchScale({changed:(scale,rate)=>changes.push({scale,rate}),started:()=>starts++,ended:()=>ends++});
  const delta=Math.log(2)/.01;
  assert.equal(pinch.wheel(delta),true);
  assert.ok(Math.abs(pinch.scale-.5)<1e-10);assert.ok(Math.abs(changes.at(-1).rate-2)<1e-10);
  pinch.wheel(-delta);assert.ok(Math.abs(pinch.scale-1)<1e-10);
  assert.equal(starts,1,'a burst has one gesture start');
  pinch.end();pinch.end();assert.equal(ends,1);assert.equal(pinch.source,null);
});

test('Safari scale is relative to gesture start, duplicate ctrl-wheel is ignored and the chosen size persists',async()=>{
  const {PinchScale}=await import('../sketches/ouroboros/pinch-scale.mjs');
  const pinch=new PinchScale();pinch.set(.8);pinch.safariStart();
  pinch.safariChange(.75);assert.ok(Math.abs(pinch.scale-.6)<1e-10);
  pinch.safariChange(.75);assert.ok(Math.abs(pinch.scale-.6)<1e-10,'Safari values are not accumulated repeatedly');
  assert.equal(pinch.wheel(40),false);assert.ok(Math.abs(pinch.scale-.6)<1e-10);
  pinch.end();assert.ok(Math.abs(pinch.scale-.6)<1e-10);
  pinch.safariStart();pinch.safariChange(1.5);assert.ok(Math.abs(pinch.scale-.9)<1e-10);
  pinch.end();pinch.wheel(5);assert.ok(pinch.scale<.9);
});

test('pinch limits keep a usable body and reject malformed gesture values',async()=>{
  const {PinchScale,MIN_SCALE,MAX_SCALE}=await import('../sketches/ouroboros/pinch-scale.mjs');
  const pinch=new PinchScale();
  for(const value of [0,-1,NaN,Infinity])assert.equal(pinch.set(value),false);
  pinch.set(.01);assert.equal(pinch.scale,MIN_SCALE);
  pinch.set(20);assert.equal(pinch.scale,MAX_SCALE);
  for(const value of [0,NaN,Infinity])assert.equal(pinch.wheel(value),false);
  assert.equal(pinch.source,null);
  pinch.safariStart();for(const value of [0,-1,NaN,Infinity])assert.equal(pinch.safariChange(value),false);
  assert.equal(pinch.scale,MAX_SCALE);
  const pixels=new PinchScale(),lines=new PinchScale();pixels.wheel(16);lines.wheel(1,1);assert.equal(pixels.scale,lines.scale);
});


test('pinch changes speed without seeking; the scratch motor and Slip both use the selected rate',()=>{
  const {processor:p,send,render}=transport(fixture());
  send({type:'play',value:true});render(8);const before=p.background;
  send({type:'rate',value:2});assert.equal(p.background,before);render(24);
  assert.ok(Math.abs(p.rate-2)<1e-6);
  const start=p.background;render(6);assert.ok(circularDistance(p.background,start+1536,p.length)<.1);
  send({type:'grab'});send({type:'motion',velocity:-4});render(4);
  send({type:'rate',value:2.5});render(40);
  assert.ok(Math.abs(p.speed-2.5)<1e-6);
  send({type:'release'});render(4);assert.equal(p.position,p.background);assert.equal(p.mix,0);
  assert.ok(Math.abs(p.speed-2.5)<1e-6);
});

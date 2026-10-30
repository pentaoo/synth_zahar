const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const fixture=(length=16000)=>Array.from({length:3},(_,channel)=>Float32Array.from({length},(_,i)=>Math.sin(i*.07)*(channel+1)*.1));
const wrap=(v,length)=>((v%length)+length)%length;
const distance=(a,b,length)=>Math.abs(wrap(a-b+length/2,length)-length/2);
const rms=pcm=>Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length);
function transport(stems=fixture(),sampleRate=8000,legacy=false){
  let Processor;const messages=[];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sketches/ouroboros/',legacy?'transport-worklet.js':'transport-vinyl-worklet.js'),'utf8'),{
    sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>messages.push(data)};}},
    registerProcessor(name,type){assert.equal(name,legacy?'ouroboros-transport':'ouroboros-vinyl-transport');Processor=type;}
  });
  const p=new Processor(),send=data=>p.port.onmessage({data});send({type:'load',stems});
  const render=(frames=128)=>{
    const outputs=Array.from({length:legacy?3:4},()=>[new Float32Array(frames)]);p.process([],outputs);return outputs.map(ch=>ch[0]);
  };
  return {p,send,render,messages};
}
function play(t){t.send({type:'play',value:true});t.render(1024);return t;}

test('release restores the motor at the scratched position, never the uninterrupted clock',()=>{
  const edited=play(transport()),control=play(transport());
  edited.send({type:'grab'});edited.send({type:'motion',velocity:-6});
  edited.render(256);control.render(256);
  const released=edited.p.position;
  assert.ok(distance(released,control.p.position,edited.p.length)>300);
  edited.send({type:'release'});
  assert.equal(edited.p.position,released,'release itself does not seek');
  assert.equal(edited.p.speed,1);assert.equal(edited.p.motion,0);
  edited.render(512);control.render(512);
  assert.ok(distance(edited.p.position,released+512,edited.p.length)<1e-7);
  assert.ok(distance(edited.p.position,control.p.position,edited.p.length)>300,'the hand displacement persists');
  const state=edited.messages.at(-1);assert.equal(state.releasePhase,released/edited.p.length);
  assert.equal(state.phase,edited.p.position/edited.p.length);assert.equal(state.transportKind,'vinyl');
});

test('the preserved Slip and new record deliberately continue at different musical positions',()=>{
  const record=play(transport()),slip=play(transport(fixture(),8000,true));
  for(const t of [record,slip]){t.send({type:'grab'});t.send({type:'motion',velocity:-6});t.render(256);t.send({type:'release'});t.render(512);}
  assert.equal(slip.p.position,slip.p.background);
  assert.ok(distance(record.p.position,slip.p.position,record.p.length)>300);
});

test('release across either loop edge retains the selected pinch tempo and exact reader',()=>{
  for(const start of [8,15994]){
    const t=play(transport());t.send({type:'rate',value:2.5});t.render(16000);t.p.position=start;
    t.send({type:'grab'});t.send({type:'motion',velocity:start<100?-9:9});t.render(160);
    assert.ok(t.p.position>=0&&t.p.position<t.p.length);
    const released=t.p.position;t.send({type:'release'});t.render(256);
    assert.ok(Math.abs(t.p.speed-2.5)<1e-8);
    assert.ok(distance(t.p.position,released+256*2.5,t.p.length)<1e-6);
    assert.ok(t.render().flatMap(pcm=>Array.from(pcm)).every(Number.isFinite));
  }
});

test('pause during a stroke freezes its audible position and resume has no hidden-time jump',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:-5});t.render(160);
  const stopped=t.p.position;t.send({type:'play',value:false});t.render(3000);
  assert.equal(t.p.position,stopped);assert.equal(t.p.motion,0);assert.equal(t.p.pendingRelease,0);
  t.send({type:'release'});t.send({type:'play',value:true});t.render(256);
  assert.ok(distance(t.p.position,stopped+256,t.p.length)<1e-7);assert.equal(t.p.scratching,false);
});

test('a new stroke starts at the previous release and accepts a fast opposite direction',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:12});t.render(128);
  assert.ok(t.p.speed>10);t.send({type:'release'});t.render(16);const start=t.p.position;
  t.send({type:'grab'});assert.equal(t.p.position,start);t.send({type:'motion',velocity:-12});
  let reverse=-1;
  for(let i=0;i<32;i++){t.render(1);if(t.p.speed<0&&reverse<0)reverse=i;}
  assert.ok(reverse>=0&&reverse<32);assert.ok(t.p.speed<-8);
  t.send({type:'release'});const end=t.p.position;t.render(32);
  assert.ok(distance(t.p.position,end+32,t.p.length)<1e-7);
});

test('a mouse flick entirely before one audio block sounds and keeps its displacement',()=>{
  const t=play(transport()),control=play(transport());
  t.send({type:'grab'});t.send({type:'motion',velocity:-7});t.send({type:'release'});
  const sound=t.render(512);control.render(512);
  assert.ok(rms(sound[0])>.01);assert.equal(t.p.releaseCount,1);assert.equal(t.p.pendingRelease,0);
  assert.ok(distance(t.p.position,control.p.position,t.p.length)>100);
  const at=t.p.position;t.render(256);assert.ok(distance(t.p.position,at+256,t.p.length)<1e-7);
  t.send({type:'release'});assert.equal(t.p.releaseCount,1,'duplicate endings cannot replay the flick');
});

test('pause discards a pending flick rather than resurrecting it on resume',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:-7});t.send({type:'release'});
  const at=t.p.position;t.send({type:'play',value:false});t.render(256);
  assert.equal(t.p.position,at);t.send({type:'play',value:true});t.render(256);
  assert.ok(distance(t.p.position,at+256,t.p.length)<1e-7);assert.equal(t.p.releaseCount,0);
});

test('the three separate stems reverse together and stationary input leaves the motor running',()=>{
  const t=play(transport());t.send({type:'grab'});const before=t.p.position;t.render(256);
  assert.equal(t.p.position,before+256);
  t.send({type:'motion',velocity:-5});const sound=t.render(128);assert.ok(t.p.speed<0);
  for(let i=0;i<128;i++)for(let ch=1;ch<3;ch++)assert.ok(Math.abs(sound[ch][i]-sound[0][i]*(ch+1))<1e-6);
  t.render(1600);assert.ok(Math.abs(t.p.speed-1)<1e-4);assert.ok(rms(t.render(128)[0])>.01);
});

test('the turn through zero is not silenced by a speed gate',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:-1});
  const sound=t.render(96);assert.ok(Math.abs(t.p.speed)<.001);
  assert.ok(rms(sound[0].slice(-32))>1e-4);assert.ok(t.p.envelope>.99);
});

test('I–IV cues wait for the next forward audible beat, including after a reverse stroke',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:-6});t.render(128);
  t.send({type:'cue',section:2});t.render(128);assert.equal(t.p.queued,2,'reverse crossings do not trigger a forward cue');
  t.send({type:'release'});const frames=Math.ceil(t.p.beat-t.p.position%t.p.beat);
  t.render(frames-1);assert.equal(t.p.queued,2);t.render(1);
  assert.equal(t.p.queued,-1);assert.equal(t.p.position,t.p.length/2);assert.equal(t.p.cueMix,1);
  t.render(256);assert.equal(t.p.cueMix,0);
  t.send({type:'cue',section:3});t.send({type:'grab'});assert.equal(t.p.queued,-1);
});

test('a strong wheel throw coasts briefly from its reached point, ignoring native momentum deltas',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');const t=play(transport());
  const wheel=new WheelScratch({grab:()=>t.send({type:'grab'}),motion:velocity=>t.send({type:'motion',velocity}),release:options=>t.send({type:'release',...options}),schedule:()=>1,unschedule:()=>{}});
  wheel.move({deltaY:24,timeStamp:0,inside:true,momentum:false});t.render(128);const released=t.p.position;
  wheel.move({deltaY:18,timeStamp:16,inside:true,momentum:true});
  assert.equal(t.p.position,released);assert.equal(t.p.scratching,false);assert.equal(t.p.coastStarts,1);
  const originalStart=t.p.coastStart,remaining=t.p.coastRemaining;
  wheel.move({deltaY:-1e6,timeStamp:32,inside:true,momentum:true});
  assert.equal(t.p.coastStart,originalStart);assert.equal(t.p.coastRemaining,remaining,'native inertia cannot extend or reverse the throw');
  let frames=0,extra=0;
  while(t.p.coastRemaining>0){const at=t.p.position;t.render(1);assert.ok(distance(t.p.position,at+t.p.speed,t.p.length)<1e-7);extra+=t.p.speed-t.p.rate;frames++;}
  assert.ok(frames<=1600);assert.ok(extra<0);assert.ok(Math.abs(extra)<800,'the extra turn is bounded to a small fraction of the phrase');
  const at=t.p.position;t.render(256);assert.ok(distance(t.p.position,at+256,t.p.length)<1e-7);assert.equal(wheel.active,false);
});

test('pinch takes over a scratch without seeking and its selected rate survives pause',async()=>{
  const {PinchScale}=await import('../sketches/ouroboros/pinch-scale.mjs');const t=play(transport());
  t.send({type:'grab'});t.send({type:'motion',velocity:-6});t.render(128);const before=t.p.position;
  const pinch=new PinchScale({started:()=>t.send({type:'release'}),changed:(scale,rate)=>t.send({type:'rate',value:rate})});
  pinch.wheel(Math.log(2)/.01);assert.equal(t.p.position,before);assert.equal(t.p.scratching,false);
  t.render(16000);assert.ok(Math.abs(t.p.speed-2)<1e-8);pinch.end();
  const stopped=t.p.position;t.send({type:'play',value:false});t.render(256);assert.equal(t.p.position,stopped);
  t.send({type:'play',value:true});t.render(256);assert.ok(distance(t.p.position,stopped+512,t.p.length)<1e-6);
});

test('Vinyl and Synth share the new position, keep similar levels and cleanly end coloration',async()=>{
  const {renderScore}=await import('../sketches/ouroboros/score.mjs');const score=renderScore(8000);
  const a=play(transport(score.stems)),b=play(transport(score.stems));b.send({type:'mode',value:'synth'});
  const left=[],right=[];
  for(const velocity of [-6,5,-8,7,-3,4]){
    for(const t of [a,b]){t.send({type:'grab'});t.send({type:'motion',velocity});}
    for(let block=0;block<5;block++){
      for(const t of [a,b])t.send({type:'motion',velocity});
      left.push(...a.render().flatMap(pcm=>Array.from(pcm)));right.push(...b.render().flatMap(pcm=>Array.from(pcm)));
    }
    for(const t of [a,b]){t.send({type:'release'});t.render(256);}
  }
  assert.equal(a.p.position,b.p.position);assert.ok(right.every(Number.isFinite));
  assert.ok(rms(left.map((v,i)=>v-right[i]))>.01);assert.ok(Math.abs(20*Math.log10(rms(right)/rms(left)))<3);
  for(const t of [a,b])t.render(2048);
  const cleanA=a.render()[0],cleanB=b.render()[0];assert.ok(rms(Array.from(cleanA,(v,i)=>v-cleanB[i]))<1e-6);
});

test('large strokes and malformed commands stay bounded through both buffer edges at 48 kHz',async()=>{
  const {renderScore}=await import('../sketches/ouroboros/score.mjs');const t=play(transport(renderScore(48000).stems,48000));
  for(const velocity of [1e100,-1e100,NaN,Infinity,0,3,-7]){
    t.send({type:'grab'});t.send({type:'motion',velocity});
    const output=t.render(4096);assert.ok(output.every(pcm=>pcm.every(Number.isFinite)));
    assert.ok(t.p.position>=0&&t.p.position<t.p.length);assert.ok(Math.abs(t.p.motion)<=12);
    t.send({type:'release'});assert.equal(t.p.motion,0);
  }
  const rate=t.p.rateTarget;for(const value of [NaN,Infinity,-2,0])t.send({type:'rate',value});assert.equal(t.p.rateTarget,rate);
});

test('engine loads the new worklet by default and retains explicit access to the original',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs');
  const previousWindow=globalThis.window,previousNode=globalThis.AudioWorkletNode;let loaded,registered;
  globalThis.window={AudioContext:class{constructor(){this.sampleRate=8000;this.audioWorklet={addModule:async url=>{loaded=url.pathname;}};}async resume(){}}};
  globalThis.AudioWorkletNode=class{constructor(context,name,options){registered={name,options};this.port={postMessage:data=>{if(data.type==='load')this.port.onmessage({data:{ready:true}});}};}};
  try{
    for(const kind of ['vinyl','slip']){
      const audio=kind==='vinyl'?new OuroborosAudio():new OuroborosAudio(()=>{},{transport:kind});audio.buildGraph=()=>{};
      await audio.initialize();assert.equal(audio.transportKind,kind);
      assert.ok(loaded.endsWith(kind==='vinyl'?'/transport-vinyl-worklet.js':'/transport-worklet.js'));
      assert.equal(registered.name,kind==='vinyl'?'ouroboros-vinyl-transport':'ouroboros-transport');
      assert.deepEqual(registered.options.outputChannelCount,Array(kind==='vinyl'?10:9).fill(1));
    }
  }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousNode===undefined)delete globalThis.AudioWorkletNode;else globalThis.AudioWorkletNode=previousNode;}
});

test('surface hiss and dust have a separate audible output, rise with motion and fade in rests',()=>{
  const quiet=()=>Array.from({length:3},()=>new Float32Array(16000));
  const weak=play(transport(quiet())),strong=play(transport(quiet()));
  for(const t of [weak,strong])assert.equal(rms(t.render()[3]),0,'there is no permanent noise bed');
  const low=[],high=[];
  for(let block=0;block<20;block++){
    weak.send({type:'motion',velocity:.5});strong.send({type:'motion',velocity:8});
    const a=weak.render(),b=strong.render();low.push(...a[3]);high.push(...b[3]);
    for(const channel of b.slice(0,3))assert.ok(channel.every(v=>v===0),'noise does not replace or leak into the musical stems');
  }
  assert.ok(rms(high)>.01);assert.ok(rms(high)>rms(low)*1.6);
  assert.ok(high.every(v=>Number.isFinite(v)&&Math.abs(v)<.4));
  strong.send({type:'release'});strong.render(4096);assert.equal(rms(strong.render()[3]),0);
});

test('wheel idle timeout retains a strong flick but small and explicitly cancelled strokes do not coast',async()=>{
  const {WheelScratch}=await import('../sketches/ouroboros/wheel-scratch.mjs');
  for(const [delta,cancel] of [[40,false],[1,false],[40,true]]){
    const t=play(transport()),timers=[];
    const wheel=new WheelScratch({grab:()=>t.send({type:'grab'}),motion:velocity=>t.send({type:'motion',velocity}),release:options=>t.send({type:'release',...options}),schedule:fn=>{timers.push(fn);return timers.length;},unschedule:()=>{}});
    wheel.move({deltaY:delta,timeStamp:0,inside:true,momentum:false});t.render(640);
    if(cancel)wheel.cancel();else timers.at(-1)();
    assert.equal(t.p.coastRemaining>0,delta===40&&!cancel);
  }
});

test('the throw follows hand direction, respects pinch rate, and stays short at different sample rates',()=>{
  for(const sampleRate of [8000,48000])for(const velocity of [-12,12]){
    const t=play(transport(fixture(),sampleRate));t.send({type:'rate',value:2});t.render(sampleRate);
    t.send({type:'grab'});t.send({type:'motion',velocity});t.render(128);const released=t.p.position;
    t.send({type:'release',coastVelocity:velocity});assert.equal(t.p.position,released);
    assert.equal(Math.sign(t.p.coastStart),Math.sign(velocity));assert.ok(t.p.coastFrames<=sampleRate*.2);
    t.render(Math.ceil(sampleRate*.23));assert.equal(t.p.coastRemaining,0);assert.ok(Math.abs(t.p.speed-2)<1e-8);
    const at=t.p.position;t.render(256);assert.ok(distance(t.p.position,at+512,t.p.length)<1e-6);
  }
});

test('new strokes, cancel, and pause interrupt a throw without seeking or restarting it',()=>{
  for(const action of ['grab','cancel','pause']){
    const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:12});t.render(128);
    t.send({type:'release',coastVelocity:12});t.render(256);assert.ok(t.p.coastRemaining>0);
    const at=t.p.position;t.send(action==='pause'?{type:'play',value:false}:{type:action});
    assert.equal(t.p.position,at);assert.equal(t.p.coastRemaining,0);
    if(action==='pause'){t.render(256);assert.equal(t.p.position,at);assert.ok(t.render()[3].every(v=>v===0));t.send({type:'play',value:true});}
    if(action==='grab'){t.send({type:'motion',velocity:-6});t.render(64);assert.ok(t.p.speed<0);t.send({type:'release'});}
    const final=t.p.position;t.render(256);assert.ok(distance(t.p.position,final+256,t.p.length)<1e-7);
  }
});

test('stale release commands and long-delayed timers cannot inject late kinetic energy',()=>{
  const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:12});t.render(2000);
  t.send({type:'release',coastVelocity:12});assert.equal(t.p.coastRemaining,0,'motion older than 160 ms has no throw');
  t.send({type:'release',coastVelocity:12});assert.equal(t.p.coastStarts,0);
  for(const value of [NaN,Infinity]){t.send({type:'grab'});t.send({type:'motion',velocity:7});t.render(128);t.send({type:'release',coastVelocity:value});assert.equal(t.p.coastRemaining,0);}
});

test('a tiny unrendered wheel flick keeps both its sound and bounded throw, but cancel discards it',()=>{
  for(const cancel of [false,true]){
    const t=play(transport());t.send({type:'grab'});t.send({type:'motion',velocity:12});t.send({type:'release',coastVelocity:12});
    if(cancel)t.send({type:'cancel'});
    const at=t.p.position;t.render(512);
    assert.equal(t.p.coastStarts,cancel?0:1);
    if(cancel)assert.ok(distance(t.p.position,at+512,t.p.length)<1e-7);else assert.ok(t.p.coastRemaining>0);
  }
});

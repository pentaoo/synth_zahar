const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../sketches/ouroboros');
const modules=Promise.all(['ritual-model','spell-book','creature-state','ritual-geometry','body-geometry','folk-score','touch-pinch'].map(n=>import(`${root}/${n}.mjs`)));
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} ~= ${b}`);
test('six stable phrase identities have their own musical events and duration',async()=>{
  const [model,,,,,score]=await modules;assert.equal(new Set(model.CREATURES.map(c=>c.id)).size,6);
  for(let channel=0;channel<3;channel++){
    const [a,b]=score.PHRASES.filter(p=>p.channel===channel);assert.equal(a.beats,8);assert.equal(b.offset,8);assert.notDeepEqual(a.notes.map(n=>n.slice(0,3)),b.notes.map(n=>n.slice(0,3)));
  }
  assert.equal(model.phraseAt(.4999),0);assert.equal(model.phraseAt(.5),1);assert.equal(model.phraseAt(1),0);
  assert.equal(model.phraseAt(.3,[4,12]),1);
});
test('unequal phrase durations drive notes, offsets and arc length from the same data',async()=>{
  const [model,,,g,base,m]=await modules,lengths=[4,12],s=m.renderScore(8000,m.DEFAULT_WAVES,lengths),skins=JSON.parse(fs.readFileSync(`${root}/assets/ritual/skins.json`));
  assert.equal(s.beats,16);assert.equal(s.phrases[1].offset,4);assert.equal(s.phrases[1].beats,12);assert.equal(s.phrases[0].beats,4);
  const boundary=Math.floor(4*60/m.BPM*8000);assert.ok(s.phraseStems[3].subarray(0,boundary).every(v=>v===0));assert.ok(s.phraseStems[3].subarray(boundary,boundary+1500).some(v=>v!==0));assert.equal(model.phraseAt(.26,lengths),1);
  const ring={...base.ringMetrics(0,300),baseRadius:300,ratio:1},pair=g.pairCreatures(ring,0,skins,lengths);
  near(pair[1].offset,base.TAU*ring.radius*.25);assert.ok(pair[1].length>pair[0].length*2.8);
  const reversed=g.pairCreatures({...ring,headAngle:ring.headAngle-base.TAU*.25},1,skins,lengths);for(const c of pair){const p=g.creaturePoint(c,20),q=g.creaturePoint(reversed.find(v=>v.id===c.id),20);near(p.x,q.x);near(p.y,q.y);}
});
test('folk rendering is finite, independent A/B branches sum exactly to each ring',async()=>{
  const [,,,,,m]=await modules,s=m.renderScore(8000);assert.equal(s.phraseStems.length,6);assert.equal(s.bpm,78);
  for(let ch=0;ch<3;ch++){let energy=0;for(let i=0;i<s.length;i++){const a=s.phraseStems[ch*2][i],b=s.phraseStems[ch*2+1][i];assert.ok(Number.isFinite(a)&&Number.isFinite(b));near(s.stems[ch][i],a+b,1e-7);energy+=s.stems[ch][i]**2;}assert.ok(energy>1);}
  assert.ok(s.phraseStems[3].some(v=>v!==0));
});
test('phrase, ring and all spell targets resolve without leaking to neighbours',async()=>{
  const [m,{SpellBook}]=await modules,b=new SpellBook();assert.deepEqual(m.resolveTarget('ring','melody-b'),['melody-a','melody-b']);
  b.cast(' ЯРОСТЬ ',{scope:'phrase',selected:'melody-b'});b.advance(1);assert.equal(b.values('melody-b').rage,1);assert.equal(b.values('melody-a').rage,0);assert.equal(b.values('bass-a').rage,0);
  b.cast('Свод',{scope:'ring',selected:'bass-b'});b.advance(2);assert.equal(b.values('bass-a').vault,1);assert.equal(b.values('bass-b').vault,1);assert.equal(b.values('drums-a').vault,0);
});
test('unknown words preserve all state; repeated casts renew instead of multiplying output',async()=>{
  const [,{SpellBook}]=await modules,b=new SpellBook();b.cast('Свод');b.advance(1);const before=JSON.stringify(b.effects);assert.equal(b.cast('сноска').ok,false);assert.equal(JSON.stringify(b.effects),before);
  for(let i=0;i<30;i++)b.cast('Свод');b.advance(2);assert.equal(b.effects.length,1);assert.equal(b.values('bass-a').vault,1);
});
test('clear one phrase smoothly without cancelling the paired phrase',async()=>{
  const [,{SpellBook}]=await modules,b=new SpellBook();b.cast('Свод',{scope:'ring',selected:'bass-a'});b.advance(2);b.cast('Снять',{scope:'phrase',selected:'bass-a'});b.advance(2.75);near(b.values('bass-a').vault,.5);assert.equal(b.values('bass-b').vault,1);b.advance(4);assert.equal(b.values('bass-a').vault,0);assert.equal(b.values('bass-b').vault,1);
});
test('heard travel drives one cast across reverse crossings and freezes on pause',async()=>{
  const [,{SpellBook}]=await modules,b=new SpellBook();const cast=b.cast('Ярость');b.advance(2);const level=b.values('bass-a').rage;b.advance(2);assert.equal(b.values('bass-a').rage,level);b.advance(.2);assert.equal(b.beat,2);assert.equal(b.effects[0].id,cast.id);b.advance(13);assert.equal(b.effects.length,0);
});
test('clearing one phrase leaves the independent all-target voice processing intact',async()=>{
  const [,{SpellBook}]=await modules,b=new SpellBook();b.cast('Свод');b.advance(2);b.cast('Снять',{scope:'phrase',selected:'bass-a'});b.advance(4);assert.equal(b.allVoiceValues().vault,1);assert.equal(b.values('bass-a').vault,0);b.cast('Снять');b.advance(6);assert.equal(b.allVoiceValues().vault,0);
});
test('robot speech uses a real node source, preempts recitative, and pause cancels it',async()=>{
  const {RitualVoice}=await import(`${root}/ritual-voice.mjs`),sources=[];
  const param=()=>({value:0}),node=()=>({connect(to){return to;},disconnect(){}});
  const c={createBiquadFilter:()=>({...node(),frequency:param(),Q:param()}),createWaveShaper:node,createGain:()=>({...node(),gain:param()}),createOscillator:()=>({...node(),frequency:param(),start(){}}),createBufferSource:()=>{const s={...node(),playbackRate:param(),start(){this.started=true;},stop(){this.stopped=true;}};sources.push(s);return s;}};
  const voice=new RitualVoice(c,node());for(const key of ['recitative-a','recitative-b','vault'])voice.buffers.set(key,{});
  voice.advance(5,true);assert.equal(voice.word,'recitative-a');assert.equal(sources[0].started,true);
  voice.say('vault');assert.equal(sources[0].stopped,true);assert.equal(voice.word,'vault');assert.equal(voice.spoken,2);
  voice.advance(7,false);assert.equal(sources[1].stopped,true);assert.equal(voice.active,null);voice.advance(7,true);assert.equal(voice.active,null);
});
test('both bites end at the neighbour gullet, material coordinates survive pinch',async()=>{
  const [,,,g,base]=await modules,skins=JSON.parse(fs.readFileSync(`${root}/assets/ritual/skins.json`));
  for(let i=0;i<3;i++)for(const compression of [1,.7,.35]){
    const ring={...base.ringMetrics(i,300,compression),baseRadius:300,ratio:base.RINGS[i].ratio},pair=g.pairCreatures(ring,0,skins);
    for(let n=0;n<2;n++){const c=pair[n],next=pair[1-n],tail=g.creaturePoint(c,c.length),mouth=(next.skin.neck-next.skin.gullet)/(next.skin.bottom-next.skin.top)*next.skin.width/next.skin.height*next.thickness,gullet=g.creaturePoint(next,-mouth);near(tail.x,gullet.x);near(tail.y,gullet.y);}
    const original=g.pairCreatures({...base.ringMetrics(i,300),baseRadius:300,ratio:base.RINGS[i].ratio},0,skins);near(pair[0].tileLength,original[0].tileLength);assert.ok(pair[0].length<=original[0].length);
  }
});
test('selecting phrase B changes the leader while preserving the circle positions',async()=>{
  const [,,,g,base]=await modules,skins=JSON.parse(fs.readFileSync(`${root}/assets/ritual/skins.json`)),r={...base.ringMetrics(0,300),baseRadius:300,ratio:1};
  const a=g.pairCreatures(r,0,skins),b=g.pairCreatures({...r,headAngle:r.headAngle-Math.PI},1,skins);
  for(const c of a){const d=b.find(v=>v.id===c.id);const x=g.creaturePoint(c,20),y=g.creaturePoint(d,20);near(x.x,y.x);near(x.y,y.y);}
});
test('new atlas head lengths align continuously with the straight departure path',async()=>{
  const [,,,g,base]=await modules,skins=JSON.parse(fs.readFileSync(`${root}/assets/ritual/skins.json`));
  for(let channel=0;channel<3;channel++)for(let part=0;part<2;part++){
    const skin=skins[['bass','melody','drums'][channel]+(part?'-b':'-a')],r={...base.ringMetrics(channel,300),baseRadius:300,ratio:base.RINGS[channel].ratio};
    r.headUnits=skin.neck/(skin.bottom-skin.top)*skin.width/skin.height;
    const b=g.ritualPresentation(1366,768,300,r,{progress:1e-9,focusAngle:-Math.PI/2});
    for(const s of [-r.headUnits*r.thickness,0,40]){const p=base.bodyPoint(r,s),q=base.bodyPoint(r,s,{...b.path,headLength:r.headUnits*r.thickness});near(p.x,q.x,1e-5);near(p.y,q.y,1e-5);}
  }
});
test('mobile presentation puts full miniature top centre and macro bottom centre',async()=>{
  const [,,,g,base]=await modules,r={...base.ringMetrics(0,140),baseRadius:140,ratio:1},state={progress:1,focusAngle:-Math.PI/2};
  for(const [w,h]of [[390,844],[360,800],[844,390],[390,440]]){const p=g.ritualPresentation(w,h,140,r,state);assert.equal(p.mobile,true);near(p.mini.x+p.mini.size/2,w/2);assert.ok(p.mini.y<30);near(p.view.tx,w/2);assert.ok(p.view.ty-r.radius*p.view.scale>h*.65);}
  assert.equal(g.ritualPresentation(1366,768,300,r,state).mobile,false);
});
test('watchful blink and gaze stay separate from geometry, reduced motion is still',async()=>{
  const [m,,{CreatureLife}]=await modules,life=new CreatureLife(),eyes=Object.fromEntries(m.CREATURES.map(c=>[c.id,{x:0,y:0}]));
  life.update(1.8,.05,{pointer:{x:100,y:0},eyes,phase:.2,playing:true});const states=life.update(1.905,.05,{pointer:{x:100,y:0},eyes,phase:.2,playing:true});assert.ok(states[0].blink>.9);assert.ok(states[0].gazeX>0);assert.equal(states[0].active,true);assert.equal(states[1].active,false);
  const reduced=life.update(1.91,.05,{reduced:true,contact:'bass-a'});assert.equal(reduced[0].blink,0);assert.equal(reduced[0].tension,0);
});
test('two-touch pinch takes over once, movement ratios and release never become clicks',async()=>{
  const [,,,,,,{TouchPinch}]=await modules,p=new TouchPinch();assert.equal(p.down(1,0,0),false);assert.equal(p.move(1,1,0),null);assert.equal(p.down(2,101,0),true);near(p.move(2,51,0),.5);near(p.move(2,101,0),2);assert.equal(p.up(1),true);assert.equal(p.active,false);assert.equal(p.up(2),false);
});
test('touch pinch owns its gesture even if Safari also emits gesture and ctrl-wheel events',async()=>{
  const {PinchScale}=await import(`${root}/pinch-scale.mjs`);let starts=0;const p=new PinchScale({started(){starts++;}});
  p.touchStart();p.touchChange(.8);assert.equal(p.source,'touch');assert.equal(p.safariStart(),false);assert.equal(p.wheel(30),false);assert.equal(p.safariChange(.5),false);near(p.scale,.8);assert.equal(starts,1);
  p.touchChange(.5);near(p.scale,.4);p.end();assert.equal(p.source,null);assert.equal(p.safariStart(),true);p.safariChange(2);near(p.scale,.8);
});
for(const legacy of [false,true])test(`${legacy?'Slip':'Vinyl'} phrase outputs share the exact audible readers in both directions`,async()=>{
  let Processor;vm.runInNewContext(fs.readFileSync(`${root}/${legacy?'transport-worklet.js':'transport-vinyl-worklet.js'}`,'utf8'),{sampleRate:8000,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor(_,p){Processor=p;}});
  const p=new Processor(),send=data=>p.command(data),length=16000,phraseStems=Array.from({length:6},(_,i)=>Float32Array.from({length},(_,n)=>Math.sin(n*.03+i)*.04)),stems=[0,1,2].map(ch=>Float32Array.from({length},(_,n)=>phraseStems[ch*2][n]+phraseStems[ch*2+1][n]));
  send({type:'load',stems,phraseStems,beats:8});near(p.beat,length/8);send({type:'play',value:true});
  for(const velocity of [0,-5,6]){if(velocity){send({type:'grab'});send({type:'motion',velocity});}const outputs=Array.from({length:legacy?9:10},()=>[new Float32Array(1024)]);p.process([],outputs);for(let ch=0;ch<3;ch++)for(let n=0;n<1024;n++)near(outputs[ch][0][n],outputs[(legacy?3:4)+ch*2][0][n]+outputs[(legacy?3:4)+ch*2+1][0][n],1e-7);}
  assert.ok(p.travelBeats>0);send({type:'play',value:false});const beat=p.travelBeats;p.process([],Array.from({length:legacy?9:10},()=>[new Float32Array(128)]));near(p.travelBeats,beat);
});
test('local robot speech assets contain PCM and no remote service is required',()=>{
  for(const word of ['vault','rage','split','clear','recitative-a','recitative-b']){const file=fs.readFileSync(`${root}/assets/voice/${word}.wav`);assert.equal(file.toString('ascii',0,4),'RIFF');assert.ok(file.length>10000);assert.ok(file.subarray(4096).some(v=>v!==0));}
});

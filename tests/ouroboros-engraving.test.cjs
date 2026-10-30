const test=require('node:test');
const assert=require('node:assert/strict');

test('compression consumes material at constant skin width and preserves all three radius ratios',async()=>{
  const {ringMetrics,RINGS}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(let index=0;index<3;index++){
    const original=ringMetrics(index,350,1);let previous=original.length;
    for(const scale of [1,.8,.6,.35]){
      const ring=ringMetrics(index,350,scale);
      assert.equal(ring.thickness,original.thickness);assert.equal(ring.tileLength,original.tileLength);
      assert.ok(Math.abs(ring.radius/(350*scale)-RINGS[index].ratio)<1e-10);
      assert.ok(ring.length<=previous);previous=ring.length;
      assert.ok(Math.abs(ring.length+ring.swallowed-original.fullLength)<1e-8);
    }
  }
});

test('a scale keeps its material coordinate while its world position changes and swallowed scales stay beyond the mouth',async()=>{
  const {ringMetrics,bodyPoint}=await import('../sketches/ouroboros/body-geometry.mjs');
  const full=ringMetrics(0,350),small=ringMetrics(0,350,.5),s=small.length*.6;
  assert.equal(bodyPoint(full,s).u,bodyPoint(small,s).u);
  assert.ok(Math.hypot(bodyPoint(full,s).x-bodyPoint(small,s).x,bodyPoint(full,s).y-bodyPoint(small,s).y)>40);
  assert.ok(full.length*.8>small.length,'that original tail section has been swallowed, not squeezed into the smaller ring');
  const expanded=ringMetrics(0,350);assert.deepEqual(bodyPoint(full,full.length*.8),bodyPoint(expanded,expanded.length*.8));
});

test('head and incoming skin share a circular spine and meet inside the transparent mouth opening',async()=>{
  const {ringMetrics,bodyPoint,HEAD_UNITS,MOUTH_UNITS}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(let index=0;index<3;index++)for(const scale of [1,.7,.35]){
    const ring=ringMetrics(index,350,scale,.17);
    for(let j=0;j<=120;j++){
      const s=-HEAD_UNITS*ring.thickness+(ring.length+HEAD_UNITS*ring.thickness)*j/120,p=bodyPoint(ring,s);
      assert.ok(Math.abs(Math.hypot(p.x,p.y)-ring.radius)<1e-8,'no raised head or local tail bridge');
    }
    const end=bodyPoint(ring,ring.length),throat=bodyPoint(ring,-ring.thickness*MOUTH_UNITS);
    assert.ok(Math.hypot(end.x-throat.x,end.y-throat.y)<1e-7);
    const a=bodyPoint(ring,-.001),b=bodyPoint(ring,.001);
    assert.ok(Math.abs(a.tx-b.tx)<.001&&Math.abs(a.ty-b.ty)<.001,'head and neck share the same tangent');
  }
});

test('departure feeds each piece behind the head through one fixed straight exit at unit material speed',async()=>{
  const {ringMetrics,bodyPoint,HEAD_UNITS}=await import('../sketches/ouroboros/body-geometry.mjs');
  const ring=ringMetrics(0,350),H=HEAD_UNITS*ring.thickness,path={kind:'depart',distance:H+120};
  for(let s=-H;s<ring.length;s+=7){
    const a=bodyPoint(ring,s,path),b=bodyPoint(ring,s+.01,path);
    assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-.01)<1e-6);
    if(s<120)assert.equal(a.y,-ring.radius);else assert.ok(Math.abs(Math.hypot(a.x,a.y)-ring.radius)<1e-7);
  }
  const head=bodyPoint(ring,-H,path),neck=bodyPoint(ring,0,path);assert.ok(head.x>neck.x,'head leads to the right');
  const gone={kind:'depart',distance:ring.length+H+1600};
  for(let s=-H;s<=ring.length;s+=10)assert.ok(bodyPoint(ring,s,gone).x>=1600,'whole snake, not only head, clears frame');
});

test('raster coordinates retain unit material distance on the circular spine',async()=>{
  const {ringMetrics,sampleBody}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(const compression of [1,.6,.35]){
    const ring=ringMetrics(0,350,compression),path=sampleBody(ring,0,512);
    for(let j=1;j<=512;j++){
      const a=(j-1)*5,b=j*5,physical=Math.hypot(path[b]-path[a],path[b+1]-path[a+1]),material=path[b+4]-path[a+4];
      assert.ok(Math.abs(physical-material)<.0003,'the skin cannot be stretched to fill the tail bridge');
    }
  }
});

test('body hit testing maps all rings and both cameras without treating white gaps as a musical surface',async()=>{
  const {ringMetrics,bodyPoint,project,camera,hitBody}=await import('../sketches/ouroboros/body-geometry.mjs');
  const rings=[0,1,2].map(i=>ringMetrics(i,300)),overview={scale:1,rotation:0,tx:683,ty:390};
  assert.equal(hitBody({x:683,y:390},rings,overview),null);
  for(const ring of rings){
    const point=bodyPoint(ring,ring.length*.35),hit=hitBody(project(point,overview),rings,overview);assert.equal(hit.channel,ring.index);
    const focus=camera(1366,768,300,ring,1,.4),close=hitBody(project(point,focus),rings,focus,0,ring.index);assert.equal(close.channel,ring.index);
  }
});

test('a short click selects, movement irreversibly becomes scratch, and cancellation never opens a view',async()=>{
  const {BodyIntent}=await import('../sketches/ouroboros/body-geometry.mjs');
  const click=new BodyIntent(100,100,0);click.move(102,101);assert.equal(click.release(120),'select');
  const drag=new BodyIntent(100,100,0);assert.equal(drag.move(106,100),true);drag.move(100,100);assert.equal(drag.release(120),'release');
  assert.equal(new BodyIntent(0,0,0).release(200,true),'release');assert.equal(new BodyIntent(0,0,0).release(700),'release');
});

test('closing never reverses a flight: early closes wait until the snakes are out of sight, switching rings flies forward twice',async()=>{
  const {ViewState}=await import('../sketches/ouroboros/view-state.mjs');const view=new ViewState();
  view.open(1);for(let i=0;i<20;i++)view.update(.016);assert.ok(view.progress>0&&view.progress<.40);
  let before=view.progress;view.close();
  // Still departing in the overview: the flight continues forward until the ring is hidden.
  while(!view.closing){view.update(.016);assert.ok(view.progress>=before,'no reversal while departing');before=view.progress;}
  assert.equal(view.progress,.5,'the return starts hidden, then arrives into the overview head first');
  for(let i=0;i<200;i++){const p=view.progress;view.update(.016);assert.ok(view.progress<=p);}
  assert.equal(view.progress,0);assert.equal(view.closing,false);
  view.open(1);for(let i=0;i<220;i++)view.update(.016);assert.equal(view.progress,1);
  view.displayAngle=.7;view.close();assert.equal(view.closing,true);assert.equal(view.departAngle,.7,'the large view departs from where the head is');
  view.open(2);assert.deepEqual(view.pending,{index:2,rotation:0});
  for(let i=0;i<500;i++){view.update(.016);assert.ok(view.progress>=0&&view.progress<=1);}
  assert.equal(view.selected,2);assert.equal(view.progress,1);assert.equal(view.pending,null);assert.equal(view.closing,false);
  // A close during the arrival into the large view finishes the arrival first.
  view.close(true);view.open(0);for(let i=0;i<120;i++)view.update(.016);assert.ok(view.progress>.54&&view.progress<1);
  view.close();assert.equal(view.closing,false);while(!view.closing)view.update(.016);assert.equal(view.progress,1);
  view.close(true);assert.equal(view.progress,0);view.open(0,.4,true);assert.equal(view.progress,1);assert.equal(view.rotation,.4);
});

test('final self-consumption has a finite endpoint, pauses in place, and requires an explicit new round',async()=>{
  const {Finale}=await import('../sketches/ouroboros/view-state.mjs');const {ringMetrics,bodyPoint}=await import('../sketches/ouroboros/body-geometry.mjs');
  const f=new Finale();assert.equal(f.begin(),true);f.update(.3);f.togglePause();const at=f.progress;f.update(2);assert.equal(f.progress,at);
  f.togglePause();f.update(2);assert.equal(f.state,'ended');assert.equal(f.progress,1);assert.equal(f.begin(),false);
  for(const t of [0,.4,.72,.9,.99,1])for(let i=0;i<3;i++){const r=ringMetrics(i,350,.35,0,t),p=bodyPoint(r,r.length*.5);assert.ok([p.x,p.y,p.u,r.length,r.thickness].every(Number.isFinite));assert.ok(r.length>=0&&r.thickness>=0);}
  for(let i=0;i<3;i++){const r=ringMetrics(i,350,.35,0,1);assert.equal(r.radius,0);assert.equal(r.length,0);assert.equal(r.thickness,0);assert.equal(r.swallowed,r.fullLength);}
  f.reset();assert.equal(f.state,'ready');assert.equal(f.progress,0);
});

test('pinch exposes extra closing pressure only after the controlled minimum, without dividing tempo by zero',async()=>{
  const {PinchScale,MIN_SCALE}=await import('../sketches/ouroboros/pinch-scale.mjs');const calls=[];
  const pinch=new PinchScale({boundary:value=>calls.push(value)});pinch.set(.1);assert.equal(pinch.scale,MIN_SCALE);assert.equal(calls.length,0);
  pinch.set(MIN_SCALE*.9);assert.equal(calls.length,1);assert.equal(pinch.scale,MIN_SCALE);pinch.set(1);assert.equal(pinch.scale,1);
});

test('ink expands from a measured low/drum signal, elongates with melody, and settles without fake impulses',async()=>{
  const {InkMass}=await import('../sketches/ouroboros/ink-physics.mjs');const quiet={low:0,melody:0,drums:0,high:0,centroid:0,waveform:new Float32Array(1024)};
  const a=new InkMass(),b=new InkMass(),c=new InkMass();for(const mass of [a,b,c])mass.resize(350);
  for(let i=0;i<300;i++){a.update(.016,quiet,150,true);b.update(.016,{...quiet,low:.8,drums:.6},150,true);c.update(.016,{...quiet,melody:1},150,true);}
  const mean=v=>Array.from(v).reduce((s,x)=>s+x,0)/v.length;
  assert.ok(mean(b.radii)>mean(a.radii)*2);assert.ok(Math.max(...c.radii)/Math.min(...c.radii)>1.6);
  const radius=mean(a.radii);for(let i=0;i<300;i++)b.update(.016,{...quiet,low:1,drums:1},150,false);
  assert.ok(Math.abs(mean(b.radii)-radius)<.1,'stopped audio cannot keep inflating the mass');
});

test('constrained ink presses against the inner body and droplets stay bounded and return',async()=>{
  const {InkMass}=await import('../sketches/ouroboros/ink-physics.mjs');const mass=new InkMass();mass.resize(350);mass.touch(1,.6);
  const features={low:1,drums:1,melody:.7,high:.2,waveform:new Float32Array(1024)};
  for(let i=0;i<300;i++)mass.update(.016,features,27,true);
  assert.ok(Math.max(...mass.pressure)>.1);
  for(let i=0;i<mass.count;i++)assert.ok(Math.hypot(mass.points[i*2],mass.points[i*2+1])<=25.51);
  assert.ok(mass.droplets.length<=7);mass.release();
  for(let i=0;i<300;i++)mass.update(.016,{...features,low:0,drums:0,melody:0,high:0},150,false);
  assert.equal(mass.droplets.length,0);assert.ok(mass.points.every(Number.isFinite));
});

function graphContext(){
  const param=value=>({value,calls:[],setTargetAtTime(v,t,tau){this.value=v;this.calls.push({v,t,tau});},cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v,t){this.value=v;this.ramp={v,t};}});
  const node=()=>({connect(to){return to;},disconnect(){},gain:param(1)});
  return {sampleRate:8000,currentTime:2,destination:node(),createGain:node,createBiquadFilter:()=>({...node(),frequency:param(1000),Q:param(1)}),createWaveShaper:node,createStereoPanner:()=>({...node(),pan:param(0)}),createDelay:()=>({...node(),delayTime:param(.1)}),createConvolver:node,createDynamicsCompressor:()=>({...node(),threshold:param(-24),ratio:param(1),knee:param(1),attack:param(.01),release:param(.1)}),createAnalyser:()=>({...node(),fftSize:256,getFloatTimeDomainData:pcm=>pcm.fill(0),getByteFrequencyData:pcm=>pcm.fill(0)}),createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)})};
}

test('each channel control changes only that channel and audio parameters use smooth targets',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs');const audio=new OuroborosAudio();audio.context=graphContext();audio.transport={connect(){}};audio.buildGraph();
  const untouched=[audio.getChannelState(0),audio.getChannelState(2)],before=audio.channels[0].level.gain.calls.length;
  for(const [key,value] of Object.entries({level:.2,pan:-.6,brightness:1900,saturation:.7,echo:.31,reverb:.4}))assert.equal(audio.setChannelParam(1,key,value),true);
  assert.deepEqual(audio.getChannelState(0),untouched[0]);assert.deepEqual(audio.getChannelState(2),untouched[1]);assert.equal(audio.channels[0].level.gain.calls.length,before);
  assert.equal(audio.channels[1].level.gain.value,.2);assert.equal(audio.channels[1].pan.pan.value,-.6);assert.equal(audio.channels[1].echo.gain.value,.31);
  assert.ok(audio.channels[1].preDrive.gain.calls.every(call=>call.tau>0));assert.ok(audio.channels[1].filter.frequency.calls.every(call=>call.tau>0));
  assert.equal(audio.setChannelParam(1,'brightness',NaN),false);assert.equal(audio.setChannelParam(4,'level',1),false);assert.equal(audio.setChannelParam(1,'nonsense',1),false);
  audio.setChannelParam(2,'punch',1);assert.ok(audio.channels[2].body.gain.value>0);assert.equal(audio.channels[1].body.gain.value,0);
});

test('wave changes re-render the ring buffers in place; finale stops sources and fades the whole FX output',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs');const audio=new OuroborosAudio(),messages=[];
  audio.context=graphContext();audio.transport={connect(){},port:{postMessage:data=>messages.push(data)}};audio.buildGraph();audio.state.phase=.63;audio.rate=2;audio.playing=true;
  await audio.changeWave(1,'square');assert.equal(audio.state.phase,.63);assert.equal(audio.rate,2);
  assert.ok(messages.every(m=>m.type==='ring'),'no reload and no seek of the record');
  const pipe=messages.find(m=>m.index===1);assert.ok(pipe.pcm.length>0);assert.equal(pipe.segments,1);
  assert.equal(messages.find(m=>m.index===0).pcm,null,'an empty ring stays silent');
  messages.length=0;await audio.changeWave(1,'square');assert.equal(messages.length,0,'unchanged rings are not rendered again');
  const material=audio.channelSettings.map(s=>({...s}));audio.finish();assert.equal(audio.playing,false);assert.ok(messages.some(m=>m.type==='play'&&m.value===false));
  assert.deepEqual(audio.master.gain.ramp,{v:0,t:2.18});assert.deepEqual(audio.channelSettings,material);
});

test('each ring has its own spell rack; a spell on one snake sounds only while that snake plays',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs'),audio=new OuroborosAudio(),routes=[];
  audio.context=graphContext();audio.transport={connect(node,output){routes.push({node,output});}};audio.buildGraph();
  assert.equal(audio.ringRacks.length,3);assert.equal(new Set(audio.ringRacks.map(r=>r.convolver)).size,3);
  assert.deepEqual(routes.map(r=>r.output).sort((a,b)=>a-b),[3,4,5,6]);
  audio.chains.summon('melody-b');const [wind,thread]=audio.chains.rings[1];
  audio.ringOrder[1].set(audio.chains.versions[1],[wind.uid,thread.uid]);
  audio.state.rings=[null,{phase:.75,segments:2,version:audio.chains.versions[1]},null];
  audio.castSpell('Ярость',{targets:[thread.uid],voice:false});audio.spells.advance(1);audio.updateSpells();
  assert.ok(audio.ringRacks[1].rage.gain.value>0,'Нить is sounding');assert.equal(audio.ringRacks[0].rage.gain.value,0);
  audio.state.rings[1].phase=.25;audio.updateSpells();assert.equal(audio.ringRacks[1].rage.gain.value,0,'Ветер is sounding');
  assert.equal(audio.inkRack.rage.gain.value,0);
  audio.setChannelParam(1,'brightness',1700);audio.setChannelParam(1,'reverb',.22);
  audio.state.rings[1].phase=.75;audio.castSpell('Снять',{targets:[thread.uid],voice:false});audio.spells.advance(3);audio.updateSpells();
  assert.equal(audio.ringRacks[1].rage.gain.value,0);assert.equal(audio.channels[1].filter.frequency.value,1700);assert.equal(audio.channels[1].space.gain.value,.22);
  audio.castSpell('Свод',{targets:audio.chains.all.map(s=>s.uid),voice:true});audio.spells.advance(4);audio.updateSpells();assert.ok(audio.inkRack.vault.gain.value>0);assert.ok(audio.voiceRack.vault.gain.value>0);
});

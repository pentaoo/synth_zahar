const test=require('node:test');
const assert=require('node:assert/strict');

test('forward transport rotates clockwise and the mirrored face leads rather than travelling backwards',async()=>{
  const {ringMetrics,bodyPoint}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(let i=0;i<3;i++){
    const ring=ringMetrics(i,350),next=ringMetrics(i,350,1,.001),a=bodyPoint(ring,0),b=bodyPoint(next,0),nose=bodyPoint(ring,-ring.thickness);
    assert.ok(a.x*b.y-a.y*b.x>0,'positive screen angle is clockwise');
    assert.ok((nose.x-a.x)*(b.x-a.x)+(nose.y-a.y)*(b.y-a.y)>0,'nose points along rotation');
    assert.ok(-a.tx*(b.x-a.x)-a.ty*(b.y-a.y)>0,'mouse projection must use the forward tangent, opposite the trailing material');
  }
});

test('incoming head coils before the trailing material, then becomes exactly the same circular skin',async()=>{
  const {ringMetrics,bodyPoint,HEAD_UNITS,TAU}=await import('../sketches/ouroboros/body-geometry.mjs');
  const ring=ringMetrics(0,350),H=ring.thickness*HEAD_UNITS;
  const entering={kind:'arrive',distance:H+80};
  const nose=bodyPoint(ring,-H,entering),tail=bodyPoint(ring,ring.length,entering);
  assert.ok(Math.abs(Math.hypot(nose.x,nose.y)-ring.radius)<1e-8);
  assert.equal(tail.y,-ring.radius);assert.ok(tail.x<0);
  ring.headAngle=-Math.PI/2;
  const done={kind:'arrive',distance:TAU*ring.radius+H};
  for(let s=-H;s<=ring.length;s+=5){
    const a=bodyPoint(ring,s,done),b=bodyPoint(ring,s);
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7);
    assert.equal(a.u,b.u,'no texture normalization during coiling');
  }
});

test('presentation has a fully absent selected body, continuous layout movement and one remaining-composition camera',async()=>{
  const {ringMetrics,presentation,bodyPoint,project,HEAD_UNITS}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(let index=0;index<3;index++){
    const ring=ringMetrics(index,300),state={progress:.45,selected:index,focusAngle:-Math.PI/2};
    const gap=presentation(1366,768,300,ring,state);assert.equal(gap.visible,false);assert.equal(gap.stage,'transfer');
    const before=presentation(1366,768,300,ring,{...state,progress:.39999});
    for(let s=-ring.thickness*HEAD_UNITS;s<ring.length;s+=15){const q=project(bodyPoint(ring,s,before.path),before.view);assert.ok(q.x<0||q.x>1366||q.y<0||q.y>768,'the whole snake has left the frame head first');}
    const leaving=presentation(1366,768,300,ring,{...state,progress:.01}),nose=bodyPoint(ring,-ring.thickness*HEAD_UNITS),moved=bodyPoint(ring,-ring.thickness*HEAD_UNITS,leaving.path);
    assert.ok(-nose.tx*(moved.x-nose.x)-nose.ty*(moved.y-nose.y)>0,'the head moves forward along its own tangent, no alignment turn');
    const start=presentation(1366,768,300,ring,{...state,progress:0}),focus=presentation(1366,768,300,ring,{...state,progress:1});
    assert.equal(start.remaining.scale,1);assert.ok(focus.remaining.scale<.4);assert.ok(focus.remaining.tx>1100&&focus.remaining.ty<180);
  }
});

test('new Space and I shortcuts preserve native controls, slider arrows, text and dialog input',async()=>{
  const {shortcut}=await import('../sketches/ouroboros/input-shortcuts.mjs');
  assert.equal(shortcut({code:'Space',tag:'CANVAS'}),'play');
  assert.equal(shortcut({code:'Space',tag:'INPUT',type:'range'}),'play');
  assert.equal(shortcut({code:'ArrowRight',tag:'INPUT',type:'range'}),null);
  assert.equal(shortcut({code:'Space',tag:'SELECT'}),null);
  assert.equal(shortcut({code:'KeyI',tag:'INPUT',type:'text'}),null);
  assert.equal(shortcut({code:'KeyI',ctrlKey:true}),null);
  assert.equal(shortcut({code:'KeyI'}),'service');
  assert.equal(shortcut({code:'Space',dialog:true}),null);
  assert.equal(shortcut({code:'Escape',dialog:true}),null);
  assert.equal(shortcut({code:'Escape'}),'back');
});

test('compressed macro cameras keep the whole control rectangle inside the white inner window',async()=>{
  const {ringMetrics,camera,controlRect}=await import('../sketches/ouroboros/body-geometry.mjs');
  for(const [width,height] of [[1366,768],[1280,800]])for(const scale of [1,.8,.5,.35])for(let i=0;i<3;i++){
    const ring=ringMetrics(i,300,scale),view=camera(width,height,300,ring,1),rect=controlRect(width,height);
    const inner=ring.radius*view.scale-ring.thickness*view.scale*.65;
    for(const x of [rect.x,rect.x+rect.width])for(const y of [rect.y,rect.y+rect.height])assert.ok(Math.hypot(x-view.tx,y-view.ty)<inner,'no printed body behind controls');
  }
});

test('pause or focus loss during new-round preparation cannot restart audio later',async()=>{
  const {OuroborosAudio}=await import('../sketches/ouroboros/engine.mjs');
  const audio=new OuroborosAudio();let resolveReady,plays=0;
  audio.ready=new Promise(resolve=>{resolveReady=resolve;});
  audio.context={onstatechange:null,close:async()=>{}};
  audio.play=async()=>{plays++;return true;};
  const restarting=audio.restart();audio.pause();resolveReady();
  assert.equal(await restarting,false);assert.equal(plays,0);assert.equal(audio.ready,null);assert.equal(audio.context,null);assert.equal(audio.state.phase,0);
});

test('collapse from focus keeps the circular body and pulls both views into one point instead of replaying uncoiling',async()=>{
  const {ringMetrics,bodyPoint,presentation,collapsePresentation,project}=await import('../sketches/ouroboros/body-geometry.mjs');
  const state={progress:1,focusAngle:-Math.PI/2},initial=ringMetrics(0,300,.35),layout=presentation(1366,768,300,initial,state);
  const pose={view:layout.view,remaining:layout.remaining,path:0,angle:-Math.PI/2};
  const start=collapsePresentation(layout,pose,0);assert.deepEqual(start.view,layout.view);
  for(const f of [.1,.5,.9,1]){
    const ring=ringMetrics(0,300,.35,0,f),shown=collapsePresentation(layout,pose,f);
    assert.equal(shown.path,0);assert.equal(shown.miniActive,false);
    for(let j=0;j<=30;j++)assert.ok(Math.abs(Math.hypot(...Object.values(bodyPoint(ring,ring.length*j/30)).slice(0,2))-ring.radius)<1e-7);
    if(f===1){const p=project(bodyPoint(ring,0),shown.view);assert.equal(p.x,683);assert.equal(p.y,768*.51);assert.deepEqual(shown.view,shown.remaining);}
  }
});

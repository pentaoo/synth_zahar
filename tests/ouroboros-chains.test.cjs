const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const root=`${__dirname}/../sketches/ouroboros`;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} ≠ ${b}`);

test('the performance starts with one bagpipe snake; names summon only that snake, copies and removals are per name',async()=>{
  const {Chains,parseCommand,SPELLS=[]}=await import(`${root}/chain-model.mjs`);const c=new Chains();
  assert.deepEqual(c.rings.map(r=>r.map(s=>s.name)),[[],['Ветер'],[]]);
  const spells=[{word:'Ярость'}];
  assert.equal(parseCommand('нить',{spells}).type,'summon');assert.equal(parseCommand('Убрать  Ветер',{spells}).type,'remove');
  assert.deepEqual(parseCommand('кольцо ярость',{spells}).scope,'ring');assert.equal(parseCommand('всё Ярость',{spells}).scope,'all');
  assert.equal(parseCommand('1 2 3 · - 5',{spells}).type,'unknown','runes need a selected snake');
  assert.deepEqual(parseCommand('1 2 3 · - 5',{spells,channel:1}).cells,['1','2','3','·','-','5','·','·']);
  c.write(c.rings[1][0].uid,['5','5','5','5','5','5','5','5']);
  const copy=c.summon('melody-a');assert.equal(copy.created,false);assert.deepEqual(copy.snake.cells,['5','5','5','5','5','5','5','5'],'a copy starts with the same phrase');
  c.write(copy.snake.uid,['1','-','-','-','-','-','-','-']);assert.equal(c.rings[1][0].cells[0],'5','and is edited separately');
  assert.equal(c.summon('bass-a').created,true);assert.equal(c.rings[0].length,1);
  const gone=c.remove('melody-a');assert.equal(gone.snake.uid,copy.snake.uid,'removal takes the last copy');assert.equal(c.rings[1].length,1);
  assert.equal(c.remove('drums-a').ok,false);
});

test('bass follows the key degrees of the bagpipe phrase it plays against',async()=>{
  const {bassNotes,degreePitch,ROOTS}=await import(`${root}/chain-model.mjs`);
  const pipe=['5','4','3','-','2','1','·','1'],notes=bassNotes(['x','-','-','x','x','-','·','x'],pipe);
  assert.deepEqual(notes.map(n=>n[0]),[0,3,4,7]);
  assert.equal(notes[0][1],degreePitch(5,ROOTS[0]));assert.equal(notes[1][1],degreePitch(3,ROOTS[0]),'held degree under a dash');
  assert.equal(notes[2][1],degreePitch(2,ROOTS[0]));assert.equal(notes[0][2],3,'dashes hold the note');
  assert.equal(bassNotes(['x','·','·','·','·','·','·','·'],null)[0][1],ROOTS[0],'no bagpipe: the root');
});

test('each ring renders N phrases of 8 beats; the drone lives in the bagpipe ring and loops without a seam',async()=>{
  const {renderRing,beatSamples}=await import(`${root}/chain-score.mjs`);const sr=8000,beat=beatSamples(sr);
  const one=renderRing(sr,1,[['1','2','3','4','3','2','1','-']]),two=renderRing(sr,1,[['1','2','3','4','3','2','1','-'],['5','4','3','-','2','1','·','1']]);
  assert.equal(one.length,beat*8);assert.equal(two.length,beat*16);assert.equal(two.segments,2);
  assert.ok(one.pcm.every(Number.isFinite));
  near(one.pcm[0],one.pcm[one.length-1],.05);
  const bassRest=renderRing(sr,0,[['·','·','·','·','·','·','·','·']]);assert.ok(bassRest.pcm.every(v=>v===0),'the bass ring has no drone of its own');
  const drums=renderRing(sr,2,[['1','·','·','·','·','·','·','·']]);let early=0,late=0;for(let n=0;n<beat;n++)early+=Math.abs(drums.pcm[n]);for(let n=beat*2;n<beat*8;n++)late+=Math.abs(drums.pcm[n]);
  assert.ok(early>0&&late===0);
});

function processor(){
  let P;vm.runInNewContext(fs.readFileSync(`${root}/transport-vinyl-worklet.js`,'utf8'),{sampleRate:8000,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>{this.last=m;}};}},registerProcessor(_,p){P=p;}});
  return new P();
}
const outputs=(n=128)=>Array.from({length:10},()=>[new Float32Array(n)]);
test('rings loop independently, enter on the bar phase, and edits swap in only at a phrase boundary',()=>{
  const p=processor(),beat=Math.round(60/78*8000),stems=[0,1,2].map(()=>new Float32Array(beat*16));
  p.command({type:'load',stems,beats:16});p.command({type:'play',value:true});
  const ring=(segments,value)=>Float32Array.from({length:beat*8*segments},(_,n)=>value*Math.sin(n*.05));
  for(let i=0;i<10;i++)p.process([],outputs());
  p.command({type:'ring',index:1,pcm:ring(1,.2),segments:1,version:1});p.command({type:'ring',index:2,pcm:ring(2,.1),segments:2,version:1});
  near(p.rings[1].position,p.position%(beat*8),1e-6);
  for(let i=0;i<60;i++)p.process([],outputs());
  const a=p.rings[1].position,b=p.rings[2].position;assert.ok(a>0&&b>0);
  p.command({type:'ring',index:1,pcm:ring(2,-.2),segments:2,version:2});assert.equal(p.rings[1].version,1,'still the old phrase');
  let swapped=null;for(let i=0;i<500&&swapped===null;i++){p.process([],outputs());if(p.rings[1].version===2)swapped=p.rings[1].position;}
  assert.ok(swapped!==null);assert.ok(swapped<p.rings[1].length/2,'swapped at the boundary into the first phrase');
  assert.notEqual(p.rings[1].length,p.rings[2].length+1);
  const o=outputs(4096);p.process([],o);assert.ok(o[5][0].some(v=>v!==0)&&o[6][0].some(v=>v!==0));assert.ok(o.every(ch=>ch[0].every(Number.isFinite)));
  p.command({type:'ring',index:2,pcm:null});for(let i=0;i<400;i++)p.process([],outputs());assert.ok(p.rings[2].pcm===null,'an emptied ring fades out and stops');
  p.command({type:'grab'});p.command({type:'motion',velocity:-6});for(let i=0;i<20;i++)p.process([],outputs());assert.ok(p.rings[1].position>=0&&p.rings[1].position<p.rings[1].length,'reverse scratch carries the rings too');
});

test('a closing large view leaves head first along its tangent and lands back on the ring without turning',async()=>{
  const {ringMetrics,presentation,bodyPoint,HEAD_UNITS,TAU}=await import(`${root}/body-geometry.mjs`);
  const ring=ringMetrics(1,300),H=ring.thickness*HEAD_UNITS,state={selected:1,focusAngle:-Math.PI/2,closing:true,departAngle:.9,arriveGate:2.1};
  const start=presentation(1366,768,300,ring,{...state,progress:1}),later=presentation(1366,768,300,ring,{...state,progress:.9});
  assert.equal(start.stage,'return-depart');
  const r={...ring,headAngle:.9},a=bodyPoint(r,-H),b=bodyPoint(r,-H,later.path),n0=bodyPoint(r,-H,start.path);
  near(a.x,n0.x,1e-6);near(a.y,n0.y,1e-6);
  assert.ok(-a.tx*(b.x-a.x)-a.ty*(b.y-a.y)>0,'forward, never tail first');
  assert.equal(presentation(1366,768,300,ring,{...state,progress:.55}).visible,false);
  const end=presentation(1366,768,300,ring,{...state,progress:1e-9});assert.equal(end.stage,'return');
  const landed={...ring,headAngle:2.1};for(const s of [-H,0,60]){const p=bodyPoint(landed,s),q=bodyPoint(ring,s,{...end.path,headLength:H});near(p.x,q.x,1e-3);near(p.y,q.y,1e-3);}
});

test('chains share the circle by weight and the skin shader never mirrors scales',async()=>{
  const {chainCreatures,chainShares}=await import(`${root}/ritual-geometry.mjs`),{ringMetrics,RINGS}=await import(`${root}/body-geometry.mjs`);
  const skins=JSON.parse(fs.readFileSync(`${root}/assets/ritual/skins.json`)),ring={...ringMetrics(1,300),baseRadius:300,ratio:RINGS[1].ratio};
  const snakes=[{uid:'a',id:'melody-a'},{uid:'b',id:'melody-b'},{uid:'c',id:'melody-a'}];
  const even=chainCreatures(ring,snakes,0,skins);assert.equal(even.length,3);near(even[1].offset,Math.PI*2*ring.radius/3,1e-9);
  const growing=chainShares(snakes,{c:0});near(growing[2].share,0);near(growing[0].share,.5);
  const led=chainCreatures(ring,snakes,2,skins);assert.equal(led[0].uid,'c');assert.equal(led[0].offset,0);
  const shader=fs.readFileSync(`${root}/engraving-renderer.mjs`,'utf8');assert.ok(!/abs\(fract/.test(shader),'no triangle-wave mirror');assert.ok(/textureGrad/.test(shader));
});

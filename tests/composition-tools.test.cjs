'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../sketches/landscape/composition-tools.js');
const files=require('../sketches/landscape/layout-files.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const rotate=(p,angle)=>[500+(p[0]-500)*Math.cos(angle)-(p[1]-500)*Math.sin(angle),500+(p[0]-500)*Math.sin(angle)+(p[1]-500)*Math.cos(angle)];

test('neighboring sectors have parallel cut edges and a constant 20-unit gap for one through eight phrases',()=>{
 for(let count=1;count<=8;count++){
  const g=tools.sectorGeometry(count),angle=Math.PI*2/count,normal=[-Math.sin(g.end),Math.cos(g.end)];
  const outerNext=rotate(g.outerStart,angle),innerNext=rotate(g.innerStart,angle);
  for(const [first,second] of [[g.outerEnd,outerNext],[g.innerEnd,innerNext]]){
   close(Math.hypot(second[0]-first[0],second[1]-first[1]),20);
  }
  close((g.outerEnd[0]-g.innerEnd[0])*normal[0]+(g.outerEnd[1]-g.innerEnd[1])*normal[1],0);
  assert(!tools.sectorPath(count).includes('NaN'));
 }
});
test('nested rings keep their own radii and a uniform gap with different segment counts',()=>{
 for(const [count,outer,inner] of [[4,462,310],[3,288,180],[2,158,62],[1,288,62]]){
  const g=tools.sectorGeometry(count,{outer,inner}),angle=Math.PI*2/count;
  close(Math.hypot(g.outerStart[0]-500,g.outerStart[1]-500),outer);
  close(Math.hypot(g.innerStart[0]-500,g.innerStart[1]-500),inner);
  for(const [first,second] of [[g.outerEnd,rotate(g.outerStart,angle)],[g.innerEnd,rotate(g.innerStart,angle)]])close(Math.hypot(second[0]-first[0],second[1]-first[1]),20);
  assert(!tools.sectorPath(count,{outer,inner}).includes('NaN'));
 }
});
test('pointer angles map to every clockwise slot, including crossing the top seam',()=>{
 for(let count=2;count<=8;count++)for(let i=0;i<count;i++){
  const angle=-Math.PI/2+(i+.5)*Math.PI*2/count;
  assert.equal(tools.slotAtPoint(Math.cos(angle),Math.sin(angle),count),i);
 }
 assert.equal(tools.slotAtPoint(0,0,4),null);
 assert.equal(tools.slotAtPoint(.0001,-1,4),0);
 assert.equal(tools.slotAtPoint(-.0001,-1,4),3);
});
test('drag preview inserts a phrase at its target and never mutates the sounding order',()=>{
 const original=[1,2,3,4].map(id=>({id}));
 assert.deepEqual(tools.reordered(original,1,2).map(field=>field.id),[2,3,1,4]);
 assert.deepEqual(original.map(field=>field.id),[1,2,3,4]);
 assert.deepEqual(tools.reordered(original,4,0).map(field=>field.id),[4,1,2,3]);
});
test('first-run phrases contain distinct notes, rhythms and two voices plus drums',()=>{
 const base={version:5,worldKey:'autumn',bpm:80,phraseLength:8,scaleSettings:{autumn:{tonic:0,mode:'majorPent'},space:{tonic:0,mode:'minorPent'}},waveforms:{autumn:['triangle','sine'],space:['sine','sawtooth']},scenes:{autumn:[],space:[]},soundSettings:{}};
 const fields=tools.demoFields(base,8);
 assert.equal(new Set(fields.map(field=>JSON.stringify(field.snapshot.scenes.autumn))).size,8);
 for(const field of fields){
  files.validateSnapshot(field.snapshot);
  assert.deepEqual(field.snapshot.scenes.autumn.map(source=>source.type),['drop','leaf','raven','fog']);
  assert.equal(field.repeats,1);
 }
 assert.deepEqual(base.scenes.autumn,[]);
});
test('old alternate-theme phrases retain their musical settings in the default theme without duplicate IDs',()=>{
 const saved={version:5,worldKey:'space',selectedId:2,tool:'aurora',bpm:98,phraseLength:4,scenes:{autumn:[{id:1,type:'drop',x:.5,y:.6,steps:[0]}],space:[{id:2,type:'aurora',x:.125,y:.3,steps:[0,1,2,3]}]},scaleSettings:{autumn:{tonic:0,mode:'major'},space:{tonic:9,mode:'minor'}},waveforms:{autumn:['sine','sine'],space:['triangle','sawtooth']},soundSettings:{autumn:{master:.3},space:{master:.2}}};
 const normalized=tools.defaultTheme(saved);files.validateSnapshot(normalized);
 assert.equal(normalized.worldKey,'autumn');assert.equal(normalized.scenes.autumn[0].type,'fog');
 assert.equal(normalized.scenes.autumn[0].x,.125);assert.equal(normalized.soundSettings.autumn.master,.2);
 assert.deepEqual(normalized.waveforms.autumn,['triangle','sawtooth']);
 assert.equal(saved.worldKey,'space');
});
test('new bass, melody and drum layers start with distinct, valid phrases',()=>{
 const base={version:5,worldKey:'autumn',bpm:96,phraseLength:8,scaleSettings:{autumn:{tonic:0,mode:'major'},space:{tonic:0,mode:'minor'}},waveforms:{autumn:['triangle','sine'],space:['sine','sawtooth']},scenes:{autumn:[],space:[]},soundSettings:{}};
 for(const kind of ['bass','melody','drums']){
  const fields=tools.partFields(base,kind);
  assert.equal(fields.length,kind==='bass'?3:4);
  assert.equal(new Set(fields.map(field=>JSON.stringify(field.snapshot.scenes.autumn))).size,fields.length);
  for(const field of fields){files.validateSnapshot(field.snapshot);assert.ok(field.snapshot.scenes.autumn.length);}
 }
});

test('drag insertion chooses the nearest gap, including after the final phrase',()=>{
 for(const count of [1,4,8,16])for(let index=0;index<count;index++){
  const angle=-Math.PI/2+(index+.05)/count*Math.PI*2;
  assert.equal(tools.insertionAtPoint(Math.cos(angle)*330,Math.sin(angle)*330,count),index);
 }
 const final=-Math.PI/2+Math.PI*2-.01;assert.equal(tools.insertionAtPoint(Math.cos(final)*330,Math.sin(final)*330,8),8);
 assert.equal(tools.insertionAtPoint(0,0,8),null);
});

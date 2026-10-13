'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const presets=require('../sketches/landscape/phrase-presets.js'),score=require('../sketches/landscape/performance-score.js'),files=require('../sketches/landscape/layout-files.js');
const {fixture,between}=require('./helpers/audio-fixture.cjs');
async function setup(){
 const f=await fixture([]);
 f.evaluate(`performancePatch=${JSON.stringify(score.patchDefaults)};Object.assign(modes,{minor:{steps:[0,2,3,5,7,8,10]},major:{steps:[0,2,4,5,7,9,11]},majorPent:{steps:[0,2,4,7,9]},minorPent:{steps:[0,3,5,7,10]},free:{steps:null}});`+between('  function createLiveSource(brush,snapshot,x,y) {','  function syncPerformance() {'));
 return {base:score.fields(f.serial())[0].snapshot,create:f.evaluate('createLiveSource')};
}
const notesFor=(steps,tonic)=>Array.from({length:25},(_,i)=>48+i).filter(note=>steps.includes(((note-tonic)%12+12)%12));
test('all musical presets adapt to tonic, scale and phrase length and preserve the other parties',async()=>{
 const {base,create}=await setup();
 for(const [mode,steps] of Object.entries({minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11],majorPent:[0,2,4,7,9],minorPent:[0,3,5,7,10]}))for(const tonic of [0,2,7,11])for(const length of [1,3,8,16,32])for(const group of Object.keys(presets.groups))for(let preset=0;preset<4;preset++){
  const snapshot=structuredClone(base);snapshot.scaleSettings.autumn={mode,tonic};snapshot.phraseLength=length;const notes=notesFor(steps,tonic),before=JSON.stringify(snapshot);
  const result=presets.insert(snapshot,{group,preset,notes},create);assert.equal(JSON.stringify(snapshot),before);files.validateSnapshot(result);
  assert.deepEqual(result.scenes.autumn.filter(source=>!presets.belongs(source,group)),snapshot.scenes.autumn.filter(source=>!presets.belongs(source,group)));
  const added=result.scenes.autumn.filter(source=>presets.belongs(source,group));assert.ok(added.length);
  for(const source of added){assert.ok(source.steps.every(step=>step>=0&&step<length));if(group!=='drums')assert.ok(notes.some(note=>Math.abs(note-(48+source.x*24))<1e-6));}
 }
});
test('append preserves existing nodes, allocates unique IDs and rejects a full phrase atomically',async()=>{
 const {base,create}=await setup(),notes=notesFor([0,2,3,5,7,8,10],2);
 const added=presets.insert(base,{group:'chords',preset:1,append:true,notes},create);
 assert.deepEqual(added.scenes.autumn.slice(0,base.scenes.autumn.length),base.scenes.autumn);assert.equal(new Set(added.scenes.autumn.map(source=>source.id)).size,added.scenes.autumn.length);
 let full=added;while(full.scenes.autumn.length<=12)full=presets.insert(full,{group:'chords',preset:1,append:true,notes},create);
 const before=JSON.stringify(full);assert.throws(()=>presets.insert(full,{group:'chords',preset:1,append:true,notes},create),/16 нод/);assert.equal(JSON.stringify(full),before);
});
test('variations and rhythm transformations retain source identities and valid tuning through repeated edits',async()=>{
 const {base,create}=await setup(),notes=notesFor([0,2,3,5,7,8,10],2);
 for(const group of Object.keys(presets.groups)){
  let result=presets.insert(base,{group,preset:0,notes},create);const ids=result.scenes.autumn.map(source=>source.id),other=result.scenes.autumn.filter(source=>!presets.belongs(source,group));
  for(let variation=1;variation<=12;variation++)for(const action of ['variation','shift','sparse','dense']){
   result=presets.transform(result,{group,action,variation,notes});files.validateSnapshot(result);
   assert.deepEqual(result.scenes.autumn.map(source=>source.id),ids);assert.deepEqual(result.scenes.autumn.filter(source=>!presets.belongs(source,group)),other);
   assert.ok(result.scenes.autumn.filter(source=>presets.belongs(source,group)).every(source=>source.steps.every(step=>step>=0&&step<result.phraseLength)));
  }
 }
});
test('free tuning still produces musical fragments and presets survive a layout round trip',async()=>{
 const {base,create}=await setup();base.scaleSettings.autumn.mode='free';
 const result=presets.insert(base,{group:'melody',preset:3,notes:[]},create);files.validateSnapshot(result);
 assert.deepEqual(files.decode(files.encode(result,'Заготовка')).snapshot,JSON.parse(JSON.stringify(result)));
});
